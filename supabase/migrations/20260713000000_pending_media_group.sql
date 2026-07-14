-- Buffer for Telegram media-group (album) items.
--
-- Telegram delivers each item of an album as a SEPARATE webhook update (and thus a
-- separate edge-function invocation), so re-assembling them into one sendMediaGroup
-- requires cross-invocation state. Each item is inserted here; a debounced background
-- flush drains the rows with `DELETE ... RETURNING` (an atomic single-flush claim: the
-- first flusher gets the rows, concurrent flushers get none) and forwards them as one
-- album. Rows are transient — the flush deletes its group and sweeps rows older than a
-- few minutes (orphans from an instance that died mid-debounce), so nothing accumulates.
--
-- The bot connects with the service-role key, which bypasses RLS; RLS is enabled with
-- no policies to match every other table in this schema (no anon/public access).

create table if not exists "public"."pending_media_group" (
  "id" uuid primary key default gen_random_uuid(),
  "media_group_id" text not null,
  "sender_id" uuid not null,
  "chat_id" bigint not null,
  "item" jsonb not null,
  "caption" text,
  "created_at" timestamptz not null default now()
);

create index if not exists "pending_media_group_group_idx"
  on "public"."pending_media_group" ("media_group_id");
create index if not exists "pending_media_group_created_idx"
  on "public"."pending_media_group" ("created_at");

alter table "public"."pending_media_group" enable row level security;
