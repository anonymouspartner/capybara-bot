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

-- SOLO vs TWO-PERSON: to run a **solo** instance (just you — a personal translator +
-- study corpus + /recap memory, no forwarding), leave `partner_telegram_id` at 0 and
-- only your own user is created. Fill it in for a normal two-person instance. `admin_*`
-- is always you (native + learning language + gender); the two languages you translate
-- between are your native and learning languages either way.
--
-- >>> EDIT THESE VALUES, then run the whole file. <<<
with input as (
  select
    000000000::bigint                       as admin_telegram_id,    -- EDIT: your Telegram ID (also the ADMIN_TELEGRAM_ID)
    '<your name>'::text                     as admin_display_name,   -- EDIT: your display name
    'en'::text                              as admin_native,         -- EDIT: your native language code (en, uk, es, fr, de, it, pt, pl)
    'uk'::text                              as admin_learning,       -- EDIT: your learning language code (the other language)
    'male'::text                            as admin_gender,         -- EDIT: 'male' or 'female'
    000000000::bigint                       as partner_telegram_id,  -- EDIT (or leave 0 for SOLO): the other person's Telegram ID
    '<partner name>'::text                  as partner_display_name, -- EDIT: the other person's display name
    'female'::text                          as partner_gender        -- EDIT: 'male' or 'female'
)
insert into public.users (telegram_id, display_name, native_language, learning_language, gender)
select admin_telegram_id,   admin_display_name,   admin_native,   admin_learning, admin_gender   from input
union all
-- The second user is created only for a two-person instance (partner_telegram_id set).
select partner_telegram_id, partner_display_name, admin_learning, admin_native,   partner_gender from input
where partner_telegram_id is not null and partner_telegram_id <> 0
on conflict (telegram_id) do nothing;

-- Default conversation row. The bot inserts every message with
-- conversation_id = this UUID (DEFAULT_CONVERSATION_ID in index.ts), and
-- messages.conversation_id has a foreign key to it, so it must exist before the
-- first message. The fixed UUID is safe to reuse: every couple has a separate
-- database, so there is no collision.
insert into public.conversations (id, title)
values ('00000000-0000-0000-0000-000000000001', 'Default conversation')
on conflict (id) do nothing;

-- Verify: expect one row (solo) or two rows (two-person, complementary native/learning
-- languages), each with a gender. If you still see the <...> placeholders or 000000000
-- for the admin here, you ran it without editing the input block; fix and re-run.
select native_language, learning_language, gender, telegram_id, display_name
from public.users
order by native_language;
