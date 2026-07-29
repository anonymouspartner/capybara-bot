-- One call behind /management's usage panel.
--
-- Two of these numbers are not reachable from the bot's normal client. Database size needs
-- pg_database_size, and the voice-file total lives in storage.objects, which PostgREST does
-- not expose. Listing the bucket through the Storage API would work but means paginating a
-- thousand-plus objects across per-user prefixes on every view -- a lot of round trips for
-- one line of text.
--
-- SECURITY DEFINER because storage.objects is not readable by the anon or authenticated
-- roles and should stay that way. The function returns AGGREGATES ONLY -- counts and byte
-- totals, never a filename, a path, or any message content -- so being definer-rights
-- widens what can be counted, not what can be read.
--
-- EXECUTE is granted to service_role alone, and revoked from PUBLIC explicitly. Postgres
-- grants EXECUTE to PUBLIC on every new function, and this project's init schema also
-- carries ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated --
-- so a new SECURITY DEFINER function is exposed by default unless it says otherwise. That
-- is exactly how vocab_top_unlearned ended up callable by anyone with the anon key.
CREATE OR REPLACE FUNCTION public.instance_usage()
RETURNS TABLE(
  period_start        date,
  messages_period     bigint,
  messages_total      bigint,
  annotations_period  bigint,
  voice_files         bigint,
  voice_bytes         bigint,
  db_bytes            bigint
)
    LANGUAGE sql
    STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
  SELECT
    date_trunc('month', now())::date,
    (SELECT count(*) FROM public.messages WHERE created_at >= date_trunc('month', now())),
    (SELECT count(*) FROM public.messages),
    (SELECT count(*) FROM public.message_annotations WHERE created_at >= date_trunc('month', now())),
    (SELECT count(*) FROM storage.objects WHERE bucket_id = 'voice-messages'),
    (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects WHERE bucket_id = 'voice-messages'),
    pg_database_size(current_database());
$$;

ALTER FUNCTION public.instance_usage() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.instance_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.instance_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.instance_usage() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.instance_usage() TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.instance_usage()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.instance_usage()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'instance_usage is still executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.instance_usage()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute instance_usage -- /management would break';
  END IF;
END $$;
