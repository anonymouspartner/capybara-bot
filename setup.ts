#!/usr/bin/env -S deno run -A
// setup.ts - guided, cross-platform setup wizard for a new Capybara instance.
//
//   deno run -A setup.ts            # run the wizard
//   deno run -A setup.ts --check    # read-only checks only (no changes)
//
// Walks one adult, one question at a time, through provisioning ONE Capybara instance
// for ONE couple (English-native admin + Ukrainian-native partner). It guides the steps
// that must be done by hand in a browser/app (create the Telegram bot, create the
// Supabase project, get API keys) and automates everything else: generates WEBHOOK_SECRET,
// writes .env, applies the DB migration, creates the storage bucket, seeds the couple,
// sets the function secrets, runs the deploy gate + deploys, sets the Telegram webhook,
// and smoke-tests the health route. It also optionally wires up one-tap /update
// self-deploy from Telegram (GitHub Actions secrets + the bot's deploy token).
//
// Secrets are written only to the gitignored .env (never printed, never committed).
// Safe to re-run: every step is idempotent and progress is tracked in
// .capybara-setup-state.json so a mid-way failure resumes cleanly.

const FUNCTION = "telegram-bot";
const REGION = "eu-west-1";
const INDEX = "supabase/functions/telegram-bot/index.ts";
const ENV_EXAMPLE = ".env.example";
const ENV_FILE = ".env";
const SEED_FILE = "seed_couple.sql";
const STORAGE_FILE = "storage_setup.sql";
const STATE_FILE = ".capybara-setup-state.json";
const MIGRATION = "supabase/migrations/20260601000000_init_schema.sql";
const PG_MOD = "https://deno.land/x/postgres@v0.19.3/mod.ts";
const CONV_UUID = "00000000-0000-0000-0000-000000000001";
const TOTAL = 12;

const SECRET_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ADMIN_TELEGRAM_ID",
] as const;

// ---------------------------------------------------------------------------- UI
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const out = (s: string) => Deno.stdout.writeSync(enc(s));
const banner = (s: string) => console.log(`\n${C.bold}${C.cyan}${s}${C.reset}`);
const info = (s: string) => console.log(s);
const dim = (s: string) => console.log(`${C.dim}${s}${C.reset}`);
const ok = (s: string) => console.log(`  ${C.green}✓${C.reset} ${s}`);
const warn = (s: string) => console.log(`  ${C.yellow}!${C.reset} ${s}`);
const err = (s: string) => console.log(`  ${C.red}✗${C.reset} ${s}`);
const step = (n: number, title: string) =>
  console.log(`\n${C.bold}Step ${n} of ${TOTAL} — ${title}${C.reset}`);

// ---------------------------------------------------------------------------- input
async function askLine(message: string): Promise<string> {
  out(message + " ");
  const bytes: number[] = [];
  const buf = new Uint8Array(1);
  while (true) {
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    if (buf[0] === 10) break; // \n
    if (buf[0] === 13) continue; // \r
    bytes.push(buf[0]);
  }
  return dec(new Uint8Array(bytes)).trim();
}

async function askSecret(message: string): Promise<string> {
  out(message + " ");
  let raw = false;
  try {
    Deno.stdin.setRaw(true);
    raw = true;
  } catch {
    raw = false;
  }
  if (!raw) {
    const v = await askLine("");
    warn("(input was visible on screen — clear your scrollback if this terminal can't hide it)");
    return v;
  }
  const bytes: number[] = [];
  const buf = new Uint8Array(1);
  try {
    while (true) {
      const n = await Deno.stdin.read(buf);
      if (n === null) break;
      const ch = buf[0];
      if (ch === 13 || ch === 10) break; // enter
      if (ch === 3) { // ctrl-c
        Deno.stdin.setRaw(false);
        console.log("^C");
        Deno.exit(130);
      }
      if (ch === 127 || ch === 8) { // backspace
        if (bytes.length) { bytes.pop(); out("\b \b"); }
        continue;
      }
      bytes.push(ch);
      out("*");
    }
  } finally {
    Deno.stdin.setRaw(false);
  }
  out("\n");
  return dec(new Uint8Array(bytes)).trim();
}

