-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 30-day PII retention schedule
-- Installs a pg_cron job that deletes all personally identifiable data older
-- than 30 days, running once daily at midnight UTC.
--
-- Requires the pg_cron extension (enabled on all Supabase projects by default).
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron if not already present
create extension if not exists pg_cron with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper function: delete all PII older than the retention window
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function delete_expired_pii(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff        timestamptz := now() - (retention_days || ' days')::interval;
  del_messages  integer;
  del_notes     integer;
  del_embeds    integer;
  del_annots    integer;
  del_pins      integer;
  del_reconcile integer;
  del_voice     integer := 0;
  expired_msg_ids uuid[];
  expired_note_ids uuid[];
begin
  -- Collect IDs of expired messages and notes before deletion
  -- (needed for cascading deletes to related tables)
  select array_agg(id) into expired_msg_ids
    from messages where created_at < cutoff;

  select array_agg(id) into expired_note_ids
    from notes where created_at < cutoff;

  -- 1. Remove recap embeddings for expired messages and notes
  delete from recap_embeddings
    where (source_type = 'message' and source_id = any(expired_msg_ids))
       or (source_type = 'note'    and source_id = any(expired_note_ids));
  get diagnostics del_embeds = row_count;

  -- 2. Remove annotations linked to expired messages
  delete from message_annotations
    where message_id = any(expired_msg_ids);
  get diagnostics del_annots = row_count;

  -- 3. Remove pin and reconcile flags on expired messages
  delete from message_pins
    where message_id = any(expired_msg_ids);
  get diagnostics del_pins = row_count;

  delete from message_reconciles
    where message_id = any(expired_msg_ids);
  get diagnostics del_reconcile = row_count;

  -- 4. Delete expired messages
  delete from messages where created_at < cutoff;
  get diagnostics del_messages = row_count;

  -- 5. Delete expired personal notes
  delete from notes where created_at < cutoff;
  get diagnostics del_notes = row_count;

  -- Voice audio files in Supabase Storage are named by Telegram file_id and
  -- referenced from the deleted message rows. Storage object deletion must be
  -- done via the Storage API or a Storage lifecycle policy; this function
  -- removes the database records and marks the count as requiring storage cleanup.
  -- See: https://supabase.com/docs/guides/storage/lifecycle-rules

  return jsonb_build_object(
    'cutoff',            cutoff,
    'deleted_messages',  del_messages,
    'deleted_notes',     del_notes,
    'deleted_embeddings', del_embeds,
    'deleted_annotations', del_annots,
    'deleted_pins',       del_pins,
    'deleted_reconciles', del_reconcile,
    'note', 'Voice files in storage require a separate lifecycle policy or manual cleanup.'
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule: run delete_expired_pii() every day at 00:00 UTC
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any existing job with the same name (idempotent)
select cron.unschedule('capybara-pii-retention')
  where exists (
    select 1 from cron.job where jobname = 'capybara-pii-retention'
  );

select cron.schedule(
  'capybara-pii-retention',        -- job name
  '0 0 * * *',                     -- cron expression: daily at midnight UTC
  $$select delete_expired_pii(30)$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify the job is registered
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert exists (
    select 1 from cron.job where jobname = 'capybara-pii-retention'
  ), 'pg_cron job was not registered — check that pg_cron is enabled on this project';
  raise notice 'capybara-pii-retention job registered successfully.';
end;
$$;
