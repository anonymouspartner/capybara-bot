-- Stop offering the machine-translated side to /backfill. Commercial project ONLY.
--
-- telegram-bot-saas no longer annotates translations (ANNOTATE_TRANSLATION_SIDE). This
-- function has to change with it: it returns a side as pending whenever that side lacks a
-- language-tagged annotation, and it offered BOTH. Left alone, the next /backfill would
-- re-annotate every translation side at full price -- the saving would evaporate on the
-- first grind, and the run would never reach "all done" because nothing would retire
-- those rows.
--
-- This is the tenant-scoped (uuid, integer) version created by 20260726000100. The base
-- migration 20260726010000 made the equivalent change to the single-tenant 1-argument
-- function; that one does not exist on this project, and 20260726010000 (saas) exists to
-- keep it that way.
--
-- The body is otherwise unchanged from 20260726000100: same tenant filter, same
-- anti-join, same ordering and limit. Only the trans_sides arm of the UNION is gone, so a
-- diff against that file should show exactly that.
--
-- Reversing this is reverting the file, not deleting data: the annotations already
-- written for translation sides are untouched, and existing flashcards sourced from them
-- keep working (resenseGrind resolves either side).

CREATE OR REPLACE FUNCTION public.backfill_pending_sides(
  p_tenant_id uuid,
  p_batch_size integer DEFAULT 16
)
RETURNS TABLE(message_id uuid, text text, language text)
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  SELECT m.id AS message_id, m.original_text AS text, m.original_language AS language
    FROM public.messages m
   WHERE m.tenant_id = p_tenant_id
     AND m.original_text IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.message_annotations a
        WHERE a.message_id = m.id
          AND (a.details ->> 'language') = m.original_language)
   ORDER BY m.id
   LIMIT p_batch_size;
$$;

ALTER FUNCTION public.backfill_pending_sides(uuid, integer) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) TO service_role;

-- Same assertion as 20260726010000 (saas): exactly one backfill_pending_sides, and it is
-- the tenant-scoped one. CREATE OR REPLACE cannot introduce an overload here because the
-- signature is unchanged, but the check is cheap and this is the function where an
-- unscoped twin would read across every tenant.
DO $$
DECLARE
  n    integer;
  sigs text;
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

  IF has_function_privilege('anon', 'public.backfill_pending_sides(uuid,integer)', 'execute')
     OR has_function_privilege('authenticated', 'public.backfill_pending_sides(uuid,integer)', 'execute') THEN
    RAISE EXCEPTION 'backfill_pending_sides is still executable by a public role';
  END IF;
END $$;
