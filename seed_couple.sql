-- seed_couple.sql
-- ============================================================================
-- One-time seed for a NEW Capybara instance (one couple = one Supabase project
-- + one Telegram bot). Run ONCE, after the DB migration is applied and the function
-- is deployed, from the Dashboard SQL editor (or psql).
--
-- The couple is always the same language pair:
--   * admin   = English-native partner  (native en, learning uk). This is also
--               the person whose Telegram ID goes in the ADMIN_TELEGRAM_ID
--               function secret.
--   * partner = Ukrainian-native partner (native uk, learning en).
-- (Gender is not stored -- the code derives en=male / uk=female. No Russian
-- anywhere; the placeholder names below are neutral, replace them.)
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

-- >>> EDIT THESE FOUR VALUES, then run the whole file. <<<
with input as (
  select
    000000000::bigint                       as admin_telegram_id,    -- EDIT: English-native partner's Telegram ID
    '<English-native partner name>'::text   as admin_display_name,   -- EDIT: that partner's display name
    000000000::bigint                       as partner_telegram_id,  -- EDIT: Ukrainian-native partner's Telegram ID
    '<Ukrainian-native partner name>'::text as partner_display_name  -- EDIT: that partner's display name
)
insert into public.users (telegram_id, display_name, native_language, learning_language)
select admin_telegram_id,   admin_display_name,   'en', 'uk' from input
union all
select partner_telegram_id, partner_display_name, 'uk', 'en' from input
on conflict (telegram_id) do nothing;

-- Default conversation row. The bot inserts every message with
-- conversation_id = this UUID (DEFAULT_CONVERSATION_ID in index.ts), and
-- messages.conversation_id has a foreign key to it, so it must exist before the
-- first message. The fixed UUID is safe to reuse: every couple has a separate
-- database, so there is no collision.
insert into public.conversations (id, title)
values ('00000000-0000-0000-0000-000000000001', 'Default conversation')
on conflict (id) do nothing;

-- Verify: expect exactly two rows -- one 'en' native (admin) and one 'uk' native.
-- If you still see the <...> placeholders or 000000000 here, you ran it without
-- editing the input block above; fix the values and re-run.
select native_language, learning_language, telegram_id, display_name
from public.users
order by native_language;
