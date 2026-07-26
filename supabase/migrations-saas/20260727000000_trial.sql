-- Free-trial state for people who are not yet customers. Commercial project ONLY.
--
-- Everything else in this schema hangs off a tenant. A trial user has none by definition:
-- they have not paid, so there is nothing to scope them to, and they cannot go through
-- tenantDb. That makes this the product's first code path where an unauthenticated
-- stranger causes API spend, and the design below is mostly about bounding that.
--
-- No message content is stored anywhere in here. Trial text is translated and discarded:
-- a stranger's private messages are a liability with no tenant to own them, and a row in
-- public.messages with a null tenant_id would break the orphan check in LAUNCH_SAAS.md
-- step 7. These tables hold a Telegram id, a language pair and two counters. Nothing else.


-- ============================================================================
-- trial_users
-- ============================================================================
-- The row is deliberately PERMANENT. The cap is a lifetime allowance, not a renewable
-- one: a per-period trial resets, and "delete the chat and start again" must not re-arm
-- it. Deleting old rows would hand every past visitor a fresh five messages, so there is
-- no retention job here on purpose -- which is affordable precisely because the row holds
-- no message content.

CREATE TABLE IF NOT EXISTS "public"."trial_users" (
    "telegram_id"       bigint PRIMARY KEY,
    "native_language"   text,
    "learning_language" text,
    "messages_used"     integer DEFAULT 0 NOT NULL,
    "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
    "last_message_at"   timestamp with time zone
);

ALTER TABLE "public"."trial_users" OWNER TO "postgres";


-- ============================================================================
-- trial_daily_usage
-- ============================================================================
-- A per-id cap bounds ONE abuser. It does nothing about ten thousand of them, and the
-- bot's address is public. This is the instance-wide ceiling: worst case per day is
-- (cap x per-message cost), whatever arrives.

