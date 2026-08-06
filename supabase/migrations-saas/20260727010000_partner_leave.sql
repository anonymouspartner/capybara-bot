-- Releasing a seat: a partner leaving, or an owner removing and replacing them.
--
-- Until now the only exit was /delete_account, which is owner-only and destroys the whole
-- couple. The partner had no lever at all: if a relationship ended, their messages stayed
-- in someone else's paid account with no way to withdraw.
--
-- WHY THIS IS A SOFT LEAVE, NOT A DELETE
--
-- messages.sender_id is ON DELETE RESTRICT, so Postgres physically refuses to remove a
-- user who has ever sent a message. That is not an obstacle to work around -- it is the
-- schema stating that a shared conversation is not one participant's to erase. The other
-- person paid for that corpus, /recap is grounded in it, and deleting half a conversation
-- would leave the remaining half incoherent (replies with nothing to reply to).
--
-- So leaving revokes ACCESS and removes what is genuinely personal -- flashcards, notes,
-- grammar corrections -- while the shared history stays with the account that owns it.
-- Same shape as leaving a group chat: you go, what you already said does not.
--
-- Anyone who wants the whole corpus gone still has that: the owner runs /delete_account,
-- which cancels billing and deletes everything including storage.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

COMMENT ON COLUMN public.users.left_at IS
  'When this member left the tenant. NULL = active member. A non-NULL row is retained '
  'only so messages.sender_id (ON DELETE RESTRICT) stays satisfiable and the shared '
  'history remains attributable; it grants no access.';

