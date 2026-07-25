-- Take the public API surface away from the RPC functions. Commercial project ONLY.
--
-- 20260726000100 and 000200 granted the rewritten functions to service_role and assumed
-- that narrowed them. It did not, for two independent reasons:
--
--   1. The init schema sets
--        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--          GRANT ALL ON FUNCTIONS TO anon, authenticated;
--      so every new function is handed to anon the moment it exists.
--
--   2. Postgres grants EXECUTE on functions to PUBLIC by default. Even with (1) undone,
--      anon still inherits EXECUTE through PUBLIC -- which is why revoking from anon and
--      authenticated alone left has_function_privilege('anon', …) still true.
--
-- Adding a service_role grant on top of either revokes nothing. The database linter duly
-- reported all eight rewritten functions as callable via /rest/v1/rpc/<name> by anyone
-- holding the anon key -- which is public by design, shipped in client code.
--
-- On a single-tenant instance that was survivable: the anon key reached one couple's own
-- data. On a shared instance it is the exact hole 20260726000100 was written to close.
-- recap_semantic_search takes a tenant id and returns that tenant's messages; with anon
-- EXECUTE, an outsider who guesses or obtains a tenant uuid reads a couple's entire
-- private history straight from the REST API, never touching the bot.
--
-- delete_expired_pii is worse and predates all of this. It is SECURITY DEFINER, takes a
-- retention window, and deletes every message, note, annotation, pin and embedding older
-- than it. Called as delete_expired_pii(0) by an anonymous caller, it destroys the entire
-- database -- every tenant -- with one unauthenticated HTTP request.
--
-- The bot connects as service_role and never as anon, so nothing legitimate calls any of
-- these over PostgREST.

-- ============================================================================
-- New functions: no automatic grant to anon, authenticated, or PUBLIC.
-- Without this the next CREATE FUNCTION silently reopens the hole.
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ============================================================================
-- Existing functions: revoke PUBLIC/anon/authenticated, keep service_role.
--
-- Scoped to the application's OWN functions -- anything not owned by an extension.
-- A blanket `REVOKE … ON ALL FUNCTIONS IN SCHEMA public` would also strip pgvector's
-- operator support functions (l2_distance, vector_negative_inner_product, the <=>
-- implementation), which is both unnecessary and a good way to break recap search for
-- reasons that would be very hard to trace back to here.
--
-- Driven off the catalog rather than a hand-written list: a list is a thing to forget to
-- update, and the property wanted is "nothing this repo defines is publicly callable",
-- not "these nine names are not publicly callable".
-- ============================================================================

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'   -- 'e' = owned by an extension
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM "anon"', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM "authenticated"', fn.sig);
    -- service_role is the identity the edge function connects as.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO "service_role"', fn.sig);
  END LOOP;
END $$;

-- backfill_pending_sides is the one function without a pinned search_path, so a caller
-- could shadow `public` and have it resolve `messages` to their own table. It is
-- SECURITY INVOKER, which bounds the damage, but there is no reason to leave it mutable
-- when every sibling function pins it.
ALTER FUNCTION "public"."backfill_pending_sides"("p_tenant_id" "uuid", "p_batch_size" integer)
  SET "search_path" TO 'public';

-- ============================================================================
-- Verify rather than trust. A lingering EXECUTE here silently reopens the exact hole
-- this migration exists to close, and the previous attempt looked like it worked.
-- ============================================================================

DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO leaked
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'still executable by anon/authenticated after revoke: %', leaked;
  END IF;
END $$;
