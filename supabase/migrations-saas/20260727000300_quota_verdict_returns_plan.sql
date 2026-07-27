-- Return the tenant's plan from the quota gate. Commercial project ONLY.
--
-- Annotation depth is now per-plan: Standard annotates what a human wrote, Ultimate also
-- annotates the translation. The bot therefore needs the plan on the path that schedules
-- annotation -- once per inbound message, for every message.
--
-- consume_message_quota is already there and already holds the tenant row under FOR
-- UPDATE, so the plan costs nothing to return. The alternative, a second SELECT per
-- message, buys the same value with an extra round trip, and a cached copy buys it with a
-- staleness window in which an upgrade silently doesn't take effect.
--
-- DROP then CREATE, because the return type changes and CREATE OR REPLACE cannot alter
-- it. The bot fails OPEN on an error from this function, so a message arriving in the
-- moment between the two statements is allowed through rather than refused -- which is
-- the right direction for a paying customer, and why this is safe to apply against a live
-- project.
--
-- Deploy order does not matter either: an older bot reading the extra column simply
-- ignores it, and a newer bot against the older function reads undefined and falls back to
-- Standard behaviour (the cheaper one -- never the reverse).

DROP FUNCTION IF EXISTS public.consume_message_quota(uuid);

CREATE OR REPLACE FUNCTION public.consume_message_quota(p_tenant_id uuid)
RETURNS TABLE(allowed boolean, reason text, used integer, quota integer,
              period_end timestamp with time zone, plan text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  t public.tenants%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_tenant', 0, 0, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF t.status NOT IN ('active', 'trialing') THEN
    RETURN QUERY SELECT false, 'inactive_subscription', t.messages_used, t.message_quota,
                        t.current_period_end, t.plan;
    RETURN;
  END IF;

  IF t.current_period_end IS NOT NULL AND now() >= t.current_period_end THEN
    UPDATE public.tenants
      SET messages_used = 0,
          period_started_at = now(),
          current_period_end = (
            SELECT MIN(candidate) FROM (
              SELECT t.current_period_end + (n || ' months')::interval AS candidate
              FROM generate_series(1, 120) AS n
            ) s WHERE candidate > now()
          )
      WHERE id = p_tenant_id
      RETURNING * INTO t;
  END IF;

  IF t.message_quota IS NOT NULL AND t.messages_used >= t.message_quota THEN
    RETURN QUERY SELECT false, 'quota_exceeded', t.messages_used, t.message_quota,
                        t.current_period_end, t.plan;
    RETURN;
  END IF;

  UPDATE public.tenants
    SET messages_used = messages_used + 1
    WHERE id = p_tenant_id
    RETURNING * INTO t;

  RETURN QUERY SELECT true, 'ok', t.messages_used, t.message_quota, t.current_period_end, t.plan;
END;
$$;

ALTER FUNCTION public.consume_message_quota(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_message_quota(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_message_quota(uuid) TO service_role;

COMMENT ON FUNCTION public.consume_message_quota(uuid) IS
  'Atomically rolls the billing period if elapsed, checks subscription status and cap, and increments usage. Returns the tenant plan so the caller can pick annotation depth without a second read. One call per inbound message.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.consume_message_quota(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.consume_message_quota(uuid)', 'execute') THEN
    RAISE EXCEPTION 'consume_message_quota is still executable by a public role';
  END IF;
END $$;
