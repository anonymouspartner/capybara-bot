import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUILD_VERSION = "v47";
const DEFAULT_CONVERSATION_ID = "00000000-0000-0000-0000-000000000001";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}`;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

const BACKFILL_ADMIN_TELEGRAM_ID = Number(Deno.env.get("ADMIN_TELEGRAM_ID"));

// --- /update (self-deploy) config; all optional. The feature is INERT unless these
// are set as function secrets: with none, /update is unavailable to deploy and only
// reports version status. GITHUB_REPO alone enables the version check (a public repo's
// raw file needs no token); a deploy button additionally needs GITHUB_DEPLOY_TOKEN.
// GITHUB_DEPLOY_TOKEN is named to avoid colliding with Actions' built-in GITHUB_TOKEN.
const GITHUB_DEPLOY_TOKEN = Deno.env.get("GITHUB_DEPLOY_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? ""; // "owner/name"
const GITHUB_DEPLOY_BRANCH = Deno.env.get("GITHUB_DEPLOY_BRANCH") ?? "main";
const GITHUB_DEPLOY_WORKFLOW = "deploy.yml";

const BACKFILL_BATCH_SIZE = 15;
const BACKFILL_TRANSLATIONS_BATCH_SIZE = 25;
const CYRILLIC_SKIP_THRESHOLD = 0.5;

type Gender = "male" | "female";
type Person = { name: string; gender: Gender };
// Gender by native language is invariant across every instance (English-native
// male, Ukrainian-native female), so it stays static -- translate()'s Ukrainian
// agreement depends on it. Names are couple-specific and come from the users
// table at request time via buildPersonMap(); the fallbacks below are only used
// if a users row can't be read.
const GENDER_BY_NATIVE_LANG: Record<"en" | "uk", Gender> = { en: "male", uk: "female" };
const FALLBACK_NAME_BY_NATIVE_LANG: Record<"en" | "uk", string> = {
  en: "the English-native partner",
  uk: "the Ukrainian-native partner",
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const RECAP_K_FLOOR = 3;
const RECAP_K_CEILING = 25;
const RECAP_K_NARROW = 5;
const RECAP_K_BROAD = 20;
const RECAP_COOLING_OFF_HOURS = 24;
const RECAP_PIN_BOOST = 0.005;
const RECAP_CANDIDATE_POOL = 50;
const RECAP_BACKFILL_BATCH_SIZE = 50;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const EDGE_RUNTIME_AVAILABLE =
  typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function";
console.log(
  EDGE_RUNTIME_AVAILABLE
    ? "boot: EdgeRuntime.waitUntil available; background tasks will be scheduled."
    : "boot: EdgeRuntime.waitUntil UNAVAILABLE; background tasks may be killed early."
);

function scheduleBackgroundWork(label: string, work: Promise<unknown>) {
  if (EDGE_RUNTIME_AVAILABLE) {
    EdgeRuntime.waitUntil(work.catch((e) => console.error(`${label} failed:`, e)));
  } else {
    work.catch((e) => console.error(`${label} failed:`, e));
  }
}

Deno.serve(async (req) => {
  // Side-effect-free health probe. Must stay BEFORE the WEBHOOK_SECRET check:
  // monitors won't send Telegram's secret header. Telegram only sends POST,
  // so a GET / ?health is safe to repurpose. By default: version + a config
  // boolean only — no DB, API, or messaging, so the plain probe reports
  // function-up regardless of DB state. adminConfigured reports whether
  // ADMIN_TELEGRAM_ID resolved to a real number at boot (true) or is
  // missing/NaN (false); it does NOT expose the ID. Lets deploy.ps1's smoke
  // check catch a missing admin secret.
  const url = new URL(req.url);
  if (req.method === "GET" || url.searchParams.has("health")) {
    const body: Record<string, unknown> = {
      status: "ok",
      version: BUILD_VERSION,
      adminConfigured: !Number.isNaN(BACKFILL_ADMIN_TELEGRAM_ID),
    };
    // Opt-in seed check (?seed): a read-only users count so a post-deploy smoke
    // test can catch an UNSEEDED instance — an empty users table makes every
    // sender see "not registered" even though the function is healthy. Kept off
    // the default probe so plain health stays DB-free and doesn't go red when
    // the DB is briefly unreachable. seeded is null if the count couldn't run.
    if (url.searchParams.has("seed")) {
      try {
        const { count, error } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true });
        if (error) throw error;
        body.userCount = count ?? 0;
        body.seeded = (count ?? 0) > 0;
      } catch (e) {
        body.seeded = null;
        body.seedCheckError = (e as Error)?.message ?? String(e);
      }
    }
    return new Response(
      JSON.stringify(body),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const update = await req.json();
    try {
      await handleUpdate(update);
    } catch (e) {
      console.error("handleUpdate error:", e);
    }
    return new Response("ok");
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("error", { status: 500 });
  }
});

async function handleUpdate(update: any) {
  // Inline-button taps (e.g. the /update deploy button) arrive as callback_query,
  // not message. Auth is by callback_query.from.id, so this is handled before the
  // users-table lookup below.
  if (update.callback_query) { await handleCallbackQuery(update.callback_query); return; }
  const msg = update.message;
  if (!msg) return;
  const user = await lookupUser(msg.from);
  if (!user) {
    await sendMessage(msg.chat.id,
      "Hi! This bot is private. Your Telegram ID hasn't been registered yet.\n\n" +
      `Your Telegram user ID is: ${msg.from.id}\n` +
      "Send this ID to the bot's owner so they can add you."
    );
    return;
  }
  if (msg.text === "/start") {
    await sendMessage(msg.chat.id,
      `Hi ${user.display_name}! Send me text or voice messages in ${user.native_language === "en" ? "English" : "Ukrainian"}, ` +
      `and I'll translate them to ${user.learning_language === "en" ? "English" : "Ukrainian"}.\n\n` +
      `You can also send photos and videos — I'll forward them straight to your partner.\n\n` +
      `Everything is saved as a study corpus.\n\n` +
      `Type /help to see what I can do.`
    );
    return;
  }
  if (msg.text === "/help") { await handleHelp(msg, user); return; }
  if (msg.text === "/vocab") { await handleVocab(msg, user); return; }
  if (msg.text === "/learn" || msg.text?.startsWith("/learn ") || msg.text?.startsWith("/learn@")) { await handleLearn(msg, user); return; }
  if (msg.text === "/forget" || msg.text?.startsWith("/forget ") || msg.text?.startsWith("/forget@")) { await handleForget(msg, user); return; }
  if (msg.text === "/export" || msg.text?.startsWith("/export@")) { await handleExport(msg, user); return; }
  if (msg.text === "/backfill_translations") { await handleBackfillTranslations(msg, user); return; }
  if (msg.text === "/backfill") { await handleBackfill(msg, user); return; }
  if (msg.text === "/diag") { await handleDiag(msg, user); return; }
  if (msg.text === "/update" || msg.text?.startsWith("/update@")) { await handleUpdateCommand(msg, user); return; }
  if (msg.text === "/reconcile" || msg.text?.startsWith("/reconcile@")) { await handleReconcile(msg, user); return; }
  if (msg.text === "/restore" || msg.text?.startsWith("/restore@")) { await handleRestore(msg, user); return; }
  if (msg.text === "/pin" || msg.text?.startsWith("/pin@")) { await handlePin(msg, user); return; }
  if (msg.text === "/unpin" || msg.text?.startsWith("/unpin@")) { await handleUnpin(msg, user); return; }
  if (msg.text === "/pinned" || msg.text?.startsWith("/pinned@")) { await handlePinned(msg, user); return; }
  if (msg.text === "/remember" || msg.text?.startsWith("/remember ") || msg.text?.startsWith("/remember@")) { await handleRemember(msg, user); return; }
  if (msg.text === "/recap_backfill" || msg.text?.startsWith("/recap_backfill@")) { await handleRecapBackfill(msg, user); return; }
  if (msg.text === "/recap" || msg.text?.startsWith("/recap ") || msg.text?.startsWith("/recap@")) { await handleRecap(msg, user); return; }
  if (msg.voice) { await handleVoiceMessage(msg, user); }
  else if (msg.video || msg.video_note) { await handleVideoMessage(msg, user); }
  else if (msg.photo) { await handlePhotoMessage(msg, user); }
  else if (msg.text) { await handleTextMessage(msg, user); }
  else { await sendMessage(msg.chat.id, "I can handle text, voice, photo, and video messages. Other types aren't supported yet."); }
}

async function lookupUser(tgUser: any) {
  const { data: existing } = await supabase.from("users").select("*").eq("telegram_id", tgUser.id).maybeSingle();
  if (existing) return existing;
  return null;
}

async function lookupPartner(userId: string) {
  const { data, error } = await supabase.from("users").select("*").neq("id", userId).maybeSingle();
  if (error) { console.error("lookupPartner failed:", error); return null; }
  return data;
}

async function lookupLearnerOfLanguage(lang: "uk" | "en"): Promise<any | null> {
  const { data, error } = await supabase.from("users").select("*").eq("learning_language", lang).maybeSingle();
  if (error) { console.error("lookupLearnerOfLanguage failed:", error); return null; }
  return data;
}

// Builds the name+gender map keyed by native language from the asker + partner
// rows. Gender is invariant (GENDER_BY_NATIVE_LANG); names come from each user's
// display_name, falling back to a neutral role label if a row is missing so
// translate() and listings still read sensibly.
function buildPersonMap(asker: any, partner: any): Record<"en" | "uk", Person> {
  const make = (lang: "en" | "uk"): Person => {
    const row = [asker, partner].find((r) => r?.native_language === lang);
    return {
      name: row?.display_name ?? FALLBACK_NAME_BY_NATIVE_LANG[lang],
      gender: GENDER_BY_NATIVE_LANG[lang],
    };
  };
  return { en: make("en"), uk: make("uk") };
}

function langLabel(lang: "uk" | "en"): string {
  return lang === "uk" ? "Ukrainian" : "English";
}

function langFlag(lang: "uk" | "en"): string {
  return lang === "uk" ? "\ud83c\uddfa\ud83c\udde6" : "\ud83c\uddec\ud83c\udde7";
}

function speakerName(lang: string, persons: Record<"en" | "uk", Person>): string {
  return (lang === "en" || lang === "uk") ? persons[lang].name : "?";
}

function parseLangArg(token: string): "uk" | "en" | null {
  const t = token.trim().toLowerCase();
  if (["uk", "ua", "ukr", "ukrainian", "\u0443\u043a\u0440", "\u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430"].includes(t)) return "uk";
  if (["en", "eng", "english", "\u0430\u043d\u0433\u043b", "\u0430\u043d\u0433\u043b\u0456\u0439\u0441\u044c\u043a\u0430"].includes(t)) return "en";
  return null;
}

function detectScriptRatios(text: string): { cyrillicRatio: number; letters: number } {
  let letters = 0;
  let cyrillic = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const isLatin = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x17f);
    const isCyrillic = (code >= 0x400 && code <= 0x4ff) || (code >= 0x500 && code <= 0x52f);
    if (isLatin || isCyrillic) {
      letters++;
      if (isCyrillic) cyrillic++;
    }
  }
  return { cyrillicRatio: letters === 0 ? 0 : cyrillic / letters, letters };
}

function detectLanguageFromScript(text: string): "uk" | "en" | null {
  const { cyrillicRatio, letters } = detectScriptRatios(text);
  if (letters === 0) return null;
  if (cyrillicRatio > CYRILLIC_SKIP_THRESHOLD) return "uk";
  if (cyrillicRatio < (1 - CYRILLIC_SKIP_THRESHOLD)) return "en";
  return null;
}

function exampleScriptMatchesLanguage(text: string, language: "uk" | "en"): boolean {
  if (!text) return false;
  const { cyrillicRatio, letters } = detectScriptRatios(text);
  if (letters === 0) return false;
  if (language === "uk") return cyrillicRatio >= CYRILLIC_SKIP_THRESHOLD;
  return cyrillicRatio <= (1 - CYRILLIC_SKIP_THRESHOLD);
}

function scheduleAnnotation(messageId: string, text: string, language: "uk" | "en", source: string) {
  if (!text) return;
  const { cyrillicRatio, letters } = detectScriptRatios(text);
  const wrongScript = letters === 0 ||
    (language === "en" && cyrillicRatio > CYRILLIC_SKIP_THRESHOLD) ||
    (language === "uk" && cyrillicRatio < (1 - CYRILLIC_SKIP_THRESHOLD));
  if (wrongScript) {
    console.log(`skip annotation: ${source} ${messageId} letters=${letters} cyrillic=${Math.round(cyrillicRatio * 100)}%, expected ${language}`);
    scheduleBackgroundWork(`fallbackRow (${source}, ${messageId})`, writeFallbackAnnotation(messageId));
    return;
  }
  scheduleBackgroundWork(`annotateMessage (${source}, ${messageId})`, annotateMessage(messageId, text, language));
}

