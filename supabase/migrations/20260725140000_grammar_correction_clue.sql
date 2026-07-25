-- Adds the two fields needed to put a solvable clue on the front of a grammar card.
--
-- The v77 cloze card front was just the corrected sentence with the target word removed
-- -- "Я дуже ____ тобою." -- which is not answerable: the blank could be any of several
-- verbs. The card needs to say WHICH word, without giving away the form being tested.
--
-- correction_lemma is the dictionary form of the corrected word ("пишатися"), and
-- correction_gloss is a short gloss of it in the learner's native language ("to be
-- proud"). Together they identify the word while leaving the inflection -- the actual
-- skill under test -- for the learner to produce.
--
-- Both nullable; the export composes whatever is present and falls back to the bare
-- sentence, so a row missing them still produces a usable card.

ALTER TABLE public.grammar_corrections
  ADD COLUMN IF NOT EXISTS correction_lemma text;

ALTER TABLE public.grammar_corrections
  ADD COLUMN IF NOT EXISTS correction_gloss text;

COMMENT ON COLUMN public.grammar_corrections.correction_lemma IS
  'Dictionary form of correction_focus, shown as a front-of-card clue.';
COMMENT ON COLUMN public.grammar_corrections.correction_gloss IS
  'Short gloss of correction_focus in the learner''s native language, shown as a front-of-card clue.';