CREATE TABLE IF NOT EXISTS "public"."trial_daily_usage" (
    "day"           date PRIMARY KEY,
    "messages_used" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."trial_daily_usage" OWNER TO "postgres";


-- ============================================================================
-- Lock both tables down.
-- ============================================================================
-- The init schema runs
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES
--     TO anon, authenticated;
-- so a table created here is handed to anon the moment it exists -- readable AND writable
-- through /rest/v1/trial_users by anyone holding the anon key, which is public by design
-- and shipped in client code. That would expose the Telegram id of every stranger who
-- ever said hello, and let anyone reset their own counter to keep the trial forever.
--
-- RLS with no policy is the real lock (it denies even a granted role); the REVOKEs are
-- belt and braces so the tables do not appear in the REST schema at all. service_role,
-- which is what the bot connects as, bypasses RLS.

ALTER TABLE "public"."trial_users"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trial_daily_usage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."trial_users"       FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."trial_daily_usage" FROM PUBLIC, "anon", "authenticated";
GRANT  ALL ON TABLE "public"."trial_users"       TO "service_role";
GRANT  ALL ON TABLE "public"."trial_daily_usage" TO "service_role";


-- ============================================================================
-- consume_trial_message
-- ============================================================================
-- One call per inbound trial message, before any model call. Mirrors
-- consume_message_quota (20260726000400): the check and the increment are one statement
-- under a row lock, because split into a read and a write in TypeScript two simultaneous
-- messages both see the last free one -- the exact bug the paid gate was written to avoid.
--
-- The caps are parameters rather than constants so the bot's own constants stay the single
-- source of truth; only service_role can call this, so a caller passing a large cap is not
-- a threat model.
--
-- Both rows are locked in a fixed order (user, then day) so concurrent callers cannot
-- deadlock against each other.
--
-- Unlike the paid gate this fails CLOSED. consume_message_quota deliberately allows a
-- message when the database errors, because a blip must not look to a paying customer like
-- a billing problem. Here the caller has paid nothing: erring towards "no free inference"
-- costs a stranger one message and costs us nothing.

CREATE OR REPLACE FUNCTION public.consume_trial_message(
  p_telegram_id bigint,
  p_trial_limit integer DEFAULT 5,
  p_daily_cap   integer DEFAULT 500
)
RETURNS TABLE(allowed boolean, reason text, used integer, trial_limit integer)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  t     public.trial_users%ROWTYPE;
  d_used integer;
BEGIN
  INSERT INTO public.trial_users (telegram_id) VALUES (p_telegram_id)
    ON CONFLICT (telegram_id) DO NOTHING;
  SELECT * INTO t FROM public.trial_users WHERE telegram_id = p_telegram_id FOR UPDATE;

  -- No language pair chosen yet: there is nothing to translate between. Checked before
  -- any counter moves, so a stray message never costs the sender an allowance.
  IF t.native_language IS NULL OR t.learning_language IS NULL THEN
    RETURN QUERY SELECT false, 'no_pair', t.messages_used, p_trial_limit;
    RETURN;
  END IF;

  -- Personal allowance before the global one, so an already-exhausted sender cannot burn
  -- the instance-wide ceiling on everyone else's behalf.
  IF t.messages_used >= p_trial_limit THEN
    RETURN QUERY SELECT false, 'trial_exhausted', t.messages_used, p_trial_limit;
    RETURN;
  END IF;

  INSERT INTO public.trial_daily_usage (day, messages_used) VALUES (current_date, 0)
    ON CONFLICT (day) DO NOTHING;
  SELECT messages_used INTO d_used FROM public.trial_daily_usage
    WHERE day = current_date FOR UPDATE;

  IF d_used >= p_daily_cap THEN
    RETURN QUERY SELECT false, 'daily_cap', t.messages_used, p_trial_limit;
    RETURN;
  END IF;

  UPDATE public.trial_daily_usage SET messages_used = messages_used + 1
    WHERE day = current_date;

  UPDATE public.trial_users
     SET messages_used = messages_used + 1,
         last_message_at = now()
   WHERE telegram_id = p_telegram_id
  RETURNING * INTO t;

  RETURN QUERY SELECT true, 'ok', t.messages_used, p_trial_limit;
END;
$$;

ALTER FUNCTION public.consume_trial_message(bigint, integer, integer) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.consume_trial_message(bigint, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_trial_message(bigint, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_trial_message(bigint, integer, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_trial_message(bigint, integer, integer) TO service_role;

COMMENT ON FUNCTION public.consume_trial_message(bigint, integer, integer) IS
  'Atomically checks a trial user''s lifetime allowance and the instance-wide daily ceiling, then increments both. One call per inbound trial message. Fails closed.';


-- ============================================================================
-- Verify rather than trust.
-- ============================================================================
-- 20260726000300 exists because a previous round of grants looked like it worked and did
-- not. Assert the end state rather than assuming the statements above achieved it.

DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(t.tbl || ' -> ' || t.role, ', ') INTO leaked
    FROM (
      SELECT c.relname AS tbl, r.rolname AS role
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated']) AS rolname) r
       WHERE n.nspname = 'public'
         AND c.relname IN ('trial_users','trial_daily_usage')
         AND (
           has_table_privilege(r.rolname, c.oid, 'SELECT') OR
           has_table_privilege(r.rolname, c.oid, 'INSERT') OR
           has_table_privilege(r.rolname, c.oid, 'UPDATE') OR
           has_table_privilege(r.rolname, c.oid, 'DELETE')
         )
    ) t;
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'trial tables still reachable by a public role: %', leaked;
  END IF;

  IF has_function_privilege('anon', 'public.consume_trial_message(bigint,integer,integer)', 'execute')
     OR has_function_privilege('authenticated', 'public.consume_trial_message(bigint,integer,integer)', 'execute') THEN
    RAISE EXCEPTION 'consume_trial_message is still executable by a public role';
  END IF;

  IF NOT (SELECT bool_and(c.relrowsecurity)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname IN ('trial_users','trial_daily_usage')) THEN
    RAISE EXCEPTION 'RLS is not enabled on both trial tables';
  END IF;
END $$;