async function writeFallbackAnnotation(messageId: string) {
  const { error } = await supabase.from("message_annotations").upsert(
    [{ message_id: messageId, annotation_type: "register", annotation_value: "neutral" }],
    { onConflict: "message_id,annotation_type,annotation_value", ignoreDuplicates: true });
  if (error) console.error("fallback row insert failed:", error);
}

async function handleTextMessage(msg: any, user: any) {
  const originalText = msg.text;
  const detectedLang = detectLanguageFromScript(originalText);
  const originalLang: "en" | "uk" = detectedLang ?? (user.native_language as "en" | "uk");
  const translationTargetLang: "en" | "uk" = originalLang === "uk" ? "en" : "uk";
  const persons = buildPersonMap(user, await lookupPartner(user.id));
  const speaker = persons[originalLang];
  const addressee = persons[translationTargetLang];
  const translated = await translate(originalText, originalLang, translationTargetLang, speaker, addressee);
  const translationOk = translated !== null;

  const { data: inserted, error: insertErr } = await supabase.from("messages").insert({
    conversation_id: DEFAULT_CONVERSATION_ID,
    sender_id: user.id,
    telegram_message_id: msg.message_id,
    original_text: originalText,
    original_language: originalLang,
    translated_text: translated,
    translated_language: translationOk ? translationTargetLang : null,
    input_type: "text",
  }).select().single();
  if (insertErr) console.error("messages insert (text) failed:", insertErr);

  if (translationOk) {
    await sendMessage(msg.chat.id, `\ud83d\udd24 Translation (${translationTargetLang}):\n${translated}`, "Markdown");
    await forwardToPartner(user, originalText, translated!, originalLang, translationTargetLang);
  } else {
    await sendMessage(msg.chat.id, `\u26a0\ufe0f Translation failed (upstream error). Your message was saved; try again in a moment.\n\n_Details:_ ${LAST_TRANSLATE_ERROR ?? "unknown"}`, "Markdown");
  }

  if (inserted) {
    if (originalLang === "uk" || originalLang === "en") scheduleAnnotation(inserted.id, originalText, originalLang, "text-original");
    if (translationOk && (translationTargetLang === "uk" || translationTargetLang === "en")) scheduleAnnotation(inserted.id, translated!, translationTargetLang, "text-translation");
    if (originalLang === "uk" || originalLang === "en") {
      scheduleBackgroundWork(`embedMessage (${inserted.id})`, embedMessageBackground(inserted.id, originalText, originalLang));
    }
  }
}

async function handleVoiceMessage(msg: any, user: any) {
  const voice = msg.voice;
  let fileInfo: any;
  try {
    fileInfo = await fetch(`${TELEGRAM_API}/getFile?file_id=${voice.file_id}`).then(r => r.json());
  } catch (e) {
    console.error("getFile fetch failed:", e);
    await sendMessage(msg.chat.id, "Couldn't reach Telegram to fetch the voice file. Try again in a moment.");
    return;
  }
  if (!fileInfo?.ok) { await sendMessage(msg.chat.id, "Couldn't fetch voice file from Telegram."); return; }
  const filePath = fileInfo.result.file_path;
  let audioBlob: Blob;
  try {
    const audioResp = await fetch(`${TELEGRAM_FILE_API}/${filePath}`);
    audioBlob = await audioResp.blob();
  } catch (e) {
    console.error("audio fetch failed:", e);
    await sendMessage(msg.chat.id, "Couldn't download the voice file from Telegram. Try again in a moment.");
    return;
  }
  const storagePath = `${user.id}/${Date.now()}_${voice.file_id}.ogg`;
  const { error: uploadErr } = await supabase.storage.from("voice-messages").upload(storagePath, audioBlob, { contentType: "audio/ogg" });
  if (uploadErr) console.error("storage upload:", uploadErr);

  const transcribeResult = await transcribeWithWhisper(audioBlob);
  if (!transcribeResult.ok) {
    await sendMessage(msg.chat.id, `\u26a0\ufe0f Transcription failed: ${transcribeResult.error}\n\nThe audio was saved; try sending again in a moment.`);
    return;
  }
  const transcript = transcribeResult.text;

  const detectedLang = detectLanguageFromScript(transcript);
  const originalLang: "en" | "uk" = detectedLang ?? (user.native_language as "en" | "uk");
  const targetLang: "en" | "uk" = originalLang === "uk" ? "en" : "uk";
  const persons = buildPersonMap(user, await lookupPartner(user.id));
  const speaker = persons[originalLang];
  const addressee = persons[targetLang];
  const translated = await translate(transcript, originalLang, targetLang, speaker, addressee);
  const translationOk = translated !== null;

  const { data: inserted, error: insertErr } = await supabase.from("messages").insert({
    conversation_id: DEFAULT_CONVERSATION_ID,
    sender_id: user.id,
    telegram_message_id: msg.message_id,
    original_text: transcript,
    original_language: originalLang,
    translated_text: translated,
    translated_language: translationOk ? targetLang : null,
    input_type: "voice",
    voice_file_id: voice.file_id,
    voice_storage_path: storagePath,
    voice_duration_seconds: voice.duration,
  }).select().single();
  if (insertErr) console.error("messages insert (voice) failed:", insertErr);

  if (translationOk) {
    await sendMessage(msg.chat.id, `\ud83c\udf99\ufe0f Heard (${originalLang}):\n${transcript}\n\n\ud83d\udd24 Translation (${targetLang}):\n${translated}`, "Markdown");
    await forwardVoiceToPartner(user, voice.file_id, transcript, translated!, originalLang, targetLang);
  } else {
    await sendMessage(msg.chat.id, `\ud83c\udf99\ufe0f Heard (${originalLang}):\n${transcript}\n\n\u26a0\ufe0f Translation failed (upstream error). The transcript was saved.\n\n_Details:_ ${LAST_TRANSLATE_ERROR ?? "unknown"}`, "Markdown");
  }

  if (inserted) {
    if (originalLang === "uk" || originalLang === "en") scheduleAnnotation(inserted.id, transcript, originalLang, "voice-original");
    if (translationOk && (targetLang === "uk" || targetLang === "en")) scheduleAnnotation(inserted.id, translated!, targetLang, "voice-translation");
    if (originalLang === "uk" || originalLang === "en") {
      scheduleBackgroundWork(`embedMessage (${inserted.id})`, embedMessageBackground(inserted.id, transcript, originalLang));
    }
  }
}

let LAST_TRANSLATE_ERROR: string | null = null;

async function translate(
  text: string, fromLang: string, toLang: string,
  speaker?: Person, addressee?: Person,
): Promise<string | null> {
  const langName = (code: string) => code === "en" ? "English" : "Ukrainian";
  const genderClause = (speaker && addressee && toLang === "uk")
    ? `\n\nGENDER AGREEMENT:\n` +
      `This message was written by ${speaker.name} (${speaker.gender}), addressing ${addressee.name} (${addressee.gender}).\n` +
      `Ukrainian marks gender on past-tense verbs, adjectives, and participles. Agree with the referent's real-world gender:\n` +
      `- First person ("I"/"me"/"my", and past-tense verbs/adjectives about the speaker) \u2192 ${speaker.gender}.\n` +
      `- Second person ("you"/"your") \u2192 ${addressee.gender}.\n` +
      `- If the text names ${speaker.name} or ${addressee.name}, use that person's gender.\n` +
      `- For "we"/"us", use plural agreement (no gender choice).\n` +
      `This never overrides the no-Russian / literary-Ukrainian rules above.`
    : "";
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: `You are a translator between ${langName(fromLang)} and ${langName(toLang)}. Translate the user's message naturally, preserving tone and register. Output ONLY the translation, no preamble or commentary. If the input contains slang, idioms, or culturally-specific phrases, render an equivalent natural expression in the target language.\n\nCRITICAL LANGUAGE RULES:\n- Never produce Russian. The Cyrillic-script language used in this conversation is ALWAYS Ukrainian, never Russian.\n- If the input appears to be Russian, or is ambiguous between Russian and Ukrainian, treat it as Ukrainian and translate accordingly.\n- When the target language is Ukrainian, output standard literary Ukrainian only. Do not use Russian words, Russian spellings, or Russified Ukrainian forms (\u0441\u0443\u0440\u0436\u0438\u043a). Prefer authentically Ukrainian vocabulary over Russian-influenced equivalents.\n- If you are uncertain whether a Cyrillic word is Russian or Ukrainian, assume Ukrainian.${genderClause}`,
      messages: [{ role: "user", content: text }],
    });
  } catch (e) {
    LAST_TRANSLATE_ERROR = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("translate API call failed:", e);
    return null;
  }
  const block = result.content[0];
  if (block.type === "text") { LAST_TRANSLATE_ERROR = null; return block.text.trim(); }
  LAST_TRANSLATE_ERROR = `unexpected content block type: ${block.type}`;
  return null;
}

type WhisperResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

type WhisperAttemptResult =
  | { ok: true; text: string; language: string }
  | { ok: false; error: string };

// This bot only handles English and Ukrainian. On short/ambiguous clips, Whisper's
// language auto-detection sometimes confuses Ukrainian with a neighboring Slavic
// language (e.g. Russian or Polish) and transcribes phonetically in that language's
// spelling instead. If that happens, we retry once forcing Ukrainian.
const WHISPER_SUPPORTED_LANGUAGES = new Set(["english", "ukrainian"]);

async function whisperRequest(audioBlob: Blob, language?: string): Promise<WhisperAttemptResult> {
  const MAX_ATTEMPTS = 3;
  let lastError = "unknown";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append("file", audioBlob, "audio.ogg");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    if (language) form.append("language", language);
    let resp: Response;
    try {
      resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      });
    } catch (e) {
      lastError = `transport: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`whisper fetch threw (attempt ${attempt}):`, e);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      break;
    }
    if (resp.ok) {
      try {
        const data = await resp.json();
        const text = typeof data.text === "string" ? data.text.trim() : "";
        if (!text) return { ok: false, error: "Whisper returned an empty transcript." };
        const detectedLanguage = typeof data.language === "string" ? data.language.toLowerCase() : "";
        return { ok: true, text, language: detectedLanguage };
      } catch (e) {
        lastError = `parse: ${e instanceof Error ? e.message : String(e)}`;
        console.error("whisper response parse failed:", e);
        break;
      }
    }
    const body = await resp.text().catch(() => "<no body>");
    lastError = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
    console.error(`whisper error (attempt ${attempt}):`, resp.status, body);
    const retriable = resp.status === 429 || (resp.status >= 500 && resp.status < 600);
    if (retriable && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      continue;
    }
    break;
  }
  return { ok: false, error: lastError };
}

async function transcribeWithWhisper(audioBlob: Blob): Promise<WhisperResult> {
  const first = await whisperRequest(audioBlob);
  if (!first.ok) return first;
  if (WHISPER_SUPPORTED_LANGUAGES.has(first.language)) return { ok: true, text: first.text };

  console.log(`whisper detected unsupported language "${first.language}", retrying with language=uk`);
  const retry = await whisperRequest(audioBlob, "uk");
  return retry.ok ? { ok: true, text: retry.text } : { ok: true, text: first.text };
}

function buildAnnotationPrompt(language: "uk" | "en"): string {
  const langName = language === "uk" ? "Ukrainian" : "English";
  const otherLangName = language === "uk" ? "English" : "Ukrainian";
  const oppositeScript = language === "uk"
    ? `If the MAJORITY of letter characters in the input are Latin-script (English), return {"vocabulary":[],"grammar":[],"idioms":[],"register":"neutral"}.`
    : `If the MAJORITY of letter characters in the input are Cyrillic-script (Ukrainian), return {"vocabulary":[],"grammar":[],"idioms":[],"register":"neutral"}.`;
  const grammarExamples = language === "uk"
    ? `"instrumental case", "imperfective aspect", "diminutive form"`
    : `"past perfect tense", "phrasal verb", "conditional", "passive voice"`;
  return (
    `Analyze the ${langName} text and return a JSON object with these keys:\n` +
    `- "vocabulary": array of {lemma, part_of_speech, english_gloss, lemma_translation} for content words only.\n` +
    `  * lemma MUST be the dictionary form (nominative singular for nouns, infinitive for verbs, base form for adjectives).\n` +
    `  * part_of_speech MUST be one of: "noun", "verb", "adjective", "adverb", "phrase".\n` +
    `  * english_gloss is 1-4 words, no articles. For ${langName} vocabulary, the gloss should be the most common/literal meaning in English.\n` +
    `  * lemma_translation is the single most common dictionary form of the word in ${otherLangName} (the OPPOSITE language). For ${langName} lemmas, return the ${otherLangName} translation; this becomes the "answer" on a flashcard.\n` +
    `    - For ${otherLangName === "Ukrainian" ? "Ukrainian" : "English"} translations, give the dictionary form (infinitive for verbs, nominative singular for nouns).\n` +
    `    - One word only when possible; a short phrase if the language has no single-word equivalent.\n` +
    `    - This may overlap with english_gloss when the lemma is English. That's fine \u2014 return both.\n` +
    `  * SKIP: prepositions, conjunctions, particles, interjections, pronouns, numerals, proper nouns (names of people/places).\n` +
    `  * For homographs (same lemma, different part of speech), return separate entries.\n` +
    `- "grammar": array of grammatical features used (e.g., ${grammarExamples})\n` +
    `- "idioms": array of any idiomatic expressions\n` +
    `- "register": one of "formal", "informal", "neutral"\n\n` +
    `${oppositeScript}\n` +
    `Output ONLY raw JSON. Do NOT wrap in markdown code fences. Do NOT include any preamble or commentary.`
  );
}

