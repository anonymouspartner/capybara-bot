// Guards for the single-tenant bot: the string catalog, the "/" command menu, the
// compose-box menu button, the health readback, and the flashcard example picker.
//
// WHY THESE LIVE IN THE REPO
//
// They used to live in a scratchpad outside the repo, and a container reset deleted all
// of them at once -- eighty-odd assertions, gone, with the code they guarded still live.
// A test that only one machine can run is a test that does not exist. These run in CI on
// every push (see .github/workflows/check.yml), in Deno, with no npm dependency to rot.
//
// Run locally:  deno test --allow-read tests/
//
// Most of these exist because something broke. Where that is true the comment says what,
// because an assertion whose reason is lost gets deleted the first time it is
// inconvenient.

import { STRINGS, LANGS, t, viewerLang } from "../supabase/functions/telegram-bot/strings.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => Deno.readTextFileSync(ROOT + p);
const SRC = read("supabase/functions/telegram-bot/index.ts");
const RAW_STRINGS = read("supabase/functions/telegram-bot/strings.ts");
const SQL_USAGE = read("supabase/migrations/20260728010000_instance_usage.sql");
const SQL_PICK = read("supabase/migrations/20260730120000_pick_example_message.sql");

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

// One fixture covering every variable name any entry interpolates, rather than a
// per-key map. A per-key map drifts: add a key, forget its vars, and the "renders
// non-empty" check silently passes against {}. The coverage test below keeps this
// honest by parsing the catalog for v.<name> and failing on anything missing here.
const VARS: Record<string, unknown> = {
  a: "English", b: "Ukrainian", name: "Vika", lang: "Ukrainian", n: 2,
  icon: "🖼️", err: "timeout.", deck: "🇺🇦 Ukrainian", word: "cat",
  lemma: "cat", arg: "cats", codes: "uk|en", token: "xx",
  max: 50, requested: 99, since: "1 July", msgs: 2155, annos: 32576,
  spend: "$15.09", files: 1015, voice: "160 MB", db: "135 MB",
  total: 5336, limit: "1.50 GB", wrote: "koty", id: 12345, text: "hello",
};

const keys = Object.keys(STRINGS);

