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

  // ---- The "/" command menu -------------------------------------------------
  //
  // These are the DESCRIPTIONS Telegram shows beside each command in the "/" list.
  // They were hardcoded English, which meant the one surface a Ukrainian speaker sees
  // before reading anything else was in the wrong language -- the exact complaint this
  // whole localization exists to answer, left in the most visible place.
  //
  // Telegram picks which set to serve from setMyCommands' language_code, matched
  // against the reader's TELEGRAM APP language -- not our stored native_language. That
  // is the same signal viewerLang's second rung uses, and it is the only one available:
  // the menu is rendered by the client before any handler runs, so there is no request
  // to resolve a user row from.
  //
  // Keep these SHORT. Telegram truncates in the menu, and Ukrainian runs longer than
  // English for the same content.
  cmd_start:      { en: "What the bot does",                        uk: "Що вміє бот" },
  cmd_help:       { en: "Show all commands",                        uk: "Показати всі команди" },
  cmd_education:  { en: "Study: words, decks, mistakes, Anki export", uk: "Навчання: слова, колоди, помилки, Anki" },
  cmd_memory:     { en: "Memory: ask, notes, pins",                 uk: "Пам'ять: запити, нотатки, закріплення" },
  cmd_ask:        { en: "Ask your shared conversation memory",      uk: "Запитати спільну пам'ять розмов" },
  cmd_management: { en: "Admin: usage, storage, diagnostics, deploys", uk: "Адмін: використання, сховище, діагностика" },

  start_greeting: {
    en: (v: any) => `Hi ${v.name}! Send me text or voice in ${v.a} or ${v.b} and I'll translate between them.`,
    uk: (v: any) => `Привіт, ${v.name}! Надсилай мені текст або голосове ${v.a} чи ${v.b} — я перекладу.`,
  },

  start_media_solo: {
    en: "Send a photo, file, GIF, or audio with a caption and I'll translate the caption into your study corpus too.",
    uk: "Надішли фото, файл, GIF чи аудіо з підписом — я перекладу підпис і додам його у твій навчальний корпус.",
  },

  start_media_pair: {
    en: "You can also send photos, videos, files, stickers, GIFs, audio, locations, and contacts — I'll forward them to the other person, and translate any caption.",
    uk: "Ще можеш надсилати фото, відео, файли, стікери, GIF, аудіо, геолокацію та контакти — я перешлю їх другій людині й перекладу підпис.",
  },

  start_tail_solo: {
    en: "Everything is saved as your personal study corpus, searchable with /ask.\n\nType /help to see what I can do.",
    uk: "Усе зберігається як твій особистий навчальний корпус, у якому можна шукати через /ask.\n\nНабери /help, щоб побачити, що я вмію.",
  },

  start_tail_pair: {
    en: "Everything is saved as a study corpus, searchable with /ask.\n\nType /help to see what I can do.",
    uk: "Усе зберігається як навчальний корпус, у якому можна шукати через /ask.\n\nНабери /help, щоб побачити, що я вмію.",
  },

  not_registered: {
    en: (v: any) => `Hi! This bot is private. Your Telegram ID hasn't been registered yet.\n\nYour Telegram user ID is: ${v.id}\nSend this ID to the bot's owner so they can add you.`,
    uk: (v: any) => `Привіт! Цей бот приватний. Твій Telegram ID ще не зареєстровано.\n\nТвій Telegram user ID: ${v.id}\nНадішли цей ID власнику бота, щоб він тебе додав.`,
  },

  // /help is now an overview, not an index. Re-listing every command here as well as in
  // the two hubs is the same list maintained twice, and the version people read is
  // whichever one they happened to open.
  help_header: {
    en: "🐹 <b>Capybara</b>",
    uk: "🐹 <b>Capybara</b>",
  },

  help_translate_solo: {
    en: (v: any) => `• Type or send a voice message — I translate between ${v.a} and ${v.b}`,
    uk: (v: any) => `• Пиши або надсилай голосове — я перекладаю між ${v.a} і ${v.b}`,
  },

  help_translate_pair: {
    en: (v: any) => `• Type or send a voice message — I translate between ${v.a} and ${v.b} and forward it to ${v.name}`,
    uk: (v: any) => `• Пиши або надсилай голосове — я перекладаю між ${v.a} і ${v.b} та пересилаю ${v.name}`,
  },

  help_media_solo: {
    en: "• Add a caption to a photo, file, GIF or audio — I translate it into your study corpus",
    uk: "• Додай підпис до фото, файлу, GIF чи аудіо — я перекладу його у твій навчальний корпус",
  },

  help_media_pair: {
    en: "• Send a photo, video, file, sticker, GIF, audio, location or contact — I forward it and translate any caption",
    uk: "• Надсилай фото, відео, файли, стікери, GIF, аудіо, геолокацію чи контакти — я перешлю їх і перекладу підпис",
  },

  help_hubs: {
    en:
      "📚 /education — words, decks, mistakes, Anki export\n" +
      "🧠 /memory — ask, notes, pins",
    uk:
      "📚 /education — слова, колоди, помилки, експорт в Anki\n" +
      "🧠 /memory — запити, нотатки, закріплення",
  },

  help_corpus_solo: {
    en: "<i>Everything is saved as your personal study corpus.</i>",
    uk: "<i>Усе зберігається як твій особистий навчальний корпус.</i>",
  },

  help_corpus_pair: {
    en: "<i>Everything is saved as a shared study corpus.</i>",
    uk: "<i>Усе зберігається як спільний навчальний корпус.</i>",
  },

  // ---- /education and /memory hubs --------------------------------------------
  //
  // The "/" menu had thirteen entries and no shape: /vocab, /learn, /forget, /export
  // and /mistakes are one activity, /ask, /note, /pin, /unpin, /pinned, /reconcile and
  // /restore are another, and the menu listed them flat, alphabetised by nothing.
  //
  // Each hub is a printed index, not a launcher. Only the commands that take no
  // argument get a button (/vocab, /export, /mistakes, /pinned) -- a button cannot
  // supply a word to /learn or the reply /pin needs, so offering one would produce a
  // usage error on tap. The rest are listed as text you type, which is what they are.
  // The commands themselves all still work typed out; nothing was removed.

  edu_header: {
    en: "📚 <b>Study</b>",
    uk: "📚 <b>Навчання</b>",
  },

  edu_body: {
    en:
      "<b>Tap to run</b>\n" +
      "• /vocab — the top words from your conversations you haven't learned yet\n" +
      "• /export — both decks plus your mistakes, as a CSV for Anki\n" +
      "• /mistakes — your last five corrections, blurred so you can test yourself\n\n" +
      "<b>Type these</b>\n" +
      "• <code>/learn &lt;word&gt;</code> — add one word to a deck\n" +
      "• <code>/learn top N</code> — add the N most frequent unlearned words at once\n" +
      "• <code>/forget &lt;word&gt;</code> — take a word back out\n" +
      "• /capybara — turn grammar coaching on or off",
    uk:
      "<b>Натисни, щоб запустити</b>\n" +
      "• /vocab — найчастіші слова з ваших розмов, які ти ще не вивчив(ла)\n" +
      "• /export — обидві колоди й твої помилки у форматі CSV для Anki\n" +
      "• /mistakes — п'ять останніх виправлень, розмиті, щоб перевірити себе\n\n" +
      "<b>Це треба набрати</b>\n" +
      "• <code>/learn &lt;слово&gt;</code> — додати одне слово до колоди\n" +
      "• <code>/learn top N</code> — додати N найчастіших невивчених слів одразу\n" +
      "• <code>/forget &lt;слово&gt;</code> — прибрати слово з колоди\n" +
      "• /capybara — увімкнути або вимкнути допомогу з граматикою",
  },

  edu_btn_vocab:    { en: "Top words",     uk: "Топ слів" },
  edu_btn_export:   { en: "Export to Anki", uk: "Експорт в Anki" },
  edu_btn_mistakes: { en: "My mistakes",   uk: "Мої помилки" },

  mem_header: {
    en: "🧠 <b>Memory</b>",
    uk: "🧠 <b>Пам'ять</b>",
  },

  mem_body: {
    en:
      "<b>Tap to run</b>\n" +
      "• /pinned — everything you've pinned, oldest first\n\n" +
      "<b>Type these</b>\n" +
      "• <code>/ask &lt;question&gt;</code> — search everything you've said to each other\n" +
      "• <code>/note &lt;note&gt;</code> — save a private note only your own /ask will find\n\n" +
      "<b>Reply to a message with these</b>\n" +
      "• /pin — mark it as meaningful, so /ask weighs it more\n" +
      "• /unpin — remove that mark\n" +
      "• /reconcile — keep it out of /ask results\n" +
      "• /restore — put a reconciled message back",
    uk:
      "<b>Натисни, щоб запустити</b>\n" +
      "• /pinned — усе закріплене, від найстарішого\n\n" +
      "<b>Це треба набрати</b>\n" +
      "• <code>/ask &lt;питання&gt;</code> — шукати в усьому, що ви казали одне одному\n" +
      "• <code>/note &lt;нотатка&gt;</code> — приватна нотатка, яку знайде лише твій /ask\n\n" +
      "<b>Відповідай на повідомлення цими</b>\n" +
      "• /pin — позначити як важливе, щоб /ask враховував його більше\n" +
      "• /unpin — зняти позначку\n" +
      "• /reconcile — виключити з результатів /ask\n" +
      "• /restore — повернути виключене повідомлення",
  },

  mem_btn_pinned: { en: "Pinned messages", uk: "Закріплені" },

  // ---- Ported from telegram-bot-saas ------------------------------------------
  //
  // The en and uk rows are lifted verbatim from the multi-tenant catalog rather than
  // rewritten. Both builds say the same things to the same two languages, and a second
  // translation of the same sentence is a second thing to keep in step -- with no way to
  // notice when they drift, because each reads fine on its own.
  //
  // The other six languages are deliberately left behind: see the header.

  fwd_no_partner: {
    en: (v: any) => `${v.icon} Got it, but there's no partner to forward it to yet.`,
    uk: (v: any) => `${v.icon} Отримав, але поки немає партнера, щоб переслати.`,
  },

  fwd_done: {
    en: (v: any) => `${v.icon} Forwarded to your partner.`,
    uk: (v: any) => `${v.icon} Переслав твоєму партнеру.`,
  },

  fwd_partner_sent: {
    en: (v: any) => `${v.icon} ${v.name} sent this.`,
    uk: (v: any) => `${v.icon} ${v.name} надіслав(ла) це.`,
  },

  fwd_album_done: {
    en: (v: any) => `${v.icon} Album forwarded to your partner (${v.n} item${v.n === 1 ? "" : "s"}).`,
    uk: (v: any) => `${v.icon} Переслав альбом твоєму партнеру (${v.n} ${plUk(v.n, "елемент", "елементи", "елементів")}).`,
  },

  fwd_partner_album: {
    en: (v: any) => `${v.icon} ${v.name} sent an album of ${v.n}.`,
    uk: (v: any) => `${v.icon} ${v.name} надіслав(ла) альбом із ${v.n} ${plUk(v.n, "елемента", "елементів", "елементів")}.`,
  },

  // An all-video album's caption is forwarded verbatim rather than translated, so this
  // is a label around the sender's own words, not a translation.
  fwd_partner_caption: {
    en: (v: any) => `${v.icon} ${v.name}: ${v.text}`,
    uk: (v: any) => `${v.icon} ${v.name}: ${v.text}`,
  },

  fwd_says: {
    en: (v: any) => `💬 ${v.name} says (${v.lang}):`,
    uk: (v: any) => `💬 ${v.name} каже (${v.lang}):`,
  },

  fwd_said: {
    en: (v: any) => `💬 ${v.name} said (${v.lang}):`,
    uk: (v: any) => `💬 ${v.name} сказав(ла) (${v.lang}):`,
  },

  translation_header: {
    en: (v: any) => `🔤 Translation (${v.lang}):`,
    uk: (v: any) => `🔤 Переклад (${v.lang}):`,
  },

  caption_translation_header: {
    en: (v: any) => `🔤 Caption translation (${v.lang}):`,
    uk: (v: any) => `🔤 Переклад підпису (${v.lang}):`,
  },

  caption_translation_failed: {
    en: (v: any) => `⚠️ Caption translation failed: ${v.err} The media was still forwarded.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти підпис: ${v.err} Медіа все одно переслано.`,
  },

  voice_heard: {
    en: (v: any) => `🎙️ Heard (${v.lang}):`,
    uk: (v: any) => `🎙️ Почув (${v.lang}):`,
  },

  voice_reach_failed: {
    en: "Couldn't reach Telegram to fetch the voice file. Try again in a moment.",
    uk: "Не вдалося зв'язатися з Telegram, щоб отримати голосове. Спробуй за хвилину.",
  },

  voice_fetch_failed: {
    en: "Couldn't fetch the voice message from Telegram. Try again in a moment.",
    uk: "Не вдалося отримати голосове з Telegram. Спробуй за хвилину.",
  },

  voice_download_failed: {
    en: "Couldn't download the voice file from Telegram. Try again in a moment.",
    uk: "Не вдалося завантажити голосове з Telegram. Спробуй за хвилину.",
  },

  voice_transcribe_failed: {
    en: (v: any) => `⚠️ Transcription failed: ${v.err}\n\nThe audio was saved, so it can be retried later.`,
    uk: (v: any) => `⚠️ Не вдалося розшифрувати: ${v.err}\n\nАудіо збережено, тож можна спробувати пізніше.`,
  },

  translation_failed_saved: {
    en: (v: any) => `⚠️ Translation failed: ${v.err} Your message was saved.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти: ${v.err} Твоє повідомлення збережено.`,
  },

  translation_failed_transcript: {
    en: (v: any) => `⚠️ Translation failed: ${v.err} The transcript was saved.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти: ${v.err} Розшифровку збережено.`,
  },

  original_label: {
    en: (v: any) => `<i>Original (${v.lang}):</i>`,
    uk: (v: any) => `<i>Оригінал (${v.lang}):</i>`,
  },

  unsupported_media: {
    en: "I can handle text, voice, photos, videos, files, stickers, GIFs, audio, locations, and contacts. Other types aren't supported yet.",
    uk: "Я вмію обробляти текст, голосові, фото, відео, файли, стікери, GIF, аудіо, геолокацію та контакти. Інші типи поки не підтримуються.",
  },

  // Chrome around the grammar note. The correction text itself already comes back from
  // checkGrammar in the reader's native language; only the frame is from here.
  grammar_note_header: {
    en: "📝 Grammar note:",
    uk: "📝 Граматична нотатка:",
  },

  grammar_correct: {
    en: "✅ Looks correct.",
    uk: "✅ Виглядає правильно.",
  },

  grammar_save_failed: {
    en: "⚠️ Couldn't save that setting — please try again.",
    uk: "⚠️ Не вдалося зберегти налаштування — спробуй ще раз.",
  },

  // Language names in the registry are English and don't decline in Ukrainian, so the
  // Ukrainian copy refers to the studied language indirectly rather than naming it
  // inline. That is why it ignores v.lang rather than interpolating it.
  grammar_on: {
    en: (v: any) => `✅ Grammar assistant ON. When you write in ${v.lang}, I'll check it and privately explain any mistakes (just to you — your partner never sees the note). Turn it off with /capybara off.`,
    uk: () => "✅ Помічник з граматики УВІМКНЕНО. Коли ти пишеш мовою, яку вивчаєш, я перевірю текст і приватно поясню помилки (тільки тобі — партнер їх не бачить). Вимкнути: /capybara off.",
  },

  grammar_off: {
    en: (v: any) => `Grammar assistant OFF. I'll stop checking your ${v.lang}. Turn it back on with /capybara on.`,
    uk: () => "Помічник з граматики ВИМКНЕНО. Більше не перевірятиму. Увімкнути: /capybara on.",
  },

  deck_update_failed: {
    en: "Couldn't update the deck. Try again shortly.",
    uk: "Не вдалося оновити колоду. Спробуй трохи згодом.",
  },

  deck_add_failed: {
    en: "Couldn't add to the deck. Try again shortly.",
    uk: "Не вдалося додати до колоди. Спробуй трохи згодом.",
  },

  // v.codes is the instance's own two language codes, built from the registry rather
  // than hardcoded "uk|en" -- this file ships to a pair the copy does not know.
  learn_usage: {
    en: (v: any) => `Usage: <code>/learn &lt;word&gt;</code> or <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nRun /vocab to see suggested words.`,
    uk: (v: any) => `Використання: <code>/learn &lt;слово&gt;</code> або <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nЗапусти /vocab, щоб побачити пропоновані слова.`,
  },

  learn_top_usage: {
    en: (v: any) => `Usage: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    uk: (v: any) => `Використання: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
  },

  learn_top_how_many: {
    en: (v: any) => `How many words?\n\nUsage: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    uk: (v: any) => `Скільки слів?\n\nВикористання: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
  },

  learn_top_n_positive: {
    en: "N must be a positive number.",
    uk: "N має бути додатним числом.",
  },

  learn_one_at_a_time: {
    en: (v: any) => `Please add one word at a time.\n\n(Or use <code>/learn top N [${v.codes}]</code> to bulk-add.)`,
    uk: (v: any) => `Додавай по одному слову за раз.\n\n(Або скористайся <code>/learn top N [${v.codes}]</code>, щоб додати пакетом.)`,
  },

  learn_no_partner_for_lang: {
    en: (v: any) => `Detected "${v.word}" as ${v.lang}, but couldn't find a partner to add the card for.`,
    uk: (v: any) => `Визначив "${v.word}" як ${v.lang}, але не знайшов партнера, кому додати картку.`,
  },

  forget_usage: {
    en: "Usage: <code>/forget &lt;word&gt;</code>\n\nRemoves a word from the matching deck.",
    uk: "Використання: <code>/forget &lt;слово&gt;</code>\n\nПрибирає слово з відповідної колоди.",
  },

  forget_one_at_a_time: {
    en: "Please remove one word at a time.",
    uk: "Прибирай по одному слову за раз.",
  },

  export_no_rows: {
    en: "Nothing has exportable rows yet (vocabulary records may be missing).",
    uk: "Поки немає рядків для експорту (можливо, бракує записів у словнику).",
  },

  learn_lang_unrecognized: {
    en: (v: any) => `Didn't recognise "${v.token}" as a language. Use ${v.codes}.`,
    uk: (v: any) => `Не розпізнав "${v.token}" як мову. Використай ${v.codes}.`,
  },

  learn_no_learner: {
    en: (v: any) => `Couldn't find anyone learning ${v.lang}. No deck to add to.`,
    uk: (v: any) => `Не знайшов нікого, хто вивчає ${v.lang}. Немає колоди, куди додати.`,
  },

  learn_none_unlearned_own: {
    en: (v: any) => `No unlearned ${v.lang} words available for your deck.\n\nRun /vocab to see the current top words.`,
    uk: (v: any) => `Немає невивчених ${v.lang} слів для твоєї колоди.\n\nЗапусти /vocab, щоб побачити поточні найчастіші слова.`,
  },

  learn_none_unlearned_partner: {
    en: (v: any) => `No unlearned ${v.lang} words available for ${v.name}'s deck.\n\nRun /vocab to see the current top words.`,
    uk: (v: any) => `Немає невивчених ${v.lang} слів для колоди ${v.name}.\n\nЗапусти /vocab, щоб побачити поточні найчастіші слова.`,
  },

  learn_added_top_own: {
    en: (v: any) => `✅ Added ${v.n} ${v.lang} word${v.n === 1 ? "" : "s"} to your ${v.deck} deck:`,
    uk: (v: any) => `✅ Додав ${v.n} ${plUk(v.n, "слово", "слова", "слів")} (${v.lang}) до твоєї колоди ${v.deck}:`,
  },

  learn_added_top_partner: {
    en: (v: any) => `✅ Added ${v.n} ${v.lang} word${v.n === 1 ? "" : "s"} to ${v.name}'s ${v.deck} deck:`,
    uk: (v: any) => `✅ Додав ${v.n} ${plUk(v.n, "слово", "слова", "слів")} (${v.lang}) до колоди ${v.name} ${v.deck}:`,
  },

  learn_capped: {
    en: (v: any) => `\n\n<i>(Capped at ${v.max}; requested ${v.requested}.)</i>`,
    uk: (v: any) => `\n\n<i>(Обмежено до ${v.max}; запитано ${v.requested}.)</i>`,
  },

  learn_export_hint_own: {
    en: "\n\n<i>Run /export when you want to import into Anki.</i>",
    uk: "\n\n<i>Запусти /export, коли захочеш імпортувати в Anki.</i>",
  },

  learn_export_hint_partner: {
    en: (v: any) => `\n\n<i>${v.name} can run /export to import into Anki.</i>`,
    uk: (v: any) => `\n\n<i>${v.name} може запустити /export, щоб імпортувати в Anki.</i>`,
  },

  vocab_word_not_found: {
    en: (v: any) => `Couldn't find "${v.word}" in the ${v.lang} vocabulary.\n\nRun /vocab to see words that have appeared in your conversations.`,
    uk: (v: any) => `Не знайшов "${v.word}" у словнику (${v.lang}).\n\nЗапусти /vocab, щоб побачити слова з ваших розмов.`,
  },

  vocab_word_not_found_short: {
    en: (v: any) => `Couldn't find "${v.word}" in the ${v.lang} vocabulary.`,
    uk: (v: any) => `Не знайшов "${v.word}" у словнику (${v.lang}).`,
  },

  learn_already_own: {
    en: (v: any) => `"${v.word}" is already in your ${v.deck} deck.`,
    uk: (v: any) => `"${v.word}" уже є у твоїй колоді ${v.deck}.`,
  },

  learn_already_partner: {
    en: (v: any) => `"${v.word}" is already in ${v.name}'s ${v.deck} deck.`,
    uk: (v: any) => `"${v.word}" уже є в колоді ${v.name} ${v.deck}.`,
  },

  learn_added_own: {
    en: (v: any) => v.n === 1 ? `✅ Added to your ${v.deck} deck:` : `✅ Added ${v.n} entries to your ${v.deck} deck:`,
    uk: (v: any) => v.n === 1 ? `✅ Додав до твоєї колоди ${v.deck}:` : `✅ Додав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} до твоєї колоди ${v.deck}:`,
  },

  learn_added_partner: {
    en: (v: any) => v.n === 1 ? `✅ Added to ${v.name}'s ${v.deck} deck:` : `✅ Added ${v.n} entries to ${v.name}'s ${v.deck} deck:`,
    uk: (v: any) => v.n === 1 ? `✅ Додав до колоди ${v.name} ${v.deck}:` : `✅ Додав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} до колоди ${v.name} ${v.deck}:`,
  },

  learn_matched_as: {
    en: (v: any) => `\n\nMatched as "${v.lemma}" (dictionary form of "${v.arg}").`,
    uk: (v: any) => `\n\nЗнайдено як "${v.lemma}" (словникова форма "${v.arg}").`,
  },

  learn_skipped: {
    en: (v: any) => `\n\n<i>(${v.n} already in deck, skipped)</i>`,
    uk: (v: any) => `\n\n<i>(${v.n} уже в колоді, пропущено)</i>`,
  },

  forget_not_in_own: {
    en: (v: any) => `"${v.word}" wasn't in your ${v.deck} deck.`,
    uk: (v: any) => `"${v.word}" не було у твоїй колоді ${v.deck}.`,
  },

  forget_not_in_partner: {
    en: (v: any) => `"${v.word}" wasn't in ${v.name}'s ${v.deck} deck.`,
    uk: (v: any) => `"${v.word}" не було в колоді ${v.name} ${v.deck}.`,
  },

  forget_removed_own: {
    en: (v: any) => v.n === 1 ? `➖ Removed from your ${v.deck} deck:` : `➖ Removed ${v.n} entries from your ${v.deck} deck:`,
    uk: (v: any) => v.n === 1 ? `➖ Прибрав із твоєї колоди ${v.deck}:` : `➖ Прибрав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} із твоєї колоди ${v.deck}:`,
  },

  forget_removed_partner: {
    en: (v: any) => v.n === 1 ? `➖ Removed from ${v.name}'s ${v.deck} deck:` : `➖ Removed ${v.n} entries from ${v.name}'s ${v.deck} deck:`,
    uk: (v: any) => v.n === 1 ? `➖ Прибрав із колоди ${v.name} ${v.deck}:` : `➖ Прибрав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} із колоди ${v.name} ${v.deck}:`,
  },

  forget_anki_note: {
    en: "\n\n<i>If this card was already imported into Anki, delete it there too.</i>",
    uk: "\n\n<i>Якщо цю картку вже імпортовано в Anki, видали її і там.</i>",
  },

  export_building: {
    en: "⏳ Building your export…",
    uk: "⏳ Готую експорт…",
  },

  export_failed: {
    en: "Couldn't build the export. Check function logs.",
    uk: "Не вдалося зібрати експорт. Перевір логи функції.",
  },

  export_empty: {
    en: "Nothing to export yet.\n\nUse /vocab and /learn to add words, or turn on /capybara so your corrections build a grammar deck.",
    uk: "Поки нема чого експортувати.\n\nСкористайся /vocab і /learn, щоб додати слова, або увімкни /capybara — і твої виправлення побудують граматичну колоду.",
  },

  mistakes_header: {
    en: "📝 <b>Your recent mistakes</b>\nTap the blur to check yourself.",
    uk: "📝 <b>Твої останні помилки</b>\nТоркнись розмиття, щоб перевірити себе.",
  },

  mistakes_footer: {
    en: "<i>These are also in /export, tagged by mistake type.</i>",
    uk: "<i>Вони також є в /export, позначені за типом помилки.</i>",
  },

  mistakes_you_wrote: {
    en: (v: any) => `(you wrote: ${v.wrote})`,
    uk: (v: any) => `(ти написав(ла): ${v.wrote})`,
  },

  mistakes_none: {
    en: "Nothing to review — I haven't caught any mistakes yet. Keep writing in the language you're learning and they'll turn up here.",
    uk: "Нема чого повторювати — я поки не помітив помилок. Продовжуй писати мовою, яку вивчаєш, і вони з'являться тут.",
  },

  mistakes_off: {
    en: "Grammar help is off, so I'm not noting your mistakes. Turn it on with /capybara and they'll collect here as you write.",
    uk: "Допомога з граматикою вимкнена, тож я не занотовую помилки. Увімкни її через /capybara — і вони збиратимуться тут.",
  },

  mistakes_failed: {
    en: "Couldn't fetch your corrections. Check function logs.",
    uk: "Не вдалося отримати твої виправлення. Перевір логи функції.",
  },

  msg_not_in_corpus: {
    en: "Couldn't find that message in the corpus.",
    uk: "Не знайшов цього повідомлення в корпусі.",
  },

  reconcile_usage: {
    en: "Reply to a message with /reconcile to exclude it from /recap results.",
    uk: "Відповідай на повідомлення командою /reconcile, щоб виключити його з результатів /recap.",
  },

  reconcile_not_found: {
    en: "Couldn't find that message in the corpus. /reconcile works on replies to messages I've stored in this conversation.",
    uk: "Не знайшов цього повідомлення в корпусі. /reconcile працює з відповідями на повідомлення, які я зберіг у цій розмові.",
  },

  reconcile_failed: {
    en: "Couldn't reconcile that message. Check function logs.",
    uk: "Не вдалося виключити це повідомлення. Перевір логи функції.",
  },

  reconcile_ok: {
    en: "✅ Reconciled. This message won't appear in /recap results.",
    uk: "✅ Виключено. Це повідомлення не з'являтиметься в результатах /recap.",
  },

  reconcile_already: {
    en: "Already reconciled.",
    uk: "Уже виключено.",
  },

  restore_usage: {
    en: "Reply to a message with /restore to bring it back into /recap results.",
    uk: "Відповідай на повідомлення командою /restore, щоб повернути його в результати /recap.",
  },

  restore_failed: {
    en: "Couldn't restore that message. Check function logs.",
    uk: "Не вдалося відновити це повідомлення. Перевір логи функції.",
  },

  restore_not_reconciled: {
    en: "That message wasn't reconciled.",
    uk: "Це повідомлення не було виключене.",
  },

  restore_ok: {
    en: "✅ Restored. This message is back in /recap.",
    uk: "✅ Відновлено. Це повідомлення знову в /recap.",
  },

  pin_usage: {
    en: "Reply to a message with /pin to mark it as meaningful.",
    uk: "Відповідай на повідомлення командою /pin, щоб позначити його як важливе.",
  },

  pin_failed: {
    en: "Couldn't pin that message. Check function logs.",
    uk: "Не вдалося закріпити це повідомлення. Перевір логи функції.",
  },

  pin_ok: {
    en: "📌 Pinned.",
    uk: "📌 Закріплено.",
  },

  pin_already: {
    en: "Already pinned.",
    uk: "Уже закріплено.",
  },

  unpin_usage: {
    en: "Reply to a pinned message with /unpin to remove the pin.",
    uk: "Відповідай на закріплене повідомлення командою /unpin, щоб зняти позначку.",
  },

  unpin_failed: {
    en: "Couldn't unpin that message. Check function logs.",
    uk: "Не вдалося відкріпити це повідомлення. Перевір логи функції.",
  },

  unpin_not_pinned: {
    en: "That message wasn't pinned.",
    uk: "Це повідомлення не було закріплене.",
  },

  unpin_ok: {
    en: "✅ Unpinned.",
    uk: "✅ Відкріплено.",
  },

  pinned_fetch_failed: {
    en: "Couldn't fetch pinned messages. Check function logs.",
    uk: "Не вдалося отримати закріплені повідомлення. Перевір логи функції.",
  },

  pinned_empty: {
    en: "No pinned messages yet. Reply to any message with /pin to mark it.",
    uk: "Поки немає закріплених повідомлень. Відповідай на будь-яке командою /pin, щоб позначити.",
  },

  pinned_header: {
    en: (v: any) => `📌 Pinned messages (${v.n}):`,
    uk: (v: any) => `📌 Закріплені повідомлення (${v.n}):`,
  },

  note_usage: {
    en: "Usage: /note &lt;note&gt; (or /remember)\n\nAdds a private note that only your own /ask will find.",
    uk: "Використання: /note &lt;нотатка&gt; (або /remember)\n\nДодає приватну нотатку, яку знайде лише твій власний /ask.",
  },

  note_save_failed: {
    en: "Couldn't save that note. Check function logs.",
    uk: "Не вдалося зберегти нотатку. Перевір логи функції.",
  },

  note_saved: {
    en: "📝 Noted.",
    uk: "📝 Записав.",
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
