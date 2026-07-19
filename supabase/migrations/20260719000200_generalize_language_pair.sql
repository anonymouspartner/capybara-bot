-- loosens the hardcoded en/uk language pair to an arbitrary
-- per-instance pair. Apply this BEFORE any non-en/uk data is written to a given
-- instance; it is written to be safe to run on the existing live en/uk instance
-- first (steps 1 and 3-5 are pure superset/no-op widenings for en/uk data; step 2
-- just removes CHECK constraints that no longer match app-level validation).
--
-- Order matters:
--   1. Backfill fallback annotations for message sides that the CURRENT (pre-this-
--      migration) backfill_pending_sides excludes as wrong-script/letterless, so
--      that dropping the script CASE in step 5 doesn't make those sides re-pend.
--   2. Drop the seven en/uk CHECK constraints -- the app is now the source of
--      truth for valid language codes.
--   3. recap_backfill_batch / recap_backfill_remaining: drop the
--      "original_language in ('en','uk')" filter.
--   4. refresh_vocabulary_counts: stop defaulting a missing annotation language to
--      'uk' (fallback rows are now always language-tagged, so a null simply won't
--      match any vocabulary row -- which is correct, not a regression).
--   5. backfill_pending_sides: drop the Cyrillic/Latin script CASE and the
--      'uk'/'en' filters; a side is pending iff its text is non-null and no
--      annotation row is tagged with that side's language.
--
-- All CREATE OR REPLACE bodies below start from the exact current bodies in
-- supabase/migrations/20260601000000_init_schema.sql (functions) and
-- supabase/migrations/20260621010000_backfill_skip_wrong_script.sql
-- (backfill_pending_sides). Grants are preserved for every recreated function.


-- ============================================================================
-- Step 1: backfill fallback annotations for currently-wrong-script sides that
-- lack a language-tagged annotation, so they retire once step 5 removes the
-- script check. Mirrors the CURRENT backfill_pending_sides' regex/ratio logic
-- exactly (Cyrillic U+0400-U+052F via 'Ѐ-ԯ', Latin via 'A-Za-zÀ-ſ',
-- CYRILLIC_SKIP_THRESHOLD = 0.5), but selects the COMPLEMENT of what that
-- function currently returns as pending: letterless sides, or sides whose
-- script doesn't match their tagged language.
-- ============================================================================

with orig_sides as (
  select m.id as message_id, m.original_text as text, m.original_language as language
  from public.messages m
  where m.original_text is not null
    and m.original_language in ('uk', 'en')
    and not exists (
      select 1 from public.message_annotations a
      where a.message_id = m.id and (a.details ->> 'language') = m.original_language)
),
trans_sides as (
  select m.id as message_id, m.translated_text as text, m.translated_language as language
  from public.messages m
  where m.translated_text is not null
    and m.translated_language in ('uk', 'en')
    and not exists (
      select 1 from public.message_annotations a
      where a.message_id = m.id and (a.details ->> 'language') = m.translated_language)
),
sides as (
  select * from orig_sides
  union all
  select * from trans_sides
),
scored as (
  select s.message_id, s.text, s.language,
    char_length(regexp_replace(s.text, '[^Ѐ-ԯ]', '', 'g'))      as cyr,
    char_length(regexp_replace(s.text, '[^A-Za-zÀ-ſ]', '', 'g')) as lat
  from sides s
),
wrong_script as (
  -- complement of the CURRENT backfill_pending_sides WHERE clause
  select message_id, language
  from scored
  where not (
    (cyr + lat) > 0
    and (
         (language = 'uk' and cyr::numeric / (cyr + lat) >= 0.5)
      or (language = 'en' and cyr::numeric / (cyr + lat) <= 0.5)
    )
  )
)
insert into public.message_annotations (message_id, annotation_type, annotation_value, details)
select message_id, 'register', 'neutral', jsonb_build_object('language', language)
from wrong_script
on conflict (message_id, annotation_type, annotation_value, language) do nothing;


-- ============================================================================
-- Step 2: drop the seven en/uk CHECK constraints.
-- ============================================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_native_language_check;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_learning_language_check;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_original_language_check;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_translated_language_check;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_language_check;

ALTER TABLE public.recap_embeddings
  DROP CONSTRAINT IF EXISTS recap_embeddings_language_check;

ALTER TABLE public.vocabulary
  DROP CONSTRAINT IF EXISTS vocabulary_language_check;


-- ============================================================================
-- Step 3: recap_backfill_batch / recap_backfill_remaining -- remove the
-- "original_language in ('en','uk')" filter so all rows count, regardless of
-- language.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."recap_backfill_batch"("p_limit" integer) RETURNS TABLE("id" "uuid", "original_text" "text", "original_language" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select m.id, m.original_text, m.original_language
  from public.messages m
  where m.original_text is not null
    and m.original_text <> ''
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    )
  order by m.created_at asc
  limit p_limit;
$$;

ALTER FUNCTION "public"."recap_backfill_batch"("p_limit" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "service_role";


CREATE OR REPLACE FUNCTION "public"."recap_backfill_remaining"() RETURNS TABLE("remaining" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select count(*)::bigint as remaining
  from public.messages m
  where m.original_text is not null
    and m.original_text <> ''
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    );
$$;

ALTER FUNCTION "public"."recap_backfill_remaining"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "service_role";


-- ============================================================================
-- Step 4: refresh_vocabulary_counts -- stop defaulting a missing annotation
-- language to 'uk'. Fallback annotations are always language-tagged now (see
-- step 1 and backfill_pending_sides below), so a null language should simply
-- fail to match any vocabulary row rather than being coerced to 'uk'.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."refresh_vocabulary_counts"() RETURNS "void"
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
      and a.annotation_value = v2.lemma
      and (a.details->>'part_of_speech') is not distinct from v2.part_of_speech
      and a.details->>'language' = v2.language
    group by v2.id
  ) sub
  where v.id = sub.id;
end;
$$;

ALTER FUNCTION "public"."refresh_vocabulary_counts"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "service_role";


-- ============================================================================
-- Step 5: backfill_pending_sides -- remove the Cyrillic/Latin script CASE and
-- the 'uk'/'en' filters entirely. A side is pending iff its text is non-null
-- and there is no annotation row whose details->>'language' equals the side's
-- language.
-- ============================================================================

create or replace function public.backfill_pending_sides(
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
    where m.original_text is not null
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.original_language)
    union all
    select m.id as message_id, m.translated_text as text, m.translated_language as language
    from public.messages m
    where m.translated_text is not null
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.translated_language)
  )
  select message_id, text, language
  from sides
  order by message_id
  limit p_batch_size;
$$;

grant execute on function public.backfill_pending_sides(integer) to service_role;