async function annotateMessage(messageId: string, text: string, language: "uk" | "en") {
  const writeFallbackRow = async () => {
    const { error } = await supabase.from("message_annotations").upsert(
      [{ message_id: messageId, annotation_type: "register", annotation_value: "neutral" }],
      { onConflict: "message_id,annotation_type,annotation_value", ignoreDuplicates: true });
    if (error) console.error("fallback row insert failed:", error);
  };
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: buildAnnotationPrompt(language),
      messages: [{ role: "user", content: text }],
    });
  } catch (e) {
    console.error("anthropic API call failed for", messageId, e);
    await writeFallbackRow();
    return;
  }
  const block = result.content[0];
  if (block.type !== "text") { await writeFallbackRow(); return; }
  if (result.stop_reason === "max_tokens") {
    console.warn(`annotateMessage: max_tokens hit on ${messageId} (lang=${language}, input length=${text.length}); annotations may be incomplete.`);
  }
  let parsed: any;
  try {
    const cleaned = block.text.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i, "").replace(/\s*\u0060\u0060\u0060$/, "");
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("annotation JSON parse failed:", block.text);
    await writeFallbackRow();
    return;
  }
  const vocabRows = (parsed.vocabulary ?? [])
    .filter((v: any) => v.lemma && v.part_of_speech)
    .map((v: any) => ({
      lemma: v.lemma,
      part_of_speech: v.part_of_speech,
      gloss: v.english_gloss ?? null,
      lemma_translation: v.lemma_translation ?? null,
      first_seen_message_id: messageId,
      language: language,
    }));
  if (vocabRows.length > 0) {
    await supabase.from("vocabulary").upsert(vocabRows, { onConflict: "lemma,part_of_speech,language", ignoreDuplicates: true });
  }
  const annotations: any[] = [];
  for (const v of parsed.vocabulary ?? []) {
    if (!v.lemma) continue;
    annotations.push({ message_id: messageId, annotation_type: "vocabulary", annotation_value: v.lemma, details: { ...v, language } });
  }
  for (const g of parsed.grammar ?? []) {
    annotations.push({ message_id: messageId, annotation_type: "grammar", annotation_value: g, details: { language } });
  }
  for (const i of parsed.idioms ?? []) {
    annotations.push({ message_id: messageId, annotation_type: "idiom", annotation_value: i, details: { language } });
  }
  if (parsed.register) {
    annotations.push({ message_id: messageId, annotation_type: "register", annotation_value: parsed.register, details: { language } });
  }
  if (annotations.length > 0) {
    await supabase.from("message_annotations").upsert(annotations, { onConflict: "message_id,annotation_type,annotation_value", ignoreDuplicates: true });
  }
}

async function sendMessage(chatId: number, text: string, parseMode?: string, replyMarkup?: any) {
  const body: any = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  if (replyMarkup) body.reply_markup = replyMarkup;
  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const respBodyRaw = await resp.text().catch(() => "<no body>");
    const respBody = respBodyRaw.length > 500 ? respBodyRaw.slice(0, 500) + "\u2026" : respBodyRaw;
    const preview = text.length > 200 ? text.slice(0, 200) + "\u2026" : text;
    console.error(`sendMessage failed: chat=${chatId} status=${resp.status} body=${respBody} preview=${JSON.stringify(preview)}`);
  }
}

// Acknowledge an inline-button tap. Telegram shows the user a spinner until this
// is called (within ~15s), so callers answer early. Optional text shows a toast.
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const resp = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
  if (!resp.ok) console.error("answerCallbackQuery failed:", resp.status, await resp.text().catch(() => "<no body>"));
}

// Edit a message's inline keyboard. Omitting replyMarkup removes the keyboard
// entirely \u2014 used to retire the /update deploy button so it can't be tapped twice.
async function editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup?: any) {
  const body: any = { chat_id: chatId, message_id: messageId };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const resp = await fetch(`${TELEGRAM_API}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) console.error("editMessageReplyMarkup failed:", resp.status, await resp.text().catch(() => "<no body>"));
}

async function sendVoice(chatId: number, voiceFileId: string, caption?: string) {
  await fetch(`${TELEGRAM_API}/sendVoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, voice: voiceFileId, caption }),
  });
}

async function sendVideo(chatId: number, videoFileId: string, caption?: string) {
  const resp = await fetch(`${TELEGRAM_API}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video: videoFileId, caption }),
  });
  if (!resp.ok) console.error("sendVideo failed:", resp.status, await resp.text().catch(() => "<no body>"));
}

async function sendPhoto(chatId: number, photoFileId: string, caption?: string) {
  const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoFileId, caption }),
  });
  if (!resp.ok) console.error("sendPhoto failed:", resp.status, await resp.text().catch(() => "<no body>"));
}

// Round "video note" messages (recorded in Telegram) — the API takes no caption,
// so any attribution must be sent as a separate text message.
async function sendVideoNote(chatId: number, videoNoteFileId: string) {
  const resp = await fetch(`${TELEGRAM_API}/sendVideoNote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video_note: videoNoteFileId }),
  });
  if (!resp.ok) console.error("sendVideoNote failed:", resp.status, await resp.text().catch(() => "<no body>"));
}

async function sendDocument(chatId: number, fileName: string, content: string, mimeType: string, caption?: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: mimeType }), fileName);
  if (caption) form.append("caption", caption);
  const resp = await fetch(`${TELEGRAM_API}/sendDocument`, { method: "POST", body: form });
  if (!resp.ok) console.error("sendDocument failed:", await resp.text());
}

async function forwardToPartner(sender: any, original: string, translated: string, origLang: string, transLang: string) {
  const partner = await lookupPartner(sender.id);
  if (!partner) return;
  const senderName = sender.display_name;
  await sendMessage(partner.telegram_id, `\ud83d\udcac ${senderName} says (${transLang}):\n${translated}\n\n_Original (${origLang}):_\n${original}`, "Markdown");
}

async function forwardVoiceToPartner(sender: any, voiceFileId: string, transcript: string, translated: string, origLang: string, transLang: string) {
  const partner = await lookupPartner(sender.id);
  if (!partner) return;
  const senderName = sender.display_name;
  await sendVoice(partner.telegram_id, voiceFileId);
  await sendMessage(partner.telegram_id, `\ud83d\udcac ${senderName} said (${transLang}):\n${translated}\n\n_Original (${origLang}):_\n${transcript}`, "Markdown");
}

// Videos are forwarded as-is by Telegram file_id (no transcription/translation).
// Handles both round "video notes" recorded in Telegram and regular videos shared
// from the phone gallery. Forwarding by file_id works at any size, so there is no
// download/Whisper step and no 20 MB bot-download limit to worry about.
async function handleVideoMessage(msg: any, user: any) {
  const partner = await lookupPartner(user.id);
  const senderName = user.display_name;

  if (msg.video_note) {
    if (!partner) {
      await sendMessage(msg.chat.id, "\ud83c\udfa5 Got your video message, but there's no partner to forward it to yet.");
      return;
    }
    await sendVideoNote(partner.telegram_id, msg.video_note.file_id);
    await sendMessage(partner.telegram_id, `\ud83c\udfa5 ${senderName} sent a video message.`);
    await sendMessage(msg.chat.id, "\ud83c\udfa5 Video message forwarded to your partner.");
    return;
  }

  // Regular video (e.g. shared from the gallery), optionally with a caption.
  const caption = typeof msg.caption === "string" ? msg.caption.trim() : "";
  if (!partner) {
    await sendMessage(msg.chat.id, "\ud83c\udfa5 Got your video, but there's no partner to forward it to yet.");
    return;
  }
  const partnerCaption = caption ? `\ud83c\udfa5 ${senderName}: ${caption}` : `\ud83c\udfa5 ${senderName} sent a video.`;
  await sendVideo(partner.telegram_id, msg.video.file_id, partnerCaption);
  await sendMessage(msg.chat.id, "\ud83c\udfa5 Video forwarded to your partner.");
}

// Photos are forwarded as-is by Telegram file_id (no download/translation step),
// the same approach as handleVideoMessage. Telegram sends msg.photo as an array of
// the same image at increasing resolutions, so the largest is the last entry.
async function handlePhotoMessage(msg: any, user: any) {
  const partner = await lookupPartner(user.id);
  if (!partner) {
    await sendMessage(msg.chat.id, "🖼️ Got your photo, but there's no partner to forward it to yet.");
    return;
  }
  const senderName = user.display_name;
  const largest = msg.photo[msg.photo.length - 1];
  const caption = typeof msg.caption === "string" ? msg.caption.trim() : "";
  const partnerCaption = caption ? `🖼️ ${senderName}: ${caption}` : `🖼️ ${senderName} sent a photo.`;
  await sendPhoto(partner.telegram_id, largest.file_id, partnerCaption);
  await sendMessage(msg.chat.id, "🖼️ Photo forwarded to your partner.");
}

