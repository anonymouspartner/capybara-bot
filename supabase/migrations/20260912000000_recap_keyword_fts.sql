-- recap_keyword_search: full-text search over original + translation, replacing
-- whole-string trigram matching.
--
-- WHY
--
-- Asked "when did I last donate blood?", the bot answered 30 August. No message on
-- 30 August mentions blood; the date came from "It will feed the homeless today".
-- Ranking bugs in index.ts explain how that item got promoted (fixed separately), but
-- the reason the CORRECT messages never outranked it is here, in retrieval.
--
-- The real answer is a Ukrainian exchange on 18 July -- "Куди ти ходиш здавати кров?"
-- ("Where do you go to donate blood?"). Two things kept it out of reach:
--
--   1. This function matched with `e.content % p_query`: pg_trgm similarity between the
--      WHOLE message text and the WHOLE query string. A short message only clears the
--      0.3 threshold when it is nearly a paraphrase of the entire question, so the arm
--      returned exactly ONE row for that query. It also cannot cross languages -- an
--      English question shares no trigrams with Ukrainian text.
--
--   2. Only original_text was ever searched. Every message already carries an English
--      translation in messages.translated_text, written at ingest, and nothing looked at
--      it. The English sentence "Where do you go to donate blood?" was sitting in the
--      same row the whole time.
--
-- With the semantic arm carrying retrieval alone, and cosine for short chat compressed
-- into a 0.30-0.40 band, genuine hits (0.349) scored below noise (0.401) and the answer
-- came down to chance.
--
-- WHAT CHANGES
--
-- Matching is now to_tsvector('english', original_text || ' ' || translated_text) against
-- an OR-query built from the question, ranked with ts_rank_cd. Measured on the live
-- corpus for "when did I last donate blood", this moves the 18 July exchange to rank 1
-- (0.60, matched through its translation) with three of the top six from that day, and
-- drops "It will feed the homeless today" out of the results entirely -- it shares no
-- term with the question.
--
-- 'english' is deliberate even though half the corpus is Ukrainian: it stems the English
-- side ("donate"/"donating"/"donation" -> "donat"), which is what an English question
-- needs, and Ukrainian tokens pass through lowercased rather than being mangled. Every
-- message has an English side to match against -- either as the original or as the
-- translation -- so this works whichever language the question is asked in.
--
-- plainto_tsquery ANDs its terms, which fails on a conversational question ("when did I
-- last donate blood" would require all of them). Its output is re-joined with | so the
-- terms are ORed and ts_rank_cd does the discriminating: matching two distinct terms
-- outranks matching one. Generic temporal words that every "when did I last X" question
-- carries are dropped first -- they match "last night" and similar across the whole
-- corpus while saying nothing about the subject.
--
-- Lexemes shorter than three characters are dropped as well. 'english' removes English
-- stopwords but leaves every other language's untouched, so a Ukrainian question keeps
-- its pronouns and particles -- "коли я востаннє здавав кров" yields "я" ("I"), which
-- matches a large share of the corpus. That matters more than it looks: RRF fuses by
-- RANK, not score, so rows matching only a filler word still collect fusion credit.
-- A length floor is the language-agnostic version of this guard; a per-language stopword
-- list here would tie a couple-agnostic function to one language pair.
--
-- Signature, return columns, date-window filters, the reconciled-message exclusion, the
-- recap_embeddings join and the note branch are all unchanged, so index.ts needs no
-- change to use this.

CREATE INDEX IF NOT EXISTS "messages_fts_en_idx" ON "public"."messages"
  USING gin (to_tsvector('english', coalesce("original_text", '') || ' ' || coalesce("translated_text", '')));

CREATE INDEX IF NOT EXISTS "notes_fts_en_idx" ON "public"."notes"
  USING gin (to_tsvector('english', coalesce("content", '')));


CREATE OR REPLACE FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "language" "text", "created_at" timestamp with time zone, "sender_name" "text", "author_id" "uuid", "is_pinned" boolean, "similarity" real)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_raw   text[];
  v_terms text[];
  v_query tsquery;
