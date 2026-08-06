-- Multi-tenant foundation for the commercial build. Commercial project ONLY --
-- see supabase/migrations-saas/README.md.
--
-- This assumes a CLEAN database: every base migration in supabase/migrations/ has been
-- applied and no tenant rows exist yet. That is what lets tenant_id be NOT NULL from the
-- start, with no column defaults and no founding-tenant backfill. There is no "inert"
-- phase to live through, because there is no live traffic to keep serving.
--
-- A tenant is a couple: one subscription, one language pair, one shared corpus.

-- ============================================================================
-- 1. The tenant itself: billing state, quota, and the onboarding pairing code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    -- Human label for support ("Tim & Vika"); never shown to another tenant.
    "display_name" "text",

    -- Billing, mirrored from Stripe. A tenant exists from the moment someone starts
    -- checkout, so it must have a representable pre-payment state: 'incomplete'.
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "plan" "text" NOT NULL DEFAULT 'trial',
    -- Access is gated on this. 'active' is the only value that grants service;
    -- 'incomplete', 'past_due' and 'canceled' all deny it.
    "status" "text" NOT NULL DEFAULT 'incomplete',

    -- Usage cap. NULL means unlimited (comped accounts only). Counted per period so a
    -- heavy month cannot run up an inference bill larger than the subscription.
    "message_quota" integer,
    "messages_used" integer NOT NULL DEFAULT 0,
    "period_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    -- Onboarding: the code a new customer sends as "/start <code>" to claim the tenant.
    -- Cleared once both seats are filled, so a leaked code cannot be replayed.
    "pairing_code" "text",

    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."tenants" OWNER TO "postgres";

ALTER TABLE ONLY "public"."tenants"
  ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");

-- Partial unique indexes: most tenants legitimately have no Stripe ids and no pairing
-- code, and those NULLs must not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_stripe_customer_idx"
  ON "public"."tenants" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_stripe_subscription_idx"
  ON "public"."tenants" ("stripe_subscription_id") WHERE "stripe_subscription_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_pairing_code_idx"
  ON "public"."tenants" ("pairing_code") WHERE "pairing_code" IS NOT NULL;

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";

COMMENT ON TABLE public.tenants IS
  'One row per subscribing couple. Owns billing state, usage quota, and the onboarding pairing code.';


-- ============================================================================
-- 2. tenant_id on every tenant-owned table, NOT NULL, indexed.
--
-- Missing tables abort the migration instead of being skipped. A skipped table is a
-- table without a tenant boundary, which is exactly the failure this migration exists
-- to prevent -- better to fail here than to discover it in production.
-- ============================================================================

DO $$
DECLARE
  tbl text;
  has_rows boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants) THEN
    RAISE EXCEPTION
      'public.tenants already has rows -- this migration is clean-slate only';
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'users', 'conversations', 'messages', 'message_annotations', 'vocabulary',
    'flashcards', 'notes', 'message_pins', 'message_reconciles', 'recap_embeddings',
    'grammar_corrections', 'pending_media_group'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE EXCEPTION
        'public.% is missing -- apply every migration in supabase/migrations/ before this one', tbl;
    END IF;
    -- Checked up front, before any DDL. An empty tenants table does NOT imply an empty
    -- database: a project can carry a whole single-tenant corpus and still have no
    -- tenants row. Without this the loop gets partway through, hits SET NOT NULL on the
    -- first populated table, and aborts -- correct, but it reports a constraint error
    -- rather than the actual problem.
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', tbl) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION
        'public.% has rows -- this migration is clean-slate only. Either wipe the tenant-owned tables first, or write a backfill migration that assigns the existing rows to a tenant before setting NOT NULL.', tbl;
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'users', 'conversations', 'messages', 'message_annotations', 'vocabulary',
    'flashcards', 'notes', 'message_pins', 'message_reconciles', 'recap_embeddings',
    'grammar_corrections', 'pending_media_group'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', tbl);
    -- Safe only because the database is empty; asserted above.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      tbl, tbl || '_tenant_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id)
         REFERENCES public.tenants(id) ON DELETE CASCADE',
      tbl, tbl || '_tenant_id_fkey');
    -- Every read filters on this column, so it is indexed everywhere.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      tbl || '_tenant_idx', tbl);
  END LOOP;
END $$;


-- ============================================================================
-- 3. Re-scope uniqueness that was global in the single-tenant schema.
--
-- vocabulary is the dangerous one. Its key is (lemma, part_of_speech, language) with no
-- reference to any tenant-owned row, so with two tenants the second couple's upsert of
-- "собака" would CONFLICT with the first couple's row and return THEIR vocabulary id --
-- silently attaching one couple's gloss, occurrence count and first-seen message to the
-- other couple's flashcards. Tenant-scoping the key is what makes the upsert correct.
--
-- The other unique keys are already tenant-safe because they are keyed on a
-- tenant-owned uuid:
--   flashcards (user_id, vocabulary_id)                          -- user_id is scoped
--   message_annotations (message_id, type, value, language)      -- message_id is scoped
--   recap_embeddings (source_type, source_id)                    -- source_id is scoped
--
-- users.telegram_id stays GLOBALLY unique on purpose. One Telegram account belongs to
-- exactly one couple, and the webhook resolves an incoming update by telegram_id alone --
-- there is no tenant context to scope the lookup by until after it succeeds. Making it
-- per-tenant would make that first lookup ambiguous.
-- ============================================================================

ALTER TABLE public.vocabulary
  DROP CONSTRAINT IF EXISTS vocabulary_lemma_pos_lang_key;

ALTER TABLE public.vocabulary
  ADD CONSTRAINT vocabulary_tenant_lemma_pos_lang_key
  UNIQUE NULLS NOT DISTINCT (tenant_id, lemma, part_of_speech, language);

COMMENT ON CONSTRAINT vocabulary_tenant_lemma_pos_lang_key ON public.vocabulary IS
  'Tenant-scoped: each couple builds its own vocabulary corpus. A global key would let one couple''s upsert return another couple''s row.';
