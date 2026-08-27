-- vocabulary.example / vocabulary.example_translation: a short, model-extracted,
-- verbatim sentence pair grounding each flashcard.
--
-- Until now /export built a card's example straight from flashcards.example_message_id
-- (= vocabulary.first_seen_message_id) -- the WHOLE message the word was first seen in,
-- which is routinely a multi-sentence paragraph, and whose translated side is a free
-- (often idiomatic) rendering with no guarantee it contains a recognizable form of
-- lemma_translation at all. See GitHub issue #53.
--
-- annotateMessage now asks the model to return, per vocabulary item, the one sentence
-- (two only if necessary) it was found in, and the corresponding sentence copied
-- verbatim from the accepted translation -- or null when no sentence there actually
-- supports lemma_translation. These are nullable and populated going forward only;
-- existing rows are extended by the /backfill_examples admin command (index.ts),
-- mirroring the /backfill_senses precedent for retrofitting a prompt change onto
-- already-annotated vocabulary. Until backfilled, export falls back to the previous
-- whole-message behavior for a row with no "example" set, so nothing regresses.

ALTER TABLE public.vocabulary
  ADD COLUMN IF NOT EXISTS example text,
  ADD COLUMN IF NOT EXISTS example_translation text;

COMMENT ON COLUMN public.vocabulary.example IS
  'The single sentence (verbatim, from the message this lemma was first seen in) the word appears in. Populated by annotation; null for rows not yet (re)annotated since this column was added.';

COMMENT ON COLUMN public.vocabulary.example_translation IS
  'The sentence from the accepted translation corresponding to "example", copied verbatim. Null when the translation renders that stretch idiomatically with no locatable sentence-level counterpart, or when the row predates this column.';