begin
  -- plainto_tsquery does the stemming and stopword removal, then its ANDed output is
  -- split back into lexemes so they can be ORed. The quote strip is because the text
  -- form of a tsquery renders each lexeme as 'lexeme'.
  select array_agg(lex) into v_raw
  from (
    select unnest(regexp_split_to_array(replace(plainto_tsquery('english', p_query)::text, '''', ''), ' & ')) as lex
  ) t
  where length(lex) >= 3
    and lex not in ('last','time','first','again','ever','go','went','day','date','recent','happen','when');

  if v_raw is null or array_length(v_raw, 1) = 0 then
    return;
  end if;

  -- Drop filler by document frequency, measured within this question rather than against
  -- a fixed percentage. No absolute cutoff works here: "коли" ("when") appears in 3.5% of
  -- this corpus while the terms that carry the question sit near 0.1%, so a global
  -- threshold either keeps the filler or discards the subject. Inside one question the
  -- rare terms ARE the subject, so a term an order of magnitude commoner than the rarest
  -- is filler whatever language it is in -- which keeps this function couple-agnostic
  -- where a per-language stopword list would not. The floor on the cap stops a typo or a
  -- hapax from collapsing the whole query to itself, and the probe LIMIT means a common
  -- term costs a bounded index scan instead of a full count.
  select array_agg(lex) into v_terms
  from (
    select lex, n, greatest(25, coalesce(min(n) filter (where n > 0) over (), 1) * 20) as cap
    from (
      select lex,
             (select count(*) from (
                select 1 from public.messages m
                 where to_tsvector('english', coalesce(m.original_text, '') || ' ' || coalesce(m.translated_text, ''))
                       @@ plainto_tsquery('simple', lex)
                 limit 500) probe) as n
      from unnest(v_raw) as lex
    ) d
  ) e
  where n <= cap;

  if v_terms is null or array_length(v_terms, 1) = 0 then
    v_terms := v_raw;
  end if;

  v_query := array_to_string(v_terms, ' | ')::tsquery;

  return query
  with msg_candidates as (
    select
      'message'::text as source_type,
      m.id            as source_id,
      m.original_text as content,
      m.original_language as language,
      m.created_at    as created_at,
      u.display_name  as sender_name,
      null::uuid      as author_id,
      (mp.message_id is not null) as is_pinned,
      ts_rank_cd(
        to_tsvector('english', coalesce(m.original_text, '') || ' ' || coalesce(m.translated_text, '')),
        v_query
      ) as similarity
    from public.recap_embeddings e
    join public.messages m on m.id = e.source_id
    left join public.users u on u.id = m.sender_id
    left join public.message_pins mp on mp.message_id = m.id
    where e.source_type = 'message'
      and not exists (select 1 from public.message_reconciles mr where mr.message_id = m.id)
      and (p_start is null or m.created_at >= p_start::timestamptz)
      and (p_end is null or m.created_at < (p_end::timestamptz + interval '1 day'))
      and to_tsvector('english', coalesce(m.original_text, '') || ' ' || coalesce(m.translated_text, '')) @@ v_query
  ),
  note_candidates as (
    select
      'note'::text    as source_type,
      n.id            as source_id,
      n.content       as content,
      n.language      as language,
      n.created_at    as created_at,
      u.display_name  as sender_name,
      n.author_id     as author_id,
      false           as is_pinned,
      ts_rank_cd(to_tsvector('english', coalesce(n.content, '')), v_query) as similarity
    from public.recap_embeddings e
    join public.notes n on n.id = e.source_id
    left join public.users u on u.id = n.author_id
    where e.source_type = 'note'
      and (p_start is null or n.created_at >= p_start::timestamptz)
      and (p_end is null or n.created_at < (p_end::timestamptz + interval '1 day'))
      and to_tsvector('english', coalesce(n.content, '')) @@ v_query
  )
  select * from (
    select * from msg_candidates
    union all
    select * from note_candidates
  ) combined
  order by similarity desc
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";