function csvEscape(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function handleExport(msg: any, user: any) {
  const { data: cards, error } = await supabase
    .from("flashcards")
    .select(`created_at, vocabulary:vocabulary_id (lemma, gloss, part_of_speech, language, lemma_translation), example_message:example_message_id (original_text, original_language, translated_text, translated_language)`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("export query failed:", error);
    await sendMessage(msg.chat.id, "Couldn't build the export. Check function logs.");
    return;
  }

  if (!cards || cards.length === 0) {
    await sendMessage(msg.chat.id, "Both decks are empty.\n\nUse /vocab and /learn to add words first.");
    return;
  }

  let ukCount = 0;
  let enCount = 0;
  let blankedExamples = 0;
  const rows: string[] = [];
  for (const card of cards as any[]) {
    const v = card.vocabulary;
    if (!v) continue;
    const m = card.example_message;
    let exampleSentence = "";
    let exampleTranslation = "";
    if (m) {
      if (m.original_language === v.language) {
        exampleSentence = m.original_text ?? "";
        exampleTranslation = m.translated_text ?? "";
      } else if (m.translated_language === v.language) {
        exampleSentence = m.translated_text ?? "";
        exampleTranslation = m.original_text ?? "";
      }
    }
    if (exampleSentence && !exampleScriptMatchesLanguage(exampleSentence, v.language)) {
      const { cyrillicRatio, letters } = detectScriptRatios(exampleSentence);
      console.warn(`export: blanking example for lemma="${v.lemma}" lang=${v.language} \u2014 script mismatch (cyrillic=${Math.round(cyrillicRatio * 100)}%, letters=${letters})`);
      exampleSentence = "";
      exampleTranslation = "";
      blankedExamples++;
    }
    let deckName: string;
    if (v.language === "uk") { deckName = "Capybara::Ukrainian"; ukCount++; }
    else if (v.language === "en") { deckName = "Capybara::English"; enCount++; }
    else { deckName = "Capybara"; }
    rows.push([
      csvEscape(v.lemma),
      csvEscape(v.gloss),
      csvEscape(v.lemma_translation),
      csvEscape(v.part_of_speech),
      csvEscape(v.language),
      csvEscape(exampleSentence),
      csvEscape(exampleTranslation),
      csvEscape(deckName),
    ].join(","));
  }

  if (rows.length === 0) {
    await sendMessage(msg.chat.id, "Neither deck has exportable rows (vocabulary records may be missing).");
    return;
  }

  if (blankedExamples > 0) {
    console.warn(`export: blanked ${blankedExamples} example sentence${blankedExamples === 1 ? "" : "s"} due to script mismatch.`);
  }

  const ankiHeader = [
    "#separator:Comma",
    "#html:false",
    "#notetype:Capybara",
    "#columns:lemma,gloss,lemma_translation,part_of_speech,language,example,example_translation,deck",
    "#deck column:8",
  ].join("\n") + "\n";

  const csv = ankiHeader + rows.join("\n") + "\n";

  const today = new Date().toISOString().slice(0, 10);
  const filename = `capybara-${today}.csv`;
  const blankedNote = blankedExamples > 0
    ? `\n\n\u26a0\ufe0f Blanked ${blankedExamples} example sentence${blankedExamples === 1 ? "" : "s"} because the linked message was in the wrong script for the card's language.`
    : "";
  const caption =
    `Two decks, equal weight \u2014 ${langFlag("uk")} Ukrainian (${ukCount}) and ${langFlag("en")} English (${enCount}). ` +
    `${cards.length} card${cards.length === 1 ? "" : "s"} total.\n\n` +
    `In Anki: File \u2192 Import \u2192 select this file. Cards land in ` +
    `"Capybara::Ukrainian" and "Capybara::English" automatically.\n\n` +
    `Study the sub-deck for the language you're learning, or the parent "Capybara" deck ` +
    `to drill both \u2014 useful for decoding each other's speech.` +
    blankedNote;
  await sendDocument(msg.chat.id, filename, csv, "text/csv", caption);
}

async function refreshVocabularyCounts() {
  const { error } = await supabase.rpc("refresh_vocabulary_counts");
  if (error) throw error;
}

async function handleHelp(msg: any, user: any) {
  const isAdmin = msg.from?.id === BACKFILL_ADMIN_TELEGRAM_ID;
  const viewerLang = user.native_language === "uk" ? "uk" : "en";
  const lines: string[] = [];
  if (viewerLang === "uk") {
    lines.push(
      "*\u041a\u043e\u043c\u0430\u043d\u0434\u0438 Capybara*",
      "",
      "\u0414\u0432\u0456 \u043a\u043e\u043b\u043e\u0434\u0438: \ud83c\uddfa\ud83c\udde6 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430 \u0456 \ud83c\uddec\ud83c\udde7 \u0430\u043d\u0433\u043b\u0456\u0439\u0441\u044c\u043a\u0430.",
      "",
      "\u2022 \u041f\u0438\u0448\u0438 \u0430\u0431\u043e \u043d\u0430\u0434\u0441\u0438\u043b\u0430\u0439 \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u0435 \u2014 \u044f \u043f\u0435\u0440\u0435\u043a\u043b\u0430\u0434\u0430\u044e \u0456 \u043f\u0435\u0440\u0435\u0441\u0438\u043b\u0430\u044e \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u043e\u0432\u0456",
      "\u2022 \u041d\u0430\u0434\u0441\u0438\u043b\u0430\u0439 \u0444\u043e\u0442\u043e \u0430\u0431\u043e \u0432\u0456\u0434\u0435\u043e \u2014 \u044f \u043f\u0435\u0440\u0435\u0441\u0438\u043b\u0430\u044e \u0439\u043e\u0433\u043e \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u043e\u0432\u0456",
      "\u2022 /vocab \u2014 \u041d\u0430\u0439\u0447\u0430\u0441\u0442\u0456\u0448\u0456 \u0441\u043b\u043e\u0432\u0430, \u0449\u0435 \u043d\u0435 \u0432\u0438\u0432\u0447\u0435\u043d\u0456",
      "\u2022 /learn <\u0441\u043b\u043e\u0432\u043e> \u2014 \u0414\u043e\u0434\u0430\u0442\u0438 \u0441\u043b\u043e\u0432\u043e \u0434\u043e \u043a\u043e\u043b\u043e\u0434\u0438",
      "\u2022 /learn top N \u2014 \u041e\u043f\u0442\u043e\u043c \u0434\u043e\u0434\u0430\u0442\u0438 N \u0441\u043b\u0456\u0432",
      "\u2022 /forget <\u0441\u043b\u043e\u0432\u043e> \u2014 \u0412\u0438\u0434\u0430\u043b\u0438\u0442\u0438 \u0441\u043b\u043e\u0432\u043e \u0437 \u043a\u043e\u043b\u043e\u0434\u0438",
      "\u2022 /export \u2014 \u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 CSV \u0434\u043b\u044f Anki",
      "",
      "*\u041f\u0430\u043c'\u044f\u0442\u044c \u0440\u043e\u0437\u043c\u043e\u0432*",
      "",
      "\u2022 /recap <\u0437\u0430\u043f\u0438\u0442> \u2014 \u0417\u0430\u043f\u0438\u0442\u0430\u0439 \u043f\u0440\u043e \u0432\u0430\u0448\u0456 \u0440\u043e\u0437\u043c\u043e\u0432\u0438 (\u043f\u0440\u0438\u0432\u0430\u0442\u043d\u043e)",
      "\u2022 /remember <\u043d\u043e\u0442\u0430\u0442\u043a\u0430> \u2014 \u041f\u0440\u0438\u0432\u0430\u0442\u043d\u0430 \u043d\u043e\u0442\u0430\u0442\u043a\u0430",
      "\u2022 /reconcile \u2014 \u0412\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c \u043d\u0430 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u043d\u044f, \u0449\u043e\u0431 \u0432\u0438\u043a\u043b\u044e\u0447\u0438\u0442\u0438 \u0437 /recap",
      "\u2022 /restore \u2014 \u041f\u043e\u0432\u0435\u0440\u043d\u0443\u0442\u0438 \u0432 /recap",
      "\u2022 /pin \u2014 \u041f\u043e\u0437\u043d\u0430\u0447\u0438\u0442\u0438 \u044f\u043a \u0432\u0430\u0436\u043b\u0438\u0432\u0435",
      "\u2022 /unpin \u2014 \u0417\u043d\u044f\u0442\u0438 \u043f\u043e\u0437\u043d\u0430\u0447\u043a\u0443",
      "\u2022 /pinned \u2014 \u0421\u043f\u0438\u0441\u043e\u043a \u0437\u0430\u043a\u0440\u0456\u043f\u043b\u0435\u043d\u0438\u0445",
    );
  } else {
    lines.push(
      "*Capybara commands*",
      "",
      "Two decks: a \ud83c\uddfa\ud83c\udde6 Ukrainian deck and a \ud83c\uddec\ud83c\udde7 English deck.",
      "",
      "\u2022 Just type or send a voice message \u2014 I translate it and forward to your partner",
      "\u2022 Send a photo or video \u2014 I forward it straight to your partner",
      "\u2022 /vocab \u2014 Top words still unlearned in each deck",
      "\u2022 /learn <word> \u2014 Add a word (script picks the deck)",
      "\u2022 /learn top N \u2014 Bulk-add the top N unlearned words",
      "\u2022 /forget <word> \u2014 Remove a word from the matching deck",
      "\u2022 /export \u2014 Download both decks as a single CSV for Anki",
      "",
      "*Conversation memory*",
      "",
      "\u2022 /recap <question> \u2014 Ask about your conversations (private to you)",
      "\u2022 /remember <note> \u2014 Add a private note only your /recap finds",
      "\u2022 /reconcile \u2014 Reply to a message to exclude it from /recap",
      "\u2022 /restore \u2014 Reply to a message to bring it back into /recap",
      "\u2022 /pin \u2014 Reply to a message to mark it meaningful (small /recap boost)",
      "\u2022 /unpin \u2014 Reply to a pinned message to remove the pin",
      "\u2022 /pinned \u2014 List all pinned messages chronologically",
    );
  }
  if (isAdmin) {
    lines.push("");
    lines.push("_Admin:_");
    lines.push("\u2022 /backfill \u2014 Annotate one batch of unprocessed messages");
    lines.push("\u2022 /backfill\\_translations \u2014 Fill lemma\\_translation for one batch");
    lines.push("\u2022 /recap\\_backfill \u2014 Embed one batch of messages for /recap");
    lines.push("\u2022 /diag \u2014 Ping upstream APIs and check recent DB activity");
    lines.push("\u2022 /update \u2014 Check GitHub for a newer build; deploy with one tap");
  }
  await sendMessage(msg.chat.id, lines.join("\n"), "Markdown");
}

async function fetchTopUnlearned(lang: "uk" | "en", learnerId: string | null, limit: number): Promise<any[]> {
  if (!learnerId) return [];
  const { data, error } = await supabase.rpc("vocab_top_unlearned", {
    p_language: lang,
    p_user_id: learnerId,
    p_limit: limit,
  });
  if (error) { console.error(`vocab_top_unlearned (${lang}) failed:`, error); return []; }
  return data ?? [];
}

function formatVocabSection(
  langCode: "uk" | "en",
  words: any[],
  viewer: any,
  learnerOfLang: any | null,
): string[] {
  const label = langLabel(langCode);
  const flag = langFlag(langCode);
  const viewerLearnsThisLang = viewer.learning_language === langCode;
  const learnerName = learnerOfLang?.display_name ?? null;
  const headerSuffix = viewerLearnsThisLang
    ? " \u2014 your deck"
    : learnerName ? ` \u2014 ${learnerName}'s deck` : "";
  if (!learnerOfLang) {
    return [`${flag} *${label} deck*${headerSuffix}\n_No learner registered for this language._`];
  }
  if (words.length === 0) {
    return [`${flag} *${label} deck*${headerSuffix}\n_All top words already added._`];
  }
  const lines = words.map((w: any, i: number) => {
    const pos = w.part_of_speech ? ` _(${w.part_of_speech})_` : "";
    const gloss = w.gloss ?? "?";
    return `${i + 1}. *${w.lemma}*${pos} \u2014 ${gloss} _(${w.occurrence_count}\u00d7)_`;
  });
  return [`${flag} *${label} deck*${headerSuffix}`, ...lines];
}

async function handleVocab(msg: any, user: any) {
  try { await refreshVocabularyCounts(); }
  catch (e) { console.error("refreshVocabularyCounts failed:", e); }
  const [ukLearner, enLearner] = await Promise.all([
    lookupLearnerOfLanguage("uk"),
    lookupLearnerOfLanguage("en"),
  ]);
  const [ukWords, enWords] = await Promise.all([
    fetchTopUnlearned("uk", ukLearner?.id ?? null, 10),
    fetchTopUnlearned("en", enLearner?.id ?? null, 10),
  ]);
  const sections: string[] = [];
  if (user.learning_language === "uk") {
    sections.push(...formatVocabSection("uk", ukWords, user, ukLearner));
    sections.push("");
    sections.push(...formatVocabSection("en", enWords, user, enLearner));
  } else {
    sections.push(...formatVocabSection("en", enWords, user, enLearner));
    sections.push("");
    sections.push(...formatVocabSection("uk", ukWords, user, ukLearner));
  }
  sections.push("");
  sections.push(`_Add with_ \`/learn <word>\` _or_ \`/learn top N uk\` _/_ \`/learn top N en\`_._`);
  await sendMessage(msg.chat.id, sections.join("\n"), "Markdown");
}

async function lemmatize(word: string, language: "uk" | "en"): Promise<string | null> {
  const langName = language === "uk" ? "Ukrainian" : "English";
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 64,
      system: `Return the dictionary (lemma) form of the given ${langName} word.\n- For nouns: nominative singular\n- For verbs: infinitive\n- For adjectives: masculine singular\n\nOutput ONLY raw JSON in the format: {"lemma": "<word>"}\nIf the input is not a recognizable ${langName} word, output: {"lemma": null}\nIf the input is a word in a different language (not ${langName}), also output: {"lemma": null}\nDo NOT wrap in markdown code fences. Do NOT include any preamble.`,
      messages: [{ role: "user", content: word }],
    });
  } catch (e) { console.error("lemmatize API call failed:", e); return null; }
  const block = result.content[0];
  if (block.type !== "text") return null;
  try {
    const cleaned = block.text.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i, "").replace(/\s*\u0060\u0060\u0060$/, "");
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.lemma === "string" && parsed.lemma.length > 0) return parsed.lemma;
    return null;
  } catch (e) { console.error("lemmatize JSON parse failed:", block.text); return null; }
}

async function lookupVocabByLemma(lemma: string, language: "uk" | "en"): Promise<any[]> {
  const { data, error } = await supabase.from("vocabulary")
    .select("id, lemma, part_of_speech, gloss, first_seen_message_id, language")
    .eq("language", language)
    .ilike("lemma", lemma);
  if (error) { console.error("vocab lookup failed:", error); return []; }
  return data ?? [];
}

