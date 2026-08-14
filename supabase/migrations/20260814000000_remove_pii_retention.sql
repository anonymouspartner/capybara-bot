-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: remove the 30-day PII retention policy
--
-- Reverses 20260626000000_pii_retention_30days.sql. Data is now kept until the
-- instance owner deletes it themselves; nothing expires on a timer.
--
-- Why: the nightly sweep did more than shorten the privacy window. Because it
-- deleted messages, notes, embeddings, annotations and pins at 30 days, it also
--   * reset vocabulary frequencies -- refresh_vocabulary_counts() recomputes
--     occurrence_count from surviving annotations, and vocab_top_unlearned hides
--     anything at 0, so words silently dropped out of /vocab;
--   * stripped flashcards of their example sentences (example_message_id is
--     ON DELETE SET NULL, and /export reads the example live from messages);
--   * expired /pin flags, so "mark this as meaningful" only held for a month;
--   * capped /recap at a rolling 30-day window.
--
-- The prior migration is left in place rather than edited: it is already applied
-- on live instances, and a fresh provision simply installs the job and then drops
-- it again when this migration runs. Both steps are idempotent.
--
-- To reinstate retention later, re-run the scheduling block from the prior
-- migration (delete_expired_pii still takes a retention_days argument if you
-- recreate it).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Unschedule the nightly job. Guarded so this is a no-op on an instance that
--    never had it (or already had it removed by hand).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'capybara-pii-retention') then
    perform cron.unschedule('capybara-pii-retention');
    raise notice 'capybara-pii-retention job unscheduled.';
  else
    raise notice 'capybara-pii-retention job not present; nothing to unschedule.';
  end if;
exception
  -- pg_cron absent (cron schema missing) means there was no job to remove.
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron not installed; nothing to unschedule.';
end
$$;

-- 2. Drop the deletion function itself, so no leftover schedule, dashboard
--    button, or stray `select delete_expired_pii()` can wipe data by accident.
drop function if exists public.delete_expired_pii(integer);

-- 3. Verify: the job must be gone. Fails the migration loudly if it survived.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'capybara-pii-retention') then
    raise exception 'capybara-pii-retention job still registered after removal';
  end if;
exception
  when undefined_table or invalid_schema_name then
    null;  -- no pg_cron, no job: verified by absence
end
$$;

-- Note: pg_cron itself is left enabled. It is a Supabase default and may be in
-- use by other jobs; dropping the extension is out of scope here.
