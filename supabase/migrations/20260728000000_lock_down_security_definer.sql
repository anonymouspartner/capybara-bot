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

-- SIGNATURE-SAFE, because this directory applies to BOTH projects.
--
-- The commercial project's vocab_top_unlearned takes a tenant argument, so it has a
-- different signature -- and a bare REVOKE naming the single-tenant one would abort the
-- whole migration there with "function does not exist". Each grant change is therefore
-- guarded on the function actually existing, so this file is a no-op wherever a given
-- signature is absent rather than a failure.
DO $$
DECLARE
  fn text;
  sigs text[] := ARRAY[
    'public.vocab_top_unlearned(text, uuid, integer)',
    'public.vocab_top_unlearned(uuid, text, uuid, integer)',
    'public.backfill_pending_sides(integer)',
    'public.backfill_pending_sides(uuid, integer)',
    'public.refresh_vocabulary_counts()',
    'public.refresh_vocabulary_counts(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', fn);
      RAISE NOTICE 'locked down %', fn;
    END IF;
  END LOOP;
END $$;

-- The bot connects as service_role, so nothing above changes what it can do. If any of
-- these revokes broke the bot, the deploy smoke test would still pass and the failure
-- would appear only when someone ran /vocab -- hence the assertion, which fails the
-- migration rather than the feature.
--
-- The oid goes through a VARIABLE rather than a '...'::regprocedure literal. A literal
-- cast is constant-folded at plan time, so it raises "function does not exist" for the
-- signature this project does not have, before the IF that was supposed to guard it ever
-- runs -- which is exactly how the first attempt at this migration failed.
DO $$
DECLARE
  fn text;
  r oid;
  bad text;
  sigs text[] := ARRAY[
    'public.vocab_top_unlearned(text, uuid, integer)',
    'public.vocab_top_unlearned(uuid, text, uuid, integer)',
    'public.backfill_pending_sides(integer)',
    'public.backfill_pending_sides(uuid, integer)',
    'public.refresh_vocabulary_counts()',
    'public.refresh_vocabulary_counts(uuid)'
  ];
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

  FOREACH fn IN ARRAY sigs LOOP
    r := to_regprocedure(fn);
    IF r IS NOT NULL AND NOT has_function_privilege('service_role', r, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost EXECUTE on % -- the bot would break', fn;
    END IF;
  END LOOP;
END $$;