async function handleLearnTop(msg: any, user: any, arg: string) {
  const match = arg.match(/^top\s*(\d+)?(?:\s+(\S+))?$/i);
  if (!match) {
    await sendMessage(msg.chat.id, "Usage: `/learn top <N> [uk|en]`", "Markdown");
    return;
  }
  const nRaw = match[1];
  const langTokenRaw = match[2];
  if (!nRaw) {
    await sendMessage(msg.chat.id, "How many words?\n\nUsage: `/learn top <N> [uk|en]`", "Markdown");
    return;
  }
  const n = parseInt(nRaw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    await sendMessage(msg.chat.id, "N must be a positive number.", "Markdown");
    return;
  }
  const N = Math.min(n, 50);

  let targetLang: "uk" | "en";
  if (langTokenRaw) {
    const parsed = parseLangArg(langTokenRaw);
    if (!parsed) {
      await sendMessage(msg.chat.id, `Didn't recognize "${langTokenRaw}" as a language. Use \`uk\` or \`en\`.`, "Markdown");
      return;
    }
    targetLang = parsed;
  } else {
    targetLang = user.learning_language;
  }

  const targetLangLabel = langLabel(targetLang);

  let targetUser: any;
  let isOwnDeck: boolean;
  if (user.learning_language === targetLang) {
    targetUser = user;
    isOwnDeck = true;
  } else {
    const learner = await lookupLearnerOfLanguage(targetLang);
    if (!learner) {
      await sendMessage(msg.chat.id, `Couldn't find anyone learning ${targetLangLabel}. No deck to add to.`);
      return;
    }
    targetUser = learner;
    isOwnDeck = false;
  }
  const deckOwnerLabel = isOwnDeck ? "your" : `${targetUser.display_name}'s`;

  try { await refreshVocabularyCounts(); }
  catch (e) { console.error("refreshVocabularyCounts (learn top) failed:", e); }
  const unlearned = await fetchTopUnlearned(targetLang, targetUser.id, N);
  if (unlearned.length === 0) {
    await sendMessage(msg.chat.id, `No unlearned ${targetLangLabel} words available for ${deckOwnerLabel} deck.\n\nRun /vocab to see the current top words.`);
    return;
  }
  const newCards = unlearned.map((v: any) => ({
    user_id: targetUser.id,
    vocabulary_id: v.id,
    example_message_id: v.first_seen_message_id,
  }));
  const { error: insertErr } = await supabase.from("flashcards")
    .upsert(newCards, { onConflict: "user_id,vocabulary_id", ignoreDuplicates: true });
  if (insertErr) {
    console.error("learn top flashcard insert failed:", insertErr);
    await sendMessage(msg.chat.id, "Couldn't add to the deck. Check function logs.");
    return;
  }
  const lines = unlearned.map((v: any, i: number) => {
    const pos = v.part_of_speech ? ` _(${v.part_of_speech})_` : "";
    const gloss = v.gloss ?? "?";
    return `${i + 1}. *${v.lemma}*${pos} \u2014 ${gloss}`;
  });
  const deckLabel = `${langFlag(targetLang)} ${targetLangLabel} deck`;
  const header = `\u2705 Added ${unlearned.length} ${targetLangLabel} word${unlearned.length === 1 ? "" : "s"} to ${deckOwnerLabel} ${deckLabel}:`;
  const truncatedNote = n > N ? `\n\n_(Capped at ${N}; requested ${n}.)_` : "";
  const exportHint = isOwnDeck
    ? `\n\n_Run \`/export\` when you want to import into Anki._`
    : `\n\n_${targetUser.display_name} can run \`/export\` to import into Anki._`;
  await sendMessage(msg.chat.id, `${header}\n${lines.join("\n")}${truncatedNote}${exportHint}`, "Markdown");
}

async function resolveLearnTarget(user: any, word: string): Promise<
  | { targetUser: any; targetLang: "uk" | "en"; isPartnerDeck: boolean }
  | { error: string }
> {
  const detected = detectLanguageFromScript(word);
  if (!detected) {
    return { error: `Couldn't tell if "${word}" is Ukrainian or English. Try a word with clearer Cyrillic or Latin letters.` };
  }
  if (detected === user.learning_language) {
    return { targetUser: user, targetLang: detected, isPartnerDeck: false };
  }
  const partner = await lookupPartner(user.id);
  if (!partner) {
    return { error: `Detected "${word}" as ${detected === "uk" ? "Ukrainian" : "English"}, but couldn't find a partner to add the card for.` };
  }
  return { targetUser: partner, targetLang: detected, isPartnerDeck: true };
}

async function handleLearn(msg: any, user: any) {
  const text = (msg.text ?? "").trim();
  const firstSpace = text.indexOf(" ");
  const arg = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  if (!arg) {
    await sendMessage(msg.chat.id, "Usage: `/learn <word>` or `/learn top <N> [uk|en]`\n\nRun /vocab to see suggested words.", "Markdown");
    return;
  }
  if (arg.toLowerCase().startsWith("top")) {
    await handleLearnTop(msg, user, arg);
    return;
  }
  if (arg.includes(" ")) {
    await sendMessage(msg.chat.id, "Please add one word at a time.\n\n(Or use `/learn top N [uk|en]` to bulk-add.)", "Markdown");
    return;
  }
  const resolved = await resolveLearnTarget(user, arg);
  if ("error" in resolved) {
    await sendMessage(msg.chat.id, resolved.error);
    return;
  }
  const { targetUser, targetLang, isPartnerDeck } = resolved;
  const targetLangLabel = langLabel(targetLang);
  let vocabRows = await lookupVocabByLemma(arg, targetLang);
  let lemmaUsed = arg;
  if (vocabRows.length === 0) {
    const lemma = await lemmatize(arg, targetLang);
    if (lemma && lemma.toLowerCase() !== arg.toLowerCase()) {
      const retry = await lookupVocabByLemma(lemma, targetLang);
      if (retry.length > 0) { vocabRows = retry; lemmaUsed = lemma; }
    }
  }
  if (vocabRows.length === 0) {
    await sendMessage(msg.chat.id, `Couldn't find "${arg}" in the ${targetLangLabel} vocabulary.\n\nRun /vocab to see words that have appeared in your conversations.`);
    return;
  }
  const newCards = vocabRows.map((v: any) => ({
    user_id: targetUser.id,
    vocabulary_id: v.id,
    example_message_id: v.first_seen_message_id,
  }));
  const { data: inserted, error: insertErr } = await supabase.from("flashcards")
    .upsert(newCards, { onConflict: "user_id,vocabulary_id", ignoreDuplicates: true })
    .select("vocabulary_id");
  if (insertErr) {
    console.error("learn flashcard insert failed:", insertErr);
    await sendMessage(msg.chat.id, "Couldn't add to the deck. Check function logs.");
    return;
  }
  const insertedIds = new Set((inserted ?? []).map((r: any) => r.vocabulary_id));
  const toAdd = vocabRows.filter((v: any) => insertedIds.has(v.id));
  const deckOwnerLabel = isPartnerDeck ? `${targetUser.display_name}'s` : "your";
  const deckLabel = `${langFlag(targetLang)} ${targetLangLabel} deck`;
  if (toAdd.length === 0) {
    await sendMessage(msg.chat.id, `"${lemmaUsed}" is already in ${deckOwnerLabel} ${deckLabel}.`, "Markdown");
    return;
  }
  const lines = toAdd.map((v: any) => {
    const pos = v.part_of_speech ? ` _(${v.part_of_speech})_` : "";
    const gloss = v.gloss ?? "?";
    return `\u2022 *${v.lemma}*${pos} \u2014 ${gloss}`;
  });
  const skipped = vocabRows.length - toAdd.length;
  const header = toAdd.length === 1
    ? `\u2705 Added to ${deckOwnerLabel} ${deckLabel}:`
    : `\u2705 Added ${toAdd.length} entries to ${deckOwnerLabel} ${deckLabel}:`;
  const lemmatized = lemmaUsed.toLowerCase() !== arg.toLowerCase() ? `\n\nMatched as "${lemmaUsed}" (dictionary form of "${arg}").` : "";
  const footer = skipped > 0 ? `\n\n_(${skipped} already in deck, skipped)_` : "";
  await sendMessage(msg.chat.id, `${header}\n${lines.join("\n")}${lemmatized}${footer}`, "Markdown");
}

async function handleForget(msg: any, user: any) {
  const text = (msg.text ?? "").trim();
  const firstSpace = text.indexOf(" ");
  const arg = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  if (!arg) {
    await sendMessage(msg.chat.id, "Usage: `/forget <word>`\n\nRemoves a word from the matching deck.", "Markdown");
    return;
  }
  if (arg.includes(" ")) {
    await sendMessage(msg.chat.id, "Please remove one word at a time.", "Markdown");
    return;
  }
  const resolved = await resolveLearnTarget(user, arg);
  if ("error" in resolved) {
    await sendMessage(msg.chat.id, resolved.error);
    return;
  }
  const { targetUser, targetLang, isPartnerDeck } = resolved;
  const targetLangLabel = langLabel(targetLang);
  let vocabRows = await lookupVocabByLemma(arg, targetLang);
  let lemmaUsed = arg;
  if (vocabRows.length === 0) {
    const lemma = await lemmatize(arg, targetLang);
    if (lemma && lemma.toLowerCase() !== arg.toLowerCase()) {
      const retry = await lookupVocabByLemma(lemma, targetLang);
      if (retry.length > 0) { vocabRows = retry; lemmaUsed = lemma; }
    }
  }
  if (vocabRows.length === 0) {
    await sendMessage(msg.chat.id, `Couldn't find "${arg}" in the ${targetLangLabel} vocabulary.`);
    return;
  }
  const vocabIds = vocabRows.map((v: any) => v.id);
  const { data: deleted, error } = await supabase.from("flashcards")
    .delete()
    .eq("user_id", targetUser.id)
    .in("vocabulary_id", vocabIds)
    .select("vocabulary_id");
  if (error) {
    console.error("forget delete failed:", error);
    await sendMessage(msg.chat.id, "Couldn't update the deck. Check function logs.");
    return;
  }
  const deckOwnerLabel = isPartnerDeck ? `${targetUser.display_name}'s` : "your";
  const deckLabel = `${langFlag(targetLang)} ${targetLangLabel} deck`;
  if (!deleted || deleted.length === 0) {
    await sendMessage(msg.chat.id, `"${lemmaUsed}" wasn't in ${deckOwnerLabel} ${deckLabel}.`, "Markdown");
    return;
  }
  const deletedIds = new Set(deleted.map((r: any) => r.vocabulary_id));
  const removed = vocabRows.filter((v: any) => deletedIds.has(v.id));
  const lines = removed.map((v: any) => {
    const pos = v.part_of_speech ? ` _(${v.part_of_speech})_` : "";
    const gloss = v.gloss ?? "?";
    return `\u2022 *${v.lemma}*${pos} \u2014 ${gloss}`;
  });
  const header = removed.length === 1
    ? `\u2796 Removed from ${deckOwnerLabel} ${deckLabel}:`
    : `\u2796 Removed ${removed.length} entries from ${deckOwnerLabel} ${deckLabel}:`;
  const lemmatized = lemmaUsed.toLowerCase() !== arg.toLowerCase() ? `\n\nMatched as "${lemmaUsed}" (dictionary form of "${arg}").` : "";
  const note = `\n\n_If this card was already imported into Anki, delete it there too._`;
  await sendMessage(msg.chat.id, `${header}\n${lines.join("\n")}${lemmatized}${note}`, "Markdown");
}

async function fetchAnnotatedSidesSet(): Promise<Set<string>> {
  const result = new Set<string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("message_annotations").select("message_id, details").range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const lang = (row.details && (row.details as any).language) || "uk";
      result.add(`${row.message_id}:${lang}`);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return result;
}

async function fetchAllAnnotateableMessages(): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("messages")
      .select("id, original_text, original_language, translated_text, translated_language, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function enumerateAnnotationSides(row: any): Array<{ text: string; language: "uk" | "en" }> {
  const out: Array<{ text: string; language: "uk" | "en" }> = [];
  if ((row.original_language === "uk" || row.original_language === "en") && row.original_text) {
    out.push({ text: row.original_text, language: row.original_language });
  }
  if ((row.translated_language === "uk" || row.translated_language === "en") && row.translated_text) {
    out.push({ text: row.translated_text, language: row.translated_language });
  }
  return out;
}

async function handleBackfill(msg: any, user: any) {
  if (msg.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) { await sendMessage(msg.chat.id, "Not authorized."); return; }
  let candidates: any[];
  try { candidates = await fetchAllAnnotateableMessages(); }
  catch (e) { console.error("fetchAllAnnotateableMessages error:", e); await sendMessage(msg.chat.id, "Backfill query failed. Check logs."); return; }
  let annotatedSides: Set<string>;
  try { annotatedSides = await fetchAnnotatedSidesSet(); }
  catch (e) { console.error("fetchAnnotatedSidesSet error:", e); await sendMessage(msg.chat.id, "Could not load annotation index. Check logs."); return; }
  type Work = { messageId: string; text: string; language: "uk" | "en" };
  const pending: Work[] = [];
  for (const row of candidates) {
    for (const side of enumerateAnnotationSides(row)) {
      const key = `${row.id}:${side.language}`;
      if (!annotatedSides.has(key)) pending.push({ messageId: row.id, text: side.text, language: side.language });
    }
  }
  const totalRemaining = pending.length;
  if (totalRemaining === 0) { await sendMessage(msg.chat.id, "\u2705 Backfill complete. 0 sides remaining."); return; }
  const batch = pending.slice(0, BACKFILL_BATCH_SIZE);
  await sendMessage(msg.chat.id, `\u23f3 Processing ${batch.length} of ${totalRemaining} remaining (across both languages)...`);
  let succeeded = 0; let failed = 0; let skippedWrongScript = 0;
  for (const work of batch) {
    const { cyrillicRatio, letters } = detectScriptRatios(work.text);
    const wrongScript = letters === 0 ||
      (work.language === "en" && cyrillicRatio > CYRILLIC_SKIP_THRESHOLD) ||
      (work.language === "uk" && cyrillicRatio < (1 - CYRILLIC_SKIP_THRESHOLD));
    if (wrongScript) { skippedWrongScript++; await writeFallbackAnnotation(work.messageId); continue; }
    try { await annotateMessage(work.messageId, work.text, work.language); succeeded++; }
    catch (e) { console.error("backfill annotateMessage failed for", work.messageId, work.language, e); failed++; }
  }
  const annotatedAfter = await fetchAnnotatedSidesSet();
  let stillPending = 0;
  for (const row of candidates) {
    for (const side of enumerateAnnotationSides(row)) {
      if (!annotatedAfter.has(`${row.id}:${side.language}`)) stillPending++;
    }
  }
  const reply =
    `\u2705 Batch done.\n` +
    `Succeeded: ${succeeded}\n` +
    (skippedWrongScript > 0 ? `Skipped (wrong script): ${skippedWrongScript}\n` : "") +
    `Failed: ${failed}\n` +
    `Verified remaining: ${stillPending}\n\n` +
    (stillPending > 0 ? `Send the command again to continue. (Avoid tapping the linkified text.)` : `\ud83c\udf89 All done!`);
  await sendMessage(msg.chat.id, reply);
}

