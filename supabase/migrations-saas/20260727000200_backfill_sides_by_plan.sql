-- Offer the machine-translated side to /backfill only for Ultimate tenants.
-- Commercial project ONLY.
--
-- Annotation depth is now what separates the plans: Standard annotates what a human wrote,
-- Ultimate also annotates the translation of it. That is the difference a customer can
-- actually understand, and it is the one that tracks cost -- Ultimate genuinely costs
-- about twice as much per message to run.
--
-- This function has to agree with the bot or the distinction is fiction. It returns a side
-- as pending whenever that side lacks a language-tagged annotation, and it offered BOTH to
-- everyone. Left alone:
--   * a Standard tenant's /backfill would re-annotate every translation side at full
--     price, so the saving evaporates on the first grind and the run never reaches
--     "all done" because nothing retires those rows;
--   * an Ultimate tenant would be correct, which is why the arm cannot simply be deleted.
--
-- The plan is read from the tenant row rather than passed in, so a caller cannot ask for
-- more than they pay for, and an upgrade takes effect on the next grind with no other
-- moving part.
--
-- Body is otherwise unchanged from 20260726000100: same tenant filter, same anti-join,
-- same ordering and limit.

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
  WITH sides AS (
    SELECT m.id AS message_id, m.original_text AS text, m.original_language AS language
      FROM public.messages m
     WHERE m.tenant_id = p_tenant_id
       AND m.original_text IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.message_annotations a
          WHERE a.message_id = m.id
            AND (a.details ->> 'language') = m.original_language)
    UNION ALL
    SELECT m.id AS message_id, m.translated_text AS text, m.translated_language AS language
      FROM public.messages m
     WHERE m.tenant_id = p_tenant_id
       AND m.translated_text IS NOT NULL
       -- The plan gate. Standard never sees this arm; Ultimate does.
       AND EXISTS (
         SELECT 1 FROM public.tenants t
          WHERE t.id = p_tenant_id AND t.plan = 'ultimate')
       AND NOT EXISTS (
         SELECT 1 FROM public.message_annotations a
          WHERE a.message_id = m.id
            AND (a.details ->> 'language') = m.translated_language)
  )
  SELECT message_id, text, language
    FROM sides
   ORDER BY message_id
   LIMIT p_batch_size;
$$;

ALTER FUNCTION public.backfill_pending_sides(uuid, integer) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.backfill_pending_sides(uuid, integer) TO service_role;

-- Exactly one backfill_pending_sides, tenant-scoped, not publicly callable. This is the
-- function where an unscoped twin would read across every tenant.
DO $$
DECLARE
  n    integer;
  sigs text;
BEGIN
  SELECT count(*), coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' | '), '(none)')
    INTO n, sigs
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'backfill_pending_sides';

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