async function askValidated(
  message: string, re: RegExp, hint: string, secret = false,
): Promise<string> {
  while (true) {
    const v = secret ? await askSecret(message) : await askLine(message);
    if (re.test(v)) return v;
    err(`That doesn't look right. ${hint}`);
  }
}

async function confirmYes(message: string): Promise<boolean> {
  const v = (await askLine(`${message} [y/N]`)).toLowerCase();
  return v === "y" || v === "yes";
}

async function openUrl(url: string) {
  const os = Deno.build.os;
  const c = os === "windows"
    ? ["cmd", "/c", "start", "", url]
    : os === "darwin"
    ? ["open", url]
    : ["xdg-open", url];
  try {
    await new Deno.Command(c[0], { args: c.slice(1), stdout: "null", stderr: "null" }).output();
  } catch { /* best effort */ }
}

async function maybeOpen(label: string, url: string) {
  info(`   ${label}: ${C.cyan}${url}${C.reset}`);
  if (await confirmYes("   Open it in your browser now?")) await openUrl(url);
}

// ---------------------------------------------------------------------------- subprocess
async function run(cmd: string, args: string[], env?: Record<string, string>): Promise<boolean> {
  try {
    const p = new Deno.Command(cmd, {
      args, env, stdin: "inherit", stdout: "inherit", stderr: "inherit",
    }).spawn();
    return (await p.status).success;
  } catch {
    return false;
  }
}

// Like run(), but feeds `input` on stdin instead of inheriting the terminal — used to
// hand a secret to `gh secret set` without ever putting it on the argv (process list).
async function runIn(cmd: string, args: string[], input: string): Promise<boolean> {
  try {
    const p = new Deno.Command(cmd, {
      args, stdin: "piped", stdout: "inherit", stderr: "inherit",
    }).spawn();
    const w = p.stdin.getWriter();
    await w.write(enc(input));
    await w.close();
    return (await p.status).success;
  } catch {
    return false;
  }
}

async function capture(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
    return { ok: r.success, out: dec(r.stdout) + dec(r.stderr) };
  } catch {
    return { ok: false, out: "" };
  }
}

const have = (cmd: string) => capture(cmd, ["--version"]).then((r) => r.ok);

// ---------------------------------------------------------------------------- files
function parseEnv(text: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) o[m[1]] = m[2];
  }
  return o;
}

async function readEnv(): Promise<Record<string, string>> {
  try {
    return parseEnv(await Deno.readTextFile(ENV_FILE));
  } catch {
    return {};
  }
}

async function writeEnv(values: Record<string, string>) {
  let text: string;
  try {
    text = await Deno.readTextFile(ENV_EXAMPLE);
  } catch {
    text = SECRET_KEYS.map((k) => `${k}=`).join("\n") + "\n";
  }
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else text += `\n${k}=${v}\n`;
  }
  await Deno.writeTextFile(ENV_FILE, text);
  try {
    await Deno.chmod(ENV_FILE, 0o600);
  } catch { /* not supported on Windows */ }
}

type State = { ref?: string; done: string[] };
async function loadState(): Promise<State> {
  try {
    return JSON.parse(await Deno.readTextFile(STATE_FILE));
  } catch {
    return { done: [] };
  }
}
async function saveState(s: State) {
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(s, null, 2));
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------- gate / deploy
async function gate(): Promise<boolean> {
  if (!await have("deno")) {
    err("deno not found — can't run the pre-deploy gate.");
    return false;
  }
  if (!await run("deno", ["check", INDEX])) {
    err("deno check failed on index.ts.");
    return false;
  }
  const src = await Deno.readTextFile(INDEX);
  const lines = src.split("\n").length;
  if (lines < 1500) {
    err(`index.ts is only ${lines} lines (expected >= 1500) — refusing to deploy a stub.`);
    return false;
  }
  const anchors = ["Deno.serve", "handleUpdate", "BACKFILL_ADMIN_TELEGRAM_ID", "handleRecap", "handleReconcile", "handlePinned"];
  const missing = anchors.filter((a) => !src.includes(a));
  if (missing.length) {
    err(`index.ts missing anchors: ${missing.join(", ")}`);
    return false;
  }
  ok(`Gate passed (deno check, ${lines} lines, all anchors present).`);
  return true;
}