async function translateLemmasBatch(
  items: Array<{ id: string; lemma: string; part_of_speech: string | null }>,
  sourceLang: "uk" | "en",
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;
  const sourceName = sourceLang === "uk" ? "Ukrainian" : "English";
  const targetName = sourceLang === "uk" ? "English" : "Ukrainian";
  const lines = items.map((it, i) => {
    const pos = it.part_of_speech ?? "unknown";
    return `${i + 1}. ${it.lemma} (${pos})`;
  }).join("\n");
  const system =
    `You are translating ${sourceName} dictionary words into ${targetName}.\n` +
    `For each numbered item, return the single most common dictionary-form ${targetName} translation.\n` +
    `Rules:\n` +
    `- Output the dictionary form (infinitive for verbs, nominative singular for nouns, masculine singular for adjectives).\n` +
    `- One word when possible; a short phrase only if the language has no single-word equivalent.\n` +
    `- Use the part_of_speech in parentheses to disambiguate homographs.\n` +
    `- If a word is untranslatable (e.g. it's actually a proper noun, foreign word, or gibberish), return null for that item.\n` +
    `- Output ONLY a raw JSON array of objects with this shape: [{"n": 1, "translation": "..."}, {"n": 2, "translation": null}, ...]\n` +
    `- Do NOT wrap in markdown code fences. Do NOT include any preamble.\n` +
    (sourceLang === "uk"
      ? `- Source is Ukrainian. NEVER treat input as Russian. Translate as if the source were standard literary Ukrainian.`
      : `- Source is English. Output authentically Ukrainian translations (not Russified Ukrainian or \u0441\u0443\u0440\u0436\u0438\u043a).`);
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: lines }],
    });
  } catch (e) {
    console.error("translateLemmasBatch API call failed:", e);
    return out;
  }
  const block = result.content[0];
  if (block.type !== "text") return out;
  let parsed: any;
  try {
    const cleaned = block.text.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i, "").replace(/\s*\u0060\u0060\u0060$/, "");
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("translateLemmasBatch JSON parse failed:", block.text);
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const entry of parsed) {
    if (typeof entry?.n !== "number") continue;
    const idx = entry.n - 1;
    if (idx < 0 || idx >= items.length) continue;
    const translation = entry.translation;
    if (typeof translation !== "string" || translation.length === 0) continue;
    out.set(items[idx].id, translation.trim());
  }
  return out;
}

async function handleBackfillTranslations(msg: any, user: any) {
  if (msg.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) { await sendMessage(msg.chat.id, "Not authorized."); return; }
  const { count: totalRemaining, error: countErr } = await supabase
    .from("vocabulary")
    .select("id", { count: "exact", head: true })
    .is("lemma_translation", null);
  if (countErr) {
    console.error("backfill_translations count failed:", countErr);
    await sendMessage(msg.chat.id, "Couldn't count remaining vocabulary rows. Check logs.");
    return;
  }
  if (!totalRemaining || totalRemaining === 0) {
    await sendMessage(msg.chat.id, "\u2705 All vocabulary rows already have a lemma_translation. Nothing to do.");
    return;
  }
  const { data: rows, error } = await supabase
    .from("vocabulary")
    .select("id, lemma, part_of_speech, language")
    .is("lemma_translation", null)
    .order("created_at", { ascending: true })
    .limit(BACKFILL_TRANSLATIONS_BATCH_SIZE);
  if (error) {
    console.error("backfill_translations fetch failed:", error);
    await sendMessage(msg.chat.id, "Couldn't fetch vocabulary rows. Check logs.");
    return;
  }
  if (!rows || rows.length === 0) {
    await sendMessage(msg.chat.id, "\u2705 No more rows to backfill.");
    return;
  }
  await sendMessage(msg.chat.id, `\u23f3 Translating ${rows.length} of ${totalRemaining} remaining...`);
  const ukItems = rows.filter((r: any) => r.language === "uk");
  const enItems = rows.filter((r: any) => r.language === "en");
  const [ukMap, enMap] = await Promise.all([
    translateLemmasBatch(ukItems, "uk"),
    translateLemmasBatch(enItems, "en"),
  ]);
  const updates = [...ukMap.entries(), ...enMap.entries()];
  let succeeded = 0;
  let failed = 0;
  for (const [id, translation] of updates) {
    const { error: updErr } = await supabase
      .from("vocabulary")
      .update({ lemma_translation: translation })
      .eq("id", id);
    if (updErr) {
      console.error("backfill_translations update failed for id", id, updErr);
      failed++;
    } else {
      succeeded++;
    }
  }
  const untranslated = rows.length - (ukMap.size + enMap.size);
  const { count: stillRemaining } = await supabase
    .from("vocabulary")
    .select("id", { count: "exact", head: true })
    .is("lemma_translation", null);
  const reply =
    `\u2705 Batch done.\n` +
    `Translated & saved: ${succeeded}\n` +
    (untranslated > 0 ? `Skipped (Claude returned null): ${untranslated}\n` : "") +
    (failed > 0 ? `Write failed: ${failed}\n` : "") +
    `Verified remaining: ${stillRemaining ?? "unknown"}\n\n` +
    ((stillRemaining ?? 0) > 0
      ? `Send the command again to continue.`
      : `\ud83c\udf89 All done!`);
  await sendMessage(msg.chat.id, reply);
}

// --- /update: check GitHub for a newer build, and (admin) deploy it with one tap ---

// The version a deploy would actually ship is the BUILD_VERSION literal in the
// committed index.ts on the deploy branch (deploy.yml runs `supabase functions
// deploy` on that file \u2014 there is no separate build artifact). So we read it
// straight from raw.githubusercontent, mirroring deploy.yml's own sed extraction.
// Git tags lag (created manually post-deploy), so they'd under-report. Returns the
// version string, or null on any failure (network / non-200 / no regex match).
async function fetchLatestVersion(): Promise<string | null> {
  if (!GITHUB_REPO) return null;
  // Cache-bust + no-store: raw.githubusercontent is CDN-cached up to a few minutes.
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_DEPLOY_BRANCH}/supabase/functions/telegram-bot/index.ts?t=${Date.now()}`;
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) { console.error(`fetchLatestVersion HTTP ${resp.status}`); return null; }
    const src = await resp.text();
    const m = src.match(/const BUILD_VERSION = "([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) {
    console.error("fetchLatestVersion failed:", e);
    return null;
  }
}

// "v45" -> 45; anything not of the form vN returns null (caller falls back to
// string comparison so a non-numeric scheme never offers a bogus deploy).
function parseVersion(v: string): number | null {
  const m = v.match(/^v(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Trigger the same gated deploy.yml workflow a human would run from the Actions
// tab. The workflow's job gate requires inputs.confirm == "deploy". A successful
// dispatch returns HTTP 204 (no content); anything else is a failure.
async function triggerDeploy(): Promise<{ ok: boolean; status: number; body?: string }> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_DEPLOY_WORKFLOW}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_DEPLOY_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "capybara-bot", // GitHub's REST API rejects requests without a User-Agent
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: GITHUB_DEPLOY_BRANCH, inputs: { confirm: "deploy" } }),
  });
  if (resp.status === 204) return { ok: true, status: 204 };
  const body = await resp.text().catch(() => "<no body>");
  console.error(`triggerDeploy non-204: status=${resp.status} body=${body.slice(0, 300)}`);
  return { ok: false, status: resp.status, body };
}

async function handleUpdateCommand(msg: any, user: any) {
  if (msg.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) { await sendMessage(msg.chat.id, "Not authorized."); return; }

  const running = BUILD_VERSION;
  if (!GITHUB_REPO) {
    await sendMessage(msg.chat.id, `Running ${running}. Update check isn't configured (GITHUB_REPO unset).`);
    return;
  }
  const latest = await fetchLatestVersion();
  if (latest === null) {
    await sendMessage(msg.chat.id, `Running ${running}. Couldn't read the latest version from GitHub (network/parse error). Try again later.`);
    return;
  }

  const runN = parseVersion(running);
  const latN = parseVersion(latest);
  const deployEnabled = !!(GITHUB_DEPLOY_TOKEN && GITHUB_REPO);

  // Non-numeric on either side: we can't order them, so compare by exact string.
  if (runN === null || latN === null) {
    await sendMessage(msg.chat.id,
      latest === running
        ? `Up to date \u2014 running ${running}.`
        : `Running ${running}; latest on GitHub is ${latest}. (Non-numeric versions \u2014 can't offer one-tap deploy.)`);
    return;
  }

  if (latN <= runN) {
    await sendMessage(msg.chat.id, `Up to date \u2014 running ${running}, latest is ${latest}.`);
    return;
  }

  // A newer build exists on the branch.
  const statusText = `\u2b06\ufe0f Update available: running ${running}, latest is ${latest}.`;
  if (!deployEnabled) {
    await sendMessage(msg.chat.id, `${statusText}\nDeploy isn't configured (GITHUB_DEPLOY_TOKEN unset) \u2014 deploy manually.`);
    return;
  }
  const keyboard = { inline_keyboard: [[{ text: `Deploy ${latest}`, callback_data: `deploy:${latest}` }]] };
  await sendMessage(msg.chat.id, `${statusText}\nTap to deploy:`, undefined, keyboard);
}

async function handleCallbackQuery(cq: any) {
  // Auth by Telegram sender id, independent of the users table. The button is only
  // ever shown in the admin's own chat, but we re-check here for defense in depth.
  if (cq.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) {
    await answerCallbackQuery(cq.id, "Not authorized.");
    return;
  }
  const data: string = cq.data ?? "";
  if (!data.startsWith("deploy:")) { await answerCallbackQuery(cq.id); return; }
  const target = data.slice("deploy:".length);

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  if (!GITHUB_DEPLOY_TOKEN || !GITHUB_REPO) {
    await answerCallbackQuery(cq.id, "Deploy not configured.");
    return;
  }

  await answerCallbackQuery(cq.id, `Dispatching deploy ${target}\u2026`);
  // Retire the button before dispatching so a slow request can't be double-tapped.
  if (chatId && messageId) await editMessageReplyMarkup(chatId, messageId);

  // The dispatch always ships branch HEAD (which is >= the button's target), so a
  // stale button still deploys current code \u2014 acceptable.
  const res = await triggerDeploy();
  if (chatId) {
    if (res.ok) {
      await sendMessage(chatId, `\ud83d\ude80 Deploy ${target} dispatched. The GitHub Actions "deploy" workflow is running (predeploy gate + health smoke test); /update will report ${target} once it lands.`);
    } else {
      await sendMessage(chatId, `Deploy dispatch failed (HTTP ${res.status}). Check the GITHUB_DEPLOY_TOKEN scope (needs Actions: write) and try again, or deploy manually.`);
    }
  }
}

