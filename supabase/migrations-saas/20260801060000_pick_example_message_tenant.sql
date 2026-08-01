-- Choose a flashcard's example sentence on evidence rather than chronology.
--
-- Ported from supabase/migrations/20260730120000_pick_example_message.sql, which is the
-- single-tenant version. This one lives in migrations-saas because the signature differs:
-- it takes a tenant and scopes every read to it.
--
-- THE BUG
--
-- Cards were created with example_message_id = first_seen_message_id -- the first message
-- the word ever appeared in -- with nothing checking that the card's own taught
-- translation survives into that message. It frequently does not, because good
-- translation is idiomatic: "Enjoy work" becomes "Гарної роботи", and a card teaching
-- насолоджуватися then shows a sentence in which that word does not occur.
--
-- Measured on the single-tenant deck before the fix was written: ~19% of 466 cards failed
-- a prefix match, and hand-checking put the true rate near 12%. 66.5% of all examples came
-- from the corpus's first week, because vocabulary accumulates fastest at the start and
-- "first seen" then anchors the whole deck there. Nothing about that is specific to one
-- couple; this build creates cards the same way.
--
-- TENANT SCOPING IS THE POINT OF THIS COPY
--
-- The message search MUST be filtered by tenant_id. Unscoped, a customer's flashcard could
-- take its example sentence from another couple's private conversation -- the single worst
-- failure this schema exists to prevent, and it would look like a feature working rather
-- than a leak. The tenant is taken from the vocabulary row itself rather than passed in
-- separately, so the two can never disagree.
--
-- WHAT IT PICKS
--
-- The shortest message between 40 and 250 characters whose lemma-language side contains
-- the lemma AND whose other side contains the taught translation. Both sides are checked:
-- an example that cannot show the answer is not an example.
--
--   * 40 lower bound, not 25: at 25 the shortest match for сьогодні was
--     "Який твій план на сього?)" -- the word misspelt. Very short messages are
--     disproportionately typos and fragments.
--   * 250 upper bound: longer messages are pasted articles and bot output, not
--     conversation. Two cards had been citing pasted AI text as their example.
--
-- MATCHING IS CRUDE AND ONLY EVER ADDS
--
-- Prefix stems over apostrophe-folded text -- U+0027 vs U+02BC made пам'ятати fail to
-- match Памʼятай, same word, different codepoint. Stemming cannot follow Slavic vowel
-- alternation (боятися -> боїшся), so it MISSES valid examples and falls back to
-- first_seen_message_id, which is the previous behaviour exactly. It can only improve a
-- card or leave it unchanged. Trigram similarity was tried and rejected on the other
-- build: on a hand-labelled set the ranges overlapped (старий/років wrong at 0.429 above
-- ставати/стає right at 0.375), so no threshold separates them.
CREATE OR REPLACE FUNCTION public.pick_example_messages(p_tenant_id uuid, p_vocabulary_ids uuid[])
RETURNS TABLE(vocabulary_id uuid, message_id uuid)
    LANGUAGE sql
    STABLE
    SET search_path TO 'public'
AS $$
  WITH v AS (
    SELECT id, language, first_seen_message_id, tenant_id,
           translate(lower(lemma), '''ʼ’`', '') AS lem,
           translate(lower(split_part(regexp_replace(btrim(lemma_translation), '^to +', '', 'i'), ' ', 1)),
                     '''ʼ’`', '') AS tr
    FROM vocabulary
    WHERE id = ANY(p_vocabulary_ids)
      AND tenant_id = p_tenant_id
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
    WHERE m.tenant_id = s.tenant_id            -- never another couple's conversation
      AND m.translated_text IS NOT NULL
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

-- Not SECURITY DEFINER: the bot connects as service_role, so caller rights suffice, and
-- definer rights would hand any caller a read straight through RLS into every tenant's
-- messages. Postgres grants EXECUTE to PUBLIC on every new function, so saying nothing
-- here would expose it by default -- which is how vocab_top_unlearned once became callable
-- with the anon key.
ALTER FUNCTION public.pick_example_messages(uuid, uuid[]) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pick_example_messages(uuid, uuid[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.pick_example_messages(uuid, uuid[]) TO service_role;

DO $$
DECLARE r oid := to_regprocedure('public.pick_example_messages(uuid, uuid[])');
BEGIN
  IF has_function_privilege('anon', r, 'EXECUTE')
     OR has_function_privilege('authenticated', r, 'EXECUTE') THEN
    RAISE EXCEPTION 'pick_example_messages is still executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', r, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute pick_example_messages -- /learn would break';
  END IF;
END $$;
