-- Billing and self-serve onboarding. Commercial project ONLY.
--
-- The single-tenant bot is provisioned by hand: collect two Telegram ids, edit
-- seed_couple.sql, run it in the dashboard. That cannot scale to customers, and it is
-- the thing this migration exists to replace.
--
-- Flow is pay-first. Stripe Checkout is the only way a tenant comes into existence, so
-- the bot never spends inference on anyone who has not paid, and there is no abuse
-- surface in the onboarding path itself.
--
--   1. Customer completes Checkout.
--   2. The webhook creates the tenant (status 'active') with a random pairing_code, and
--      its conversation row.
--   3. Stripe's success_url points at the claim route, which looks the tenant up by
--      checkout session id and 302s to https://t.me/<bot>?start=<pairing_code>.
--   4. Telegram sends "/start <pairing_code>" on the customer's behalf. They claim the
--      first seat; the bot hands them an invite link carrying the same code for their
--      partner.
--   5. Second seat claimed -> pairing_code is cleared, so a leaked link is inert.

-- ============================================================================
-- 1. Tenant columns for the checkout -> claim handoff and the billing period.
-- ============================================================================

ALTER TABLE public.tenants
  -- What the claim route looks the tenant up by. Stripe substitutes the real id into
  -- success_url via {CHECKOUT_SESSION_ID}, so this is the only identifier the customer's
  -- browser carries back, and it must therefore be unguessable-by-enumeration (it is --
  -- Stripe session ids are long and random) and single-purpose.
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  -- Which price they bought. The plan/quota mapping lives in the edge function's env
  -- (STRIPE_PRICE_STANDARD / STRIPE_PRICE_HEAVY), not here, so prices can be re-pointed
  -- without a migration; this records what was actually charged.
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  -- End of the paid period, mirrored from the subscription. Quota resets when the clock
  -- passes this, so usage windows line up with what the customer is billed for rather
  -- than with a rolling 30 days that would drift out of step with their invoice.
  ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone,
  -- A code that never expires is a permanent invite to a stranger. Cleared outright once
  -- both seats are claimed; this bounds the window if a subscription is abandoned
  -- half-onboarded.
  ADD COLUMN IF NOT EXISTS pairing_code_expires_at timestamp with time zone,
  -- The person who paid: the only member who may manage the subscription. Nullable until
  -- they claim their seat, because the tenant exists from the moment Checkout completes.
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_owner_user_id_fkey;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_checkout_session_idx
  ON public.tenants (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.pairing_code IS
  'Claim code for both seats. Delivered via a t.me deep link; cleared once the second seat is taken so a leaked link is inert.';


-- ============================================================================
-- 2. Quota accounting.
--
-- One function, called once per inbound message, doing three things that must not be
-- separable: roll the period if it has elapsed, check the cap, and increment. Splitting
-- them across a read and a write in the edge function would let two messages arriving
-- together both read messages_used = quota - 1 and both proceed. UPDATE ... RETURNING
-- makes the whole thing a single atomic statement, so the row lock serializes them.
--
-- Returns the decision plus the numbers the caller needs to write a useful message, so
-- the bot never has to issue a second read to find out how close to the cap it is.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_message_quota(p_tenant_id uuid)
RETURNS TABLE(allowed boolean, reason text, used integer, quota integer, period_end timestamp with time zone)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  t public.tenants%ROWTYPE;
BEGIN
  -- Lock the row for the duration: everything below reads and then writes it.
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_tenant', 0, 0, NULL::timestamptz;
    RETURN;
  END IF;

  -- Subscription state gates everything. 'active' and 'trialing' are the only Stripe
  -- statuses that mean "this person is paid up"; past_due, canceled, unpaid and
  -- incomplete all deny, and the caller distinguishes them by tenants.status.
  IF t.status NOT IN ('active', 'trialing') THEN
    RETURN QUERY SELECT false, 'inactive_subscription', t.messages_used, t.message_quota, t.current_period_end;
    RETURN;
  END IF;

  -- Roll the window if the paid period has elapsed. Done here rather than by a scheduled
  -- job so it cannot drift or be missed: the reset happens on the first message after the
  -- boundary, which is the first moment it can possibly matter.
  IF t.current_period_end IS NOT NULL AND now() >= t.current_period_end THEN
    UPDATE public.tenants
      SET messages_used = 0,
          period_started_at = now(),
          -- Advance by whole months until the end is in the future. A tenant dormant for
          -- three months lands on the correct current window rather than one long past.
          current_period_end = (
            SELECT MIN(candidate) FROM (
              SELECT t.current_period_end + (n || ' months')::interval AS candidate
              FROM generate_series(1, 120) AS n
            ) s WHERE candidate > now()
          )
      WHERE id = p_tenant_id
      RETURNING * INTO t;
  END IF;

  -- NULL quota means uncapped (comped accounts, and the operator's own tenant).
  IF t.message_quota IS NOT NULL AND t.messages_used >= t.message_quota THEN
    RETURN QUERY SELECT false, 'quota_exceeded', t.messages_used, t.message_quota, t.current_period_end;
    RETURN;
  END IF;

  UPDATE public.tenants
    SET messages_used = messages_used + 1
    WHERE id = p_tenant_id
    RETURNING * INTO t;

  RETURN QUERY SELECT true, 'ok', t.messages_used, t.message_quota, t.current_period_end;
END;
$$;

ALTER FUNCTION public.consume_message_quota(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_message_quota(uuid) TO service_role;

COMMENT ON FUNCTION public.consume_message_quota(uuid) IS
  'Atomically rolls the billing period if elapsed, checks subscription status and cap, and increments usage. One call per inbound message.';


-- ============================================================================
-- 3. Seat claiming.
--
-- Also a single statement, for the same reason: two people tapping the same invite link
-- at the same moment must not both be handed the last seat. The pairing code is matched
-- and the seat count checked inside one locked read.
--
-- Returns an outcome string rather than raising, because every failure here is something
-- the bot has to explain to a human ("that link has expired"), not an error to log.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_tenant_seat(p_pairing_code text)
RETURNS TABLE(outcome text, tenant_id uuid, seats_taken integer)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  t public.tenants%ROWTYPE;
  n integer;
BEGIN
  SELECT * INTO t FROM public.tenants
    WHERE pairing_code = p_pairing_code FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_code', NULL::uuid, 0;
    RETURN;
  END IF;

  IF t.pairing_code_expires_at IS NOT NULL AND now() >= t.pairing_code_expires_at THEN
    RETURN QUERY SELECT 'expired_code', t.id, 0;
    RETURN;
  END IF;

  IF t.status NOT IN ('active', 'trialing') THEN
    RETURN QUERY SELECT 'inactive_subscription', t.id, 0;
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM public.users WHERE users.tenant_id = t.id;

  -- Two seats per tenant: a tenant is a couple.
  IF n >= 2 THEN
    RETURN QUERY SELECT 'full', t.id, n;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ok', t.id, n;
END;
$$;

ALTER FUNCTION public.claim_tenant_seat(text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.claim_tenant_seat(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_tenant_seat(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_tenant_seat(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tenant_seat(text) TO service_role;
