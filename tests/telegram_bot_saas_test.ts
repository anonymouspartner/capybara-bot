// Guards for the multi-tenant build.
//
// Deliberately NOT a copy of telegram_bot_test.ts. The two builds are separate products
// that share ~90% of their code, so the interesting assertions are the ones where they
// must DIFFER -- tenant scoping above all -- plus the four defects ported across from the
// single-tenant build, which would otherwise regress here unobserved.
//
// Run locally:  deno test --allow-read tests/

import { STRINGS, LANGS, t, viewerLang } from "../supabase/functions/telegram-bot-saas/strings.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => Deno.readTextFileSync(ROOT + p);
const SRC = read("supabase/functions/telegram-bot-saas/index.ts");
const RAW_STRINGS = read("supabase/functions/telegram-bot-saas/strings.ts");
const SQL_PICK = read("supabase/migrations-saas/20260801060000_pick_example_message_tenant.sql");

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

Deno.test("catalog: all eight languages on every key, nothing empty", () => {
  const bad: string[] = [];
  for (const k of Object.keys(STRINGS)) {
    for (const l of LANGS) {
      if ((STRINGS as any)[k][l] === undefined) bad.push(`${k}.${l} missing`);
    }
  }
  assert(LANGS.length === 8, `expected 8 languages, got ${LANGS.length}`);
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("catalog: no key is defined twice", () => {
  // Object.keys dedupes, so a duplicate passes every runtime check while the second
  // definition silently shadows the first. This caught a real collision: the "/" menu keys
  // were added without noticing the /help catalog already defined ten of them.
  const body = RAW_STRINGS.slice(RAW_STRINGS.indexOf("export const STRINGS"), RAW_STRINGS.lastIndexOf("\n};"));
  const found = [...body.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1]);
  const dupes = [...new Set(found.filter((k, i) => found.indexOf(k) !== i))];
  assert(dupes.length === 0, `defined twice: ${dupes.join(", ")}`);
});

Deno.test("catalog: no CJK contamination", () => {
  // A stray Chinese glyph reached the French copy twice. None of the eight languages here
  // uses these ranges.
  const bad = Object.keys(STRINGS).filter((k) =>
    LANGS.some((l) => {
      const e = (STRINGS as any)[k][l];
      return typeof e === "string" && /[　-鿿가-힯]/.test(e);
    })
  );
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("viewerLang resolves across all eight, and falls back safely", () => {
  assert(viewerLang({ language_code: "en" }, { native_language: "pl" }) === "pl", "row wins");
  assert(viewerLang({ language_code: "pt-BR" }) === "pt", "pt-BR normalises");
  assert(viewerLang({ language_code: "uk-UA" }) === "uk", "uk-UA normalises");
  assert(viewerLang({ language_code: "ja" }) === "en", "unsupported falls back");
  assert(viewerLang(undefined) === "en", "no from object falls back");
});

Deno.test('the "/" menu is keyed, and every key resolves in all eight languages', () => {
  // Descriptions were hardcoded English, so the first surface a customer reads -- the list
  // of what the product does -- was in the wrong language whichever one they picked.
  assert(!/command: "start", description:/.test(SRC), "no literal descriptions");
  const block = SRC.slice(SRC.indexOf("const PUBLIC_COMMANDS"), SRC.indexOf("const SUPERADMIN_EXTRA"));
  const keys = [...block.matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]);
  // A ratchet, not a target: the menu was curated down to eight deliberately, so growing
  // it should be a decision someone made on purpose rather than a drift.
  assert(keys.length === 8, `expected 8 menu entries, got ${keys.length}`);
  for (const k of keys) {
    assert(k in STRINGS, `${k} missing from the catalog`);
    for (const l of LANGS) {
      const out = t(l, k);
      assert(out.length > 0, `${k}.${l} empty`);
      // Telegram's hard limit is 256; this is the readability bound.
      assert(out.length <= 80, `${k}.${l} is ${out.length} chars, too long for a menu row`);
    }
  }
  // Superadmin entries stay English literals on purpose: one operator, who reads English.
  assert(/const SUPERADMIN_EXTRA/.test(SRC), "superadmin extras kept separate");
  assert(/command: "tenants", description:/.test(SRC), "superadmin entries stay literal");
});

Deno.test("English is the fallback set, registered with no language_code", () => {
  // Telegram serves the language_code-less list to every app language without one of its
  // own. Sending "" registers a set for the empty-string language and leaves the fallback
  // unset -- English for nobody, missing for everyone.
  assert(/setMyCommands\(commandsIn\(PUBLIC_COMMANDS, "en"\)\)/.test(SRC), "en carries no lang arg");
  assert(/setMyCommands\(commandsIn\(PUBLIC_COMMANDS, lang\), undefined, lang\)/.test(SRC), "others pass lang");
  assert(/if \(languageCode\) body\.language_code = languageCode;/.test(SRC), "omitted, not sent empty");
});

Deno.test("the per-chat menu is set lazily, not by iterating every customer", () => {
  // The per-language sets are matched against the reader's APP language, which need not be
  // the language they chose here. A chat scope outranks the default and pins it to their
  // choice. It must NOT be done by walking the users table on cold start: that is one
  // Telegram call per customer per cold start, growing with the customer base, mostly for
  // people who are not even active. The single-tenant build can iterate; it has two users.
  assert(/const chatMenuSet = new Set<number>\(\);/.test(SRC), "needs a per-instance guard");
  assert(/if \(!id \|\| chatMenuSet\.has\(id\)\) return;/.test(SRC), "at most once per user per instance");
  assert(/scheduleBackgroundWork\("setChatMenuForUser"/.test(SRC), "runs off the hot path");
  // Marking done before the call: retrying every message would turn a Telegram outage into
  // a per-message API storm.
  assert(/chatMenuSet\.add\(id\);\s*\n\s*await setMyCommands/.test(SRC), "mark before call, not after");
});

Deno.test("the webhook is kept wide enough to deliver button taps", () => {
  // setWebhook's contract is "If not specified, the previous setting will be used", so a
  // narrow allowed_updates is sticky and silently survives every re-registration. On this
  // build that breaks the plan picker, the onboarding wizard and the trial flow -- every
  // path a paying customer takes -- with no error anywhere.
  assert(/const REQUIRED_UPDATES = \[.*"callback_query".*\]/.test(SRC), "callback_query required");
  assert(/await ensureWebhookAllowsCallbacks\(\)/.test(SRC), "self-heal must run");
  // Reuse the URL Telegram already holds; a computed one differs behind a custom domain.
  assert(/JSON\.stringify\(\{ url: info\.url,/.test(SRC), "must reuse the existing url");
  // setWebhook DROPS the secret when the parameter is omitted.
  assert(/secret_token: WEBHOOK_SECRET/.test(SRC), "must re-send the secret");
  assert(/if \(allowed\.length === 0\) return true;/.test(SRC), "empty list is already correct");
  assert(/url\.searchParams\.has\("webhook"\)/.test(SRC), "readback must be exposed");
});

Deno.test("?commands reads the menu back, and does not publish the customer count", () => {
  // A count of chat scopes IS the customer count, and this route is unauthenticated by
  // necessity -- the deploy smoke test calls it before anything is signed in. Reporting
  // per-chat menus here, as the single-tenant build does, would publish business
  // information. That is the one place the two readbacks must differ.
  assert(/url\.searchParams\.has\("commands"\)/.test(SRC), "readback must be exposed");
  assert(/\$\{TELEGRAM_API\}\/getMyCommands/.test(SRC), "must ask Telegram, not report a flag");
  assert(/sample: r\.commands\[0\]\?\.description/.test(SRC), "a count alone cannot show language");
  assert(/await describe\("fallback"\);/.test(SRC), "fallback set checked on its own");
  assert(!/perChatMenus/.test(SRC), "must not enumerate customer chat scopes");
  // Scoped to the ?commands branch itself. tenantCount elsewhere is fine -- it is the
  // long-standing ?seed check, deliberately opt-in and documented. What must not happen is
  // the menu readback walking the users table to report a scope per customer.
  const block = SRC.slice(
    SRC.indexOf('url.searchParams.has("commands")'),
    SRC.indexOf('url.searchParams.has("webhook")'),
  );
  assert(block.length > 0, "?commands block not found");
  assert(!/\.from\("users"\)/.test(block), "menu readback must not enumerate users");
  assert(!/tenantCount|count\(/.test(block), "menu readback must not report customer counts");
});

Deno.test("compose-box menu button is default, not pinned to commands", () => {
  assert(/menu_button: \{ type: "default" \}/.test(SRC), "should set default");
  assert(!/menu_button: \{ type: "commands" \}/.test(SRC), "should not force commands");
});

Deno.test("flashcard examples are tenant-scoped and fail soft", () => {
  // Unscoped, a customer's flashcard could take its example from another couple's private
  // conversation -- and it would look like the feature working rather than a leak.
  assert(/p_tenant_id: tenantId/.test(SRC), "the RPC call must pass a tenant");
  assert(/pickExamples\(user\.tenant_id,/.test(SRC), "call sites must pass the tenant");
  const uses = [...SRC.matchAll(/example_message_id: examples\.get\(v\.id\) \?\? v\.first_seen_message_id/g)];
  assert(uses.length === 2, `both insert sites should use the picker, found ${uses.length}`);
  assert(!/example_message_id: v\.first_seen_message_id,/.test(SRC), "no unguarded first_seen insert");
  assert(/pick_example_messages failed, falling back to first_seen/.test(SRC), "must fail soft");
});

Deno.test("the picker migration scopes by tenant and stays caller-rights", () => {
  const ddl = SQL_PICK.replace(/^\s*--.*$/gm, "");
  // Comments are stripped first: this file explains why it is not SECURITY DEFINER, so
  // matching raw text would pass on the prose without inspecting the DDL.
  assert(!/SECURITY DEFINER/.test(ddl), "must not be SECURITY DEFINER");
  assert(/m\.tenant_id = s\.tenant_id/.test(ddl), "message search must be tenant-scoped");
  assert(/AND tenant_id = p_tenant_id/.test(ddl), "vocabulary lookup must be tenant-scoped");
  assert(/COALESCE\(best\.id, s\.first_seen_message_id\)/.test(ddl), "must fall back, never return null");
  assert(/GRANT {2}EXECUTE ON FUNCTION public\.pick_example_messages\(uuid, uuid\[\]\) TO service_role/.test(SQL_PICK), "granted");
  assert(/REVOKE EXECUTE ON FUNCTION public\.pick_example_messages\(uuid, uuid\[\]\) FROM PUBLIC/.test(SQL_PICK), "revoked");
});

Deno.test("the hubs group the menu without removing any command", () => {
  assert(/isCmd\(t, "education", "study"\)/.test(SRC) && /isCmd\(t, "memory"\)/.test(SRC), "hubs dispatch");
  // The grouping is a discoverability change, not a capability change. Every command that
  // left the menu must still work typed out.
  for (const c of ["vocab", "learn", "forget", "export", "mistakes", "capybara", "practice",
                   "pin", "unpin", "pinned", "reconcile", "restore"]) {
    assert(new RegExp(`"/${c}"|isCmd\\(t, "${c}"`).test(SRC), `/${c} must still dispatch`);
  }
  // Buttons call the real handlers rather than a second copy that can drift.
  for (const h of ["handleVocab", "handleExport", "handleMistakes", "handlePinned"]) {
    assert(new RegExp(`await ${h}\\(shim, actor\\)`).test(SRC), `${h} should be reused`);
  }
  // Only argument-free commands get buttons: a button cannot carry the word /learn needs.
  assert(!/callback_data: "ed\|learn"/.test(SRC) && !/callback_data: "mem\|ask"/.test(SRC), "no arg buttons");
  // Opening an index is a pure read; billing a message for it charges for our own menu.
  const gate = SRC.slice(SRC.indexOf('"leave", "help", "start"'), SRC.indexOf('const verdict = await consumeQuota'));
  assert(/"education", "study", "memory"/.test(gate), "hubs must be exempt from the quota gate");
  // The commercially load-bearing entries must survive the cut: a lapsed card dead-ends at
  // /management, and /plans is the only entry aimed at someone who is not a customer yet.
  for (const k of ["cmd_billing", "cmd_plans", "cmd_leave", "cmd_ask"]) {
    assert(new RegExp(`key: "${k}"`).test(SRC), `${k} must stay in the menu`);
  }
});

Deno.test("solo practice: the bot's words never reach the study corpus", () => {
  // The whole constraint of this feature. Vocabulary, flashcards, /recap and /ask are
  // supposed to be built from real human conversation; a deck mined from model output
  // would quietly stop being that. The bot's turns go to practice_turns, which nothing in
  // the study pipeline reads -- so it holds BY CONSTRUCTION rather than by remembering to
  // filter every reader of messages.
  const fn = SRC.slice(SRC.indexOf("async function practiceReply("), SRC.indexOf("async function handleCapybara("));
  assert(fn.length > 0, "practiceReply not found");
  assert(/\.from\("practice_turns"\)\s*\n?\s*\.insert/.test(fn), "turns go to practice_turns");
  assert(!/\.from\("messages"\)/.test(fn), "must never write the bot's words to messages");
  assert(!/scheduleAnnotation|embedMessageBackground/.test(fn), "must not annotate or embed its own output");
  const sql = read("supabase/migrations-saas/20260806070000_practice_partner.sql");
  assert(/CREATE TABLE IF NOT EXISTS public\.practice_turns/.test(sql), "table must exist");
  assert(/ENABLE ROW LEVEL SECURITY/.test(sql), "as private as the conversation it replaces");
  assert(/RAISE EXCEPTION 'practice_turns is readable by anon\/authenticated'/.test(sql), "self-asserting");
});

Deno.test("solo practice: replies in the target language, costs a quota unit, is opt-in", () => {
  const fn = SRC.slice(SRC.indexOf("async function practiceReply("), SRC.indexOf("async function handleCapybara("));
  // Production practice is the point -- answering in their native language would defeat it.
  assert(/Reply ONLY in \$\{target\}/.test(fn), "must reply in the language being learned");
  assert(/langMeta\(user\.learning_language\)\.englishName/.test(fn), "target is learning_language");
  // A reply is a model call. Absorbing it would roughly double the cost of serving a plan.
  assert(/const verdict = await consumeQuota\(user\.tenant_id\);/.test(fn), "must charge a message");
  assert(/if \(!verdict\.allowed\) return;/.test(fn), "must stop at the cap");
  // Correcting mid-conversation is what stops people talking; /capybara already does it.
  assert(/Do not correct their mistakes/.test(fn), "conversation partner, not a teacher");
  // Off by default, and only fires with no partner.
  assert(/practice_partner boolean NOT NULL DEFAULT false/.test(read("supabase/migrations-saas/20260806070000_practice_partner.sql")), "off by default");
  assert(/if \(user\.practice_partner && !\(await lookupPartner\(db, user\.id\)\)\)/.test(SRC), "solo only");
  // Turning it OFF must work at the cap, or the setting spending the allowance is the one
  // you cannot reach to stop.
  const gate = SRC.slice(SRC.indexOf('"leave", "help", "start"'), SRC.indexOf('const verdict = await consumeQuota'));
  assert(/"practice"/.test(gate), "/practice must be exempt from the quota gate");
});

Deno.test("tenant scoping: raw dbAdmin use stays rare and commented", () => {
  // Every customer-facing read goes through tenantDb. dbAdmin bypasses that by design and
  // is legitimate in a few places (instance-wide health, provisioning), but each one is a
  // place a tenant boundary could be crossed, so the count is pinned rather than trusted.
  //
  // 44 is the count at the time of writing, not a target. It is a ratchet: raising it
  // should be a deliberate act with a reason, because each new dbAdmin call is a place a
  // tenant boundary could be crossed. The newest one is the flashcard example picker,
  // which is legitimate precisely because it passes p_tenant_id and the SQL scopes on it.
  const uses = [...SRC.matchAll(/\bdbAdmin\b/g)].length;
  assert(uses <= 44, `dbAdmin used ${uses} times, was 44 -- each new one bypasses tenantDb, so justify it`);
  assert(/function tenantDb\(/.test(SRC), "tenantDb must exist");
});
