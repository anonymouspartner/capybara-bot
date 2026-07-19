-- seed_couple.sql
-- ============================================================================
-- One-time seed for a NEW Capybara instance (one couple = one Supabase project
-- + one Telegram bot). Run ONCE, after the DB migration is applied and the function
-- is deployed, from the Dashboard SQL editor (or psql).
--
-- One couple = two people with complementary languages, configured in the input
-- block below (native/learning must be complementary: if admin is native en +
-- learning uk, the partner is native uk + learning en).
--   * admin is the person whose Telegram ID goes in the ADMIN_TELEGRAM_ID secret.
-- Gender ('male'/'female') is stored per user and drives grammatical gender
-- agreement for languages that mark it (Ukrainian, Spanish, French, ...). It
-- requires the users.gender migration (20260719000000) applied first.
-- Supported language codes: en, uk, es, fr, de, it, pt, pl (see the LANGUAGES
-- registry in index.ts; add an entry there to support more).
--
-- HOW TO GET THE TWO TELEGRAM IDs (the onboarding trick):
--   Before anyone is seeded the bot recognizes no one. When an unregistered
--   person messages it, the bot replies with that person's own Telegram ID
--   ("Your Telegram user ID is: 123456789"). So:
--     1. Deploy the function and set the Telegram webhook first.
--     2. Each partner sends the bot any message once.
--     3. Read each partner's numeric ID off the bot's reply.
--     4. Fill the four values in the `input` block below.
--     5. Run this whole file.
--     6. Each partner messages again -- now they are recognized and it works.
--
-- Re-runnable: ON CONFLICT DO NOTHING means running this twice is harmless.
-- ============================================================================

-- >>> EDIT THESE VALUES, then run the whole file. <<<
with input as (
  select
    000000000::bigint                       as admin_telegram_id,    -- EDIT: admin partner's Telegram ID
    '<admin partner name>'::text            as admin_display_name,   -- EDIT: admin's display name
    'en'::text                              as admin_native,         -- EDIT: admin's native language code (en, uk, es, fr, de, it, pt, pl)
    'uk'::text                              as admin_learning,       -- EDIT: admin's learning language code (= the partner's native)
    'male'::text                            as admin_gender,         -- EDIT: 'male' or 'female'
    000000000::bigint                       as partner_telegram_id,  -- EDIT: partner's Telegram ID
    '<partner name>'::text                  as partner_display_name, -- EDIT: partner's display name
    'female'::text                          as partner_gender        -- EDIT: 'male' or 'female'
)
insert into public.users (telegram_id, display_name, native_language, learning_language, gender)
select admin_telegram_id,   admin_display_name,   admin_native,   admin_learning, admin_gender   from input
union all
select partner_telegram_id, partner_display_name, admin_learning, admin_native,   partner_gender from input
on conflict (telegram_id) do nothing;

-- Default conversation row. The bot inserts every message with
-- conversation_id = this UUID (DEFAULT_CONVERSATION_ID in index.ts), and
-- messages.conversation_id has a foreign key to it, so it must exist before the
-- first message. The fixed UUID is safe to reuse: every couple has a separate
-- database, so there is no collision.
insert into public.conversations (id, title)
values ('00000000-0000-0000-0000-000000000001', 'Default conversation')
on conflict (id) do nothing;

-- Verify: expect exactly two rows with complementary native/learning languages
-- and a gender each. If you still see the <...> placeholders or 000000000 here,
-- you ran it without editing the input block above; fix the values and re-run.
select native_language, learning_language, gender, telegram_id, display_name
from public.users
order by native_language;
