-- Ledger of paid API calls, one row per billable call.
--
-- Until now the only place the bot measured spend was /annotate_ab, which sampled a
-- handful of recent messages, ran them through two annotation models, and extrapolated
-- a monthly figure from that. That covered one of eleven Claude call sites and none of
-- the OpenAI ones, and it kept nothing, so actual spend was unrecoverable after the fact.
--
-- Every paid call now writes a row here as it happens (see logApiUsage in index.ts), and
-- /annotate_ab cost reports measured totals instead of a projection. Writes are
-- fire-and-forget: a failure here must never delay or break a user-facing reply.
--
-- Both the raw units AND cost_usd are stored. Rates change, so the cost as-charged is
-- history that can't be recomputed later; the units let a corrected rate be re-applied.
--
-- ElevenLabs rows come from scripts/anki_pronunciation/ (the local deck generator), not
-- from the bot -- the edge function has no ElevenLabs integration and deliberately holds
-- no TTS credentials. That tool writes here directly with the service role key.
--
-- RLS is enabled with no policies, as everywhere else in this schema: the service role
-- bypasses RLS and is the only client, so this exists purely to block anon/authenticated.

create table if not exists "public"."api_usage" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,                      -- anthropic | openai | elevenlabs
  "model" text not null,
  "feature" text not null,                       -- call-site label, e.g. 'translate'
  "input_tokens" integer not null default 0,
  "output_tokens" integer not null default 0,
  "audio_seconds" numeric not null default 0,    -- whisper, billed per minute
  "characters" integer not null default 0,       -- elevenlabs, billed per character
  "cost_usd" numeric not null default 0,
  "created_at" timestamptz not null default now()
);

-- Every report is "spend since <timestamp>", optionally sliced by call site.
create index if not exists "api_usage_created_idx" on "public"."api_usage" ("created_at");
create index if not exists "api_usage_feature_idx" on "public"."api_usage" ("feature");

alter table "public"."api_usage" enable row level security;