async function buildVersion(): Promise<string | null> {
  try {
    const m = (await Deno.readTextFile(INDEX)).match(/const BUILD_VERSION = "([^"]+)";/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function smokeHealth(ref: string, expectVersion: string | null): Promise<boolean> {
  const url = `https://${ref}.supabase.co/functions/v1/${FUNCTION}?health`;
  try {
    const r = await fetch(url);
    if (r.status !== 200) {
      err(`Health route returned ${r.status} (expected 200).`);
      return false;
    }
    const body = await r.json();
    if (expectVersion && body.version !== expectVersion) {
      err(`Live version "${body.version}" != expected "${expectVersion}".`);
      return false;
    }
    if (body.adminConfigured !== true) {
      err("adminConfigured is not true — ADMIN_TELEGRAM_ID isn't set on the project.");
      return false;
    }
    ok(`Health OK: version ${body.version}, adminConfigured true.`);
    return true;
  } catch (e) {
    err(`Couldn't reach the health route: ${(e as Error).message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------- supabase auth
async function ensureSupabaseAuth(): Promise<boolean> {
  if ((await capture("supabase", ["projects", "list"])).ok) return true;
  warn("You're not logged in to the Supabase CLI.");
  info("   A browser window will open so you can authorize the CLI.");
  if (!await confirmYes("   Run `supabase login` now?")) return false;
  await run("supabase", ["login"]);
  return (await capture("supabase", ["projects", "list"])).ok;
}

// ---------------------------------------------------------------------------- SQL: bucket + seed
type Seed = { adminId: string; adminName: string; partnerId: string; partnerName: string };

function fillSeedSql(template: string, s: Seed): string {
  const esc = (n: string) => n.replace(/'/g, "''");
  // Replace ONLY the two telegram-id placeholders, which are the literal
  // `000000000::bigint`. Anchoring on `::bigint` is deliberate: a bare
  // /000000000/g also matches the run of zeros inside the default-conversation
  // UUID (00000000-0000-0000-0000-000000000001) and would rewrite it to a bogus
  // value, breaking the messages.conversation_id foreign key.
  let i = 0;
  return template
    .replace(/000000000::bigint/g, () => `${i++ === 0 ? s.adminId : s.partnerId}::bigint`)
    .replace("<English-native partner name>", esc(s.adminName))
    .replace("<Ukrainian-native partner name>", esc(s.partnerName));
}

async function applyBucketAndSeedOverConnection(ref: string, dbpw: string, s: Seed): Promise<boolean> {
  const targets = [
    { hostname: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
    { hostname: `aws-0-${REGION}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  ];
  let Client: unknown;
  try {
    ({ Client } = await import(PG_MOD) as { Client: unknown });
  } catch (e) {
    warn(`Couldn't load the Postgres driver: ${(e as Error).message}`);
    return false;
  }
  for (const t of targets) {
    // deno-lint-ignore no-explicit-any
    const client = new (Client as any)({ ...t, database: "postgres", password: dbpw, tls: { enabled: true } });
    try {
      await client.connect();
      try {
        await client.queryArray(
          "insert into storage.buckets (id, name, public) values ('voice-messages','voice-messages',false) on conflict (id) do nothing",
        );
        await client.queryArray`insert into public.users (telegram_id, display_name, native_language, learning_language) values (${s.adminId}, ${s.adminName}, 'en', 'uk') on conflict (telegram_id) do nothing`;
        await client.queryArray`insert into public.users (telegram_id, display_name, native_language, learning_language) values (${s.partnerId}, ${s.partnerName}, 'uk', 'en') on conflict (telegram_id) do nothing`;
        await client.queryArray(
          `insert into public.conversations (id, title) values ('${CONV_UUID}','Default conversation') on conflict (id) do nothing`,
        );
        const res = await client.queryArray("select count(*)::int from public.users");
        const count = Number(res.rows?.[0]?.[0] ?? 0);
        ok(`Storage bucket + seed applied via ${t.hostname} (users rows: ${count}).`);
        return true;
      } finally {
        await client.end();
      }
    } catch (e) {
      warn(`Connection via ${t.hostname} failed: ${(e as Error).message}`);
    }
  }
  return false;
}

async function pasteFallback(ref: string, s: Seed) {
  warn("Couldn't apply the bucket + seed automatically. One quick manual step instead:");
  info("   1. Open your project's SQL editor:");
  info(`      ${C.cyan}https://supabase.com/dashboard/project/${ref}/sql/new${C.reset}`);
  info("   2. Paste and run BOTH snippets below.\n");
  let storage = "";
  try {
    storage = await Deno.readTextFile(STORAGE_FILE);
  } catch { /* ignore */ }
  let seed = "";
  try {
    seed = fillSeedSql(await Deno.readTextFile(SEED_FILE), s);
  } catch { /* ignore */ }
  console.log(`${C.dim}--- storage_setup.sql -------------------------------------------${C.reset}`);
  console.log(storage.trim());
  console.log(`${C.dim}--- seed (filled in for you) ------------------------------------${C.reset}`);
  console.log(seed.trim());
  console.log(`${C.dim}----------------------------------------------------------------${C.reset}\n`);
  await askLine("Press Enter once you've run both snippets in the SQL editor...");
}

// ---------------------------------------------------------------------------- validators
const V = {
  token: /^\d{6,}:[A-Za-z0-9_-]{30,}$/,
  id: /^\d{5,}$/,
  name: /^[^<>]{1,64}$/,
  anthropic: /^sk-ant-/,
  openai: /^sk-/,
  ref: /^[a-z0-9]{20}$/,
};

// Verify a bot token is LIVE, not just well-formed. A dead or mistyped token
// still passes V.token but makes setWebhook fail at the very last step, leaving
// the bot silent -- so check getMe here, before any project work. Returns the
// bot's @username on success, or null if Telegram rejects the token.
async function verifyBotToken(token: string): Promise<string | null> {
  try {
    const b = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
    return b?.ok ? (b.result?.username ?? "your bot") : null;
  } catch {
    return null;
  }
}

// Prompt for a bot token until Telegram confirms it's live; returns the token.
async function askLiveBotToken(prompt: string): Promise<string> {
  while (true) {
    const token = await askValidated(
      prompt, V.token, "It should look like digits, a colon, then ~35 characters.", true,
    );
    const username = await verifyBotToken(token);
    if (username) {
      ok(`Token verified — bot is @${username}.`);
      return token;
    }
    err("Telegram rejected that token (getMe → Unauthorized). Re-copy it from @BotFather — it must be exact.");
  }
}

// ---------------------------------------------------------------------------- --check mode
async function runCheck() {
  banner("Capybara setup — read-only check (--check)");
  let allGood = true;

  banner("Prerequisites");
  for (const [name, cmd] of [["git", "git"], ["deno", "deno"], ["supabase CLI", "supabase"]] as const) {
    if (await have(cmd)) ok(name);
    else { err(`${name} not found`); allGood = false; }
  }
  if (await fileExists(INDEX)) ok("repo root (index.ts found)");
  else { err("run this from the Capybara repo root (index.ts not found)"); allGood = false; }

  banner(".env");
  const env = await readEnv();
  if (Object.keys(env).length === 0) warn(".env not present yet (the wizard will create it)");
  else for (const k of SECRET_KEYS) (env[k] ? ok(`${k} = set`) : warn(`${k} = empty`));

  banner("Deploy gate");
  if (!await gate()) allGood = false;

  banner(allGood ? "All checks passed." : "Some checks failed — see above.");
  Deno.exit(allGood ? 0 : 1);
}

// ---------------------------------------------------------------------------- main wizard
async function main() {
  if (Deno.args.includes("--check")) {
    await runCheck();
    return;
  }

  banner("🦫  Capybara — guided setup");
  dim("Sets up ONE bot for ONE couple: an English-native partner (the admin) and a");
  dim("Ukrainian-native partner. Built specifically for that English+Ukrainian pairing.");
  dim("Secrets are written only to .env (gitignored) — never printed or committed.");
  dim("Safe to stop and re-run; your progress is saved.\n");

  // Step 0 - prerequisites
  if (!await fileExists(INDEX)) {
    err("Please run this from the Capybara repo root (couldn't find index.ts).");
    Deno.exit(1);
  }
  for (const [name, cmd, url] of [
    ["deno", "deno", "https://deno.land"],
    ["the Supabase CLI", "supabase", "https://supabase.com/docs/guides/cli"],
    ["git", "git", "https://git-scm.com/downloads"],
  ] as const) {
    if (!await have(cmd)) {
      err(`${name} isn't installed. Install it (${url}) and re-run.`);
      Deno.exit(1);
    }
  }

  const state = await loadState();
  const env = await readEnv();
  const values: Record<string, string> = { ...env };

  // Step 1 - .env / resume
  step(1, "Your details file (.env)");
  if (Object.keys(env).length > 0) {
    const filled = SECRET_KEYS.filter((k) => env[k]).length;
    info(`Found an existing .env with ${filled}/${SECRET_KEYS.length} values filled.`);
    if (!await confirmYes("Reuse what's already there (answer No to start fresh)?")) {
      for (const k of SECRET_KEYS) delete values[k];
    }
  } else {
    ok("Starting fresh — I'll collect a few things and write .env for you.");
  }
  const need = (k: string) => !values[k];

  // Step 2 - Telegram bot token
  step(2, "Create your Telegram bot");
  if (need("TELEGRAM_BOT_TOKEN")) {
    info("In Telegram, message @BotFather, send /newbot, and follow the prompts.");
    info("It gives you a token that looks like 123456789:AAEx....");
    await maybeOpen("BotFather", "https://t.me/BotFather");
    values.TELEGRAM_BOT_TOKEN = await askLiveBotToken("Paste the bot token:");
  } else {
    // Re-verify a reused token too: a stale/invalid one in .env is exactly what
    // leaves the bot silent, and it's cheap to catch now instead of at Step 12.
    const username = await verifyBotToken(values.TELEGRAM_BOT_TOKEN);
    if (username) ok(`Bot token already set and verified — @${username}.`);
    else {
      warn("The saved bot token is INVALID (Telegram getMe → Unauthorized) — let's re-enter it.");
      values.TELEGRAM_BOT_TOKEN = await askLiveBotToken("Paste a valid bot token:");
    }
  }

  // Step 3 - partners' IDs + names
  step(3, "Who are the two partners?");
  info("Each partner should message @userinfobot once and read their numeric Id.");
  await maybeOpen("userinfobot", "https://t.me/userinfobot");
  const adminId = await askValidated(
    "English-native partner's Telegram ID (this person is the admin):", V.id, "Numbers only.",
  );
  const adminName = await askValidated("English-native partner's display name:", V.name, "1–64 chars, no < or >.");
  let partnerId = await askValidated("Ukrainian-native partner's Telegram ID:", V.id, "Numbers only.");
  while (partnerId === adminId) {
    warn("That's the same ID as the admin — the two partners need different IDs.");
    partnerId = await askValidated("Ukrainian-native partner's Telegram ID:", V.id, "Numbers only.");
  }
  const partnerName = await askValidated("Ukrainian-native partner's display name:", V.name, "1–64 chars, no < or >.");
  values.ADMIN_TELEGRAM_ID = adminId;
  const seed: Seed = { adminId, adminName, partnerId, partnerName };

  // Step 4 - API keys
  step(4, "Your AI keys");
  if (need("ANTHROPIC_API_KEY")) {
    info("Anthropic powers translation and /recap.");
    await maybeOpen("Anthropic console", "https://console.anthropic.com/settings/keys");
    values.ANTHROPIC_API_KEY = await askValidated("Paste your Anthropic API key:", V.anthropic, "It usually starts with sk-ant-.", true);
  } else ok("Anthropic key already set.");
  if (need("OPENAI_API_KEY")) {
    info("OpenAI powers voice transcription and search embeddings.");
    await maybeOpen("OpenAI keys", "https://platform.openai.com/api-keys");
    values.OPENAI_API_KEY = await askValidated("Paste your OpenAI API key:", V.openai, "It usually starts with sk-.", true);
  } else ok("OpenAI key already set.");

  // Step 5 - Supabase project
  step(5, "Your Supabase project");
  info(`Create a project at the dashboard — choose region ${REGION} and Postgres 17.`);
  await maybeOpen("Supabase dashboard", "https://supabase.com/dashboard/projects");
  const ref = await askValidated("Project ref (the 20-char id in the project URL):", V.ref, "20 lowercase letters/numbers.");
  state.ref = ref;
  info("I also need the database password you set when creating the project.");
  info("(Used once to apply the schema + seed; never written to .env.)");
  const dbpw = await askSecret("Database password:");

  // Step 6 - generate WEBHOOK_SECRET + write .env
  step(6, "Generate secret + save .env");
  if (need("WEBHOOK_SECRET")) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    values.WEBHOOK_SECRET = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    ok("Generated a fresh WEBHOOK_SECRET.");
  }
  await writeEnv(values);
  ok(".env written (gitignored, not printed).");
  state.done = [...new Set([...state.done, "env"])];
  await saveState(state);

  // Supabase auth (needed for the next steps)
  if (!await ensureSupabaseAuth()) {
    err("Supabase CLI isn't authenticated. Run `supabase login` and re-run setup.");
    Deno.exit(1);
  }

  // Step 7 - migration
  step(7, "Build the database");
  info("Applying the schema migration to your project...");
  const linked = await run("supabase", ["link", "--project-ref", ref], { SUPABASE_DB_PASSWORD: dbpw });
  if (!linked) warn("`supabase link` reported a problem — continuing; db push may still work.");
  const pushed = await run("supabase", ["db", "push"], { SUPABASE_DB_PASSWORD: dbpw });
  if (pushed) {
    ok("Schema applied.");
    state.done = [...new Set([...state.done, "migration"])];
    await saveState(state);
  } else {
    warn("Couldn't apply the migration via the CLI.");
    info("   Paste the contents of this file into the SQL editor and run it:");
    info(`   ${MIGRATION}`);
    info(`   ${C.cyan}https://supabase.com/dashboard/project/${ref}/sql/new${C.reset}`);
    await askLine("Press Enter once the schema migration has run...");
  }

  // Step 8 - bucket + seed
  step(8, "Create storage + add the couple");
  const applied = await applyBucketAndSeedOverConnection(ref, dbpw, seed);
  if (!applied) await pasteFallback(ref, seed);
  state.done = [...new Set([...state.done, "seed"])];
  await saveState(state);

  // Step 9 - secrets
  step(9, "Set the function secrets");
  if (!await run("supabase", ["secrets", "set", "--env-file", ENV_FILE, "--project-ref", ref])) {
    err("Failed to set secrets. Fix the error above and re-run setup (it will resume).");
    Deno.exit(1);
  }
  ok("Secrets set.");
  state.done = [...new Set([...state.done, "secrets"])];
  await saveState(state);

  // Step 10 - optional: one-tap /update self-deploy from Telegram.
  // Done BEFORE the deploy below on purpose: the bot reads its function secrets at boot,
  // so wiring /update after a deploy wouldn't take effect until the next one.
  step(10, "One-tap updates from Telegram (/update) — optional");
  info("Lets the admin ship future builds from Telegram: /update checks GitHub for a newer");
  info("BUILD_VERSION and deploys it with one tap (the gate + smoke test still run). Optional —");
  info("skip it and you can always deploy from the repo's Actions tab or the CLI.");
  if (await confirmYes("Set up /update self-deploy now?")) {
    if (!await have("gh")) {
      warn("GitHub CLI (gh) not found — skipping. Install it (https://cli.github.com), run");
      info("   `gh auth login`, then re-run setup to enable /update.");
    } else if (!(await capture("gh", ["auth", "status"])).ok) {
      warn("gh isn't logged in — run `gh auth login`, then re-run setup to enable /update.");
    } else {
      const rv = await capture("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
      const repo = rv.ok ? rv.out.trim() : "";
      if (!repo) {
        warn("Couldn't determine the GitHub repo from this checkout — skipping /update setup.");
      } else {
        ok(`Deploy source: ${repo} (branch main).`);
        let allSet = true;

        // (a) Repo Actions secrets — deploy.yml uses these to authenticate to Supabase and
        //     to pick the default project. The access token is piped via stdin, never argv.
        if ((await capture("gh", ["secret", "list", "--repo", repo])).out.includes("SUPABASE_ACCESS_TOKEN")) {
          ok("SUPABASE_ACCESS_TOKEN already set on the repo — leaving it.");
        } else {
          info("A Supabase access token lets the deploy workflow push to your project.");
          await maybeOpen("Supabase access tokens", "https://supabase.com/dashboard/account/tokens");
          const sbToken = await askSecret("Paste a Supabase access token:");
          if (!await runIn("gh", ["secret", "set", "SUPABASE_ACCESS_TOKEN", "--repo", repo], sbToken)) allSet = false;
        }
        if (!await run("gh", ["secret", "set", "SUPABASE_PROJECT_REF", "--repo", repo, "--body", ref])) allSet = false;

        // (b) Optional allowlist — pin the workflow to this project. Don't clobber an existing
        //     list (a shared repo serving several couples sets DEPLOY_ALLOWED_REFS deliberately).
        if ((await capture("gh", ["variable", "list", "--repo", repo])).out.includes("DEPLOY_ALLOWED_REFS")) {
          info("DEPLOY_ALLOWED_REFS already exists — add this ref to it by hand if you allowlist targets.");
        } else {
          await run("gh", ["variable", "set", "DEPLOY_ALLOWED_REFS", "--repo", repo, "--body", ref]);
        }

        // (c) Bot function secrets — read at boot, so they go into .env (0600) and get pushed
        //     here, before the deploy step. The PAT lives only in .env, never on the argv.
        info("Finally, a GitHub token lets the BOT dispatch the deploy: a fine-grained PAT");
        info("   on THIS repo with Actions: Read and write.");
        await maybeOpen("New fine-grained token", "https://github.com/settings/personal-access-tokens/new");
        const ghToken = await askSecret("Paste the GitHub deploy token (Actions: read+write):");
        values.GITHUB_REPO = repo;
        values.GITHUB_DEPLOY_BRANCH = "main";
        values.GITHUB_DEPLOY_TOKEN = ghToken;
        await writeEnv(values);
        if (!await run("supabase", ["secrets", "set", "--env-file", ENV_FILE, "--project-ref", ref])) allSet = false;

        if (allSet) {
          ok("/update configured — the deploy below will boot the bot with it enabled.");
          state.done = [...new Set([...state.done, "update"])];
          await saveState(state);
        } else {
          warn("Some /update settings didn't apply — see the errors above; re-run setup to retry.");
        }
      }
    }
  } else {
    dim("Skipped /update. You can enable it later — see the README's “Self-deploy from Telegram” section.");
  }

  // Step 11 - gate + deploy + smoke
  step(11, "Deploy the bot");
  if (!await gate()) {
    err("Pre-deploy gate failed — not deploying. See the errors above.");
    Deno.exit(1);
  }
  if (!await run("supabase", ["functions", "deploy", FUNCTION, "--project-ref", ref, "--no-verify-jwt"])) {
    err("Deploy failed. Fix the error above and re-run setup.");
    Deno.exit(1);
  }
  const ver = await buildVersion();
  if (!await smokeHealth(ref, ver)) {
    warn("Deploy ran but the health check didn't pass cleanly — see above.");
  } else {
    state.done = [...new Set([...state.done, "deploy"])];
    await saveState(state);
  }
  dim(`Tip: tag this build as a rollback point — git tag ${ver ?? "vNN"}`);

  // Step 12 - webhook + manual test
  step(12, "Connect Telegram + final test");
  const hookUrl = `https://${ref}.supabase.co/functions/v1/${FUNCTION}`;
  const set = `https://api.telegram.org/bot${values.TELEGRAM_BOT_TOKEN}/setWebhook` +
    `?url=${encodeURIComponent(hookUrl)}&secret_token=${encodeURIComponent(values.WEBHOOK_SECRET)}`;
  let webhookOk = false;
  try {
    const r = await (await fetch(set)).json();
    if (r.ok) {
      ok("Telegram webhook set.");
      webhookOk = true;
    } else {
      err(`Telegram rejected the webhook: ${r.description ?? "unknown"}`);
    }
  } catch (e) {
    err(`Couldn't set the webhook: ${(e as Error).message}`);
  }

  // A failed webhook is fatal: Telegram has nowhere to deliver updates, so the
  // bot stays completely silent. Do NOT mark the run complete (that would be a
  // false all-clear) -- stop loudly with the most likely cause and the fix.
  if (!webhookOk) {
    banner("⚠️  Setup did NOT finish — the Telegram webhook was not set.");
    info("Until the webhook is set, Telegram can't deliver messages and the bot stays silent.");
    info("The usual cause is an invalid TELEGRAM_BOT_TOKEN. Verify it with:");
    info(`   ${C.cyan}curl -s "https://api.telegram.org/bot<your-token>/getMe"${C.reset}   # expect {"ok":true,...}`);
    info("Fix TELEGRAM_BOT_TOKEN in .env if it's wrong, then re-run  deno run -A setup.ts");
    await saveState(state); // 'complete' intentionally NOT recorded
    Deno.exit(1);
  }

  // Confirm the couple actually got seeded. Step 8 silently falls back to a
  // manual SQL paste that's easy to skip, leaving public.users empty -- which
  // makes every message answer with "...your Telegram ID hasn't been registered
  // yet". The seed health probe is read-only and side-effect-free.
  try {
    const b = await (await fetch(`${hookUrl}?health&seed`)).json();
    if (b.seeded === false || b.userCount === 0) {
      warn("The users table is EMPTY — the seed (Step 8) never ran.");
      info("Both partners will get \"...your Telegram ID hasn't been registered yet\" until you seed.");
      info("   Open the SQL editor and run seed_couple.sql (it was filled in for you above):");
      info(`   ${C.cyan}https://supabase.com/dashboard/project/${ref}/sql/new${C.reset}`);
    } else if (b.userCount) {
      ok(`Seed verified: ${b.userCount} users registered.`);
    }
  } catch { /* best-effort: never block completion on the probe */ }

  banner("🎉  Setup complete — now test it in Telegram:");
  info("  • Both partners send /help — the bot replies in their language.");
  info("  • English partner sends an English sentence → expect Ukrainian back.");
  info("  • Ukrainian partner sends a Ukrainian sentence → expect English back.");
  info("  • Admin sends /diag — upstream checks pass; the other partner gets \"Not authorized.\"");
  info("  • Reply to a message with /pin, then /pinned; try /remember then /recap.");
  dim("\nNote: a freshly-sent message won't appear in /recap for 24h (by design); /remember notes are instant.");
  dim("New couples start empty, so the /backfill* commands don't apply.");
  state.done = [...new Set([...state.done, "complete"])];
  await saveState(state);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    err(`Unexpected error: ${(e as Error).message}`);
    Deno.exit(1);
  }
}