async function handleDiag(msg: any, user: any) {
  if (msg.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) { await sendMessage(msg.chat.id, "Not authorized."); return; }
  const lines: string[] = ["\ud83d\udd0d Diagnostic check..."];

  const anthropicStart = Date.now();
  try {
    await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    lines.push(`\u2705 Anthropic OK (${Date.now() - anthropicStart}ms)`);
  } catch (e) {
    lines.push(`\u274c Anthropic FAIL: ${e instanceof Error ? e.message : String(e)}`);
  }

  const whisperStart = Date.now();
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([0])], { type: "audio/ogg" }), "tiny.ogg");
    form.append("model", "whisper-1");
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const elapsed = Date.now() - whisperStart;
    if (resp.status === 401 || resp.status === 403) {
      lines.push(`\u274c OpenAI AUTH FAIL (HTTP ${resp.status}, ${elapsed}ms)`);
    } else if (resp.status >= 500) {
      lines.push(`\u26a0\ufe0f OpenAI 5xx (HTTP ${resp.status}, ${elapsed}ms) \u2014 transient outage likely`);
    } else if (resp.status === 429) {
      lines.push(`\u26a0\ufe0f OpenAI RATE LIMITED (${elapsed}ms)`);
    } else {
      lines.push(`\u2705 OpenAI Whisper reachable (HTTP ${resp.status}, ${elapsed}ms)`);
    }
  } catch (e) {
    lines.push(`\u274c OpenAI transport FAIL: ${e instanceof Error ? e.message : String(e)}`);
  }

  const embedStart = Date.now();
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: "ping" }),
    });
    const elapsed = Date.now() - embedStart;
    if (resp.status === 401 || resp.status === 403) {
      lines.push(`\u274c OpenAI Embeddings AUTH FAIL (HTTP ${resp.status}, ${elapsed}ms)`);
    } else if (resp.status >= 500) {
      lines.push(`\u26a0\ufe0f OpenAI Embeddings 5xx (HTTP ${resp.status}, ${elapsed}ms)`);
    } else if (resp.status === 429) {
      lines.push(`\u26a0\ufe0f OpenAI Embeddings RATE LIMITED (${elapsed}ms)`);
    } else {
      lines.push(`\u2705 OpenAI Embeddings reachable (HTTP ${resp.status}, ${elapsed}ms)`);
    }
  } catch (e) {
    lines.push(`\u274c OpenAI Embeddings transport FAIL: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { data: lastMsg } = await supabase.from("messages")
    .select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastMsg) {
    const ageSec = Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / 1000);
    lines.push(`\ud83d\udcdd Last messages insert: ${ageSec}s ago`);
  } else {
    lines.push(`\ud83d\udcdd messages table is empty`);
  }

  await sendMessage(msg.chat.id, lines.join("\n"));
}

async function embedText(text: string): Promise<number[] | null> {
  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
  } catch (e) {
    console.error("embedText transport failed:", e);
    return null;
  }
  if (!resp.ok) {
    console.error("embedText HTTP", resp.status, await resp.text().catch(() => ""));
    return null;
  }
  const data = await resp.json().catch(() => null);
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIM) {
    console.error("embedText: malformed response");
    return null;
  }
  return emb as number[];
}

async function embedTextsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
  } catch (e) {
    console.error("embedTextsBatch transport failed:", e);
    return texts.map(() => null);
  }
  if (!resp.ok) {
    console.error("embedTextsBatch HTTP", resp.status, await resp.text().catch(() => ""));
    return texts.map(() => null);
  }
  const data = await resp.json().catch(() => null);
  const items = data?.data;
  if (!Array.isArray(items)) {
    console.error("embedTextsBatch: malformed response");
    return texts.map(() => null);
  }
  const out: (number[] | null)[] = texts.map(() => null);
  for (const item of items) {
    if (typeof item?.index === "number" && Array.isArray(item.embedding) && item.embedding.length === EMBEDDING_DIM) {
      out[item.index] = item.embedding as number[];
    }
  }
  return out;
}

function vectorLiteral(emb: number[]): string {
  return "[" + emb.join(",") + "]";
}

async function insertEmbedding(
  sourceType: "message" | "note",
  sourceId: string,
  content: string,
  language: "uk" | "en",
  embedding: number[],
): Promise<void> {
  const { error } = await supabase.rpc("upsert_recap_embedding", {
    p_source_type: sourceType,
    p_source_id: sourceId,
    p_content: content,
    p_language: language,
    p_embedding: vectorLiteral(embedding),
  });
  if (error) console.error(`insertEmbedding (${sourceType}/${sourceId}) failed:`, error);
}

async function embedMessageBackground(messageId: string, text: string, language: "uk" | "en"): Promise<void> {
  const emb = await embedText(text);
  if (!emb) { console.error(`embedMessageBackground skipped (${messageId}): embedding failed`); return; }
  await insertEmbedding("message", messageId, text, language, emb);
}

async function embedNoteBackground(noteId: string, text: string, language: "uk" | "en"): Promise<void> {
  const emb = await embedText(text);
  if (!emb) { console.error(`embedNoteBackground skipped (${noteId}): embedding failed`); return; }
  await insertEmbedding("note", noteId, text, language, emb);
}

type CorpusMessageRow = {
  id: string;
  sender_id: string;
  original_text: string;
  original_language: "uk" | "en";
  telegram_message_id: number | null;
  created_at: string;
};

async function findMessageByTelegramId(telegramMessageId: number): Promise<CorpusMessageRow | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, original_text, original_language, telegram_message_id, created_at")
    .eq("telegram_message_id", telegramMessageId)
    .maybeSingle();
  if (error) { console.error("findMessageByTelegramId failed:", error); return null; }
  return (data as CorpusMessageRow | null) ?? null;
}

async function handleReconcile(msg: any, user: any) {
  const replyTo = msg.reply_to_message;
  if (!replyTo) {
    await sendMessage(msg.chat.id, "Reply to a message with /reconcile to exclude it from /recap results.");
    return;
  }
  const target = await findMessageByTelegramId(replyTo.message_id);
  if (!target) {
    await sendMessage(msg.chat.id, "Couldn't find that message in the corpus. /reconcile works on replies to messages I've stored in this conversation.");
    return;
  }
  const { data: inserted, error } = await supabase
    .from("message_reconciles")
    .upsert({ message_id: target.id, reconciled_by: user.id }, { onConflict: "message_id", ignoreDuplicates: true })
    .select("message_id");
  if (error) {
    console.error("reconcile upsert failed:", error);
    await sendMessage(msg.chat.id, "Couldn't reconcile that message. Check function logs.");
    return;
  }
  const wasNew = (inserted ?? []).length > 0;
  await sendMessage(msg.chat.id, wasNew
    ? "\u2705 Reconciled. This message won't appear in /recap results."
    : "Already reconciled.");
}

async function handleRestore(msg: any, user: any) {
  const replyTo = msg.reply_to_message;
  if (!replyTo) {
    await sendMessage(msg.chat.id, "Reply to a message with /restore to bring it back into /recap results.");
    return;
  }
  const target = await findMessageByTelegramId(replyTo.message_id);
  if (!target) {
    await sendMessage(msg.chat.id, "Couldn't find that message in the corpus.");
    return;
  }
  const { data: deleted, error } = await supabase
    .from("message_reconciles")
    .delete()
    .eq("message_id", target.id)
    .select("message_id");
  if (error) {
    console.error("restore delete failed:", error);
    await sendMessage(msg.chat.id, "Couldn't restore that message. Check function logs.");
    return;
  }
  if (!deleted || deleted.length === 0) {
    await sendMessage(msg.chat.id, "That message wasn't reconciled.");
    return;
  }
  await sendMessage(msg.chat.id, "\u2705 Restored. This message is back in /recap.");
}

async function handlePin(msg: any, user: any) {
  const replyTo = msg.reply_to_message;
  if (!replyTo) {
    await sendMessage(msg.chat.id, "Reply to a message with /pin to mark it as meaningful.");
    return;
  }
  const target = await findMessageByTelegramId(replyTo.message_id);
  if (!target) {
    await sendMessage(msg.chat.id, "Couldn't find that message in the corpus.");
    return;
  }
  const { data: inserted, error } = await supabase
    .from("message_pins")
    .upsert({ message_id: target.id, pinned_by: user.id }, { onConflict: "message_id", ignoreDuplicates: true })
    .select("message_id");
  if (error) {
    console.error("pin upsert failed:", error);
    await sendMessage(msg.chat.id, "Couldn't pin that message. Check function logs.");
    return;
  }
  const wasNew = (inserted ?? []).length > 0;
  await sendMessage(msg.chat.id, wasNew ? "\ud83d\udccc Pinned." : "Already pinned.");
}

async function handleUnpin(msg: any, user: any) {
  const replyTo = msg.reply_to_message;
  if (!replyTo) {
    await sendMessage(msg.chat.id, "Reply to a pinned message with /unpin to remove the pin.");
    return;
  }
  const target = await findMessageByTelegramId(replyTo.message_id);
  if (!target) {
    await sendMessage(msg.chat.id, "Couldn't find that message in the corpus.");
    return;
  }
  const { data: deleted, error } = await supabase
    .from("message_pins")
    .delete()
    .eq("message_id", target.id)
    .select("message_id");
  if (error) {
    console.error("unpin delete failed:", error);
    await sendMessage(msg.chat.id, "Couldn't unpin that message. Check function logs.");
    return;
  }
  if (!deleted || deleted.length === 0) {
    await sendMessage(msg.chat.id, "That message wasn't pinned.");
    return;
  }
  await sendMessage(msg.chat.id, "\u2705 Unpinned.");
}

async function handlePinned(msg: any, user: any) {
  const { data, error } = await supabase
    .from("message_pins")
    .select("pinned_at, message:message_id (id, original_text, original_language, created_at)")
    .order("pinned_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("pinned query failed:", error);
    await sendMessage(msg.chat.id, "Couldn't fetch pinned messages. Check function logs.");
    return;
  }
  if (!data || data.length === 0) {
    await sendMessage(msg.chat.id, "No pinned messages yet. Reply to any message with /pin to mark it.");
    return;
  }
  const persons = buildPersonMap(user, await lookupPartner(user.id));
  const rows: string[] = [];
  for (const r of data as any[]) {
    const m = r.message;
    if (!m) continue;
    const date = (m.created_at ?? "").slice(0, 10);
    const sender = speakerName(m.original_language, persons);
    const raw = (m.original_text ?? "").replace(/\s+/g, " ").trim();
    const snippet = raw.length > 160 ? raw.slice(0, 157) + "\u2026" : raw;
    rows.push(`\u2022 ${date} \u2014 ${sender}: \u00ab${snippet}\u00bb`);
  }
  const header = `\ud83d\udccc Pinned messages (${rows.length}):`;
  await sendMessage(msg.chat.id, [header, "", ...rows].join("\n"));
}

async function handleRemember(msg: any, user: any) {
  const text = (msg.text ?? "").trim();
  const firstSpace = text.indexOf(" ");
  const note = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  if (!note) {
    await sendMessage(msg.chat.id, "Usage: `/remember <note>`\n\nAdds a private note that only your own /recap will find.", "Markdown");
    return;
  }
  const detected = detectLanguageFromScript(note);
  const language: "uk" | "en" = detected ?? (user.native_language === "uk" ? "uk" : "en");
  const { data: inserted, error } = await supabase
    .from("notes")
    .insert({ author_id: user.id, content: note, language })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("remember insert failed:", error);
    await sendMessage(msg.chat.id, "Couldn't save that note. Check function logs.");
    return;
  }
  scheduleBackgroundWork(`embedNote (${inserted.id})`, embedNoteBackground(inserted.id, note, language));
  await sendMessage(msg.chat.id, "\ud83d\udcdd Noted.");
}

type ParseOutput = {
  language: "en" | "uk";
  time_window: { start: string; end: string } | null;
  shape: "narrow" | "broad";
  k: number;
};

function defaultParse(fallbackLang: "en" | "uk"): ParseOutput {
  return { language: fallbackLang, time_window: null, shape: "broad", k: RECAP_K_BROAD };
}

async function parseQuestion(question: string, fallbackLang: "en" | "uk"): Promise<ParseOutput> {
  const today = new Date().toISOString().slice(0, 10);
  const system =
    `You are the parser for a /recap query on a bilingual relationship-memory bot. ` +
    `Extract structured fields from the user's question.\n\n` +
    `Output ONLY raw JSON with this shape:\n` +
    `{\n` +
    `  "language": "en" | "uk",\n` +
    `  "time_window": null | { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },\n` +
    `  "shape": "narrow" | "broad"\n` +
    `}\n\n` +
    `Today's date is ${today}.\n\n` +
    `Rules:\n` +
    `- "language" is the dominant language of the question (en or uk). Detect from script and word content.\n` +
    `- "time_window" is null unless the question has an explicit time marker. If present, return an inclusive [start, end] range (YYYY-MM-DD).\n` +
    `- "shape" is "narrow" for specific factual questions and "broad" for open-ended ones.\n\n` +
    `Do NOT wrap in markdown code fences. Do NOT include preamble.`;
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 256,
      system,
      messages: [{ role: "user", content: question }],
    });
  } catch (e) {
    console.error("parseQuestion API call failed:", e);
    return defaultParse(fallbackLang);
  }
  const block = result.content[0];
  if (block.type !== "text") return defaultParse(fallbackLang);
  let parsed: any;
  try {
    const cleaned = block.text.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i, "").replace(/\s*\u0060\u0060\u0060$/, "");
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("parseQuestion JSON parse failed:", block.text);
    return defaultParse(fallbackLang);
  }
  const language: "en" | "uk" = (parsed.language === "uk" || parsed.language === "en") ? parsed.language : fallbackLang;
  const shape: "narrow" | "broad" = parsed.shape === "narrow" ? "narrow" : "broad";
  const tw = parsed.time_window;
  const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const time_window = (tw && isDate(tw.start) && isDate(tw.end)) ? { start: tw.start, end: tw.end } : null;
  const rawK = shape === "narrow" ? RECAP_K_NARROW : RECAP_K_BROAD;
  const k = Math.max(RECAP_K_FLOOR, Math.min(RECAP_K_CEILING, rawK));
  return { language, time_window, shape, k };
}

