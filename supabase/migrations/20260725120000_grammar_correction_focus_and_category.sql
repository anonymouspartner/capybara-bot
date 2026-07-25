-- Adds the two fields a cloze-style grammar card needs.
--
-- error_focus (added in the previous migration) stores the wrong form exactly as the
-- learner wrote it -- "довго". Building a fill-in-the-blank card requires the opposite:
-- the CORRECTED form as it appears in the corrected sentence -- "довгого". That cannot
-- be derived from error_focus, because inflected languages change the suffix: a
-- substring search for "довго" matches inside "довгого" and would blank only part of
-- the word, leaking the ending onto the card front. So the model is asked for it
-- directly and it is stored alongside.
--
-- category groups corrections by the kind of mistake ("case", "aspect", ...) so /export
-- can emit it as an Anki tag, making the deck diagnostic ("most of my errors are case
-- endings") rather than just a pile of corrected sentences.
--
-- Both are nullable, and the export falls back to the previous card shape whenever they
-- are absent or the corrected form cannot be located as a whole word. Existing rows keep
-- working untouched.

ALTER TABLE public.grammar_corrections
  ADD COLUMN IF NOT EXISTS correction_focus text;

ALTER TABLE public.grammar_corrections
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.grammar_corrections.error_focus IS
  'The wrong form, verbatim as the learner wrote it (appears in original_text).';
COMMENT ON COLUMN public.grammar_corrections.correction_focus IS
  'The same word corrected, verbatim as it appears in corrected_text. Cloze blank target.';
COMMENT ON COLUMN public.grammar_corrections.category IS
  'Kind of mistake (case, aspect, gender, agreement, tense, spelling, word-order, word-choice, preposition, other). Exported as an Anki tag.';
