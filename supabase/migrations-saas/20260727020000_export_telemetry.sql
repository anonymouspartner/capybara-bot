-- Record that /export ran.
--
-- The question this exists to answer is "does the Anki hand-off actually work", and right
-- now nothing in the system can. /export builds a file, sends it, and forgets -- so there
-- is no way to tell whether anyone ever runs it, let alone whether they import it and
-- study. That matters because the two obvious directions for the study surface (invest in
-- better Anki exports vs. bring review into Telegram) point opposite ways depending on the
-- answer, and choosing without it is guessing.
--
-- Two columns, not an events table. An events table is the right shape if you want to
-- analyse command usage generally, and the wrong shape for one question -- it invites
-- logging everything, which on a product holding private conversations is a liability that
-- has to be justified rather than accumulated by default. These two are the minimum that
-- answers the question, and they double as the state /export new needs, so the telemetry
-- costs nothing that was not already required.
--
-- export_count is the more informative of the two. A first export says someone was curious;
-- a SECOND says the file was actually useful to them, which is the signal worth having.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.last_exported_at IS
  'When this user last completed an /export. Also the cutoff for /export new.';
COMMENT ON COLUMN public.users.export_count IS
  'How many times this user has completed an /export. A count above 1 is the signal that '
  'the Anki hand-off is genuinely being used rather than tried once.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'export_count'
  ) THEN
    RAISE EXCEPTION 'export_count was not created';
  END IF;
END $$;
