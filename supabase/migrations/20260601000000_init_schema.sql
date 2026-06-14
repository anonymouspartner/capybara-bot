


-- Capybara initial migration -- the canonical, versioned source for the database.
--
-- This is the first (and currently only) Supabase migration. Apply it to a fresh
-- project either way:
--   * CLI:        `supabase db push --project-ref <ref>`   (records it as applied)
--   * Dashboard:  paste the entire contents into the SQL editor and Run.
-- It is idempotent (IF NOT EXISTS / OR REPLACE), so re-running is safe.
--
-- Existing primary project: the schema is already applied there from before
-- migrations existed. Don't re-run blindly; record this as the baseline with
-- `supabase migration repair --status applied 20260601000000 --project-ref <ref>`.
--
-- Capybara base schema -- public schema, schema-only (no data rows).
--
-- Provenance: produced by `supabase db dump --schema public` against the live
-- primary project (ref <project-ref>) on 2026-06-01. The body below is
-- that dump verbatim -- ground-truth-extracted, not hand-written from memory.
--
-- One addition: the three CREATE EXTENSION statements further down (just after
-- the schema/owner block, before the first function). `supabase db dump
-- --schema public` never emits extension creation, but this schema depends on
-- vector (schema public), pg_trgm (schema extensions) and uuid-ossp (schema
-- extensions) -- confirmed against the live project's installed extensions.
-- Without them a fresh project fails at the first `public.vector` reference.
--
-- Apply to a fresh Supabase project (Dashboard SQL editor or CLI) to build an
-- empty instance from zero. Idempotent: IF NOT EXISTS / OR REPLACE throughout,
-- so re-running is safe. The roles referenced (postgres, anon, authenticated,
-- service_role, pg_database_owner) are standard Supabase roles present in every
-- project; the bot connects as service_role (RLS enabled, no policies -- the
-- service role bypasses RLS, so the explicit grants below are what it relies on).

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


-- Extensions (prepended; not emitted by `supabase db dump --schema public`).
-- Schemas match the live project (verified 2026-06-01): vector -> public,
-- pg_trgm -> extensions, uuid-ossp -> extensions. On a fresh Supabase project
-- uuid-ossp is preinstalled (no-op here); vector and pg_trgm are not, and are
-- required before the tables/functions below can load. The `extensions` schema
-- exists by default on every Supabase project.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";



CREATE OR REPLACE FUNCTION "public"."recap_backfill_batch"("p_limit" integer) RETURNS TABLE("id" "uuid", "original_text" "text", "original_language" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select m.id, m.original_text, m.original_language
  from public.messages m
  where m.original_text is not null
    and m.original_text <> ''
    and m.original_language in ('en', 'uk')
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    )
  order by m.created_at asc
  limit p_limit;
$$;


ALTER FUNCTION "public"."recap_backfill_batch"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recap_backfill_remaining"() RETURNS TABLE("remaining" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select count(*)::bigint as remaining
  from public.messages m
  where m.original_text is not null
    and m.original_text <> ''
    and m.original_language in ('en', 'uk')
    and not exists (
      select 1 from public.recap_embeddings e
      where e.source_type = 'message' and e.source_id = m.id
    );
$$;


ALTER FUNCTION "public"."recap_backfill_remaining"() OWNER TO "postgres";


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
    left join public.users u on u.native_language = m.original_language
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
    left join public.users u on u.native_language = m.original_language
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
      and coalesce(a.details->>'language', 'uk') = v2.language
    group by v2.id
  ) sub
  where v.id = sub.id;
end;
$$;


ALTER FUNCTION "public"."refresh_vocabulary_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  insert into public.recap_embeddings (source_type, source_id, content, language, embedding)
  values (p_source_type, p_source_id, p_content, p_language, p_embedding)
  on conflict (source_type, source_id) do update
    set content   = excluded.content,
        language  = excluded.language,
        embedding = excluded.embedding;
end;
$$;


ALTER FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vocab_top_unlearned"("p_language" "text", "p_user_id" "uuid", "p_limit" integer) RETURNS TABLE("id" "uuid", "lemma" "text", "part_of_speech" "text", "gloss" "text", "occurrence_count" integer, "language" "text", "first_seen_message_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select v.id, v.lemma, v.part_of_speech, v.gloss,
         v.occurrence_count, v.language, v.first_seen_message_id
  from public.vocabulary v
  where v.language = p_language
    and v.occurrence_count > 0
    and not exists (
      select 1 from public.flashcards f
      where f.vocabulary_id = v.id
        and f.user_id = p_user_id
    )
  order by v.occurrence_count desc, v.lemma asc
  limit p_limit;
$$;


ALTER FUNCTION "public"."vocab_top_unlearned"("p_language" "text", "p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vocabulary_id" "uuid" NOT NULL,
    "example_message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flashcards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_annotations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "annotation_type" "text" NOT NULL,
    "annotation_value" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_annotations_annotation_type_check" CHECK (("annotation_type" = ANY (ARRAY['grammar'::"text", 'idiom'::"text", 'register'::"text", 'vocabulary'::"text"])))
);


