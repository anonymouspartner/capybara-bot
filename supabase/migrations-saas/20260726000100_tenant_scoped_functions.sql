-- Tenant-scope every SECURITY DEFINER function. Commercial project ONLY.
--
-- These seven functions are the hole that scoping the TypeScript cannot close. They run
-- as postgres with SECURITY DEFINER, they take no tenant argument, and their bodies
-- select straight from public.messages / public.notes / public.vocabulary with no
-- boundary at all. A perfectly scoped edge function that calls
-- recap_semantic_search(embedding, 10, …) still gets rows from every couple on the
-- instance -- /recap would answer one couple's question with another couple's messages.
--
-- Each function gains a leading p_tenant_id and filters on it. The OLD signature is
-- DROPped rather than left in place: CREATE OR REPLACE with a new argument list creates
-- an OVERLOAD, so the unscoped version would remain callable and the leak would remain
-- open. Dropping it means any call site that has not been updated fails loudly with
-- "function does not exist" instead of quietly returning cross-tenant rows.
--
-- Bodies are otherwise unchanged from supabase/migrations/ -- same CTEs, same joins,
-- same ordering and limits. The only edits are the new parameter and its predicates.

-- ============================================================================
-- recap_keyword_search
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."recap_keyword_search"("text", integer, "date", "date");

CREATE OR REPLACE FUNCTION "public"."recap_keyword_search"("p_tenant_id" "uuid", "p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "language" "text", "created_at" timestamp with time zone, "sender_name" "text", "author_id" "uuid", "is_pinned" boolean, "similarity" real)
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
      and e.tenant_id = p_tenant_id
      and m.tenant_id = p_tenant_id
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
      and e.tenant_id = p_tenant_id
      and n.tenant_id = p_tenant_id
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

ALTER FUNCTION "public"."recap_keyword_search"("p_tenant_id" "uuid", "p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_tenant_id" "uuid", "p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_tenant_id" "uuid", "p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_tenant_id" "uuid", "p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";


-- ============================================================================
-- recap_semantic_search
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."recap_semantic_search"("public"."vector", integer, "date", "date");

CREATE OR REPLACE FUNCTION "public"."recap_semantic_search"("p_tenant_id" "uuid", "p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "language" "text", "created_at" timestamp with time zone, "sender_name" "text", "author_id" "uuid", "is_pinned" boolean, "similarity" double precision)
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
      and e.tenant_id = p_tenant_id
      and m.tenant_id = p_tenant_id
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
      and e.tenant_id = p_tenant_id
      and n.tenant_id = p_tenant_id
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

ALTER FUNCTION "public"."recap_semantic_search"("p_tenant_id" "uuid", "p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_tenant_id" "uuid", "p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_tenant_id" "uuid", "p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_tenant_id" "uuid", "p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";


-- ============================================================================
-- vocab_top_unlearned
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."vocab_top_unlearned"("text", "uuid", integer);

CREATE OR REPLACE FUNCTION "public"."vocab_top_unlearned"("p_tenant_id" "uuid", "p_language" "text", "p_user_id" "uuid", "p_limit" integer) RETURNS TABLE("id" "uuid", "lemma" "text", "part_of_speech" "text", "gloss" "text", "occurrence_count" integer, "language" "text", "first_seen_message_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select v.id, v.lemma, v.part_of_speech, v.gloss,
         v.occurrence_count, v.language, v.first_seen_message_id
  from public.vocabulary v
  where v.tenant_id = p_tenant_id
    and v.language = p_language
    and v.occurrence_count > 0
    and not exists (
      select 1 from public.flashcards f
      where f.vocabulary_id = v.id
        and f.user_id = p_user_id
    )
  order by v.occurrence_count desc, v.lemma asc
  limit p_limit;
$$;

ALTER FUNCTION "public"."vocab_top_unlearned"("p_tenant_id" "uuid", "p_language" "text", "p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_tenant_id" "uuid", "p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_tenant_id" "uuid", "p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_tenant_id" "uuid", "p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "service_role";


-- ============================================================================
-- refresh_vocabulary_counts
--
-- Recounting every tenant's vocabulary on one couple's message is also a cost problem,
-- not just a correctness one: the unscoped UPDATE rewrites the whole table.
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."refresh_vocabulary_counts"();

CREATE OR REPLACE FUNCTION "public"."refresh_vocabulary_counts"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.vocabulary v
  set occurrence_count = coalesce(sub.cnt, 0)
  from (
    select v2.id, count(a.id) as cnt
    from public.vocabulary v2
    left join public.message_annotations a
      on a.annotation_type = 'vocabulary'
      and a.tenant_id = v2.tenant_id
      and a.annotation_value = v2.lemma
      and (a.details->>'part_of_speech') is not distinct from v2.part_of_speech
      and a.details->>'language' = v2.language
    where v2.tenant_id = p_tenant_id
    group by v2.id
  ) sub
  where v.id = sub.id;
end;
$$;

ALTER FUNCTION "public"."refresh_vocabulary_counts"("p_tenant_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"("p_tenant_id" "uuid") TO "service_role";


-- ============================================================================
-- backfill_pending_sides
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."backfill_pending_sides"(integer);

create or replace function public.backfill_pending_sides(
  p_tenant_id uuid,
  p_batch_size integer default 16
)
returns table(message_id uuid, text text, language text)
language sql
stable
security invoker
as $$
  with sides as (
    select m.id as message_id, m.original_text as text, m.original_language as language
    from public.messages m
    where m.tenant_id = p_tenant_id
      and m.original_text is not null
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.original_language)
    union all
    select m.id as message_id, m.translated_text as text, m.translated_language as language
    from public.messages m
    where m.tenant_id = p_tenant_id
      and m.translated_text is not null
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.translated_language)
  )
  select message_id, text, language
  from sides
  order by message_id
  limit p_batch_size;
$$;

ALTER FUNCTION "public"."backfill_pending_sides"("p_tenant_id" "uuid", "p_batch_size" integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."backfill_pending_sides"("p_tenant_id" "uuid", "p_batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_pending_sides"("p_tenant_id" "uuid", "p_batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_pending_sides"("p_tenant_id" "uuid", "p_batch_size" integer) TO "service_role";


-- ============================================================================
-- recap_backfill_batch / recap_backfill_remaining
--
-- Admin-only embedding backfill utilities, but unscoped they would let one tenant's
-- admin walk every other tenant's message text.
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."recap_backfill_batch"(integer);

CREATE OR REPLACE FUNCTION "public"."recap_backfill_batch"("p_tenant_id" "uuid", "p_limit" integer) RETURNS TABLE("id" "uuid", "original_text" "text", "original_language" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select m.id, m.original_text, m.original_language
  from public.messages m
  where m.tenant_id = p_tenant_id
    and m.original_text is not null
    and m.original_text <> ''
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    )
  order by m.created_at asc
  limit p_limit;
$$;

ALTER FUNCTION "public"."recap_backfill_batch"("p_tenant_id" "uuid", "p_limit" integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_tenant_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_tenant_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_tenant_id" "uuid", "p_limit" integer) TO "service_role";


DROP FUNCTION IF EXISTS "public"."recap_backfill_remaining"();

CREATE OR REPLACE FUNCTION "public"."recap_backfill_remaining"("p_tenant_id" "uuid") RETURNS TABLE("remaining" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select count(*)::bigint as remaining
  from public.messages m
  where m.tenant_id = p_tenant_id
    and m.original_text is not null
    and m.original_text <> ''
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    );
$$;

ALTER FUNCTION "public"."recap_backfill_remaining"("p_tenant_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"("p_tenant_id" "uuid") TO "service_role";
