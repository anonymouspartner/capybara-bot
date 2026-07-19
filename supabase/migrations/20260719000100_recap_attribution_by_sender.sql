-- correctness fix, independent of the language-generalization work.
--
-- recap_keyword_search and recap_semantic_search currently attribute a message's
-- sender by joining public.users on u.native_language = m.original_language. That
-- is wrong whenever a message's original_language doesn't match its sender's
-- native_language -- e.g. the partner writing in their *learning* language, or (once
-- the language pair stops being hardcoded en/uk) any case where two users don't
-- have distinct, mutually-exclusive native languages. The correct join is on the
-- message's actual sender_id.
--
-- This migration CREATE OR REPLACEs both functions with their bodies byte-for-byte
-- identical to supabase/migrations/20260601000000_init_schema.sql, except for that
-- one join in the msg_candidates CTE:
--   OLD: left join public.users u on u.native_language = m.original_language
--   NEW: left join public.users u on u.id = m.sender_id
-- Signatures, params, ordering, limits, note_candidates, and grants are unchanged.

CREATE OR REPLACE FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "language" "text", "created_at" timestamp with time zone, "sender_name" "text", "author_id" "uuid", "is_pinned" boolean, "similarity" real)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
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
      extensions.similarity(e.content, p_query) as similarity
    from public.recap_embeddings e
    join public.messages m on m.id = e.source_id
    left join public.users u on u.id = m.sender_id
    left join public.message_pins mp on mp.message_id = m.id
    where e.source_type = 'message'
      and not exists (select 1 from public.message_reconciles mr where mr.message_id = m.id)
      and (p_start is null or m.created_at >= p_start::timestamptz)
      and (p_end is null or m.created_at < (p_end::timestamptz + interval '1 day'))
      and e.content operator(extensions.%) p_query
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
      extensions.similarity(e.content, p_query) as similarity
    from public.recap_embeddings e
    join public.notes n on n.id = e.source_id
    left join public.users u on u.id = n.author_id
    where e.source_type = 'note'
      and (p_start is null or n.created_at >= p_start::timestamptz)
      and (p_end is null or n.created_at < (p_end::timestamptz + interval '1 day'))
      and e.content operator(extensions.%) p_query
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


CREATE OR REPLACE FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "language" "text", "created_at" timestamp with time zone, "sender_name" "text", "author_id" "uuid", "is_pinned" boolean, "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
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
      1 - (e.embedding <=> p_query_embedding) as similarity
    from public.recap_embeddings e
    join public.messages m on m.id = e.source_id
    left join public.users u on u.id = m.sender_id
    left join public.message_pins mp on mp.message_id = m.id
    where e.source_type = 'message'
      and not exists (select 1 from public.message_reconciles mr where mr.message_id = m.id)
      and (p_start is null or m.created_at >= p_start::timestamptz)
      and (p_end is null or m.created_at < (p_end::timestamptz + interval '1 day'))
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
      1 - (e.embedding <=> p_query_embedding) as similarity
    from public.recap_embeddings e
    join public.notes n on n.id = e.source_id
    left join public.users u on u.id = n.author_id
    where e.source_type = 'note'
      and (p_start is null or n.created_at >= p_start::timestamptz)
      and (p_end is null or n.created_at < (p_end::timestamptz + interval '1 day'))
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

ALTER FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";
