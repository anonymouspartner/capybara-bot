// Customer-facing copy for the single-tenant bot, in English and Ukrainian.
//
// WHY THIS FILE EXISTS
// This build served a Ukrainian native speaker an English interface for a year. She could
// read it, but a product whose whole claim is "write in your language and be read in
// yours" should not open in the wrong one.
//
// WHY ONLY TWO LANGUAGES, WHEN THE REGISTRY OFFERS EIGHT
// The multi-tenant build carries all eight because it sells to strangers whose language is
// unknown until they arrive. This build is provisioned per couple, by hand, and this
// instance is English/Ukrainian. Both of these are reviewed to a standard the maintainer
// can actually check; the other six would be machine-written, unreviewed, and would serve
// nobody today.
//
// Adding one later is a column, not a rewrite: add the code to Lang and LANGS, add the key
// to each row, and t() picks it up. A language that is missing falls back to English and
// warns, so a half-finished addition degrades safely rather than breaking a send.
//
// SHAPE
// Key-major, so both translations of one string sit together and a missing one is visible
// at a glance. Entries are plain strings, or functions where a value is interpolated --
// interpolation is then just code, there is no template parser to write, and the compiler
// catches a missing variable. Functions also carry plural rules, which differ per language
// (Ukrainian has three forms where English has two).
//
// Admin surfaces (/diag, the backfill grinds) are deliberately absent: one operator, who
// reads English. Translating them is pure cost.

export type Lang = "en" | "uk";
export const LANGS: Lang[] = ["en", "uk"];

type Entry = string | ((v: any) => string);
type Row = Record<Lang, Entry>;

// Ukrainian has three plural forms, chosen by the last digit and the last two: 1 book,
// 2 books, 5 books -- and 21 takes the SINGULAR, which is the case a naive n === 1 check
// gets wrong.
function plUk(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const STRINGS: Record<string, Row> = {
  // ---- /management (admin) ---------------------------------------------------
  //
  // Localized even though only the admin sees it, because "admin" here is one half of a
  // couple, not an operator role -- and which half that is depends on the instance.

  mgmt_header: {
    en: "🛠 <b>Instance management</b>",
    uk: "🛠 <b>Керування інстансом</b>",
  },

  mgmt_usage: {
    en: (v: any) =>
      `<b>This month</b> (since ${v.since})\n` +
      `• ${v.msgs} message${v.msgs === 1 ? "" : "s"}\n` +
      `• ${v.annos} annotation${v.annos === 1 ? "" : "s"}\n` +
      `• ≈ ${v.spend} in model calls`,
    uk: (v: any) =>
      `<b>Цього місяця</b> (з ${v.since})\n` +
      `• ${v.msgs} ${plUk(v.msgs, "повідомлення", "повідомлення", "повідомлень")}\n` +
      `• ${v.annos} ${plUk(v.annos, "анотація", "анотації", "анотацій")}\n` +
      `• ≈ ${v.spend} на виклики моделі`,
  },

  mgmt_storage: {
    en: (v: any) =>
      `<b>Storage</b>\n` +
      `• ${v.files} voice file${v.files === 1 ? "" : "s"}, ${v.voice}\n` +
      `• database ${v.db}\n` +
      `• ${v.total} of the ${v.limit} free tier`,
    uk: (v: any) =>
      `<b>Сховище</b>\n` +
      `• ${v.files} ${plUk(v.files, "голосовий файл", "голосові файли", "голосових файлів")}, ${v.voice}\n` +
      `• база даних ${v.db}\n` +
      `• ${v.total} з безкоштовного тарифу ${v.limit}`,
  },

  mgmt_corpus: {
    en: (v: any) => `<b>Corpus</b>\n• ${v.total} messages all time`,
    uk: (v: any) => `<b>Корпус</b>\n• ${v.total} повідомлень за весь час`,
  },

  mgmt_spend_note: {
    en: "<i>Spend is an estimate from message count at the measured per-message rate, not a bill. The real number is in the Anthropic console.</i>",
    uk: "<i>Витрати — це оцінка за кількістю повідомлень і виміряною ставкою, а не рахунок. Справжня сума — в консолі Anthropic.</i>",
  },

  mgmt_btn_diag: { en: "Run diagnostics", uk: "Запустити діагностику" },
  mgmt_btn_update: { en: "Check for updates", uk: "Перевірити оновлення" },

  mgmt_not_admin: {
    en: "That one's for whoever set this instance up.",
    uk: "Це для того, хто налаштовував цей інстанс.",
  },

  mgmt_usage_failed: {
    en: "Couldn't read usage just now. Check function logs.",
    uk: "Не вдалося зчитати статистику. Перевір логи функції.",
  },
};

// Resolve the reader's language, most authoritative first:
//
//   1. The user's own native_language. In this build both people are registered before
//      they can use anything, so this is almost always the answer, and it is definitive:
//      they chose it at setup.
//   2. Telegram's own from.language_code, normalised ("uk-UA" -> "uk") and kept only if it
//      is one this build has copy for. Covers the gap before a row exists and anyone the
//      bot replies to who is not a registered user.
//   3. English.
export function viewerLang(
  from: { language_code?: string } | null | undefined,
  user?: { native_language?: string } | null,
): Lang {
  const known = (c: string | null | undefined): Lang | null =>
    c && (LANGS as string[]).includes(c) ? (c as Lang) : null;
  return known(user?.native_language)
    ?? known((from?.language_code ?? "").split("-")[0].toLowerCase())
    ?? "en";
}

export function t(lang: string | null | undefined, key: string, vars?: any): string {
  const row = STRINGS[key];
  if (!row) { console.error(`strings: unknown key "${key}"`); return ""; }
  const l = (lang && (LANGS as string[]).includes(lang) ? lang : "en") as Lang;
  let entry = row[l];
  if (entry === undefined) {
    console.warn(`strings: "${key}" missing for "${l}", falling back to English`);
    entry = row.en;
  }
  return typeof entry === "function" ? entry(vars ?? {}) : entry;
}
