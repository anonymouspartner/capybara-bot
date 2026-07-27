-- Let /tenants report how much room is left. Commercial project ONLY.
--
-- The commercial project runs on the Supabase free tier, where the constraint is not cost
-- (there is no bill) but headroom: the database only ever grows. Nothing is deleted --
-- retention was deliberately dropped in 20260726000500, because a product selling a
-- searchable memory must not erase it -- and embeddings are ~6 KB per message before
-- indexes, an order of magnitude more than the message text.
--
-- So the ceiling arrives sooner the better the product does, which is exactly the failure
-- you want to see coming rather than discover. The operator has no reason to be opening
-- the Supabase dashboard day to day; /tenants is where they already look.
--
-- SECURITY INVOKER and no arguments: it reports sizes, never contents. The caller-side
-- superadmin check in handleTenants is what restricts it in practice, and the revokes
-- below are what stop it being called from outside the bot at all.

CREATE OR REPLACE FUNCTION public.instance_storage()
RETURNS TABLE(db_bytes bigint, largest_table text, largest_bytes bigint)
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  WITH biggest AS (
    SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 1
  )
  SELECT pg_database_size(current_database())::bigint,
         (SELECT name FROM biggest),
         (SELECT bytes FROM biggest);
$$;

ALTER FUNCTION public.instance_storage() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.instance_storage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.instance_storage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.instance_storage() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.instance_storage() TO service_role;

COMMENT ON FUNCTION public.instance_storage() IS
  'Database size and the largest table in public. Sizes only, never contents. Backs the storage line in /tenants.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.instance_storage()', 'execute')
     OR has_function_privilege('authenticated', 'public.instance_storage()', 'execute') THEN
    RAISE EXCEPTION 'instance_storage is still executable by a public role';
  END IF;
END $$;