-- The unique index on telegram_id has to become PARTIAL.
--
-- It is global, so a retained left row would permanently block that person from ever
-- joining ANY tenant again -- someone leaves a relationship, later signs up with a new
-- partner, and the insert fails on a row they cannot see and did not know exists. Scoping
-- uniqueness to active members keeps the guarantee that matters (one live membership per
-- Telegram account, which is what makes lookupUser's tenant resolution unambiguous) while
-- letting history accumulate underneath it.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_telegram_id_key;
DROP INDEX IF EXISTS public.users_telegram_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_active_key
  ON public.users (telegram_id)
  WHERE left_at IS NULL;

-- Every lookup that means "a current member" filters on left_at IS NULL, so give that
-- shape an index rather than leaving it to a filter over the tenant scan.
CREATE INDEX IF NOT EXISTS users_tenant_active_idx
  ON public.users (tenant_id)
  WHERE left_at IS NULL;

-- Seat counting must ignore departed members, or a tenant whose partner left would report
-- 'full' forever and the freed seat could never be refilled.
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

  -- left_at IS NULL: a departed member does not hold their seat.
  SELECT count(*) INTO n FROM public.users
    WHERE users.tenant_id = t.id AND users.left_at IS NULL;

  -- Two seats per tenant.
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

-- Releasing a seat is several writes that must not half-apply: personal data removed,
-- seat released, pairing code reissued so the owner can invite someone else. One function
-- so a failure rolls back whole rather than stranding a member who is partly gone -- no
-- access, but still holding the seat.
--
-- ONE FUNCTION FOR BOTH EXITS. A partner leaving and an owner removing them differ only
-- in who is allowed to do it; the data work is identical. Splitting them would be two
-- copies of the delete-and-release logic, free to drift, and the drift would be silent --
-- one path forgetting to clear notes, say, leaves private notes readable by whoever
-- inherits the account.
--
--   actor = target  -> leaving. Refused for the owner: the subscription is theirs, and a
--                      tenant whose owner walked out keeps billing with nobody able to
--                      reach the portal to stop it. They use /delete_account.
--   actor ≠ target  -> removal. The actor must own the tenant. Nobody else can eject a
--                      member, and the owner cannot be ejected.
--
-- The new pairing code is MINTED HERE rather than passed in. stripe-billing already owns a
-- generator with a deliberately look-alike-free alphabet (no 0/O, no 1/l/I, because the
-- code gets read off a screen and sometimes typed by hand); duplicating that into the bot
-- would be a second copy free to drift from the first. Generating it inside the same
-- transaction that frees the seat also means there is no window where the seat is open but
-- no code exists.
--
-- The departed member's telegram_id and language come back with the result so the caller
-- can tell them, in their own language, without a second read against a row it has just
-- changed.
CREATE OR REPLACE FUNCTION public.release_seat(p_actor_user_id uuid, p_target_user_id uuid)
RETURNS TABLE(outcome text, tenant_id uuid, pairing_code text,
              target_telegram_id bigint, target_native_language text, target_display_name text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  a public.users%ROWTYPE;
  u public.users%ROWTYPE;
  t public.tenants%ROWTYPE;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  new_code text := '';
  i integer;
BEGIN
  SELECT * INTO a FROM public.users WHERE id = p_actor_user_id FOR UPDATE;
  IF NOT FOUND OR a.left_at IS NOT NULL THEN
    RETURN QUERY SELECT 'unknown_actor', NULL::uuid, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO u FROM public.users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_user', NULL::uuid, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF u.left_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_left', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Cross-tenant guard. Both ids arrive from the caller, and an actor from one tenant
  -- ejecting a member of another would be the worst bug this function could have.
  IF a.tenant_id <> u.tenant_id THEN
    RETURN QUERY SELECT 'different_tenant', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO t FROM public.tenants WHERE id = u.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_tenant', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_actor_user_id = p_target_user_id THEN
    -- Leaving.
    IF t.owner_user_id = p_target_user_id THEN
      RETURN QUERY SELECT 'is_owner', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
      RETURN;
    END IF;
  ELSE
    -- Removal: only the owner, and never of the owner.
    IF t.owner_user_id <> p_actor_user_id THEN
      RETURN QUERY SELECT 'not_owner', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
      RETURN;
    END IF;
    IF t.owner_user_id = p_target_user_id THEN
      RETURN QUERY SELECT 'is_owner', u.tenant_id, NULL::text, NULL::bigint, NULL::text, NULL::text;
      RETURN;
    END IF;
  END IF;

  -- Personal study data goes with the person. These are individually owned, unlike the
  -- messages: a deck is what YOU chose to learn, a note is private to its author by
  -- construction, and a grammar correction is a record of your own mistakes. Clearing
  -- notes matters most on the removal path -- they were written on the promise that only
  -- their author could retrieve them, and the account is about to change hands.
  DELETE FROM public.flashcards WHERE user_id = p_target_user_id;
  DELETE FROM public.notes WHERE author_id = p_target_user_id;
  DELETE FROM public.grammar_corrections WHERE user_id = p_target_user_id;

  -- Pins and reconciles are deliberately KEPT. They are curation of the shared corpus --
  -- "this message mattered", "ignore this one" -- and they shape the remaining person's
  -- /recap. Removing them would silently change results for someone who did not act.
  -- (Both are ON DELETE NO ACTION anyway, which is why the user row is retained.)

  UPDATE public.users SET left_at = now() WHERE id = p_target_user_id;

  FOR i IN 1..12 LOOP
    new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;

  -- Release the seat: a FRESH code, so the owner can invite someone else. Reusing the old
  -- one would let anyone still holding the original link walk into the vacated seat --
  -- including the person who was just removed.
  UPDATE public.tenants
     SET pairing_code = new_code,
         pairing_code_expires_at = now() + interval '14 days'
   WHERE id = u.tenant_id;

  RETURN QUERY SELECT 'ok', u.tenant_id, new_code, u.telegram_id, u.native_language, u.display_name;
END;
$$;

ALTER FUNCTION public.release_seat(uuid, uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.release_seat(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_seat(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_seat(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_seat(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'users_telegram_id_active_key'
  ) THEN
    RAISE EXCEPTION 'partial unique index on users.telegram_id was not created';
  END IF;
  IF to_regprocedure('public.release_seat(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'release_seat was not created';
  END IF;
END $$;
