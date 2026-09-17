-- Revoke anon/authenticated EXECUTE on the recap_* SECURITY DEFINER functions.
--
-- All five are SECURITY DEFINER, so they run with the definer's rights and read
-- `messages`, `message_annotations` and `recap_embeddings` regardless of RLS.
-- They were also executable by `anon`, which means the project's publishable
-- anon key — public by design, safe to put in a browser, printed in the
-- dashboard — could call them over /rest/v1/rpc/ and read the couple's
-- conversation history back out.
--
-- Confirmed against the live project before writing this, not inferred from the
-- linter: an anonymous POST to /rest/v1/rpc/recap_keyword_search returned
-- HTTP 200 and executed the function. It came back empty only because the probe
-- used a deliberately non-matching term over a two-day window in 2020; a real
-- query would have returned real messages. This is the /recap corpus — the
-- private relationship memory the whole project exists to hold — so the exposure
-- is worse than a normal table leak, and RLS on those tables does not help
-- because SECURITY DEFINER is precisely what steps around it.
--
-- Safe for the bot. Every caller of all five is supabase/functions/telegram-bot/
-- index.ts, whose client is createClient(SUPABASE_URL, SERVICE_ROLE) — checked
-- each call site before applying, not assumed:
--
--   upsert_recap_embedding     index.ts:4461
--   recap_semantic_search      index.ts:4864
--   recap_keyword_search       index.ts:4865
--   recap_backfill_remaining   index.ts:5163
--   recap_backfill_batch       index.ts:5182
--
-- No script, workflow or client outside that file calls them. service_role keeps
-- EXECUTE, so the bot is unaffected; this only closes the anonymous door.
--
-- REVOKE rather than switching to SECURITY INVOKER: these genuinely need definer
-- rights to read across RLS-enabled tables on the bot's behalf, and dropping that
-- would break /recap for the legitimate caller too. The advisor lists REVOKE
-- first for the same reason.
--
-- Idempotent: REVOKE on a privilege that isn't held is a no-op.
--
-- Note for anything added later: Supabase's default privileges grant EXECUTE on
-- new public functions to anon and authenticated automatically, so a future
-- SECURITY DEFINER function here starts out exposed the same way and needs its
-- own REVOKE.

-- PUBLIC is the grantee that actually matters here, and revoking anon and
-- authenticated alone does nothing. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and anon/authenticated inherit through it, so
-- they never hold an explicit grant to take away. Found this the hard way: a
-- first pass revoking only those two roles reported success and changed nothing
-- — anon could still call the function over HTTP afterwards. The live ACL was
-- `=X/postgres | postgres=X/postgres | service_role=X/postgres`, where the
-- leading `=X` is PUBLIC's grant.
--
-- That same ACL is why this is safe: service_role holds its OWN explicit grant
-- (`service_role=X/postgres`), so it does not depend on PUBLIC and the bot keeps
-- working. The GRANT below is therefore a no-op today; it is here so the
-- guarantee survives anyone later re-examining these privileges.
REVOKE EXECUTE ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."recap_backfill_remaining"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."recap_keyword_search"("p_query" "text", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."recap_semantic_search"("p_query_embedding" "public"."vector", "p_limit" integer, "p_start" "date", "p_end" "date") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."recap_backfill_batch"("p_limit" integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."recap_backfill_remaining"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."upsert_recap_embedding"("p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") TO "service_role";
