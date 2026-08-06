-- An optional conversation partner for subscribers who do not have one.
--
-- WHY
--
-- The intro already sells solo use -- "Or use it solo: write in the language you're
-- learning, see it corrected and translated, and study what you got wrong." That is true
-- as far as it goes, but a solo customer writes into silence: lookupPartner returns null,
-- forwardToPartner returns early, and nothing answers. They pay for a two-sided product
-- and get one side. This lets the bot take the empty seat and reply in the language they
-- are practising.
--
-- WHY A SEPARATE TABLE RATHER THAN A FLAG ON messages
--
-- The decision was that the bot's own words must never reach the study corpus: vocabulary,
-- flashcards, /recap and /ask are supposed to be built from real human conversation, and a
-- deck mined from model output would quietly stop being that.
--
-- messages.sender_id is NOT NULL and references users, so a bot turn cannot be stored
-- there anyway without loosening a constraint that is doing real work. Good -- a separate
-- table is the better design regardless: every existing reader of messages (annotation,
-- the vocabulary view, /recap embedding, /export, the backfill grinds) stays correct BY
-- CONSTRUCTION. A boolean column would instead require finding and filtering each of those
-- readers, and any one missed would silently poison the deck.
--
-- The customer's OWN turns still go to messages exactly as they do today, so their
-- vocabulary and flashcards keep working and keep coming from words they actually wrote.
-- They are duplicated here only so the thread reads as a conversation when it is replayed
-- as context for the next reply.
CREATE TABLE IF NOT EXISTS public.practice_turns (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
    -- 'user' or 'assistant', matching the shape the model API expects, so replaying a
    -- thread needs no translation between vocabularies.
    role        text NOT NULL CHECK (role IN ('user', 'assistant')),
    content     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ON DELETE CASCADE here, where messages deliberately uses RESTRICT. The difference is
-- ownership: a shared conversation is not one participant's to erase, but a practice
-- thread is one person talking to a machine, and it belongs to them alone.
COMMENT ON TABLE public.practice_turns IS
  'Solo practice conversation. Deliberately NOT in messages: bot output must never reach '
  'the study corpus (vocabulary, flashcards, /recap). The user''s own turns are also in '
  'messages, where they still feed the deck as normal.';

-- The only access pattern: the last N turns of one person's thread, newest first.
CREATE INDEX IF NOT EXISTS practice_turns_user_recent_idx
    ON public.practice_turns (user_id, created_at DESC);

-- RLS on with no permissive policies, matching every other table here: the bot connects as
-- service_role and bypasses it, and nothing else should read this at all. A practice
-- thread is as private as the conversation it stands in for.
ALTER TABLE public.practice_turns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_turns FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_turns FROM anon;
REVOKE ALL ON TABLE public.practice_turns FROM authenticated;
GRANT  ALL ON TABLE public.practice_turns TO service_role;

-- Off by default. This costs a model call per reply, so it is something a customer turns
-- on deliberately, not something that starts spending on their behalf.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS practice_partner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.practice_partner IS
  'Solo practice mode: when this user has no partner, the bot replies in their '
  'learning_language. Off by default; each reply consumes a message from the quota.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='users'
                   AND column_name='practice_partner') THEN
    RAISE EXCEPTION 'practice_partner was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='practice_turns') THEN
    RAISE EXCEPTION 'practice_turns was not created';
  END IF;
  -- The whole point of the table is that it is not readable by the roles a leaked anon
  -- key would give you.
  IF has_table_privilege('anon', 'public.practice_turns', 'SELECT')
     OR has_table_privilege('authenticated', 'public.practice_turns', 'SELECT') THEN
    RAISE EXCEPTION 'practice_turns is readable by anon/authenticated';
  END IF;
END $$;
