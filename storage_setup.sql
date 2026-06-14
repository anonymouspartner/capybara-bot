-- storage_setup.sql
-- ============================================================================
-- Creates the private `voice-messages` Storage bucket that index.ts uploads
-- voice-note audio into (handleVoiceMessage -> supabase.storage.from("voice-messages")).
--
-- The DB migration builds only the database; Storage buckets live in the `storage`
-- schema and aren't part of it, so without this step the bucket must be created by
-- hand in the Dashboard (PROVISION_NEW_COUPLE.md Step 4b). Running this file makes the
-- bucket reproducible from code instead.
--
-- Run ONCE per instance, after the DB migration, from the Dashboard SQL editor (or psql).
-- Idempotent: ON CONFLICT DO NOTHING, so re-running is harmless.
--
-- The bucket is PRIVATE (public = false): the function writes with the service role,
-- so public read access is neither needed nor wanted.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', false)
on conflict (id) do nothing;

-- Verify: expect one row, public = false.
select id, name, public from storage.buckets where id = 'voice-messages';
