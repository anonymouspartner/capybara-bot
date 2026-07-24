-- Per-user toggle for the grammar assistant. When true and the user sends a text
-- message the bot classifies as their LEARNING language, the bot replies privately
-- (to the sender only) with a short correction/explanation of any mistake, written
-- in the user's native language. Normal translation + forwarding are unaffected.
--
-- Defaults to false so existing instances behave exactly as before until a user opts
-- in with /capybara on. Safe to run on the live instance (pure additive widening).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS grammar_assist boolean NOT NULL DEFAULT false;