type RetrievedItem = {
  source_type: "message" | "note";
  source_id: string;
  content: string;
  language: "en" | "uk";
  created_at: string;
  sender_name: string | null;
  author_id: string | null;
  is_pinned: boolean;
  similarity: number;
};

async function retrieveCandidates(
  question: string,
  queryEmbedding: number[],
  timeWindow: { start: string; end: string } | null,
): Promise<{ semantic: RetrievedItem[]; keyword: RetrievedItem[] }> {
  const p_start = timeWindow?.start ?? null;
  const p_end = timeWindow?.end ?? null;
  const p_limit = RECAP_CANDIDATE_POOL;
  const p_embedding = vectorLiteral(queryEmbedding);
  const [semResp, kwResp] = await Promise.all([
    supabase.rpc("recap_semantic_search", { p_query_embedding: p_embedding, p_limit, p_start, p_end }),
    supabase.rpc("recap_keyword_search", { p_query: question, p_limit, p_start, p_end }),
  ]);
  if (semResp.error) console.error("recap_semantic_search failed:", semResp.error);
  if (kwResp.error) console.error("recap_keyword_search failed:", kwResp.error);
  return {
    semantic: (semResp.data as RetrievedItem[] | null) ?? [],
    keyword: (kwResp.data as RetrievedItem[] | null) ?? [],
  };
}

function rrfMerge(semantic: RetrievedItem[], keyword: RetrievedItem[]): Map<string, { item: RetrievedItem; score: number }> {
  const RRF_K = 60;
  const merged = new Map<string, { item: RetrievedItem; score: number }>();
  semantic.forEach((item, idx) => {
    const key = `${item.source_type}:${item.source_id}`;
    merged.set(key, { item, score: 1 / (RRF_K + idx + 1) });
  });
  keyword.forEach((item, idx) => {
    const key = `${item.source_type}:${item.source_id}`;
    const add = 1 / (RRF_K + idx + 1);
    const existing = merged.get(key);
    if (existing) existing.score += add;
    else merged.set(key, { item, score: add });
  });
  return merged;
}

function filterAndRank(
  merged: Map<string, { item: RetrievedItem; score: number }>,
  askerId: string,
  k: number,
): RetrievedItem[] {
  const coolingOffMs = RECAP_COOLING_OFF_HOURS * 3600 * 1000;
  const now = Date.now();
  const out: { item: RetrievedItem; score: number }[] = [];
  for (const entry of merged.values()) {
    const { item } = entry;
    const itemTimeMs = new Date(item.created_at).getTime();
    if (item.source_type === "message" && now - itemTimeMs < coolingOffMs) continue;
    if (item.source_type === "note" && item.author_id !== askerId) continue;
    const finalScore = entry.score + (item.is_pinned ? RECAP_PIN_BOOST : 0);
    out.push({ item, score: finalScore });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k).map((e) => e.item);
}

function formatContextForSynthesis(items: RetrievedItem[]): string {
  const lines: string[] = [];
  const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const item of sorted) {
    const dt = item.created_at.replace("T", " ").slice(0, 16);
    if (item.source_type === "message") {
      const sender = item.sender_name ?? "?";
      lines.push(`[message] ${dt} | ${sender} (${item.language}) | \u00ab${item.content}\u00bb`);
    } else {
      const author = item.sender_name ?? "?";
      lines.push(`[note]    ${dt} | ${author} | ${item.content}`);
    }
  }
  return lines.join("\n");
}

// Describes one partner for the synthesis prompt's identity clause, e.g.
// e.g. "<name> (en native, learning uk)". Uses the language codes verbatim, as the
// original hardcoded clause did.
function describePerson(u: { display_name: string; native_language: string; learning_language: string }): string {
  return `${u.display_name} (${u.native_language} native, learning ${u.learning_language})`;
}

// Builds the two-person identity clause from the asker + partner rows, English
// native listed first to match the original framing. Degrades gracefully to a
// role-only description (no names) if either row is missing -- the en<->uk pair
// is invariant across every instance, so the roles are always accurate.
function buildCoupleIdentity(asker: any, partner: any): string {
  if (!asker?.display_name || !partner?.display_name) {
    return "an English-native partner and a Ukrainian-native partner";
  }
  const [first, second] = asker.native_language === "en" ? [asker, partner] : [partner, asker];
  return `${describePerson(first)} and ${describePerson(second)}`;
}

function buildSynthesisPrompt(
  askerName: string,
  coupleIdentity: string,
  answerLanguage: "en" | "uk",
  retrievedItems: string,
  question: string,
): string {
  const answerLangName = answerLanguage === "uk" ? "Ukrainian" : "English";
  return `You are answering a question about a shared conversational history between two people in a relationship: ${coupleIdentity}. You are the /recap feature of their translation bot \u2014 a private memory tool either of them can query.\n\nThe person asking is: ${askerName}.\nAnswer in: ${answerLangName}. Match the dominant language of their question.\n\nRules:\n1. Ground every claim in the CONTEXT. If the context doesn't contain the answer, say so plainly \u2014 never guess or fill in from general knowledge.\n2. Quote sparingly: 1-2 short quotes total, hard maximum 3, woven naturally into the answer.\n3. Quotes appear in their ORIGINAL language, exactly as written. Do not translate quotes; the narrative around them is in the answer language.\n4. Distinguish messages from notes when citing. Message: "[name] said on March 14: \u00ab...\u00bb". Note: "you noted on March 14: ...". Notes are private observations the writer recorded \u2014 not things the other person said. Never blur this.\n5. Be concise. Narrow questions get 1-4 sentences; broad get a short paragraph. Don't pad or editorialize.\n6. If views conflict or evolve over time, say so.\n7. Do not infer emotional states unless the source text explicitly conveys them.\n8. You do recall and synthesis of what was said or noted \u2014 you are not an advisor, predictor, or judge. If asked what someone will do/want/feel in future, who was right in a disagreement, or for relationship advice: decline warmly and briefly, point to what you CAN do (recall), and suggest a regular chat with Claude or talking with someone who knows them.\n9. If the CONTEXT has nothing relevant, say so in one sentence. "I don't see anything about that in your conversations" is enough.\n10. Preserve tone \u2014 if the messages were playful or affectionate, reflect that.\n\nOutput format: plain text, no headers or markdown beyond the quote guillemets. Speak directly to the asker in second person.\n\nCRITICAL LANGUAGE RULES:\n- Never produce Russian. The Cyrillic-script language in this corpus is ALWAYS Ukrainian, never Russian.\n- When answering in Ukrainian, output standard literary Ukrainian only. No Russian words, spellings, or Russified forms.\n\n# CONTEXT\n${retrievedItems}\n\n# QUESTION\n${question}`;
}

async function synthesizeAnswer(
  question: string,
  items: RetrievedItem[],
  askerName: string,
  coupleIdentity: string,
  answerLanguage: "en" | "uk",
): Promise<string | null> {
  const context = formatContextForSynthesis(items);
  const systemPrompt = buildSynthesisPrompt(askerName, coupleIdentity, answerLanguage, context, question);
  let result;
  try {
    result = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });
  } catch (e) {
    console.error("synthesizeAnswer API call failed:", e);
    return null;
  }
  const block = result.content[0];
  if (block.type !== "text") return null;
  return block.text.trim();
}

async function sendChatAction(chatId: number, action: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (e) {
    console.error("sendChatAction failed:", e);
  }
}

async function handleRecap(msg: any, user: any) {
  const text = (msg.text ?? "").trim();
  const firstSpace = text.indexOf(" ");
  const question = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  if (!question) {
    await sendMessage(msg.chat.id,
      "Usage: `/recap <question>`\n\nAsk about your conversations. Results are private to you. Notes from /remember participate alongside messages.",
      "Markdown");
    return;
  }
  scheduleBackgroundWork(`recap typing (${msg.chat.id})`, sendChatAction(msg.chat.id, "typing"));

  const askerFallbackLang: "en" | "uk" = user.native_language === "uk" ? "uk" : "en";
  const parsed = await parseQuestion(question, askerFallbackLang);

  const qEmb = await embedText(question);
  if (!qEmb) {
    await sendMessage(msg.chat.id, parsed.language === "uk"
      ? "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043e\u043f\u0440\u0430\u0446\u044e\u0432\u0430\u0442\u0438 \u0437\u0430\u043f\u0438\u0442. \u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437."
      : "Couldn't process your question (embedding error). Try again in a moment.");
    return;
  }

  const { semantic, keyword } = await retrieveCandidates(question, qEmb, parsed.time_window);
  const merged = rrfMerge(semantic, keyword);
  const top = filterAndRank(merged, user.id, parsed.k);
  if (top.length === 0) {
    await sendMessage(msg.chat.id, parsed.language === "uk"
      ? "\u042f \u043d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0448\u043e\u0432 \u043f\u0440\u043e \u0446\u0435 \u0443 \u0432\u0430\u0448\u0438\u0445 \u0440\u043e\u0437\u043c\u043e\u0432\u0430\u0445."
      : "I don't see anything about that in your conversations.");
    return;
  }

  const partner = await lookupPartner(user.id);
  const coupleIdentity = buildCoupleIdentity(user, partner);
  const answer = await synthesizeAnswer(question, top, user.display_name, coupleIdentity, parsed.language);
  if (!answer) {
    await sendMessage(msg.chat.id, parsed.language === "uk"
      ? "\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0433\u0435\u043d\u0435\u0440\u0443\u0432\u0430\u0442\u0438 \u0432\u0456\u0434\u043f\u043e\u0432\u0456\u0434\u044c. \u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437."
      : "Couldn't generate an answer. Try again in a moment.");
    return;
  }
  await sendMessage(msg.chat.id, answer);
}

async function recapBackfillRemaining(): Promise<number | null> {
  const { data, error } = await supabase.rpc("recap_backfill_remaining");
  if (error) { console.error("recap_backfill_remaining failed:", error); return null; }
  if (Array.isArray(data)) {
    const row = data[0];
    const v = row?.remaining;
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v);
  }
  if (typeof data === "number") return data;
  return null;
}

async function handleRecapBackfill(msg: any, user: any) {
  if (msg.from?.id !== BACKFILL_ADMIN_TELEGRAM_ID) { await sendMessage(msg.chat.id, "Not authorized."); return; }

  const remaining = await recapBackfillRemaining();
  if (remaining === null) { await sendMessage(msg.chat.id, "Couldn't query backfill remaining. Check logs."); return; }
  if (remaining === 0) { await sendMessage(msg.chat.id, "\u2705 Recap backfill complete. 0 messages remaining."); return; }

  const { data: batchData, error: batchErr } = await supabase.rpc("recap_backfill_batch", { p_limit: RECAP_BACKFILL_BATCH_SIZE });
  if (batchErr) {
    console.error("recap_backfill_batch failed:", batchErr);
    await sendMessage(msg.chat.id, "Couldn't fetch backfill batch. Check logs.");
    return;
  }
  const batch = (batchData as Array<{ id: string; original_text: string; original_language: "uk" | "en" }> | null) ?? [];
  if (batch.length === 0) {
    await sendMessage(msg.chat.id, "\u2705 Recap backfill complete. 0 messages remaining.");
    return;
  }

  await sendMessage(msg.chat.id, `\u23f3 Embedding ${batch.length} of ~${remaining} remaining...`);

  const embeddings = await embedTextsBatch(batch.map((b) => b.original_text));
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i++) {
    const emb = embeddings[i];
    if (!emb) { failed++; continue; }
    const item = batch[i];
    try {
      await insertEmbedding("message", item.id, item.original_text, item.original_language, emb);
      succeeded++;
    } catch (e) {
      console.error("recap_backfill insertEmbedding failed for", item.id, e);
      failed++;
    }
  }

  const after = await recapBackfillRemaining();
  const afterStr = after === null ? "unknown" : String(after);
  const reply =
    `\u2705 Batch done.\n` +
    `Embedded: ${succeeded}\n` +
    (failed > 0 ? `Failed: ${failed}\n` : "") +
    `Verified remaining: ${afterStr}\n\n` +
    ((after ?? 1) > 0 ? "Send /recap_backfill again to continue." : "\ud83c\udf89 All messages embedded!");
  await sendMessage(msg.chat.id, reply);
}