ALTER TABLE "public"."message_annotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_pins" (
    "message_id" "uuid" NOT NULL,
    "pinned_by" "uuid" NOT NULL,
    "pinned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reconciles" (
    "message_id" "uuid" NOT NULL,
    "reconciled_by" "uuid" NOT NULL,
    "reconciled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reconciles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "telegram_message_id" bigint,
    "original_text" "text" NOT NULL,
    "original_language" "text" NOT NULL,
    "translated_text" "text",
    "translated_language" "text",
    "input_type" "text" NOT NULL,
    "voice_file_id" "text",
    "voice_storage_path" "text",
    "voice_duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_input_type_check" CHECK (("input_type" = ANY (ARRAY['text'::"text", 'voice'::"text"]))),
    CONSTRAINT "messages_original_language_check" CHECK (("original_language" = ANY (ARRAY['en'::"text", 'uk'::"text"]))),
    CONSTRAINT "messages_translated_language_check" CHECK (("translated_language" = ANY (ARRAY['en'::"text", 'uk'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "language" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notes_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'uk'::"text"])))
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recap_embeddings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "language" "text" NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recap_embeddings_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'uk'::"text"]))),
    CONSTRAINT "recap_embeddings_source_type_check" CHECK (("source_type" = ANY (ARRAY['message'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."recap_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "telegram_id" bigint NOT NULL,
    "display_name" "text" NOT NULL,
    "native_language" "text" NOT NULL,
    "learning_language" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "users_learning_language_check" CHECK (("learning_language" = ANY (ARRAY['en'::"text", 'uk'::"text"]))),
    CONSTRAINT "users_native_language_check" CHECK (("native_language" = ANY (ARRAY['en'::"text", 'uk'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vocabulary" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lemma" "text" NOT NULL,
    "part_of_speech" "text",
    "gloss" "text",
    "first_seen_message_id" "uuid",
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "difficulty_estimate" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text" NOT NULL,
    "lemma_translation" "text",
    CONSTRAINT "vocabulary_difficulty_estimate_check" CHECK ((("difficulty_estimate" >= 1) AND ("difficulty_estimate" <= 5))),
    CONSTRAINT "vocabulary_language_check" CHECK (("language" = ANY (ARRAY['uk'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."vocabulary" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vocabulary"."lemma_translation" IS 'Translation of the lemma into the opposite language (Ukrainian for English lemmas, English for Ukrainian lemmas). Populated by annotation for new rows, backfilled for old rows.';



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_user_id_vocabulary_id_key" UNIQUE ("user_id", "vocabulary_id");



ALTER TABLE ONLY "public"."message_annotations"
    ADD CONSTRAINT "message_annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_annotations"
    ADD CONSTRAINT "message_annotations_unique_finding" UNIQUE NULLS NOT DISTINCT ("message_id", "annotation_type", "annotation_value");



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."message_reconciles"
    ADD CONSTRAINT "message_reconciles_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recap_embeddings"
    ADD CONSTRAINT "recap_embeddings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recap_embeddings"
    ADD CONSTRAINT "recap_embeddings_source_type_source_id_key" UNIQUE ("source_type", "source_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_telegram_id_key" UNIQUE ("telegram_id");



ALTER TABLE ONLY "public"."vocabulary"
    ADD CONSTRAINT "vocabulary_lemma_pos_lang_key" UNIQUE NULLS NOT DISTINCT ("lemma", "part_of_speech", "language");



ALTER TABLE ONLY "public"."vocabulary"
    ADD CONSTRAINT "vocabulary_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_annotations_message" ON "public"."message_annotations" USING "btree" ("message_id");



CREATE INDEX "idx_annotations_type_value" ON "public"."message_annotations" USING "btree" ("annotation_type", "annotation_value");



CREATE INDEX "idx_messages_original_language" ON "public"."messages" USING "btree" ("original_language");



CREATE INDEX "idx_notes_author_created" ON "public"."notes" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_recap_embeddings_content_trgm" ON "public"."recap_embeddings" USING "gin" ("content" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_recap_embeddings_source_lookup" ON "public"."recap_embeddings" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_recap_embeddings_vector" ON "public"."recap_embeddings" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "idx_vocabulary_lemma" ON "public"."vocabulary" USING "btree" ("lemma");



CREATE INDEX "idx_vocabulary_occurrence" ON "public"."vocabulary" USING "btree" ("occurrence_count" DESC);



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_example_message_id_fkey" FOREIGN KEY ("example_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_annotations"
    ADD CONSTRAINT "message_annotations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_pins"
    ADD CONSTRAINT "message_pins_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."message_reconciles"
    ADD CONSTRAINT "message_reconciles_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reconciles"
    ADD CONSTRAINT "message_reconciles_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vocabulary"
    ADD CONSTRAINT "vocabulary_first_seen_message_id_fkey" FOREIGN KEY ("first_seen_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_annotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_pins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reconciles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recap_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vocabulary" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "anon";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_backfill_remaining"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_vocabulary_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vocab_top_unlearned"("p_language" "text", "p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."flashcards" TO "anon";
GRANT ALL ON TABLE "public"."flashcards" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcards" TO "service_role";



GRANT ALL ON TABLE "public"."message_annotations" TO "anon";
GRANT ALL ON TABLE "public"."message_annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."message_annotations" TO "service_role";



GRANT ALL ON TABLE "public"."message_pins" TO "anon";
GRANT ALL ON TABLE "public"."message_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."message_pins" TO "service_role";



GRANT ALL ON TABLE "public"."message_reconciles" TO "anon";
GRANT ALL ON TABLE "public"."message_reconciles" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reconciles" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."recap_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."recap_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."recap_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vocabulary" TO "anon";
GRANT ALL ON TABLE "public"."vocabulary" TO "authenticated";
GRANT ALL ON TABLE "public"."vocabulary" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







