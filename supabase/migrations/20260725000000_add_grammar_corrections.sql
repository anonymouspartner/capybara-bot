-- Stores the corrections produced by the /capybara grammar assistant so they can be
-- studied later. Until now grammarAssist sent its note to Telegram and discarded it;
-- nothing was persisted, so corrections could not be reviewed or exported to Anki.
--
-- One row per detected mistake (correct sentences are not recorded -- there is nothing
-- to study). /export turns each row into an "error -> correction" card in the
-- Capybara::Grammar deck.
--
-- Purely additive: a new table, no changes to existing objects. Safe to run on the
-- live instance at any time; the bot simply starts writing rows once the matching
-- build is deployed.

CREATE TABLE IF NOT EXISTS "public"."grammar_corrections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    -- The learner whose sentence was corrected. Corrections are personal: only this
    -- user's own rows are ever shown back to them or exported.
    "user_id" "uuid" NOT NULL,
    -- The message that triggered the check. Nullable so a correction survives if the
    -- message row is ever removed, and so the check is not blocked on the insert.
    "message_id" "uuid",
    -- The language being learned/corrected (the app validates the code; no CHECK here,
    -- matching the post-generalization schema where language codes are app-level).
    "language" "text" NOT NULL,
    -- What the learner actually wrote (the card front).
    "original_text" "text" NOT NULL,
    -- The corrected sentence (the card back).
    "corrected_text" "text" NOT NULL,
    -- Short explanation in the learner's native language.
    "explanation" "text",
    -- The specific word/form that was wrong, when the model identifies one. Optional:
    -- used to highlight the error on the card, not required to build one.
    "error_focus" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."grammar_corrections" OWNER TO "postgres";

ALTER TABLE ONLY "public"."grammar_corrections"
  ADD CONSTRAINT "grammar_corrections_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."grammar_corrections"
  ADD CONSTRAINT "grammar_corrections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."grammar_corrections"
  ADD CONSTRAINT "grammar_corrections_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;

-- Export reads a user's corrections oldest-first; this covers that access path.
CREATE INDEX IF NOT EXISTS "grammar_corrections_user_created_idx"
  ON "public"."grammar_corrections" ("user_id", "created_at");

-- Row-level security is on for every table in this schema; the bot connects as the
-- service role, which bypasses RLS.
ALTER TABLE "public"."grammar_corrections" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."grammar_corrections" TO "anon";
GRANT ALL ON TABLE "public"."grammar_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."grammar_corrections" TO "service_role";
