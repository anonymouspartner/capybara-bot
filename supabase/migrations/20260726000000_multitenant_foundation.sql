-- Phase 1 of turning Capybara into a multi-tenant service: introduce the tenant
-- boundary and attach every existing row to it. Deliberately INERT -- no application
-- code reads these columns yet, so deploying the current build against this schema
-- behaves exactly as before. Phase 2 switches the queries over.
--
-- A tenant is a couple: one subscription, one language pair, one shared corpus. The
-- live instance becomes tenant #1, so the maintainer keeps using the bot throughout the
-- migration rather than running a forked copy.
--
-- tenant_id is denormalized onto every tenant-owned table instead of being reached
-- through conversations. That is a deliberate trade: it costs a column per table, and
-- buys a single-predicate filter (.eq("tenant_id", ...)) on all sixteen currently
-- unscoped reads. Closing cross-tenant leaks mechanically is worth more than schema
-- purity -- a missed join here leaks one couple's private messages to another.

-- ============================================================================
-- 1. The tenant itself: billing state, quota, and the onboarding pairing code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    -- Human label for support ("Tim & Vika"); never shown to the other tenant.
    "display_name" "text",

    -- Billing. Null until Stripe is wired in phase 5; the founding tenant stays null
    -- forever, which is also how any comped account is represented.
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "plan" "text" NOT NULL DEFAULT 'founder',
    -- Mirrors the Stripe subscription state. Access is gated on this in phase 5;
    -- 'active' is the only value that grants service.
    "status" "text" NOT NULL DEFAULT 'active',

    -- Usage cap. NULL means unlimited (founder/comped). Counted per period so a heavy
    -- month cannot silently run up an inference bill larger than the subscription.
    "message_quota" integer,
    "messages_used" integer NOT NULL DEFAULT 0,
    "period_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    -- Onboarding: the code a new customer sends as "/start <code>" to claim the tenant.
    -- Cleared once both seats are filled so a leaked code cannot be replayed.
    "pairing_code" "text",

    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."tenants" OWNER TO "postgres";

ALTER TABLE ONLY "public"."tenants"
  ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");

-- Partial unique indexes: many tenants legitimately have no Stripe ids and no pairing
-- code, and NULLs must not collide with each other.
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


-- ============================================================================
-- 2. The founding tenant, and tenant_id on every tenant-owned table.
--    Nullable for now: existing code writes rows without it, and a NOT NULL
--    constraint here would break the running bot on its next message.
-- ============================================================================

INSERT INTO public.tenants (display_name, plan, status, message_quota)
SELECT 'Founding instance', 'founder', 'active', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tenants);

DO $$
DECLARE
  t uuid;
  tbl text;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;

  FOREACH tbl IN ARRAY ARRAY[
    'users', 'conversations', 'messages', 'message_annotations', 'vocabulary',
    'flashcards', 'notes', 'message_pins', 'message_reconciles', 'recap_embeddings',
    'grammar_corrections', 'pending_media_group'
  ] LOOP
    -- Skip tables a given instance may not have yet (pending_media_group and
    -- grammar_corrections both arrived in later migrations).
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', tbl);
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      tbl, tbl || '_tenant_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id)
         REFERENCES public.tenants(id) ON DELETE CASCADE',
      tbl, tbl || '_tenant_id_fkey');
    -- Every phase-2 query filters on this column, so it is indexed everywhere.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      tbl || '_tenant_idx', tbl);
    -- Attach all pre-existing rows to the founding tenant.
    EXECUTE format('UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl)
      USING t;
  END LOOP;
END $$;


-- ============================================================================
-- 3. Default new rows to the founding tenant.
--
-- The running build inserts rows with no tenant_id. Until phase 2 teaches it to set
-- one, a column default keeps those inserts attached to the founding tenant instead of
-- creating orphans. Phase 2 drops these defaults and makes the column NOT NULL, once
-- every insert site passes a tenant explicitly.
-- ============================================================================

DO $$
DECLARE
  t uuid;
  tbl text;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'conversations', 'messages', 'message_annotations', 'vocabulary',
    'flashcards', 'notes', 'message_pins', 'message_reconciles', 'recap_embeddings',
    'grammar_corrections', 'pending_media_group'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT %L', tbl, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.tenants IS
  'One row per subscribing couple. Owns billing state, usage quota, and the onboarding pairing code.';
