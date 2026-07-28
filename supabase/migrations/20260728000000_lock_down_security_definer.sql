-- Stop vocab_top_unlearned being callable by anyone with the anon key.
--
-- THE ACTUAL PROBLEM, precisely
--
-- Row-level security is enabled on messages, vocabulary and flashcards, with no permissive
-- policies -- so anon and authenticated read nothing through ordinary table access. That is
-- the design, and it holds.
--
-- SECURITY DEFINER functions are the exception: they execute as the owner, so RLS does not
-- apply to them. vocab_top_unlearned is SECURITY DEFINER *and* carries the default PUBLIC
-- EXECUTE grant, which makes it a hole straight through that policy. Anyone with the
-- project URL and the anon key -- a value Supabase treats as public by design -- can call
-- it and receive lemma, gloss, part of speech and frequency for the whole corpus.
--
-- Nor does it need any inside knowledge to use. The p_user_id argument only feeds a
-- "not already in this user's flashcards" anti-join, so an unknown uuid filters nothing
-- out and returns MORE, not less.
--
-- The words are drawn from several thousand private messages between two people. It is not
-- the message text, but a frequency-ranked vocabulary of a relationship is not nothing.
--
-- WHY THE OTHER TWO ARE LEFT ALONE, AND STILL REVOKED
--
-- backfill_pending_sides and refresh_vocabulary_counts carry the same PUBLIC grant but are
-- NOT SECURITY DEFINER, so they run as the caller and RLS stops them dead. They are not
-- exploitable today. They are revoked anyway, because "safe as long as nobody adds a
-- permissive policy or flips SECURITY DEFINER later" is a property that has to be
-- rechecked forever, and an explicit grant is a property that does not.
--
-- backfill_pending_sides is the sharper of the two: it returns messages.original_text
-- directly, so if it ever became SECURITY DEFINER it would leak the conversation itself.
--
-- The grants come from the init schema's ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
-- FUNCTIONS TO anon, authenticated, plus Postgres granting EXECUTE to PUBLIC on every new
-- function. Nothing here was a mistake anyone made; it is what happens by default, which
-- is exactly why it is worth checking rather than assuming.

REVOKE EXECUTE ON FUNCTION public.vocab_top_unlearned(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vocab_top_unlearned(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vocab_top_unlearned(text, uuid, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.vocab_top_unlearned(text, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.backfill_pending_sides(integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.backfill_pending_sides(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_vocabulary_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_vocabulary_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_vocabulary_counts() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_vocabulary_counts() TO service_role;

-- The bot connects as service_role, so nothing above changes what it can do. If any of
-- these revokes broke the bot, the deploy smoke test would still pass and the failure
-- would appear only when a customer ran /vocab -- hence the assertion, which fails the
-- migration rather than the feature.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('vocab_top_unlearned', 'backfill_pending_sides', 'refresh_vocabulary_counts')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'still executable by anon/authenticated: %', bad;
  END IF;

  IF NOT has_function_privilege('service_role',
        'public.vocab_top_unlearned(text, uuid, integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost EXECUTE on vocab_top_unlearned -- the bot would break';
  END IF;
END $$;
