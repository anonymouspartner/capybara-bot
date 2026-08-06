-- Guard: keep the unscoped backfill_pending_sides out of the commercial project.
--
-- migrations/20260726010000_backfill_original_sides_only.sql rewrites the BASE, 1-argument
-- backfill_pending_sides(integer) so the single-tenant bot stops re-annotating machine
-- translations. Base migrations are applied to both projects, and that one uses
-- CREATE OR REPLACE.
--
-- On the commercial project that is not a replacement -- it is an ADDITION. 20260726000100
-- dropped the 1-argument version here and created a tenant-scoped
-- backfill_pending_sides(uuid, integer) in its place. A different argument list means
-- Postgres creates a second, overloaded function rather than replacing the first, so
-- re-running the base migrations would quietly restore an unscoped function that reads
-- public.messages across every tenant -- the exact cross-tenant read primitive that
-- 20260726000100 removed and 20260726000300 revoked public access to.
--
-- The tenant-scoped (uuid, integer) function is not touched by the base migration and
-- needs no repair, so this drops the unscoped overload instead of re-applying anything.
-- Idempotent, and a no-op on a project where the base migration has not been re-run.
--
-- The commercial build deliberately still annotates BOTH sides: halving the flashcards a
-- subscriber receives is a product decision, not a cost decision, and it is not one this
-- repo makes on their behalf.

DROP FUNCTION IF EXISTS "public"."backfill_pending_sides"(integer);

-- Verify rather than trust: assert exactly one backfill_pending_sides remains and that it
-- is the tenant-scoped one. A silent extra overload here is precisely the failure this
-- file exists to prevent, so it must fail loudly rather than pass quietly.
DO $$
DECLARE
  sigs text;
  n    integer;
BEGIN
  SELECT count(*), coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' | '), '(none)')
    INTO n, sigs
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'backfill_pending_sides';

  IF n <> 1 OR sigs NOT LIKE '%uuid%' THEN
    RAISE EXCEPTION
      'backfill_pending_sides must exist exactly once, tenant-scoped; found % overload(s): %',
      n, sigs;
  END IF;
END $$;