Deno.test("catalog: every key has every language, and none renders empty", () => {
  const bad: string[] = [];
  for (const k of keys) {
    for (const l of LANGS) {
      if ((STRINGS as any)[k][l] === undefined) { bad.push(`${k}.${l} missing`); continue; }
      const out = t(l, k, VARS);
      if (!out || !out.trim()) bad.push(`${k}.${l} empty`);
    }
  }
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("catalog: no entry leaks undefined or [object Object]", () => {
  const bad = keys.filter((k) =>
    LANGS.some((l) => {
      const o = t(l, k, VARS);
      return o.includes("undefined") || o.includes("[object");
    })
  );
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("catalog: every interpolated variable has a fixture", () => {
  // Parses the source for v.<name>. Without this the fixture silently rots: a new key
  // using a new variable renders "undefined" and every other check still passes.
  const used = new Set([...RAW_STRINGS.matchAll(/\bv\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !(v in VARS));
  assert(missing.length === 0, `no fixture for: ${missing.join(", ")}`);
});

Deno.test("catalog: no unescaped < > & outside the allowed tags", () => {
  // These strings are sent with parse_mode HTML. An unescaped angle bracket makes
  // Telegram reject the whole send, so the message silently never arrives.
  const bad: string[] = [];
  for (const k of keys) {
    for (const l of LANGS) {
      const out = t(l, k, VARS);
      const stripped = out.replace(/<\/?(b|i|code|pre|u|s)>/g, "");
      if (/[<>]/.test(stripped)) bad.push(`${k}.${l}`);
      if (/&(?!amp;|lt;|gt;|quot;|#)/.test(out)) bad.push(`${k}.${l} (bare &)`);
    }
  }
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("catalog: no CJK contamination", () => {
  // A machine-written entry once arrived with a Chinese glyph in the French copy, twice.
  // Both languages here are Latin/Cyrillic, so anything in these ranges is contamination.
  const bad = keys.filter((k) =>
    LANGS.some((l) => /[\u3000-\u9fff\uac00-\ud7af]/.test(t(l, k, VARS)))
  );
  assert(bad.length === 0, bad.join(", "));
});

Deno.test("catalog: no key carries a language outside LANGS", () => {
  // An extra language on one key is a row nothing renders. One entry once carried an
  // `es:` value inherited from the multi-tenant catalog it was lifted from.
  const stray = keys.filter((k) =>
    Object.keys((STRINGS as any)[k]).some((l) => !(LANGS as string[]).includes(l))
  );
  assert(stray.length === 0, stray.join(", "));
});

Deno.test("catalog: no key is defined twice", () => {
  // Object.keys dedupes, so a key defined twice passes every check above while the second
  // definition silently shadows the first. Only reading the file catches it -- this
  // happened once, and the shadowed copy was the better-written one.
  const body = RAW_STRINGS.slice(RAW_STRINGS.indexOf("export const STRINGS"), RAW_STRINGS.lastIndexOf("\n};"));
  const found = [...body.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1]);
  const dupes = found.filter((k, i) => found.indexOf(k) !== i);
  assert(dupes.length === 0, `defined twice: ${[...new Set(dupes)].join(", ")}`);
});

Deno.test("t(): falls back to English, and an unknown key does not throw", () => {
  assert(t("uk", "mgmt_header") !== t("en", "mgmt_header"), "uk should differ from en");
  assert(t("ja", "mgmt_header") === t("en", "mgmt_header"), "unknown language should fall back");
  assert(t("en", "definitely_not_a_key") === "", "unknown key should render empty");
});

Deno.test("ukrainian plurals: 1 / 2 / 5 differ, and 21 takes the singular", () => {
  // 21 is the case a naive n === 1 check gets wrong, which is why plUk exists.
  const forms = new Set([1, 2, 5].map((n) => t("uk", "mgmt_usage", { ...VARS, msgs: n })));
  assert(forms.size === 3, "1/2/5 should produce three distinct forms");
  assert(
    t("uk", "mgmt_usage", { ...VARS, msgs: 21 }).includes("21 повідомлення"),
    "21 should take the singular",
  );
});

Deno.test("viewerLang: user row beats Telegram code beats English", () => {
  assert(viewerLang({ language_code: "en" }, { native_language: "uk" }) === "uk", "row wins");
  assert(viewerLang({ language_code: "uk" }) === "uk", "telegram code used when no row");
  assert(viewerLang({ language_code: "uk-UA" }) === "uk", "uk-UA normalises");
  assert(viewerLang({ language_code: "pl" }) === "en", "unsupported falls back");
  assert(viewerLang(undefined) === "en", "no from object falls back");
});

Deno.test("command menu: descriptions are catalog keys, not hardcoded English", () => {
  // They were literals, and setMyCommands took no language_code -- so the "/" menu could
  // not have been anything but English no matter what else was localized. It is the first
  // surface a Ukrainian speaker reads.
  assert(/\{ command: "start",\s+key: "cmd_start" \}/.test(SRC), "start should use a key");
  assert(!/command: "start", description:/.test(SRC), "no literal descriptions");
  assert(/\{ command: "management", key: "cmd_management" \}/.test(SRC), "admin entry keyed too");
});

Deno.test("command menu: five public entries, every key present in both languages", () => {
  // Counted inside PUBLIC_COMMANDS only: ADMIN_COMMANDS spreads it and adds /management
  // at the same indent, so a whole-file count is off by one for the wrong reason.
  const block = SRC.slice(SRC.indexOf("const PUBLIC_COMMANDS"), SRC.indexOf("const ADMIN_COMMANDS"));
  const entries = [...block.matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]);
  assert(entries.length === 5, `expected 5 menu entries, got ${entries.length}`);
  for (const k of [...entries, "cmd_management"]) {
    assert(k in STRINGS, `${k} missing from the catalog`);
    for (const l of LANGS) assert(t(l, k).length > 0, `${k}.${l} empty`);
    // Telegram truncates long descriptions, and Ukrainian runs longer than English.
    for (const l of LANGS) assert(t(l, k).length <= 60, `${k}.${l} over 60 chars`);
    // No short English phrase here is also correct Ukrainian, so equality means an
    // untranslated entry slipped through.
    assert(t("en", k) !== t("uk", k), `${k} identical across languages`);
  }
});

Deno.test("command menu: English is the fallback set, registered with no language_code", () => {
  // Telegram serves the language_code-less list to every app language without one of its
  // own. Sending "" instead registers a set for the empty-string language and leaves the
  // fallback unset -- the menu would then be English for nobody and missing for everyone.
  assert(/setMyCommands\(commandsIn\(PUBLIC_COMMANDS, "en"\)\)/.test(SRC), "en has no scope/lang args");
  assert(/setMyCommands\(commandsIn\(PUBLIC_COMMANDS, lang\), undefined, lang\)/.test(SRC), "others pass lang");
  assert(/if \(languageCode\) body\.language_code = languageCode;/.test(SRC), "omitted, not sent empty");
  // A chat scope outranks the default one, so the admin list must still carry the public
  // commands or setting it would hide /start and /help from the admin entirely.
  assert(/const ADMIN_COMMANDS[^=]*=\s*\[\s*\n?\s*\.\.\.PUBLIC_COMMANDS,/.test(SRC), "admin spreads public");
});

Deno.test("compose-box menu button is released to default, not pinned to commands", () => {
  // "commands" renders as a blue hamburger in the left slot and opens a sheet; "default"
  // gives the "/" shortcut inside the input field, which autofills and so composes with
  // typing an argument. The old code set "commands" under a comment claiming the reverse.
  assert(/menu_button: \{ type: "default" \}/.test(SRC), "should set default");
  assert(!/menu_button: \{ type: "commands" \}/.test(SRC), "should not force commands");
  assert(/await setChatMenuButtonToDefault\(\)/.test(SRC), "should actually be called");
});

Deno.test("health ?commands reads the menu back from Telegram rather than reporting a flag", () => {
  // setMyCommands runs as background work, so a failure leaves the webhook at 200 and the
  // request log clean. A flag reporting what we believe we sent would go green on exactly
  // the failure it exists to catch.
  assert(/\$\{TELEGRAM_API\}\/getMyCommands/.test(SRC), "should call getMyCommands");
  assert(/url\.searchParams\.has\("commands"\)/.test(SRC), "should be opt-in");
  assert(!/body\.commandsRegistered/.test(SRC), "should not report a local flag");
  // A count proves a list exists; only a sample line proves it is in the right language.
  assert(/sample: r\.commands\[0\]\?\.description/.test(SRC), "should report a sample");
  // Plain health must stay dependency-free so the deploy smoke test still reports
  // function-up when an upstream is down.
  const health = SRC.slice(SRC.indexOf('status: "ok",'), SRC.indexOf("const secret = req.headers"));
  assert(
    health.indexOf('url.searchParams.has("commands")') < health.indexOf("getMyCommands"),
    "the Telegram call must sit behind the opt-in guard",
  );
});

Deno.test("/education and /memory group the menu without removing any command", () => {
  assert(/isCmd\(t, "education", "study"\)/.test(SRC) && /isCmd\(t, "memory"\)/.test(SRC), "hubs dispatch");
  // The grouping is a discoverability change, not a capability change.
  for (const c of ["vocab", "learn", "forget", "export", "mistakes", "capybara",
                   "pin", "unpin", "pinned", "reconcile", "restore"]) {
    assert(new RegExp(`"/${c}"|isCmd\\(t, "${c}"`).test(SRC), `/${c} must still dispatch`);
  }
  // Buttons call the real handlers rather than a second copy that can drift.
  for (const h of ["handleVocab", "handleExport", "handleMistakes", "handlePinned"]) {
    assert(new RegExp(`await ${h}\\(shim, actor\\)`).test(SRC), `${h} should be reused`);
  }
  // Only argument-free commands get buttons: a button cannot carry the word /learn needs.
  assert(!/callback_data: "ed:learn"/.test(SRC) && !/callback_data: "mem:ask"/.test(SRC), "no arg buttons");
});

Deno.test("the callback admin gate still guards everything after the hub branch", () => {
  // The blanket admin check used to be the FIRST statement in handleCallbackQuery, so
  // every callback was admin-only. The ed:/mem: branch now runs ahead of it; this pins
  // that the gate still precedes the deploy button.
  const fn = SRC.slice(SRC.indexOf("async function handleCallbackQuery"));
  const hub = fn.indexOf('data.startsWith("ed:")');
  const gate = fn.indexOf("cq.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID");
  const deploy = fn.indexOf('data.startsWith("deploy:")');
  assert(hub > -1 && hub < gate, "hub branch must return before the admin gate");
  assert(gate > -1 && gate < deploy, "deploy must stay behind the admin gate");
  assert(/if \(!actor\) \{ await answerCallbackQuery\(cq\.id, "Not registered\."\); return; \}/.test(fn),
    "hub buttons require a registered user");
});

Deno.test("no localized handler passes a bare string literal to sendMessage", () => {
  // The mechanism that stops the localization regressing one forgotten message at a time.
  const names = ["handleMistakes", "handleExport", "exportRun", "handleLearnTop", "handleLearn",
    "handleForget", "handleReconcile", "handleRestore", "handlePin", "handleUnpin",
    "handlePinned", "handleRemember", "handleEducation", "handleMemory", "handleHelp",
    "grammarAssist", "handleCapybara"];
  const offenders: string[] = [];
  for (const n of names) {
    const start = SRC.indexOf(`async function ${n}(`);
    if (start === -1) { offenders.push(`${n} (not found)`); continue; }
    const body = SRC.slice(start, SRC.indexOf("\n}\n", start));
    for (const m of body.matchAll(/sendMessage\([^,]+,\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g)) {
      // A template that only composes interpolations carries no prose -- the words are in
      // the variables, which come from t(). Strip ${...} and ask whether English remains.
      const prose = m[1].replace(/\$\{[^}]*\}/g, "").replace(/\\[nt]/g, " ");
      if (!/[A-Za-z]{2,}/.test(prose)) continue;
      offenders.push(`${n}: ${m[1].slice(0, 40)}`);
    }
  }
  assert(offenders.length === 0, offenders.join(" | "));
});

Deno.test("the bare-literal detector can actually fail", () => {
  // A detector that never fires proves nothing. Samples with known answers.
  const detect = (line: string) =>
    [...line.matchAll(/sendMessage\([^,]+,\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g)]
      .some((m) => /[A-Za-z]{2,}/.test(m[1].replace(/\$\{[^}]*\}/g, "").replace(/\\[nt]/g, " ")));
  assert(detect('await sendMessage(msg.chat.id, "That message was not pinned.");'), "catches a literal");
  assert(detect("await sendMessage(msg.chat.id, `Added ${n} words to your deck.`);"), "catches template prose");
  assert(!detect('await sendMessage(msg.chat.id, t(lang, "unpin_ok"));'), "passes a t() call");
  assert(!detect("await sendMessage(msg.chat.id, `${header}\\n${lines.join(\"\\n\")}`);"), "passes pure interpolation");
});

Deno.test("flashcard examples are picked on evidence, with a fallback to first_seen", () => {
  // Cards used to take example_message_id = first_seen_message_id with nothing checking
  // that the taught translation survives into that message. ~12% of a 466-card deck did
  // not, and 66.5% of all examples came from the corpus's first week.
  assert(/supabase\.rpc\("pick_example_messages"/.test(SRC), "should call the picker");
  const uses = [...SRC.matchAll(/example_message_id: examples\.get\(v\.id\) \?\? v\.first_seen_message_id/g)];
  assert(uses.length === 2, `both insert sites should use the picker, found ${uses.length}`);
  assert(!/example_message_id: v\.first_seen_message_id,/.test(SRC), "no unguarded first_seen insert");
  // Adding the card is what the user asked for; the example is decoration on it.
  assert(/pick_example_messages failed, falling back to first_seen/.test(SRC), "must fail soft");
});

Deno.test("migrations: SECURITY DEFINER usage function is aggregates-only and locked down", () => {
  assert(!/original_text/.test(SQL_USAGE) && /count\(\*\)/.test(SQL_USAGE), "aggregates only");
  assert(/SECURITY DEFINER/.test(SQL_USAGE), "definer needed for storage.objects");
  // A new function is PUBLIC-executable by default here; that default is how
  // vocab_top_unlearned became callable with the anon key.
  assert(/REVOKE EXECUTE ON FUNCTION public\.instance_usage\(\) FROM PUBLIC/.test(SQL_USAGE), "revoked");
  assert(/GRANT {2}EXECUTE ON FUNCTION public\.instance_usage\(\) TO service_role/.test(SQL_USAGE), "granted");
  assert(/RAISE EXCEPTION 'instance_usage is still executable/.test(SQL_USAGE), "self-asserting");
});

Deno.test("migrations: the example picker is caller-rights and locked down", () => {
  // Deliberately NOT definer: the bot connects as service_role, and definer rights would
  // hand any caller a read straight through RLS into the message corpus.
  // Comments are stripped first -- this file *explains* why it is not SECURITY DEFINER,
  // so matching the raw text would pass on the prose and never inspect the DDL.
  const ddl = SQL_PICK.replace(/^\s*--.*$/gm, "");
  assert(!/SECURITY DEFINER/.test(ddl), "must not be SECURITY DEFINER");
  assert(/REVOKE EXECUTE ON FUNCTION public\.pick_example_messages\(uuid\[\]\) FROM PUBLIC/.test(SQL_PICK), "revoked");
  assert(/GRANT {2}EXECUTE ON FUNCTION public\.pick_example_messages\(uuid\[\]\) TO service_role/.test(SQL_PICK), "granted");
  assert(/COALESCE\(best\.id, s\.first_seen_message_id\)/.test(SQL_PICK), "must fall back, never return null");
  assert(/BETWEEN 40 AND 250/.test(SQL_PICK), "length bounds keep out typos and pasted articles");
});
