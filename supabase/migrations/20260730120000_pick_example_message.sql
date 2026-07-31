-- Choose a flashcard's example sentence on evidence rather than on chronology.
--
-- THE BUG THIS REPLACES
--
-- Cards were created with example_message_id = first_seen_message_id: the first message
-- the word ever appeared in, with nothing checking that the card's own taught translation
-- survives into that message. It frequently does not, because good translation is
-- idiomatic -- "Enjoy work" becomes "Гарної роботи", and a card teaching
-- насолоджуватися then shows a sentence in which that word does not occur. The learner
-- is tested on a word and shown evidence for a different one.
--
-- Measured on the live deck before this was written: ~19% of 466 cards had an example
-- whose other side did not contain the taught translation by prefix match. Hand-checking
-- a sample put the true rate near 12%, the rest being Ukrainian inflection that prefix
-- matching cannot follow. Separately, 66.5% of all examples came from the corpus's first
-- week, because vocabulary accumulates fastest at the start and "first seen" then anchors
-- the whole deck there.
--
-- WHAT THIS PICKS INSTEAD
--
-- The shortest message, between 40 and 250 characters, whose lemma-language side contains
-- the lemma and whose other side contains the taught translation. Both sides are checked,
-- which is the whole point: an example that cannot show the answer is not an example.
--
--   * 40 lower bound, not 25: at 25 the shortest match for сьогодні was
--     "Який твій план на сього?)" -- a message with the word misspelt. Very short messages
--     are disproportionately typos and fragments.
--   * 250 upper bound: longer messages here are pasted articles and bot output, not
--     conversation. Two cards had been citing pasted AI text as their example sentence.
--   * Shortest-first among what remains, because a flashcard example should be readable
--     at a glance.
--
-- MATCHING IS DELIBERATELY CRUDE, AND ONLY EVER ADDS
--
-- Prefix stems, after folding away apostrophe variants -- U+0027 vs U+02BC made
-- пам'ятати fail to match Памʼятай, same word, different codepoint.
--
-- Stemming cannot follow Ukrainian vowel alternation (боятися -> боїшся, день -> дня), so
-- this MISSES valid examples. Trigram similarity was tried and rejected: on a hand-labelled
-- calibration set its ranges overlapped -- старий/років (wrong) scored 0.429 against
-- ставати/стає (right) at 0.375 -- so no threshold separates them. Detecting an inflected
-- Slavic word by string similarity is not reliably solvable this way.
--
-- Missing a good candidate is safe: the function falls back to first_seen_message_id, the
-- previous behaviour exactly. So this can only improve a card or leave it unchanged, never
-- degrade one. A lemmatiser or a model call would do better and is the obvious upgrade.
--
-- Batched (uuid[] in, one row out per id) because /learn top N adds up to 50 cards at once
-- and a per-card round trip would make a slow command slower.
CREATE OR REPLACE FUNCTION public.pick_example_messages(p_vocabulary_ids uuid[])
RETURNS TABLE(vocabulary_id uuid, message_id uuid)
    LANGUAGE sql
    STABLE
    SET search_path TO 'public'
AS $$
  WITH v AS (
    SELECT id, language, first_seen_message_id,
           -- Fold apostrophe variants; take the first word; drop an English "to " infinitive
           -- marker so a card glossed "to sit" is matched on "sit" and not on "to".
           translate(lower(lemma), '''ʼ’`', '') AS lem,
           translate(lower(split_part(regexp_replace(btrim(lemma_translation), '^to +', '', 'i'), ' ', 1)),
                     '''ʼ’`', '') AS tr
    FROM vocabulary
    WHERE id = ANY(p_vocabulary_ids)
  ), stems AS (
    SELECT v.*,
           left(lem, greatest(4, floor(length(lem) * 0.60)::int)) AS lem_stem,
           left(tr,  greatest(4, floor(length(tr)  * 0.55)::int)) AS tr_stem
    FROM v
  )
  SELECT s.id, COALESCE(best.id, s.first_seen_message_id)
  FROM stems s
  LEFT JOIN LATERAL (
    SELECT m.id
    FROM messages m
    WHERE m.translated_text IS NOT NULL
      AND length(m.original_text) BETWEEN 40 AND 250
      AND translate(lower(CASE WHEN m.original_language = s.language
                               THEN m.original_text ELSE m.translated_text END), '''ʼ’`', '')
          LIKE '%' || s.lem_stem || '%'
      AND translate(lower(CASE WHEN m.original_language = s.language
                               THEN m.translated_text ELSE m.original_text END), '''ʼ’`', '')
          LIKE '%' || s.tr_stem || '%'
    ORDER BY length(m.original_text) ASC, m.created_at ASC
    LIMIT 1
  ) best ON true;
$$;

-- Not SECURITY DEFINER: the bot connects as service_role, so caller rights are enough, and
-- definer rights would hand anyone who could call it a read straight through RLS into the
-- message corpus. Postgres grants EXECUTE to PUBLIC on every new function and this project's
-- init schema also carries ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon,
-- authenticated -- so saying nothing here would expose it by default. That default is exactly
-- how vocab_top_unlearned became callable with the anon key.
ALTER FUNCTION public.pick_example_messages(uuid[]) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.pick_example_messages(uuid[]) TO service_role;

DO $$
DECLARE r oid := to_regprocedure('public.pick_example_messages(uuid[])');
BEGIN
  IF has_function_privilege('anon', r, 'EXECUTE')
     OR has_function_privilege('authenticated', r, 'EXECUTE') THEN
    RAISE EXCEPTION 'pick_example_messages is still executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', r, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute pick_example_messages -- /learn would break';
  END IF;
END $$;
