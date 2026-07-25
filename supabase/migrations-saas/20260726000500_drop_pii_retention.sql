-- Remove the fixed-window PII retention job. Commercial project ONLY.
--
-- The base schema (20260626000000) schedules capybara-pii-retention nightly, deleting
-- every message, note, annotation, pin and embedding older than 30 days. On the personal
-- bot that is a deliberate privacy choice by the two people whose messages they are.
--
-- On the paid product it is a defect. The subscription sells a study corpus and a
-- searchable memory of a relationship; a job that silently erases both, one month in,
-- destroys the thing the customer is paying for -- and does it invisibly, so the symptom
-- is "/recap has got worse" with no way for them to connect it to a cause. It would have
-- fired on the first tenant to reach 30 days.
--
-- Retention is now: keep while the account exists, and delete when the customer asks
-- (/delete_account) or when the tenant row is removed, which cascades. That is a policy
-- the customer controls rather than one imposed on a clock.
--
-- delete_expired_pii is dropped outright, not just unscheduled. Leaving a
-- SECURITY DEFINER function that erases the whole database, called by nothing, is a
-- footgun waiting for someone to re-schedule it or invoke it by hand while debugging.

DO $$
BEGIN
  -- cron.unschedule throws if the job is absent, so only call it when it exists. This
  -- also makes the migration safe on a project where the base cron was never applied.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capybara-pii-retention') THEN
    PERFORM cron.unschedule('capybara-pii-retention');
    RAISE NOTICE 'unscheduled capybara-pii-retention';
  ELSE
    RAISE NOTICE 'capybara-pii-retention not scheduled; nothing to unschedule';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.delete_expired_pii(integer);

-- Verify: neither the job nor the function may survive this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capybara-pii-retention') THEN
    RAISE EXCEPTION 'capybara-pii-retention is still scheduled';
  END IF;
  IF to_regprocedure('public.delete_expired_pii(integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'delete_expired_pii still exists';
  END IF;
END $$;
