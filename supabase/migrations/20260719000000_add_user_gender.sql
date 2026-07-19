-- additive migration, safe to apply anytime.
--
-- Adds a per-user "gender" column to public.users. Purpose: the bot's copy/tone
-- currently infers gendered phrasing (e.g. Ukrainian adjective agreement) from a
-- hardcoded en=male / uk=female assumption tied to the fixed language pair. As the
-- bot generalizes to arbitrary language pairs, that assumption no longer holds, so
-- gender needs to be its own explicit, per-user fact.
--
-- Nullable by design: until this migration's backfill (or an admin command) sets
-- it, the app falls back to its existing en=male / uk=female default so behavior
-- is unchanged for the current couple. New instances / new users get NULL and the
-- app should prompt or otherwise resolve gender explicitly rather than guess.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the CHECK constraint is added inside a
-- DO block guarded by a pg_constraint existence check (Postgres has no native
-- "ADD CONSTRAINT IF NOT EXISTS" for CHECK constraints), so re-running this file
-- does not error.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_gender_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_gender_check
      CHECK (gender IS NULL OR gender = ANY (ARRAY['male'::text, 'female'::text]));
  END IF;
END
$$;

-- Backfill the existing couple so current behavior is preserved once the app
-- switches from the hardcoded en/uk default to reading this column. Guarded by
-- "gender IS NULL" so re-running is a no-op and it never clobbers a value the
-- maintainer has since set by hand.
UPDATE public.users
  SET gender = 'male'
  WHERE native_language = 'en' AND gender IS NULL;

UPDATE public.users
  SET gender = 'female'
  WHERE native_language = 'uk' AND gender IS NULL;
