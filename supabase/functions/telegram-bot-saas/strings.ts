// Customer-facing copy for telegram-bot-saas, in the eight languages the registry offers.
//
// WHY THIS FILE EXISTS
// The language picker offered eight languages and then talked to the customer in English
// whichever one they picked. On a product whose entire claim is "write in your language
// and be read in theirs", opening in the wrong language is not a cosmetic bug.
//
// TRANSLATION PROVENANCE -- read before trusting this file
//   en, uk  reviewed by the maintainer.
//   es, fr, de, it, pt, pl  MACHINE-WRITTEN AND UNREVIEWED. Nobody who speaks them has
//   read them. They are almost certainly serviceable and may well contain phrasing a
//   native speaker would not use. That matters more here than on most products, because
//   this one sells language quality. If a speaker ever reviews one, the fix is this file
//   and nothing else.
//
// A MISSING translation degrades safely -- t() falls back to English and warns. A WRONG
// one does not announce itself, which is why the provenance is recorded rather than
// assumed.
//
// SHAPE
// Key-major: all eight translations of one string sit together, so a missing language is
// visible at a glance rather than discovered by a customer. Entries are plain strings, or
// functions where a value is interpolated -- interpolation is then just code, there is no
// template parser to write, and the compiler catches a missing variable. Functions also
// carry plural rules, which differ per language (Ukrainian and Polish have three forms
// where English has two).
//
// Superadmin surfaces (/tenants, /diag, the grinds) are deliberately absent: one operator,
// who reads English.

export type Lang = "en" | "uk" | "es" | "fr" | "de" | "it" | "pt" | "pl";
export const LANGS: Lang[] = ["en", "uk", "es", "fr", "de", "it", "pt", "pl"];

type Entry = string | ((v: any) => string);
type Row = Record<Lang, Entry>;

// Ukrainian/Polish plural selector: 1, few (2-4), many. Used where a count is shown.
function plUk(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const STRINGS: Record<string, Row> = {
  // ---------------------------------------------------------------- intro / plans
  intro_body: {
    en: "<b>Capybara</b> turns real conversations into a language you actually learn.\n\n" +
        "It lives in Telegram and translates between your two languages, so you can write in yours and be read in theirs from day one — then builds a study deck out of what was genuinely said.\n\n" +
        "Two things a translation app doesn't do:\n\n" +
        "• <b>Flashcards from your own sentences</b> — every word in the sense it was actually used, not the dictionary's first guess. Exports to Anki.\n" +
        "• <b>A searchable record</b> — ask \"when did we book the flights?\" and it finds it.\n\n" +
        "<b>Use it with a language partner</b>, and you each read the other in your own language while both decks fill up. <b>Or use it solo</b> — write in the language you're learning, see it corrected and translated, and study what you got wrong.",
    uk: "<b>Capybara</b> перетворює справжні розмови на мову, яку ти справді вивчаєш.\n\n" +
        "Бот живе в Telegram і перекладає між твоїми двома мовами, тож ти пишеш своєю, а тебе читають їхньою — з першого дня. А з того, що було сказано насправді, він складає колоду для навчання.\n\n" +
        "Дві речі, яких не робить звичайний перекладач:\n\n" +
        "• <b>Картки з твоїх власних речень</b> — кожне слово в тому значенні, у якому його вжили, а не перше зі словника. Експорт в Anki.\n" +
        "• <b>Пошук по всьому написаному</b> — запитай «коли ми бронювали квитки?», і бот знайде.\n\n" +
        "<b>Користуйся разом із мовним партнером</b> — кожен читає іншого своєю мовою, а обидві колоди наповнюються. <b>Або сам</b> — пиши мовою, яку вивчаєш, дивись на виправлення та переклад і вчи те, де помилився.",
    es: "<b>Capybara</b> convierte conversaciones reales en un idioma que de verdad aprendes.\n\n" +
        "Vive en Telegram y traduce entre vuestros dos idiomas, así escribes en el tuyo y te leen en el suyo desde el primer día — y con lo que se dijo de verdad construye un mazo de estudio.\n\n" +
        "Dos cosas que una app de traducción no hace:\n\n" +
        "• <b>Tarjetas a partir de tus propias frases</b> — cada palabra en el sentido en que se usó, no la primera acepción del diccionario. Se exporta a Anki.\n" +
        "• <b>Un registro que puedes buscar</b> — pregunta «¿cuándo reservamos los vuelos?» y lo encuentra.\n\n" +
        "<b>Úsalo con un compañero de idioma</b> y cada uno lee al otro en su propia lengua mientras los dos mazos se llenan. <b>O úsalo solo</b> — escribe en el idioma que aprendes, ve la corrección y la traducción, y estudia lo que fallaste.",
    fr: "<b>Capybara</b> transforme de vraies conversations en une langue que tu apprends vraiment.\n\n" +
        "Il vit dans Telegram et traduit entre vos deux langues : tu écris dans la tienne et on te lit dans la sienne, dès le premier jour — puis il construit un jeu de cartes à partir de ce qui a réellement été dit.\n\n" +
        "Deux choses qu'une appli de traduction ne fait pas :\n\n" +
        "• <b>Des cartes tirées de tes propres phrases</b> — chaque mot dans le sens où il a été employé, pas la première entrée du dictionnaire. Export vers Anki.\n" +
        "• <b>Un historique consultable</b> — demande « quand a-t-on réservé les vols ? » et il le retrouve.\n\n" +
        "<b>Utilise-le avec un partenaire linguistique</b> : chacun lit l'autre dans sa propre langue pendant que les deux jeux se remplissent. <b>Ou utilise-le seul</b> — écris dans la langue que tu apprends, vois la correction et la traduction, et révise tes erreurs.",
    de: "<b>Capybara</b> macht aus echten Gesprächen eine Sprache, die du wirklich lernst.\n\n" +
        "Es lebt in Telegram und übersetzt zwischen euren beiden Sprachen — du schreibst in deiner, du wirst in ihrer gelesen, vom ersten Tag an. Aus dem, was tatsächlich gesagt wurde, baut es einen Lernstapel.\n\n" +
        "Zwei Dinge, die eine Übersetzungs-App nicht tut:\n\n" +
        "• <b>Karteikarten aus deinen eigenen Sätzen</b> — jedes Wort in der Bedeutung, in der es benutzt wurde, nicht die erste aus dem Wörterbuch. Export nach Anki.\n" +
        "• <b>Ein durchsuchbares Archiv</b> — frag „wann haben wir die Flüge gebucht?“ und es findet die Stelle.\n\n" +
        "<b>Nutz es mit einem Sprachpartner</b>: Jeder liest den anderen in der eigenen Sprache, und beide Stapel füllen sich. <b>Oder allein</b> — schreib in der Sprache, die du lernst, sieh Korrektur und Übersetzung, und lern aus deinen Fehlern.",
    it: "<b>Capybara</b> trasforma conversazioni vere in una lingua che impari davvero.\n\n" +
        "Vive in Telegram e traduce tra le vostre due lingue: tu scrivi nella tua e ti leggono nella loro, dal primo giorno — e da ciò che è stato detto davvero costruisce un mazzo di studio.\n\n" +
        "Due cose che un'app di traduzione non fa:\n\n" +
        "• <b>Flashcard dalle tue stesse frasi</b> — ogni parola nel senso in cui è stata usata, non la prima voce del dizionario. Esporta in Anki.\n" +
        "• <b>Un archivio ricercabile</b> — chiedi «quando abbiamo prenotato i voli?» e lo trova.\n\n" +
        "<b>Usalo con un partner linguistico</b>: ognuno legge l'altro nella propria lingua mentre entrambi i mazzi si riempiono. <b>Oppure da solo</b> — scrivi nella lingua che stai imparando, guarda correzione e traduzione, e studia dove hai sbagliato.",
    pt: "<b>Capybara</b> transforma conversas reais numa língua que aprendes de verdade.\n\n" +
        "Vive no Telegram e traduz entre as vossas duas línguas: escreves na tua e leem-te na deles, desde o primeiro dia — e do que foi realmente dito constrói um baralho de estudo.\n\n" +
        "Duas coisas que uma app de tradução não faz:\n\n" +
        "• <b>Cartões a partir das tuas próprias frases</b> — cada palavra no sentido em que foi usada, não a primeira entrada do dicionário. Exporta para o Anki.\n" +
        "• <b>Um registo pesquisável</b> — pergunta «quando reservámos os voos?» e ele encontra.\n\n" +
        "<b>Usa-o com um parceiro de língua</b>: cada um lê o outro na sua própria língua enquanto os dois baralhos se enchem. <b>Ou usa-o sozinho</b> — escreve na língua que estás a aprender, vê a correção e a tradução, e estuda onde erraste.",
    pl: "<b>Capybara</b> zamienia prawdziwe rozmowy w język, którego naprawdę się uczysz.\n\n" +
        "Działa w Telegramie i tłumaczy między waszymi dwoma językami: piszesz w swoim, a czytają cię w swoim — od pierwszego dnia. Z tego, co faktycznie zostało powiedziane, buduje talię do nauki.\n\n" +
        "Dwie rzeczy, których nie robi aplikacja do tłumaczenia:\n\n" +
        "• <b>Fiszki z twoich własnych zdań</b> — każde słowo w znaczeniu, w jakim zostało użyte, a nie pierwsze ze słownika. Eksport do Anki.\n" +
        "• <b>Przeszukiwalny zapis</b> — zapytaj „kiedy rezerwowaliśmy loty?”, a bot znajdzie.\n\n" +
        "<b>Używaj z partnerem językowym</b> — każde z was czyta drugie we własnym języku, a obie talie się zapełniają. <b>Albo sam</b> — pisz w języku, którego się uczysz, patrz na poprawki i tłumaczenie, i ucz się na błędach.",
  },

  intro_trial_note: {
    en: "<i>Try it free below — five messages, no card. Trial messages are translated and not stored.</i>",
    uk: "<i>Спробуй безкоштовно нижче — п'ять повідомлень, без картки. Повідомлення з пробного періоду перекладаються і не зберігаються.</i>",
    es: "<i>Pruébalo gratis abajo — cinco mensajes, sin tarjeta. Los mensajes de prueba se traducen y no se guardan.</i>",
    fr: "<i>Essaie gratuitement ci-dessous — cinq messages, sans carte. Les messages d'essai sont traduits et non conservés.</i>",
    de: "<i>Unten kostenlos testen — fünf Nachrichten, ohne Karte. Testnachrichten werden übersetzt und nicht gespeichert.</i>",
    it: "<i>Provalo gratis qui sotto — cinque messaggi, senza carta. I messaggi di prova vengono tradotti e non conservati.</i>",
    pt: "<i>Experimenta grátis abaixo — cinco mensagens, sem cartão. As mensagens de teste são traduzidas e não guardadas.</i>",
    pl: "<i>Wypróbuj za darmo poniżej — pięć wiadomości, bez karty. Wiadomości próbne są tłumaczone i nie są przechowywane.</i>",
  },

  plan_standard: {
    en: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} messages/month. Flashcards from what <b>you</b> write.`,
    uk: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} повідомлень на місяць. Картки з того, що пишеш <b>ти</b>.`,
    es: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} mensajes al mes. Tarjetas de lo que escribes <b>tú</b>.`,
    fr: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} messages par mois. Des cartes à partir de ce que <b>tu</b> écris.`,
    de: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} Nachrichten pro Monat. Karten aus dem, was <b>du</b> schreibst.`,
    it: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} messaggi al mese. Flashcard da ciò che scrivi <b>tu</b>.`,
    pt: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} mensagens por mês. Cartões do que <b>tu</b> escreves.`,
    pl: (v) => `<b>Standard</b> — ${v.price}\n${v.quota} wiadomości miesięcznie. Fiszki z tego, co piszesz <b>ty</b>.`,
  },

  plan_pro: {
    en: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} messages/month. Flashcards from <b>both</b> sides — what you write and what you read. Roughly double the deck.`,
    uk: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} повідомлень на місяць. Картки з <b>обох</b> боків — і з того, що пишеш, і з того, що читаєш. Приблизно вдвічі більша колода.`,
    es: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} mensajes al mes. Tarjetas de <b>ambos</b> lados — lo que escribes y lo que lees. Casi el doble de mazo.`,
    fr: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} messages par mois. Des cartes des <b>deux</b> côtés — ce que tu écris et ce que tu lis. Environ deux fois plus de cartes.`,
    de: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} Nachrichten pro Monat. Karten von <b>beiden</b> Seiten — was du schreibst und was du liest. Etwa doppelt so viele.`,
    it: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} messaggi al mese. Flashcard da <b>entrambi</b> i lati — ciò che scrivi e ciò che leggi. Circa il doppio del mazzo.`,
    pt: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} mensagens por mês. Cartões dos <b>dois</b> lados — o que escreves e o que lês. Cerca do dobro do baralho.`,
    pl: (v) => `<b>Pro</b> — ${v.price}\n${v.quota} wiadomości miesięcznie. Fiszki z <b>obu</b> stron — z tego, co piszesz, i z tego, co czytasz. Mniej więcej dwa razy większa talia.`,
  },

  plan_covers_both: {
    en: "One subscription covers you and a language partner.",
    uk: "Одна підписка покриває тебе і мовного партнера.",
    es: "Una suscripción cubre a ti y a un compañero de idioma.",
    fr: "Un seul abonnement couvre toi et un partenaire linguistique.",
    de: "Ein Abo deckt dich und einen Sprachpartner ab.",
    it: "Un abbonamento copre te e un partner linguistico.",
    pt: "Uma subscrição cobre-te a ti e a um parceiro de língua.",
    pl: "Jedna subskrypcja obejmuje ciebie i partnera językowego.",
  },

  plans_after_paying: {
    en: "After paying you'll get a link that sets everything up in three taps — plus one to invite a language partner, whenever you want it.",
    uk: "Після оплати ти отримаєш посилання, яке все налаштує за три дотики — і ще одне, щоб запросити мовного партнера, коли захочеш.",
    es: "Después de pagar recibirás un enlace que lo configura todo en tres toques — y otro para invitar a un compañero de idioma, cuando quieras.",
    fr: "Après le paiement, tu recevras un lien qui configure tout en trois touches — et un autre pour inviter un partenaire linguistique, quand tu veux.",
    de: "Nach der Zahlung bekommst du einen Link, der alles in drei Tipps einrichtet — und einen zweiten, um jederzeit einen Sprachpartner einzuladen.",
    it: "Dopo il pagamento riceverai un link che configura tutto in tre tocchi — e un altro per invitare un partner linguistico, quando vuoi.",
    pt: "Depois de pagares recebes um link que configura tudo em três toques — e outro para convidar um parceiro de língua, quando quiseres.",
    pl: "Po opłaceniu dostaniesz link, który wszystko ustawi w trzech dotknięciach — i drugi, żeby zaprosić partnera językowego, kiedy zechcesz.",
  },

  plans_not_open: {
    en: "Subscriptions aren't open through the bot just yet — message the person who sent you here and they'll get you set up.",
    uk: "Підписки через бота поки що недоступні — напиши тому, хто дав тобі це посилання, і тебе налаштують.",
    es: "Las suscripciones aún no están abiertas en el bot — escribe a quien te haya enviado aquí y te configurará.",
    fr: "Les abonnements ne sont pas encore ouverts via le bot — écris à la personne qui t'a envoyé ici, elle te configurera.",
    de: "Abos sind über den Bot noch nicht offen — schreib der Person, die dich hergeschickt hat, sie richtet dich ein.",
    it: "Gli abbonamenti non sono ancora aperti nel bot — scrivi a chi ti ha mandato qui e ti configurerà.",
    pt: "As subscrições ainda não estão abertas no bot — escreve a quem te enviou para aqui e trata de te configurar.",
    pl: "Subskrypcje przez bota jeszcze nie działają — napisz do osoby, która cię tu wysłała, a wszystko ustawi.",
  },

  btn_try_free: {
    en: "✨ Try it free", uk: "✨ Спробувати безкоштовно", es: "✨ Probar gratis",
    fr: "✨ Essayer gratuitement", de: "✨ Kostenlos testen", it: "✨ Prova gratis",
    pt: "✨ Experimentar grátis", pl: "✨ Wypróbuj za darmo",
  },

  // ---------------------------------------------------------------- trial
  trial_pick_native: {
    en: "Which language do you speak natively?",
    uk: "Яка мова для тебе рідна?",
    es: "¿Cuál es tu lengua materna?",
    fr: "Quelle est ta langue maternelle ?",
    de: "Welche Sprache ist deine Muttersprache?",
    it: "Qual è la tua lingua madre?",
    pt: "Qual é a tua língua materna?",
    pl: "Jaki jest twój język ojczysty?",
  },

  trial_pick_learning: {
    en: "And which are you learning?",
    uk: "А яку вивчаєш?",
    es: "¿Y cuál estás aprendiendo?",
    fr: "Et laquelle apprends-tu ?",
    de: "Und welche lernst du?",
    it: "E quale stai imparando?",
    pt: "E qual estás a aprender?",
    pl: "A jakiego się uczysz?",
  },

  trial_pair_set: {
    en: (v) => `Set: ${v.native} ↔ ${v.learning}.\n\nSend me a message in either language and I'll translate it. You've got ${v.limit} free — the first one comes with the flashcards it would add to your deck.`,
    uk: (v) => `Готово: ${v.native} ↔ ${v.learning}.\n\nНадішли мені повідомлення будь-якою з цих мов, і я перекладу. У тебе ${v.limit} безкоштовних — до першого додам картки, які потрапили б у твою колоду.`,
    es: (v) => `Listo: ${v.native} ↔ ${v.learning}.\n\nEnvíame un mensaje en cualquiera de los dos idiomas y lo traduzco. Tienes ${v.limit} gratis — con el primero verás las tarjetas que añadiría a tu mazo.`,
    fr: (v) => `C'est réglé : ${v.native} ↔ ${v.learning}.\n\nÉcris-moi dans l'une des deux langues et je traduis. Tu en as ${v.limit} gratuits — le premier arrive avec les cartes qu'il ajouterait à ton jeu.`,
    de: (v) => `Eingestellt: ${v.native} ↔ ${v.learning}.\n\nSchreib mir in einer der beiden Sprachen, ich übersetze. Du hast ${v.limit} gratis — bei der ersten siehst du die Karten, die in deinen Stapel kämen.`,
    it: (v) => `Fatto: ${v.native} ↔ ${v.learning}.\n\nScrivimi in una delle due lingue e traduco. Ne hai ${v.limit} gratis — con il primo vedrai le flashcard che aggiungerebbe al tuo mazzo.`,
    pt: (v) => `Pronto: ${v.native} ↔ ${v.learning}.\n\nEnvia-me uma mensagem em qualquer uma das línguas e eu traduzo. Tens ${v.limit} grátis — na primeira mostro os cartões que iria juntar ao teu baralho.`,
    pl: (v) => `Ustawione: ${v.native} ↔ ${v.learning}.\n\nNapisz do mnie w jednym z tych języków, a przetłumaczę. Masz ${v.limit} za darmo — przy pierwszej pokażę fiszki, które trafiłyby do twojej talii.`,
  },

  trial_left: {
    en: (v) => `${v.n} free ${v.n === 1 ? "message" : "messages"} left.`,
    uk: (v) => `Залишилось ${v.n} безкоштовних ${plUk(v.n, "повідомлення", "повідомлення", "повідомлень")}.`,
    es: (v) => `Te ${v.n === 1 ? "queda" : "quedan"} ${v.n} ${v.n === 1 ? "mensaje gratis" : "mensajes gratis"}.`,
    fr: (v) => `Il te reste ${v.n} message${v.n === 1 ? "" : "s"} gratuit${v.n === 1 ? "" : "s"}.`,
    de: (v) => `Noch ${v.n} ${v.n === 1 ? "kostenlose Nachricht" : "kostenlose Nachrichten"} übrig.`,
    it: (v) => `${v.n === 1 ? "Ti resta" : "Ti restano"} ${v.n} ${v.n === 1 ? "messaggio gratis" : "messaggi gratis"}.`,
    pt: (v) => `${v.n === 1 ? "Resta-te" : "Restam-te"} ${v.n} ${v.n === 1 ? "mensagem grátis" : "mensagens grátis"}.`,
    pl: (v) => `${plUk(v.n, "Została", "Zostały", "Zostało")} ${v.n} darmowa ${plUk(v.n, "wiadomość", "wiadomości", "wiadomości")}.`,
  },

  trial_flashcards_header: {
    en: "Flashcards this would add to your deck:",
    uk: "Картки, які це додало б до твоєї колоди:",
    es: "Tarjetas que esto añadiría a tu mazo:",
    fr: "Cartes que cela ajouterait à ton jeu :",
    de: "Karten, die das deinem Stapel hinzufügen würde:",
    it: "Flashcard che questo aggiungerebbe al tuo mazzo:",
    pt: "Cartões que isto acrescentaria ao teu baralho:",
    pl: "Fiszki, które to dodałoby do twojej talii:",
  },

  trial_text_only: {
    en: "Voice, photos and files are part of the subscription — the free trial is text only.",
    uk: "Голосові, фото та файли доступні за підпискою — безкоштовна проба лише текстова.",
    es: "Las notas de voz, las fotos y los archivos son parte de la suscripción — la prueba gratuita es solo texto.",
    fr: "Les messages vocaux, les photos et les fichiers font partie de l'abonnement — l'essai gratuit est en texte uniquement.",
    de: "Sprachnachrichten, Fotos und Dateien gehören zum Abo — der kostenlose Test ist nur Text.",
    it: "Vocali, foto e file fanno parte dell'abbonamento — la prova gratuita è solo testo.",
    pt: "Mensagens de voz, fotos e ficheiros fazem parte da subscrição — a versão de teste é só texto.",
    pl: "Wiadomości głosowe, zdjęcia i pliki są częścią subskrypcji — darmowa próba jest tylko tekstowa.",
  },

  trial_too_long: {
    en: (v) => `That's a bit long for the free trial — try something under ${v.max} characters.`,
    uk: (v) => `Для безкоштовної проби це задовге — спробуй до ${v.max} символів.`,
    es: (v) => `Es un poco largo para la prueba gratuita — prueba con menos de ${v.max} caracteres.`,
    fr: (v) => `C'est un peu long pour l'essai gratuit — essaie avec moins de ${v.max} caractères.`,
    de: (v) => `Das ist für den kostenlosen Test etwas lang — versuch es mit weniger als ${v.max} Zeichen.`,
    it: (v) => `È un po' lungo per la prova gratuita — prova con meno di ${v.max} caratteri.`,
    pt: (v) => `É um pouco longo para a versão de teste — tenta com menos de ${v.max} caracteres.`,
    pl: (v) => `To trochę za długie na darmową próbę — spróbuj poniżej ${v.max} znaków.`,
  },

  trial_exhausted: {
    en: (v) => `That's your ${v.limit} free messages used. Hope it gave you a feel for it.`,
    uk: (v) => `Ти використав усі ${v.limit} безкоштовних повідомлень. Сподіваюсь, ти відчув, як це працює.`,
    es: (v) => `Has usado tus ${v.limit} mensajes gratis. Espero que te hayas hecho una idea.`,
    fr: (v) => `Tu as utilisé tes ${v.limit} messages gratuits. J'espère que ça t'a donné une idée.`,
    de: (v) => `Deine ${v.limit} kostenlosen Nachrichten sind aufgebraucht. Ich hoffe, du hast ein Gefühl dafür bekommen.`,
    it: (v) => `Hai usato i tuoi ${v.limit} messaggi gratuiti. Spero ti sia fatto un'idea.`,
    pt: (v) => `Usaste as tuas ${v.limit} mensagens grátis. Espero que tenhas ficado com uma ideia.`,
    pl: (v) => `Wykorzystałeś swoje ${v.limit} darmowych wiadomości. Mam nadzieję, że dało to obraz całości.`,
  },

  trial_daily_cap: {
    en: "The free trial has hit its limit for today — try again tomorrow, or skip the queue below.",
    uk: "Безкоштовна проба вичерпала денний ліміт — спробуй завтра або пропусти чергу нижче.",
    es: "La prueba gratuita ha alcanzado su límite de hoy — inténtalo mañana o sáltate la cola abajo.",
    fr: "L'essai gratuit a atteint sa limite du jour — réessaie demain, ou passe devant ci-dessous.",
    de: "Der kostenlose Test hat sein Tageslimit erreicht — versuch es morgen wieder, oder überspring die Warteschlange unten.",
    it: "La prova gratuita ha raggiunto il limite di oggi — riprova domani, o salta la coda qui sotto.",
    pt: "A versão de teste atingiu o limite de hoje — tenta amanhã, ou passa à frente aqui em baixo.",
    pl: "Darmowa próba wyczerpała dzienny limit — spróbuj jutro albo pomiń kolejkę poniżej.",
  },

  trial_translate_failed: {
    en: "I couldn't translate that one — try again in a moment.",
    uk: "Не вдалося перекласти — спробуй ще раз за хвилину.",
    es: "No he podido traducir eso — inténtalo de nuevo en un momento.",
    fr: "Je n'ai pas pu traduire — réessaie dans un instant.",
    de: "Das konnte ich nicht übersetzen — versuch es gleich noch mal.",
    it: "Non sono riuscito a tradurlo — riprova tra un momento.",
    pt: "Não consegui traduzir isso — tenta outra vez daqui a pouco.",
    pl: "Nie udało mi się tego przetłumaczyć — spróbuj za chwilę.",
  },

  generic_error: {
    en: "Something went wrong on my end. Try again in a moment.",
    uk: "Щось пішло не так з мого боку. Спробуй ще раз за хвилину.",
    es: "Algo ha fallado por mi parte. Inténtalo de nuevo en un momento.",
    fr: "Quelque chose a échoué de mon côté. Réessaie dans un instant.",
    de: "Bei mir ist etwas schiefgelaufen. Versuch es gleich noch mal.",
    it: "Qualcosa è andato storto da parte mia. Riprova tra un momento.",
    pt: "Algo correu mal do meu lado. Tenta outra vez daqui a pouco.",
    pl: "Coś poszło nie tak po mojej stronie. Spróbuj za chwilę.",
  },

  // ---------------------------------------------------------------- /start, /help
  start_greeting: {
    en: (v) => `Hi ${v.name}! Send me text or voice in ${v.a} or ${v.b} and I'll translate between them.`,
    uk: (v) => `Привіт, ${v.name}! Надсилай текст або голосове ${v.a} чи ${v.b} — я перекладатиму між ними.`,
    es: (v) => `¡Hola, ${v.name}! Mándame texto o voz en ${v.a} o ${v.b} y traduzco entre los dos.`,
    fr: (v) => `Salut ${v.name} ! Envoie-moi du texte ou un vocal en ${v.a} ou en ${v.b}, je traduis entre les deux.`,
    de: (v) => `Hi ${v.name}! Schick mir Text oder Sprachnachrichten auf ${v.a} oder ${v.b}, ich übersetze dazwischen.`,
    it: (v) => `Ciao ${v.name}! Mandami testo o vocali in ${v.a} o ${v.b} e traduco tra le due.`,
    pt: (v) => `Olá, ${v.name}! Envia-me texto ou voz em ${v.a} ou ${v.b} e eu traduzo entre as duas.`,
    pl: (v) => `Cześć, ${v.name}! Wysyłaj tekst albo głosówki po ${v.a} lub ${v.b}, a ja przetłumaczę.`,
  },
  start_media_solo: {
    en: "Send a photo, file, GIF, or audio with a caption and I'll translate the caption into your study corpus too.",
    uk: "Надішли фото, файл, GIF чи аудіо з підписом — я перекладу підпис і додам до твого корпусу.",
    es: "Envía una foto, archivo, GIF o audio con pie de foto y también traduciré el texto a tu corpus.",
    fr: "Envoie une photo, un fichier, un GIF ou un audio avec une légende : je traduirai aussi la légende dans ton corpus.",
    de: "Schick ein Foto, eine Datei, ein GIF oder Audio mit Bildunterschrift — ich übersetze die Unterschrift auch in deinen Korpus.",
    it: "Manda una foto, un file, una GIF o un audio con didascalia: tradurrò anche la didascalia nel tuo corpus.",
    pt: "Envia uma foto, ficheiro, GIF ou áudio com legenda e eu traduzo também a legenda para o teu corpus.",
    pl: "Wyślij zdjęcie, plik, GIF-a albo audio z podpisem — podpis też przetłumaczę do twojego korpusu.",
  },
  start_media_partner: {
    en: "You can also send photos, videos, files, stickers, GIFs, audio, locations, and contacts — I'll forward them to the other person, and translate any caption.",
    uk: "Можеш також надсилати фото, відео, файли, стікери, GIF, аудіо, геолокацію та контакти — я перешлю їх партнерові й перекладу підпис.",
    es: "También puedes enviar fotos, vídeos, archivos, stickers, GIFs, audio, ubicaciones y contactos — se los reenvío a la otra persona y traduzco el pie de foto.",
    fr: "Tu peux aussi envoyer photos, vidéos, fichiers, stickers, GIF, audio, positions et contacts — je les transmets à l'autre personne et je traduis la légende.",
    de: "Du kannst auch Fotos, Videos, Dateien, Sticker, GIFs, Audio, Standorte und Kontakte schicken — ich leite sie weiter und übersetze die Bildunterschrift.",
    it: "Puoi anche mandare foto, video, file, sticker, GIF, audio, posizioni e contatti — li inoltro all'altra persona e traduco la didascalia.",
    pt: "Também podes enviar fotos, vídeos, ficheiros, stickers, GIFs, áudio, localizações e contactos — reencaminho-os à outra pessoa e traduzo a legenda.",
    pl: "Możesz też wysyłać zdjęcia, filmy, pliki, naklejki, GIF-y, audio, lokalizacje i kontakty — prześlę je drugiej osobie i przetłumaczę podpis.",
  },
  start_tail_solo: {
    en: "Everything is saved as your personal study corpus, searchable with /ask.\n\nType /help to see what I can do.",
    uk: "Усе зберігається як твій особистий навчальний корпус, у якому можна шукати через /ask.\n\nНапиши /help, щоб побачити, що я вмію.",
    es: "Todo se guarda como tu corpus de estudio personal, que puedes buscar con /ask.\n\nEscribe /help para ver qué puedo hacer.",
    fr: "Tout est enregistré comme ton corpus d'étude personnel, consultable avec /ask.\n\nTape /help pour voir ce que je sais faire.",
    de: "Alles wird als dein persönlicher Lernkorpus gespeichert, durchsuchbar mit /ask.\n\nTipp /help, um zu sehen, was ich kann.",
    it: "Tutto viene salvato come il tuo corpus di studio personale, ricercabile con /ask.\n\nScrivi /help per vedere cosa so fare.",
    pt: "Tudo fica guardado como o teu corpus de estudo pessoal, pesquisável com /ask.\n\nEscreve /help para veres o que sei fazer.",
    pl: "Wszystko zapisuje się jako twój osobisty korpus do nauki, przeszukiwalny przez /ask.\n\nWpisz /help, żeby zobaczyć, co potrafię.",
  },
  start_tail_partner: {
    en: "Everything is saved as a study corpus.\n\nType /help to see what I can do.",
    uk: "Усе зберігається як навчальний корпус.\n\nНапиши /help, щоб побачити, що я вмію.",
    es: "Todo se guarda como corpus de estudio.\n\nEscribe /help para ver qué puedo hacer.",
    fr: "Tout est enregistré comme corpus d'étude.\n\nTape /help pour voir ce que je sais faire.",
    de: "Alles wird als Lernkorpus gespeichert.\n\nTipp /help, um zu sehen, was ich kann.",
    it: "Tutto viene salvato come corpus di studio.\n\nScrivi /help per vedere cosa so fare.",
    pt: "Tudo fica guardado como corpus de estudo.\n\nEscreve /help para veres o que sei fazer.",
    pl: "Wszystko zapisuje się jako korpus do nauki.\n\nWpisz /help, żeby zobaczyć, co potrafię.",
  },

  help_header: {
    en: "<b>Capybara commands</b>", uk: "<b>Команди Capybara</b>", es: "<b>Comandos de Capybara</b>",
    fr: "<b>Commandes Capybara</b>", de: "<b>Capybara-Befehle</b>", it: "<b>Comandi Capybara</b>",
    pt: "<b>Comandos do Capybara</b>", pl: "<b>Polecenia Capybary</b>",
  },
  help_decks: {
    en: (v) => `Two decks: a ${v.a} deck and a ${v.b} deck.`,
    uk: (v) => `Дві колоди: ${v.a} і ${v.b}.`,
    es: (v) => `Dos mazos: uno de ${v.a} y otro de ${v.b}.`,
    fr: (v) => `Deux jeux de cartes : un en ${v.a} et un en ${v.b}.`,
    de: (v) => `Zwei Stapel: ein ${v.a}-Stapel und ein ${v.b}-Stapel.`,
    it: (v) => `Due mazzi: uno di ${v.a} e uno di ${v.b}.`,
    pt: (v) => `Dois baralhos: um de ${v.a} e outro de ${v.b}.`,
    pl: (v) => `Dwie talie: ${v.a} i ${v.b}.`,
  },
  help_write_solo: {
    en: "Write or send a voice note — I translate between your two languages",
    uk: "Пиши або надсилай голосове — я перекладаю між твоїми двома мовами",
    es: "Escribe o manda un audio — traduzco entre tus dos idiomas",
    fr: "Écris ou envoie un vocal — je traduis entre tes deux langues",
    de: "Schreib oder schick eine Sprachnachricht — ich übersetze zwischen deinen beiden Sprachen",
    it: "Scrivi o manda un vocale — traduco tra le tue due lingue",
    pt: "Escreve ou manda um áudio — traduzo entre as tuas duas línguas",
    pl: "Pisz albo wyślij głosówkę — tłumaczę między twoimi dwoma językami",
  },
  help_write_partner: {
    en: "Write or send a voice note — I translate and forward it to your partner",
    uk: "Пиши або надсилай голосове — я перекладаю і пересилаю партнерові",
    es: "Escribe o manda un audio — traduzco y se lo reenvío a tu pareja",
    fr: "Écris ou envoie un vocal — je traduis et je le transmets à ton partenaire",
    de: "Schreib oder schick eine Sprachnachricht — ich übersetze und leite sie weiter",
    it: "Scrivi o manda un vocale — traduco e lo inoltro al tuo partner",
    pt: "Escreve ou manda um áudio — traduzo e reencaminho ao teu parceiro",
    pl: "Pisz albo wyślij głosówkę — przetłumaczę i prześlę partnerowi",
  },
  cmd_vocab: {
    en: "Most frequent words you haven't learned yet", uk: "Найчастіші слова, які ще не вивчені",
    es: "Las palabras más frecuentes que aún no has aprendido", fr: "Les mots les plus fréquents que tu n'as pas encore appris",
    de: "Die häufigsten Wörter, die du noch nicht gelernt hast", it: "Le parole più frequenti che non hai ancora imparato",
    pt: "As palavras mais frequentes que ainda não aprendeste", pl: "Najczęstsze słowa, których jeszcze nie znasz",
  },
  cmd_learn: {
    en: "Add a word to your deck", uk: "Додати слово до колоди", es: "Añadir una palabra a tu mazo",
    fr: "Ajouter un mot à ton jeu", de: "Ein Wort zu deinem Stapel hinzufügen", it: "Aggiungere una parola al mazzo",
    pt: "Adicionar uma palavra ao teu baralho", pl: "Dodaj słowo do talii",
  },
  cmd_learn_top: {
    en: "Bulk-add the top N words", uk: "Оптом додати N слів", es: "Añadir en bloque las N palabras principales",
    fr: "Ajouter en masse les N premiers mots", de: "Die Top-N-Wörter auf einmal hinzufügen", it: "Aggiungere in blocco le prime N parole",
    pt: "Adicionar em bloco as N principais palavras", pl: "Dodaj hurtem N najczęstszych słów",
  },
  cmd_forget: {
    en: "Remove a word from your deck", uk: "Видалити слово з колоди", es: "Quitar una palabra de tu mazo",
    fr: "Retirer un mot de ton jeu", de: "Ein Wort aus deinem Stapel entfernen", it: "Rimuovere una parola dal mazzo",
    pt: "Remover uma palavra do teu baralho", pl: "Usuń słowo z talii",
  },
  cmd_export: {
    en: "Download a CSV for Anki", uk: "Завантажити CSV для Anki", es: "Descargar un CSV para Anki",
    fr: "Télécharger un CSV pour Anki", de: "Eine CSV für Anki herunterladen", it: "Scaricare un CSV per Anki",
    pt: "Descarregar um CSV para o Anki", pl: "Pobierz CSV do Anki",
  },
  cmd_capybara: {
    en: "Grammar checking for the language you're learning (on/off)",
    uk: "Перевірка граматики мови, яку вивчаєш (увімк/вимк)",
    es: "Corrección gramatical del idioma que aprendes (activar/desactivar)",
    fr: "Correction grammaticale de la langue que tu apprends (activer/désactiver)",
    de: "Grammatikprüfung für die Sprache, die du lernst (an/aus)",
    it: "Correzione grammaticale della lingua che stai imparando (on/off)",
    pt: "Correção gramatical da língua que estás a aprender (ligar/desligar)",
    pl: "Sprawdzanie gramatyki języka, którego się uczysz (wł./wył.)",
  },
  help_memory_header: {
    en: "<b>Conversation memory</b>", uk: "<b>Пам'ять розмов</b>", es: "<b>Memoria de conversaciones</b>",
    fr: "<b>Mémoire des conversations</b>", de: "<b>Gesprächsgedächtnis</b>", it: "<b>Memoria delle conversazioni</b>",
    pt: "<b>Memória das conversas</b>", pl: "<b>Pamięć rozmów</b>",
  },
  cmd_ask: {
    en: "Ask about your conversations (privately)", uk: "Запитай про ваші розмови (приватно)",
    es: "Pregunta sobre vuestras conversaciones (en privado)", fr: "Pose une question sur vos conversations (en privé)",
    de: "Frag etwas über eure Gespräche (privat)", it: "Chiedi delle vostre conversazioni (in privato)",
    pt: "Pergunta sobre as vossas conversas (em privado)", pl: "Zapytaj o wasze rozmowy (prywatnie)",
  },
  cmd_note: {
    en: "Save a private note", uk: "Зберегти приватну нотатку", es: "Guardar una nota privada",
    fr: "Enregistrer une note privée", de: "Eine private Notiz speichern", it: "Salvare una nota privata",
    pt: "Guardar uma nota privada", pl: "Zapisz prywatną notatkę",
  },
  cmd_reconcile: {
    en: "Reply to a message to exclude it from /ask", uk: "Відповідь на повідомлення, щоб виключити з /ask",
    es: "Responde a un mensaje para excluirlo de /ask", fr: "Réponds à un message pour l'exclure de /ask",
    de: "Auf eine Nachricht antworten, um sie aus /ask auszuschließen", it: "Rispondi a un messaggio per escluderlo da /ask",
    pt: "Responde a uma mensagem para a excluir do /ask", pl: "Odpowiedz na wiadomość, żeby wykluczyć ją z /ask",
  },
  cmd_restore: {
    en: "Put it back into /ask", uk: "Повернути в /ask", es: "Devolverlo a /ask",
    fr: "Le remettre dans /ask", de: "Sie wieder in /ask aufnehmen", it: "Rimetterlo in /ask",
    pt: "Voltar a incluí-la no /ask", pl: "Przywróć do /ask",
  },
  cmd_pin: {
    en: "Mark as important", uk: "Позначити як важливе", es: "Marcar como importante",
    fr: "Marquer comme important", de: "Als wichtig markieren", it: "Segnare come importante",
    pt: "Marcar como importante", pl: "Oznacz jako ważne",
  },
  cmd_unpin: {
    en: "Remove the mark", uk: "Зняти позначку", es: "Quitar la marca",
    fr: "Retirer la marque", de: "Markierung entfernen", it: "Togliere il segno",
    pt: "Retirar a marca", pl: "Usuń oznaczenie",
  },
  cmd_pinned: {
    en: "List pinned messages", uk: "Список закріплених", es: "Lista de mensajes fijados",
    fr: "Liste des messages épinglés", de: "Angeheftete Nachrichten auflisten", it: "Elenco dei messaggi fissati",
    pt: "Lista de mensagens fixadas", pl: "Lista przypiętych wiadomości",
  },
  cmd_billing: {
    en: "Subscription, usage and payment", uk: "Підписка, використання та оплата",
    es: "Suscripción, uso y pago", fr: "Abonnement, utilisation et paiement",
    de: "Abo, Nutzung und Zahlung", it: "Abbonamento, utilizzo e pagamento",
    pt: "Subscrição, utilização e pagamento", pl: "Subskrypcja, zużycie i płatność",
  },
  // The five menu descriptions the /help catalog did not already cover. The rest of the
  // "/" menu reuses the cmd_* keys above: they are the same descriptive sentence in the
  // same eight languages, and maintaining a second near-identical set would guarantee the
  // two drift. /management reuses cmd_billing, which already says exactly that.
  //
  // Provenance is the file header's: en and uk reviewed, the other six machine-written.
  cmd_start: {
    en: "What the bot does",
    uk: "Що вміє бот",
    es: "Qué hace el bot",
    fr: "Ce que fait le bot",
    de: "Was der Bot kann",
    it: "Cosa fa il bot",
    pt: "O que o bot faz",
    pl: "Co potrafi bot",
  },
  cmd_help: {
    en: "Show all commands",
    uk: "Показати всі команди",
    es: "Ver todos los comandos",
    fr: "Voir toutes les commandes",
    de: "Alle Befehle anzeigen",
    it: "Mostra tutti i comandi",
    pt: "Ver todos os comandos",
    pl: "Pokaż wszystkie komendy",
  },
  cmd_mistakes: {
    en: "Review your recent grammar mistakes",
    uk: "Переглянути свої останні помилки",
    es: "Repasa tus últimos errores de gramática",
    fr: "Revoir tes dernières fautes de grammaire",
    de: "Deine letzten Grammatikfehler ansehen",
    it: "Rivedi i tuoi ultimi errori di grammatica",
    pt: "Rever os teus últimos erros de gramática",
    pl: "Przejrzyj swoje ostatnie błędy",
  },
  cmd_leave: {
    en: "Leave this account (for the partner)",
    uk: "Вийти з цього акаунта (для партнера)",
    es: "Salir de esta cuenta (para la pareja)",
    fr: "Quitter ce compte (pour le partenaire)",
    de: "Dieses Konto verlassen (für den Partner)",
    it: "Lascia questo account (per il partner)",
    pt: "Sair desta conta (para o parceiro)",
    pl: "Opuść to konto (dla partnera)",
  },
  cmd_plans: {
    en: "Plans and pricing",
    uk: "Тарифи та ціни",
    es: "Planes y precios",
    fr: "Offres et tarifs",
    de: "Tarife und Preise",
    it: "Piani e prezzi",
    pt: "Planos e preços",
    pl: "Plany i ceny",
  },
  // ------------------------------------------------------- solo practice partner
  //
  // For a subscriber with no partner. The intro already sells solo use, but a solo
  // customer writes into silence -- nothing answers. This lets the bot take the empty
  // seat and reply in the language they are practising.
  //
  // practice_on states the cost plainly. Each reply is a model call, so it consumes a
  // message from the allowance; a customer who discovers that from a quota refusal
  // instead would be right to be annoyed.

  practice_on: {
    en: (v: any) => `🗣 <b>Practice partner on.</b> While you have no partner, I'll reply to you in ${v.lang} so you have someone to talk to. Your own words still build your deck — mine never do.\n\n<i>Each reply counts as one message from your monthly allowance. Turn it off with /practice off.</i>`,
    uk: (v: any) => `🗣 <b>Мовний партнер увімкнено.</b> Поки в тебе немає партнера, я відповідатиму ${v.lang}, щоб було з ким говорити. Твої слова й далі наповнюють колоду — мої ніколи.\n\n<i>Кожна відповідь рахується як одне повідомлення з місячного ліміту. Вимкнути: /practice off.</i>`,
    es: (v: any) => `🗣 <b>Compañero de práctica activado.</b> Mientras no tengas pareja, te responderé en ${v.lang} para que tengas con quién hablar. Tus palabras siguen llenando tu mazo; las mías nunca.\n\n<i>Cada respuesta cuenta como un mensaje de tu límite mensual. Desactívalo con /practice off.</i>`,
    fr: (v: any) => `🗣 <b>Partenaire d'entraînement activé.</b> Tant que tu n'as pas de partenaire, je te répondrai en ${v.lang} pour que tu aies quelqu'un à qui parler. Tes mots continuent d'alimenter ton paquet ; les miens jamais.\n\n<i>Chaque réponse compte comme un message de ton quota mensuel. Désactive avec /practice off.</i>`,
    de: (v: any) => `🗣 <b>Übungspartner an.</b> Solange du keinen Partner hast, antworte ich dir auf ${v.lang}, damit du jemanden zum Reden hast. Deine Wörter füllen weiterhin deinen Stapel — meine nie.\n\n<i>Jede Antwort zählt als eine Nachricht deines Monatskontingents. Ausschalten mit /practice off.</i>`,
    it: (v: any) => `🗣 <b>Partner di pratica attivo.</b> Finché non hai un partner, ti risponderò in ${v.lang} così hai con chi parlare. Le tue parole continuano a riempire il mazzo; le mie mai.\n\n<i>Ogni risposta conta come un messaggio del tuo limite mensile. Disattiva con /practice off.</i>`,
    pt: (v: any) => `🗣 <b>Parceiro de prática ligado.</b> Enquanto não tiveres parceiro, respondo-te em ${v.lang} para teres com quem falar. As tuas palavras continuam a encher o baralho; as minhas nunca.\n\n<i>Cada resposta conta como uma mensagem do teu limite mensal. Desliga com /practice off.</i>`,
    pl: (v: any) => `🗣 <b>Partner do ćwiczeń włączony.</b> Dopóki nie masz partnera, będę odpowiadać po ${v.lang}, żebyś miał z kim rozmawiać. Twoje słowa nadal budują talię — moje nigdy.\n\n<i>Każda odpowiedź liczy się jako jedna wiadomość z miesięcznego limitu. Wyłącz: /practice off.</i>`,
  },

  practice_off: {
    en: "Practice partner off. I'll go back to just translating.",
    uk: "Мовного партнера вимкнено. Повертаюся до звичайного перекладу.",
    es: "Compañero de práctica desactivado. Vuelvo a solo traducir.",
    fr: "Partenaire d'entraînement désactivé. Je me contente de traduire à nouveau.",
    de: "Übungspartner aus. Ich übersetze wieder nur.",
    it: "Partner di pratica disattivato. Torno a tradurre soltanto.",
    pt: "Parceiro de prática desligado. Volto a apenas traduzir.",
    pl: "Partner do ćwiczeń wyłączony. Wracam do samego tłumaczenia.",
  },

  practice_has_partner: {
    en: "You already have a partner, so I'll stay out of the way. This is for people using Capybara on their own.",
    uk: "У тебе вже є партнер, тож я не втручатимусь. Це для тих, хто користується Capybara наодинці.",
    es: "Ya tienes pareja, así que no me meto. Esto es para quien usa Capybara en solitario.",
    fr: "Tu as déjà un partenaire, je te laisse donc tranquille. C'est pour ceux qui utilisent Capybara seuls.",
    de: "Du hast schon einen Partner, also halte ich mich raus. Das ist für alle, die Capybara allein nutzen.",
    it: "Hai già un partner, quindi resto da parte. Questo è per chi usa Capybara da solo.",
    pt: "Já tens parceiro, por isso fico de fora. Isto é para quem usa o Capybara sozinho.",
    pl: "Masz już partnera, więc się nie wtrącam. To dla osób korzystających z Capybary samodzielnie.",
  },

  practice_save_failed: {
    en: "⚠️ Couldn't save that setting — please try again.",
    uk: "⚠️ Не вдалося зберегти налаштування — спробуй ще раз.",
    es: "⚠️ No se pudo guardar ese ajuste — inténtalo de nuevo.",
    fr: "⚠️ Impossible d'enregistrer ce réglage — réessaie.",
    de: "⚠️ Einstellung konnte nicht gespeichert werden — versuch es erneut.",
    it: "⚠️ Impossibile salvare l'impostazione — riprova.",
    pt: "⚠️ Não foi possível guardar essa definição — tenta de novo.",
    pl: "⚠️ Nie udało się zapisać ustawienia — spróbuj ponownie.",
  },

  cmd_practice: {
    en: "Chat with me to practise (solo users)",
    uk: "Розмовляти зі мною для практики (соло)",
    es: "Charla conmigo para practicar (en solitario)",
    fr: "Discuter avec moi pour t'entraîner (solo)",
    de: "Zum Üben mit mir chatten (allein)",
    it: "Chiacchiera con me per esercitarti (da solo)",
    pt: "Conversa comigo para praticar (a solo)",
    pl: "Rozmawiaj ze mną, by ćwiczyć (solo)",
  },
  cmd_delete_account: {
    en: "Delete the account and all its data (permanent)", uk: "Видалити акаунт і всі дані (назавжди)",
    es: "Borrar la cuenta y todos sus datos (permanente)", fr: "Supprimer le compte et toutes ses données (définitif)",
    de: "Konto und alle Daten löschen (endgültig)", it: "Eliminare l'account e tutti i dati (definitivo)",
    pt: "Apagar a conta e todos os dados (permanente)", pl: "Usuń konto i wszystkie dane (nieodwracalnie)",
  },

  // ---------------------------------------------------------------- quota
  quota_exceeded: {
    en: (v) => `You've used all ${v.quota} messages for this billing period.${v.resumes}\n\nType /billing to move to a larger plan.`,
    uk: (v) => `Ти використав усі ${v.quota} повідомлень за цей розрахунковий період.${v.resumes}\n\nНапиши /billing, щоб перейти на більший тариф.`,
    es: (v) => `Has usado los ${v.quota} mensajes de este periodo de facturación.${v.resumes}\n\nEscribe /billing para pasar a un plan mayor.`,
    fr: (v) => `Tu as utilisé les ${v.quota} messages de cette période de facturation.${v.resumes}\n\nTape /billing pour passer à un forfait supérieur.`,
    de: (v) => `Du hast alle ${v.quota} Nachrichten dieses Abrechnungszeitraums verbraucht.${v.resumes}\n\nTipp /billing, um auf einen größeren Tarif zu wechseln.`,
    it: (v) => `Hai usato tutti i ${v.quota} messaggi di questo periodo di fatturazione.${v.resumes}\n\nScrivi /billing per passare a un piano più grande.`,
    pt: (v) => `Usaste todas as ${v.quota} mensagens deste período de faturação.${v.resumes}\n\nEscreve /billing para passares a um plano maior.`,
    pl: (v) => `Wykorzystałeś wszystkie ${v.quota} wiadomości w tym okresie rozliczeniowym.${v.resumes}\n\nWpisz /billing, żeby przejść na większy plan.`,
  },
  quota_resets_on: {
    en: (v) => ` Your allowance resets on ${v.date}.`,
    uk: (v) => ` Ліміт оновиться ${v.date}.`,
    es: (v) => ` Tu cuota se renueva el ${v.date}.`,
    fr: (v) => ` Ton quota est réinitialisé le ${v.date}.`,
    de: (v) => ` Dein Kontingent wird am ${v.date} zurückgesetzt.`,
    it: (v) => ` Il tuo limite si azzera il ${v.date}.`,
    pt: (v) => ` A tua quota renova a ${v.date}.`,
    pl: (v) => ` Limit odnowi się ${v.date}.`,
  },
  quota_inactive: {
    en: "Your Capybara subscription isn't active right now, so I've paused translating.\n\nType /billing to update your payment details — nothing is deleted in the meantime.",
    uk: "Твоя підписка Capybara зараз неактивна, тож я призупинив переклад.\n\nНапиши /billing, щоб оновити платіжні дані — нічого не видаляється тим часом.",
    es: "Tu suscripción a Capybara no está activa ahora mismo, así que he pausado la traducción.\n\nEscribe /billing para actualizar tus datos de pago — mientras tanto no se borra nada.",
    fr: "Ton abonnement Capybara n'est pas actif en ce moment, j'ai donc mis la traduction en pause.\n\nTape /billing pour mettre à jour tes informations de paiement — rien n'est supprimé entre-temps.",
    de: "Dein Capybara-Abo ist gerade nicht aktiv, deshalb habe ich das Übersetzen pausiert.\n\nTipp /billing, um deine Zahlungsdaten zu aktualisieren — in der Zwischenzeit wird nichts gelöscht.",
    it: "Il tuo abbonamento Capybara non è attivo al momento, quindi ho messo in pausa la traduzione.\n\nScrivi /billing per aggiornare i dati di pagamento — nel frattempo non viene eliminato nulla.",
    pt: "A tua subscrição do Capybara não está ativa neste momento, por isso pausei a tradução.\n\nEscreve /billing para atualizares os dados de pagamento — entretanto nada é apagado.",
    pl: "Twoja subskrypcja Capybary nie jest teraz aktywna, więc wstrzymałem tłumaczenie.\n\nWpisz /billing, żeby zaktualizować dane płatności — w międzyczasie nic nie jest usuwane.",
  },
  quota_unverifiable: {
    en: "I can't verify your subscription at the moment. Type /billing to check it, or try again shortly.",
    uk: "Зараз не можу перевірити твою підписку. Напиши /billing або спробуй трохи згодом.",
    es: "Ahora mismo no puedo verificar tu suscripción. Escribe /billing para comprobarla, o inténtalo en un rato.",
    fr: "Je ne peux pas vérifier ton abonnement pour le moment. Tape /billing pour le consulter, ou réessaie plus tard.",
    de: "Ich kann dein Abo gerade nicht prüfen. Tipp /billing, oder versuch es gleich noch mal.",
    it: "Al momento non riesco a verificare il tuo abbonamento. Scrivi /billing per controllarlo, o riprova tra poco.",
    pt: "Neste momento não consigo verificar a tua subscrição. Escreve /billing para a veres, ou tenta daqui a pouco.",
    pl: "Nie mogę teraz zweryfikować twojej subskrypcji. Wpisz /billing albo spróbuj za chwilę.",
  },
  quota_heads_up: {
    en: (v) => `Heads up: you've used ${v.used} of your ${v.quota} messages this period. Type /billing to change plan.`,
    uk: (v) => `До відома: використано ${v.used} з ${v.quota} повідомлень за цей період. Напиши /billing, щоб змінити тариф.`,
    es: (v) => `Aviso: has usado ${v.used} de tus ${v.quota} mensajes de este periodo. Escribe /billing para cambiar de plan.`,
    fr: (v) => `Info : tu as utilisé ${v.used} de tes ${v.quota} messages cette période. Tape /billing pour changer de forfait.`,
    de: (v) => `Hinweis: Du hast ${v.used} von ${v.quota} Nachrichten in diesem Zeitraum verbraucht. Tipp /billing, um den Tarif zu wechseln.`,
    it: (v) => `Nota: hai usato ${v.used} dei tuoi ${v.quota} messaggi di questo periodo. Scrivi /billing per cambiare piano.`,
    pt: (v) => `Aviso: usaste ${v.used} das tuas ${v.quota} mensagens deste período. Escreve /billing para mudares de plano.`,
    pl: (v) => `Uwaga: wykorzystałeś ${v.used} z ${v.quota} wiadomości w tym okresie. Wpisz /billing, żeby zmienić plan.`,
  },

  // ---------------------------------------------------------------- /billing
  billing_summary: {
    en: (v) => `<b>Your Capybara subscription</b>\nPlan: ${v.plan}\nStatus: ${v.status}\nUsed this period: ${v.usage}\nRenews: ${v.renews}`,
    uk: (v) => `<b>Твоя підписка Capybara</b>\nТариф: ${v.plan}\nСтатус: ${v.status}\nВикористано за період: ${v.usage}\nПоновлення: ${v.renews}`,
    es: (v) => `<b>Tu suscripción a Capybara</b>\nPlan: ${v.plan}\nEstado: ${v.status}\nUsado este periodo: ${v.usage}\nSe renueva: ${v.renews}`,
    fr: (v) => `<b>Ton abonnement Capybara</b>\nForfait : ${v.plan}\nStatut : ${v.status}\nUtilisé cette période : ${v.usage}\nRenouvellement : ${v.renews}`,
    de: (v) => `<b>Dein Capybara-Abo</b>\nTarif: ${v.plan}\nStatus: ${v.status}\nIn diesem Zeitraum genutzt: ${v.usage}\nVerlängerung: ${v.renews}`,
    it: (v) => `<b>Il tuo abbonamento Capybara</b>\nPiano: ${v.plan}\nStato: ${v.status}\nUsato in questo periodo: ${v.usage}\nRinnovo: ${v.renews}`,
    pt: (v) => `<b>A tua subscrição do Capybara</b>\nPlano: ${v.plan}\nEstado: ${v.status}\nUsado neste período: ${v.usage}\nRenova: ${v.renews}`,
    pl: (v) => `<b>Twoja subskrypcja Capybary</b>\nPlan: ${v.plan}\nStatus: ${v.status}\nZużyte w tym okresie: ${v.usage}\nOdnowienie: ${v.renews}`,
  },
  billing_unlimited: {
    en: "unlimited", uk: "без обмежень", es: "ilimitado", fr: "illimité",
    de: "unbegrenzt", it: "illimitato", pt: "ilimitado", pl: "bez limitu",
  },
  billing_load_failed: {
    en: "I couldn't load your subscription just now. Try again shortly.",
    uk: "Не вдалося завантажити твою підписку. Спробуй трохи згодом.",
    es: "No he podido cargar tu suscripción ahora mismo. Inténtalo en un rato.",
    fr: "Je n'ai pas pu charger ton abonnement pour l'instant. Réessaie plus tard.",
    de: "Ich konnte dein Abo gerade nicht laden. Versuch es gleich noch mal.",
    it: "Non sono riuscito a caricare il tuo abbonamento adesso. Riprova tra poco.",
    pt: "Não consegui carregar a tua subscrição agora. Tenta daqui a pouco.",
    pl: "Nie udało mi się teraz wczytać twojej subskrypcji. Spróbuj za chwilę.",
  },
  billing_not_owner: {
    en: "Billing is managed by whoever set up the subscription — ask them to run /billing.",
    uk: "Оплатою керує той, хто оформив підписку — попроси його виконати /billing.",
    es: "La facturación la gestiona quien creó la suscripción — pídele que ejecute /billing.",
    fr: "La facturation est gérée par la personne qui a créé l'abonnement — demande-lui de faire /billing.",
    de: "Die Abrechnung verwaltet, wer das Abo eingerichtet hat — bitte diese Person, /billing auszuführen.",
    it: "La fatturazione è gestita da chi ha creato l'abbonamento — chiedigli di eseguire /billing.",
    pt: "A faturação é gerida por quem criou a subscrição — pede-lhe para executar /billing.",
    pl: "Płatnościami zarządza osoba, która założyła subskrypcję — poproś ją o wpisanie /billing.",
  },
  billing_not_configured: {
    en: "Self-service billing isn't configured on this instance yet.",
    uk: "Самообслуговування для оплати ще не налаштоване.",
    es: "La facturación de autoservicio aún no está configurada en esta instancia.",
    fr: "La facturation en libre-service n'est pas encore configurée sur cette instance.",
    de: "Die Selbstbedienungs-Abrechnung ist auf dieser Instanz noch nicht eingerichtet.",
    it: "La fatturazione self-service non è ancora configurata su questa istanza.",
    pt: "A faturação self-service ainda não está configurada nesta instância.",
    pl: "Samoobsługowe płatności nie są jeszcze skonfigurowane w tej instancji.",
  },
  billing_portal_failed: {
    en: "I couldn't open the billing portal just now. Try again shortly.",
    uk: "Не вдалося відкрити портал оплати. Спробуй трохи згодом.",
    es: "No he podido abrir el portal de facturación ahora. Inténtalo en un rato.",
    fr: "Je n'ai pas pu ouvrir le portail de facturation. Réessaie plus tard.",
    de: "Ich konnte das Abrechnungsportal gerade nicht öffnen. Versuch es gleich noch mal.",
    it: "Non sono riuscito ad aprire il portale di fatturazione adesso. Riprova tra poco.",
    pt: "Não consegui abrir o portal de faturação agora. Tenta daqui a pouco.",
    pl: "Nie udało mi się teraz otworzyć portalu płatności. Spróbuj za chwilę.",
  },
  billing_manage: {
    en: "Manage your card, plan or cancellation here — the link is private and expires shortly.\n\nTo delete your account and all its data permanently, send /delete_account.",
    uk: "Керуй карткою, тарифом чи скасуванням тут — посилання приватне й скоро стане недійсним.\n\nЩоб назавжди видалити акаунт і всі дані, надішли /delete_account.",
    es: "Gestiona tu tarjeta, plan o cancelación aquí — el enlace es privado y caduca pronto.\n\nPara borrar tu cuenta y todos sus datos de forma permanente, envía /delete_account.",
    fr: "Gère ta carte, ton forfait ou ta résiliation ici — le lien est privé et expire bientôt.\n\nPour supprimer définitivement ton compte et toutes ses données, envoie /delete_account.",
    de: "Verwalte hier Karte, Tarif oder Kündigung — der Link ist privat und läuft bald ab.\n\nUm dein Konto und alle Daten endgültig zu löschen, sende /delete_account.",
    it: "Gestisci qui carta, piano o disdetta — il link è privato e scade a breve.\n\nPer eliminare definitivamente l'account e tutti i dati, invia /delete_account.",
    pt: "Gere aqui o cartão, plano ou cancelamento — o link é privado e expira em breve.\n\nPara apagares a conta e todos os dados permanentemente, envia /delete_account.",
    pl: "Zarządzaj tutaj kartą, planem lub rezygnacją — link jest prywatny i wkrótce wygaśnie.\n\nAby trwale usunąć konto i wszystkie dane, wyślij /delete_account.",
  },
  billing_btn_manage: {
    en: "Manage subscription", uk: "Керувати підпискою", es: "Gestionar suscripción",
    fr: "Gérer l'abonnement", de: "Abo verwalten", it: "Gestisci abbonamento",
    pt: "Gerir subscrição", pl: "Zarządzaj subskrypcją",
  },

  // ---------------------------------------------------------------- study surface
  unsupported_media: {
    en: "I can handle text, voice, photos, videos, files, stickers, GIFs, audio, locations, and contacts. Other types aren't supported yet.",
    uk: "Я вмію обробляти текст, голосові, фото, відео, файли, стікери, GIF, аудіо, геолокацію та контакти. Інші типи поки не підтримуються.",
    es: "Puedo con texto, voz, fotos, vídeos, archivos, stickers, GIFs, audio, ubicaciones y contactos. Otros tipos aún no están soportados.",
    fr: "Je gère le texte, les vocaux, photos, vidéos, fichiers, stickers, GIF, audio, positions et contacts. Les autres types ne sont pas encore pris en charge.",
    de: "Ich kann Text, Sprachnachrichten, Fotos, Videos, Dateien, Sticker, GIFs, Audio, Standorte und Kontakte. Andere Typen werden noch nicht unterstützt.",
    it: "Gestisco testo, vocali, foto, video, file, sticker, GIF, audio, posizioni e contatti. Altri tipi non sono ancora supportati.",
    pt: "Consigo lidar com texto, voz, fotos, vídeos, ficheiros, stickers, GIFs, áudio, localizações e contactos. Outros tipos ainda não são suportados.",
    pl: "Obsługuję tekst, głosówki, zdjęcia, filmy, pliki, naklejki, GIF-y, audio, lokalizacje i kontakty. Inne typy nie są jeszcze wspierane.",
  },
  account_load_failed: {
    en: "I couldn't load your account just now. Try again shortly.",
    uk: "Не вдалося завантажити твій акаунт. Спробуй трохи згодом.",
    es: "No he podido cargar tu cuenta ahora mismo. Inténtalo en un rato.",
    fr: "Je n'ai pas pu charger ton compte pour l'instant. Réessaie plus tard.",
    de: "Ich konnte dein Konto gerade nicht laden. Versuch es gleich noch mal.",
    it: "Non sono riuscito a caricare il tuo account adesso. Riprova tra poco.",
    pt: "Não consegui carregar a tua conta agora. Tenta daqui a pouco.",
    pl: "Nie udało mi się teraz wczytać twojego konta. Spróbuj za chwilę.",
  },
  voice_fetch_failed: {
    en: "Couldn't fetch the voice message from Telegram. Try again in a moment.",
    uk: "Не вдалося отримати голосове з Telegram. Спробуй за хвилину.",
    es: "No he podido obtener el audio de Telegram. Inténtalo en un momento.",
    fr: "Impossible de récupérer le vocal depuis Telegram. Réessaie dans un instant.",
    de: "Die Sprachnachricht konnte nicht von Telegram geladen werden. Versuch es gleich noch mal.",
    it: "Non sono riuscito a scaricare il vocale da Telegram. Riprova tra un momento.",
    pt: "Não consegui obter a mensagem de voz do Telegram. Tenta daqui a pouco.",
    pl: "Nie udało się pobrać głosówki z Telegrama. Spróbuj za chwilę.",
  },
  deck_update_failed: {
    en: "Couldn't update the deck. Try again shortly.",
    uk: "Не вдалося оновити колоду. Спробуй трохи згодом.",
    es: "No he podido actualizar el mazo. Inténtalo en un rato.",
    fr: "Je n'ai pas pu mettre à jour le jeu. Réessaie plus tard.",
    de: "Der Stapel konnte nicht aktualisiert werden. Versuch es gleich noch mal.",
    it: "Non sono riuscito ad aggiornare il mazzo. Riprova tra poco.",
    pt: "Não consegui atualizar o baralho. Tenta daqui a pouco.",
    pl: "Nie udało się zaktualizować talii. Spróbuj za chwilę.",
  },
  learn_usage: {
    en: (v) => `Usage: <code>/learn &lt;word&gt;</code> or <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nRun /vocab to see suggested words.`,
    uk: (v) => `Використання: <code>/learn &lt;слово&gt;</code> або <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nВиконай /vocab, щоб побачити пропоновані слова.`,
    es: (v) => `Uso: <code>/learn &lt;palabra&gt;</code> o <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nEjecuta /vocab para ver palabras sugeridas.`,
    fr: (v) => `Usage : <code>/learn &lt;mot&gt;</code> ou <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nFais /vocab pour voir des mots suggérés.`,
    de: (v) => `Verwendung: <code>/learn &lt;Wort&gt;</code> oder <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nMit /vocab siehst du Wortvorschläge.`,
    it: (v) => `Uso: <code>/learn &lt;parola&gt;</code> o <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nEsegui /vocab per vedere le parole suggerite.`,
    pt: (v) => `Utilização: <code>/learn &lt;palavra&gt;</code> ou <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nExecuta /vocab para veres palavras sugeridas.`,
    pl: (v) => `Użycie: <code>/learn &lt;słowo&gt;</code> albo <code>/learn top &lt;N&gt; [${v.codes}]</code>\n\nWpisz /vocab, żeby zobaczyć proponowane słowa.`,
  },
  learn_top_usage: {
    en: (v) => `Usage: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    uk: (v) => `Використання: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    es: (v) => `Uso: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    fr: (v) => `Usage : <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    de: (v) => `Verwendung: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    it: (v) => `Uso: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    pt: (v) => `Utilização: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
    pl: (v) => `Użycie: <code>/learn top &lt;N&gt; [${v.codes}]</code>`,
  },
  learn_how_many: {
    en: "How many words?", uk: "Скільки слів?", es: "¿Cuántas palabras?",
    fr: "Combien de mots ?", de: "Wie viele Wörter?", it: "Quante parole?",
    pt: "Quantas palavras?", pl: "Ile słów?",
  },
  learn_n_positive: {
    en: "N must be a positive number.", uk: "N має бути додатним числом.",
    es: "N debe ser un número positivo.", fr: "N doit être un nombre positif.",
    de: "N muss eine positive Zahl sein.", it: "N deve essere un numero positivo.",
    pt: "N tem de ser um número positivo.", pl: "N musi być liczbą dodatnią.",
  },
  learn_one_at_a_time: {
    en: (v) => `Please add one word at a time.\n\n(Or use <code>/learn top N [${v.codes}]</code> to bulk-add.)`,
    uk: (v) => `Додавай по одному слову.\n\n(Або <code>/learn top N [${v.codes}]</code> для масового додавання.)`,
    es: (v) => `Añade una palabra cada vez.\n\n(O usa <code>/learn top N [${v.codes}]</code> para añadir en bloque.)`,
    fr: (v) => `Ajoute un mot à la fois.\n\n(Ou utilise <code>/learn top N [${v.codes}]</code> pour un ajout groupé.)`,
    de: (v) => `Bitte ein Wort nach dem anderen.\n\n(Oder <code>/learn top N [${v.codes}]</code> für viele auf einmal.)`,
    it: (v) => `Aggiungi una parola alla volta.\n\n(Oppure usa <code>/learn top N [${v.codes}]</code> per aggiungerne molte.)`,
    pt: (v) => `Adiciona uma palavra de cada vez.\n\n(Ou usa <code>/learn top N [${v.codes}]</code> para adicionar em bloco.)`,
    pl: (v) => `Dodawaj po jednym słowie.\n\n(Albo użyj <code>/learn top N [${v.codes}]</code>, żeby dodać hurtem.)`,
  },
  forget_usage: {
    en: "Usage: <code>/forget &lt;word&gt;</code>\n\nRemoves a word from the matching deck.",
    uk: "Використання: <code>/forget &lt;слово&gt;</code>\n\nВидаляє слово з відповідної колоди.",
    es: "Uso: <code>/forget &lt;palabra&gt;</code>\n\nQuita una palabra del mazo correspondiente.",
    fr: "Usage : <code>/forget &lt;mot&gt;</code>\n\nRetire un mot du jeu correspondant.",
    de: "Verwendung: <code>/forget &lt;Wort&gt;</code>\n\nEntfernt ein Wort aus dem passenden Stapel.",
    it: "Uso: <code>/forget &lt;parola&gt;</code>\n\nRimuove una parola dal mazzo corrispondente.",
    pt: "Utilização: <code>/forget &lt;palavra&gt;</code>\n\nRemove uma palavra do baralho correspondente.",
    pl: "Użycie: <code>/forget &lt;słowo&gt;</code>\n\nUsuwa słowo z odpowiedniej talii.",
  },
  forget_one_at_a_time: {
    en: "Please remove one word at a time.", uk: "Видаляй по одному слову.",
    es: "Quita una palabra cada vez.", fr: "Retire un mot à la fois.",
    de: "Bitte ein Wort nach dem anderen entfernen.", it: "Rimuovi una parola alla volta.",
    pt: "Remove uma palavra de cada vez.", pl: "Usuwaj po jednym słowie.",
  },
  export_nothing: {
    en: "Nothing has exportable rows yet (vocabulary records may be missing).",
    uk: "Поки немає рядків для експорту (можливо, бракує словникових записів).",
    es: "Todavía no hay filas exportables (puede que falten registros de vocabulario).",
    fr: "Rien à exporter pour l'instant (des entrées de vocabulaire peuvent manquer).",
    de: "Noch nichts zum Exportieren (Vokabeleinträge fehlen möglicherweise).",
    it: "Non c'è ancora nulla da esportare (potrebbero mancare i record di vocabolario).",
    pt: "Ainda não há linhas exportáveis (podem faltar registos de vocabulário).",
    pl: "Nie ma jeszcze nic do wyeksportowania (mogą brakować wpisów słownikowych).",
  },

  // ---------------------------------------------------------------- grammar assistant
  // Folded in from the old GRAMMAR_UI, which was the only localization that existed and
  // covered en/uk alone. Two systems for one job is one too many.
  grammar_correct: {
    en: "✅ Looks correct.", uk: "✅ Виглядає правильно.", es: "✅ Parece correcto.",
    fr: "✅ Ça a l'air correct.", de: "✅ Sieht richtig aus.", it: "✅ Sembra corretto.",
    pt: "✅ Parece correto.", pl: "✅ Wygląda poprawnie.",
  },
  grammar_note_header: {
    en: "📝 Grammar note:", uk: "📝 Граматична нотатка:", es: "📝 Nota de gramática:",
    fr: "📝 Note de grammaire :", de: "📝 Grammatik-Hinweis:", it: "📝 Nota grammaticale:",
    pt: "📝 Nota gramatical:", pl: "📝 Notatka gramatyczna:",
  },
  grammar_save_failed: {
    en: "⚠️ Couldn't save that setting — please try again.",
    uk: "⚠️ Не вдалося зберегти налаштування — спробуй ще раз.",
    es: "⚠️ No he podido guardar ese ajuste — inténtalo de nuevo.",
    fr: "⚠️ Impossible d'enregistrer ce réglage — réessaie.",
    de: "⚠️ Die Einstellung konnte nicht gespeichert werden — bitte nochmal versuchen.",
    it: "⚠️ Non sono riuscito a salvare l'impostazione — riprova.",
    pt: "⚠️ Não consegui guardar essa definição — tenta de novo.",
    pl: "⚠️ Nie udało się zapisać ustawienia — spróbuj ponownie.",
  },
  grammar_on: {
    en: (v) => `✅ Grammar assistant ON. When you write in ${v.lang}, I'll check it and privately explain any mistakes (just to you — your partner never sees the note). Turn it off with /capybara off.`,
    uk: (v) => `✅ Помічник з граматики УВІМКНЕНО. Коли ти пишеш ${v.lang}, я перевірю текст і приватно поясню помилки (тільки тобі — партнер їх не бачить). Вимкнути: /capybara off.`,
    es: (v) => `✅ Asistente de gramática ACTIVADO. Cuando escribas en ${v.lang}, lo revisaré y te explicaré los errores en privado (solo a ti — tu pareja nunca ve la nota). Desactívalo con /capybara off.`,
    fr: (v) => `✅ Assistant de grammaire ACTIVÉ. Quand tu écris en ${v.lang}, je vérifie et j'explique les erreurs en privé (à toi seul — ton partenaire ne voit jamais la note). Désactive-le avec /capybara off.`,
    de: (v) => `✅ Grammatik-Assistent AN. Wenn du auf ${v.lang} schreibst, prüfe ich es und erkläre Fehler privat (nur dir — dein Partner sieht die Notiz nie). Ausschalten mit /capybara off.`,
    it: (v) => `✅ Assistente di grammatica ATTIVO. Quando scrivi in ${v.lang}, controllo e ti spiego gli errori in privato (solo a te — il tuo partner non vede mai la nota). Disattivalo con /capybara off.`,
    pt: (v) => `✅ Assistente de gramática LIGADO. Quando escreveres em ${v.lang}, verifico e explico os erros em privado (só a ti — o teu parceiro nunca vê a nota). Desliga com /capybara off.`,
    pl: (v) => `✅ Asystent gramatyki WŁĄCZONY. Kiedy piszesz po ${v.lang}, sprawdzę tekst i prywatnie wyjaśnię błędy (tylko tobie — partner nigdy nie widzi notatki). Wyłącz przez /capybara off.`,
  },
  grammar_off: {
    en: (v) => `Grammar assistant OFF. I'll stop checking your ${v.lang}. Turn it back on with /capybara on.`,
    uk: (v) => `Помічник з граматики ВИМКНЕНО. Більше не перевірятиму ${v.lang}. Увімкнути: /capybara on.`,
    es: (v) => `Asistente de gramática DESACTIVADO. Dejo de revisar tu ${v.lang}. Actívalo de nuevo con /capybara on.`,
    fr: (v) => `Assistant de grammaire DÉSACTIVÉ. J'arrête de vérifier ton ${v.lang}. Réactive-le avec /capybara on.`,
    de: (v) => `Grammatik-Assistent AUS. Ich prüfe dein ${v.lang} nicht mehr. Wieder an mit /capybara on.`,
    it: (v) => `Assistente di grammatica DISATTIVATO. Smetto di controllare il tuo ${v.lang}. Riattivalo con /capybara on.`,
    pt: (v) => `Assistente de gramática DESLIGADO. Deixo de verificar o teu ${v.lang}. Volta a ligar com /capybara on.`,
    pl: (v) => `Asystent gramatyki WYŁĄCZONY. Przestaję sprawdzać twój ${v.lang}. Włącz ponownie przez /capybara on.`,
  },

  // ---------------------------------------------------------------- onboarding
  ob_welcome_first: {
    en: "Welcome to Capybara! Let's get you set up — three taps and you're done.\n\nFirst: which language do you speak natively?",
    uk: "Ласкаво просимо до Capybara! Налаштуємо тебе — три дотики, і все.\n\nПерше: яка мова для тебе рідна?",
    es: "¡Bienvenido a Capybara! Vamos a configurarte — tres toques y listo.\n\nPrimero: ¿cuál es tu lengua materna?",
    fr: "Bienvenue sur Capybara ! On te configure — trois touches et c'est fait.\n\nD'abord : quelle est ta langue maternelle ?",
    de: "Willkommen bei Capybara! Wir richten dich ein — drei Tipps, fertig.\n\nZuerst: welche Sprache ist deine Muttersprache?",
    it: "Benvenuto su Capybara! Ti configuriamo — tre tocchi e hai finito.\n\nPrima cosa: qual è la tua lingua madre?",
    pt: "Bem-vindo ao Capybara! Vamos configurar-te — três toques e está feito.\n\nPrimeiro: qual é a tua língua materna?",
    pl: "Witaj w Capybara! Ustawimy cię — trzy dotknięcia i gotowe.\n\nNajpierw: jaki jest twój język ojczysty?",
  },

  ob_ask_learning: {
    en: (v) => `${v.native} it is. And which language are you learning — the one your partner speaks?`,
    uk: (v) => `${v.native} — добре. А яку мову вивчаєш — ту, якою говорить твій партнер?`,
    es: (v) => `${v.native}, perfecto. ¿Y qué idioma estás aprendiendo — el que habla tu pareja?`,
    fr: (v) => `${v.native}, très bien. Et quelle langue apprends-tu — celle que parle ton partenaire ?`,
    de: (v) => `${v.native}, gut. Und welche Sprache lernst du — die, die dein Partner spricht?`,
    it: (v) => `${v.native}, ottimo. E quale lingua stai imparando — quella del tuo partner?`,
    pt: (v) => `${v.native}, muito bem. E que língua estás a aprender — a do teu parceiro?`,
    pl: (v) => `${v.native}, dobrze. A jakiego języka się uczysz — tego, którym mówi twój partner?`,
  },

  ob_ask_gender: {
    en: "Last one. How should I refer to you? This isn't cosmetic — English and several other languages change verb and adjective endings depending on who's speaking, so translations come out wrong without it.",
    uk: "Останнє. Як до тебе звертатися? Це не косметика — у багатьох мовах закінчення дієслів і прикметників залежать від того, хто говорить, тож без цього переклад буде неправильним.",
    es: "La última. ¿Cómo debo referirme a ti? No es cosmético — en varios idiomas las terminaciones de verbos y adjetivos cambian según quién habla, y sin esto las traducciones salen mal.",
    fr: "Dernière question. Comment dois-je parler de toi ? Ce n'est pas cosmétique — dans plusieurs langues, les terminaisons des verbes et des adjectifs changent selon qui parle, et sans ça les traductions sont fausses.",
    de: "Die letzte. Wie soll ich dich ansprechen? Das ist nicht kosmetisch — in mehreren Sprachen ändern sich Verb- und Adjektivendungen je nachdem, wer spricht, sonst werden Übersetzungen falsch.",
    it: "L'ultima. Come devo riferirmi a te? Non è estetico — in diverse lingue le desinenze di verbi e aggettivi cambiano a seconda di chi parla, e senza questo le traduzioni escono sbagliate.",
    pt: "A última. Como devo referir-me a ti? Não é cosmético — em várias línguas as terminações de verbos e adjetivos mudam consoante quem fala, e sem isto as traduções saem erradas.",
    pl: "Ostatnie. Jak mam się do ciebie zwracać? To nie kosmetyka — w wielu językach końcówki czasowników i przymiotników zależą od tego, kto mówi, więc bez tego tłumaczenia wychodzą błędnie.",
  },

  ob_gender_she: {
    en: "She/her", uk: "Вона", es: "Ella", fr: "Elle",
    de: "Sie", it: "Lei", pt: "Ela", pl: "Ona",
  },
  ob_gender_he: {
    en: "He/him", uk: "Він", es: "Él", fr: "Il",
    de: "Er", it: "Lui", pt: "Ele", pl: "On",
  },

  ob_all_set: {
    en: (v) => `You're all set, ${v.name}! I'll translate between ${v.native} and ${v.learning}.\n\n<b>Start now, on your own</b> — write in either language and I'll translate it, and every message builds your study deck. Nothing else is needed.\n\n<b>Or add a language partner</b>, whenever you like. They read you in their language and you read them in yours, and you both get a deck out of it — forward them the link below.\n\nType /help to see everything.`,
    uk: (v) => `Все готово, ${v.name}! Перекладатиму між ${v.native} та ${v.learning}.\n\n<b>Почни просто зараз, сам</b> — пиши будь-якою з двох мов, я перекладу, і кожне повідомлення поповнює твою колоду. Більше нічого не потрібно.\n\n<b>Або додай мовного партнера</b>, коли захочеш. Він читатиме тебе своєю мовою, а ти його — своєю, і колода буде в обох. Перешли йому посилання нижче.\n\nНапиши /help, щоб побачити все.`,
    es: (v) => `¡Todo listo, ${v.name}! Traduciré entre ${v.native} y ${v.learning}.\n\n<b>Empieza ahora, por tu cuenta</b> — escribe en cualquiera de los dos idiomas y lo traduzco, y cada mensaje construye tu mazo. No hace falta nada más.\n\n<b>O añade un compañero de idioma</b> cuando quieras. Él te lee en su idioma y tú a él en el tuyo, y los dos sacáis un mazo — reenvíale el enlace de abajo.\n\nEscribe /help para verlo todo.`,
    fr: (v) => `Tout est prêt, ${v.name} ! Je traduirai entre ${v.native} et ${v.learning}.\n\n<b>Commence maintenant, seul</b> — écris dans l'une des deux langues, je traduis, et chaque message enrichit ton jeu de cartes. Rien d'autre n'est nécessaire.\n\n<b>Ou ajoute un partenaire linguistique</b> quand tu veux. Il te lit dans sa langue et tu le lis dans la tienne, et vous obtenez chacun un jeu — transfère-lui le lien ci-dessous.\n\nTape /help pour tout voir.`,
    de: (v) => `Alles bereit, ${v.name}! Ich übersetze zwischen ${v.native} und ${v.learning}.\n\n<b>Fang gleich an, allein</b> — schreib in einer der beiden Sprachen, ich übersetze, und jede Nachricht baut deinen Stapel auf. Mehr braucht es nicht.\n\n<b>Oder hol einen Sprachpartner dazu</b>, wann du willst. Er liest dich in seiner Sprache, du ihn in deiner, und beide bekommen einen Stapel — leite ihm den Link unten weiter.\n\nTipp /help, um alles zu sehen.`,
    it: (v) => `Tutto pronto, ${v.name}! Tradurrò tra ${v.native} e ${v.learning}.\n\n<b>Inizia subito, da solo</b> — scrivi in una delle due lingue e traduco, e ogni messaggio costruisce il tuo mazzo. Non serve altro.\n\n<b>Oppure aggiungi un partner linguistico</b>, quando vuoi. Lui ti legge nella sua lingua e tu lui nella tua, e ne esce un mazzo per entrambi — inoltragli il link qui sotto.\n\nScrivi /help per vedere tutto.`,
    pt: (v) => `Está tudo pronto, ${v.name}! Vou traduzir entre ${v.native} e ${v.learning}.\n\n<b>Começa já, sozinho</b> — escreve em qualquer uma das línguas e eu traduzo, e cada mensagem constrói o teu baralho. Não é preciso mais nada.\n\n<b>Ou junta um parceiro de língua</b>, quando quiseres. Ele lê-te na língua dele e tu a ele na tua, e ambos ficam com um baralho — reencaminha-lhe o link abaixo.\n\nEscreve /help para veres tudo.`,
    pl: (v) => `Wszystko gotowe, ${v.name}! Będę tłumaczyć między ${v.native} a ${v.learning}.\n\n<b>Zacznij od razu, sam</b> — pisz w jednym z dwóch języków, a ja przetłumaczę, i każda wiadomość buduje twoją talię. Nic więcej nie trzeba.\n\n<b>Albo dodaj partnera językowego</b>, kiedy zechcesz. On czyta ciebie w swoim języku, ty jego w swoim, i oboje macie talię — prześlij mu link poniżej.\n\nWpisz /help, żeby zobaczyć wszystko.`,
  },

  ob_invite_code_fallback: {
    en: (v) => `Their setup code: ${v.code}`,
    uk: (v) => `Код для налаштування: ${v.code}`,
    es: (v) => `Su código de configuración: ${v.code}`,
    fr: (v) => `Son code de configuration : ${v.code}`,
    de: (v) => `Sein Einrichtungscode: ${v.code}`,
    it: (v) => `Il suo codice di configurazione: ${v.code}`,
    pt: (v) => `O código de configuração dele: ${v.code}`,
    pl: (v) => `Jego kod konfiguracyjny: ${v.code}`,
  },

  ob_partner_welcome: {
    en: (v) => `Welcome to Capybara! Your partner has set this up for ${v.native} ↔ ${v.learning}.\n\nYou'll be writing in ${v.learning}. How should I refer to you?`,
    uk: (v) => `Ласкаво просимо до Capybara! Твій партнер налаштував це для пари ${v.native} ↔ ${v.learning}.\n\nТи писатимеш мовою ${v.learning}. Як до тебе звертатися?`,
    es: (v) => `¡Bienvenido a Capybara! Tu pareja lo ha configurado para ${v.native} ↔ ${v.learning}.\n\nTú escribirás en ${v.learning}. ¿Cómo debo referirme a ti?`,
    fr: (v) => `Bienvenue sur Capybara ! Ton partenaire a configuré ${v.native} ↔ ${v.learning}.\n\nTu écriras en ${v.learning}. Comment dois-je parler de toi ?`,
    de: (v) => `Willkommen bei Capybara! Dein Partner hat das für ${v.native} ↔ ${v.learning} eingerichtet.\n\nDu schreibst auf ${v.learning}. Wie soll ich dich ansprechen?`,
    it: (v) => `Benvenuto su Capybara! Il tuo partner ha configurato ${v.native} ↔ ${v.learning}.\n\nTu scriverai in ${v.learning}. Come devo riferirmi a te?`,
    pt: (v) => `Bem-vindo ao Capybara! O teu parceiro configurou isto para ${v.native} ↔ ${v.learning}.\n\nVais escrever em ${v.learning}. Como devo referir-me a ti?`,
    pl: (v) => `Witaj w Capybara! Twój partner ustawił to dla pary ${v.native} ↔ ${v.learning}.\n\nBędziesz pisać po ${v.learning}. Jak mam się do ciebie zwracać?`,
  },

  ob_partner_not_ready: {
    en: "Your partner hasn't finished setting up yet. Ask them to complete their setup, then open this link again.",
    uk: "Твій партнер ще не завершив налаштування. Попроси його закінчити, а потім відкрий це посилання ще раз.",
    es: "Tu pareja aún no ha terminado la configuración. Pídele que la complete y luego abre este enlace otra vez.",
    fr: "Ton partenaire n'a pas encore terminé sa configuration. Demande-lui de la finir, puis rouvre ce lien.",
    de: "Dein Partner ist mit der Einrichtung noch nicht fertig. Bitte ihn, sie abzuschließen, und öffne diesen Link dann erneut.",
    it: "Il tuo partner non ha ancora finito la configurazione. Chiedigli di completarla, poi riapri questo link.",
    pt: "O teu parceiro ainda não terminou a configuração. Pede-lhe para a concluir e abre este link outra vez.",
    pl: "Twój partner jeszcze nie dokończył konfiguracji. Poproś go, żeby ją skończył, a potem otwórz ten link ponownie.",
  },

  ob_already_setup: {
    en: "You're already set up — no need for the setup link. Type /help to see what I can do.",
    uk: "Ти вже налаштований — посилання не потрібне. Напиши /help, щоб побачити, що я вмію.",
    es: "Ya estás configurado — no necesitas el enlace. Escribe /help para ver qué puedo hacer.",
    fr: "Tu es déjà configuré — pas besoin du lien. Tape /help pour voir ce que je sais faire.",
    de: "Du bist bereits eingerichtet — der Link ist nicht nötig. Tipp /help, um zu sehen, was ich kann.",
    it: "Sei già configurato — il link non serve. Scrivi /help per vedere cosa so fare.",
    pt: "Já estás configurado — não precisas do link. Escreve /help para veres o que sei fazer.",
    pl: "Jesteś już skonfigurowany — link nie jest potrzebny. Wpisz /help, żeby zobaczyć, co potrafię.",
  },

  ob_owner_error: {
    en: "You're set up and I can start translating — but I couldn't record you as the account holder, so /billing won't work yet. Contact support and we'll fix it.",
    uk: "Ти налаштований, і я можу перекладати — але не вдалося записати тебе власником акаунта, тож /billing поки не працюватиме. Напиши в підтримку, ми це виправимо.",
    es: "Estás configurado y puedo empezar a traducir — pero no he podido registrarte como titular de la cuenta, así que /billing aún no funcionará. Contacta con soporte y lo arreglamos.",
    fr: "Tu es configuré et je peux traduire — mais je n'ai pas pu t'enregistrer comme titulaire du compte, donc /billing ne marchera pas encore. Contacte le support, on corrigera ça.",
    de: "Du bist eingerichtet und ich kann übersetzen — aber ich konnte dich nicht als Kontoinhaber speichern, deshalb funktioniert /billing noch nicht. Melde dich beim Support, wir bringen das in Ordnung.",
    it: "Sei configurato e posso tradurre — ma non sono riuscito a registrarti come titolare dell'account, quindi /billing non funzionerà ancora. Contatta l'assistenza e lo sistemiamo.",
    pt: "Estás configurado e já posso traduzir — mas não consegui registar-te como titular da conta, por isso o /billing ainda não vai funcionar. Contacta o suporte e resolvemos.",
    pl: "Jesteś skonfigurowany i mogę tłumaczyć — ale nie udało się zapisać cię jako właściciela konta, więc /billing na razie nie zadziała. Napisz do wsparcia, naprawimy to.",
  },

  // ---------------------------------------------------------------- refusals
  refusal_expired: {
    en: "That setup link has expired. Open the billing portal from your receipt email, or contact support and we'll issue a new one.",
    uk: "Термін дії цього посилання минув. Відкрий портал оплати з листа-квитанції або напиши в підтримку — видамо нове.",
    es: "Ese enlace ha caducado. Abre el portal de facturación desde el correo del recibo, o contacta con soporte y te damos uno nuevo.",
    fr: "Ce lien a expiré. Ouvre le portail de facturation depuis l'e-mail de reçu, ou contacte le support pour en obtenir un nouveau.",
    de: "Dieser Link ist abgelaufen. Öffne das Abrechnungsportal aus deiner Beleg-E-Mail, oder melde dich beim Support für einen neuen.",
    it: "Quel link è scaduto. Apri il portale di fatturazione dall'email della ricevuta, o contatta l'assistenza per averne uno nuovo.",
    pt: "Esse link expirou. Abre o portal de faturação a partir do email do recibo, ou contacta o suporte para receberes um novo.",
    pl: "Ten link wygasł. Otwórz portal płatności z maila z potwierdzeniem albo napisz do wsparcia, wystawimy nowy.",
  },

  refusal_full: {
    en: "Both seats on that subscription are already taken. If you think that's wrong, contact support.",
    uk: "Обидва місця в цій підписці вже зайняті. Якщо це помилка, напиши в підтримку.",
    es: "Las dos plazas de esa suscripción ya están ocupadas. Si crees que es un error, contacta con soporte.",
    fr: "Les deux places de cet abonnement sont déjà prises. Si tu penses que c'est une erreur, contacte le support.",
    de: "Beide Plätze in diesem Abo sind schon belegt. Wenn das nicht stimmt, melde dich beim Support.",
    it: "Entrambi i posti di quell'abbonamento sono già occupati. Se pensi sia un errore, contatta l'assistenza.",
    pt: "Os dois lugares dessa subscrição já estão ocupados. Se achas que é engano, contacta o suporte.",
    pl: "Oba miejsca w tej subskrypcji są już zajęte. Jeśli to pomyłka, napisz do wsparcia.",
  },

  refusal_inactive: {
    en: "That subscription isn't active. If you've just paid, give it a minute and try again; otherwise check your billing details.",
    uk: "Ця підписка неактивна. Якщо ти щойно заплатив, зачекай хвилину і спробуй ще раз; інакше перевір дані оплати.",
    es: "Esa suscripción no está activa. Si acabas de pagar, espera un minuto y vuelve a intentarlo; si no, revisa tus datos de facturación.",
    fr: "Cet abonnement n'est pas actif. Si tu viens de payer, attends une minute et réessaie ; sinon, vérifie tes informations de facturation.",
    de: "Dieses Abo ist nicht aktiv. Wenn du gerade bezahlt hast, warte kurz und versuch es nochmal; sonst prüf deine Zahlungsdaten.",
    it: "Quell'abbonamento non è attivo. Se hai appena pagato, aspetta un minuto e riprova; altrimenti controlla i dati di fatturazione.",
    pt: "Essa subscrição não está ativa. Se acabaste de pagar, espera um minuto e tenta de novo; caso contrário verifica os dados de faturação.",
    pl: "Ta subskrypcja nie jest aktywna. Jeśli właśnie zapłaciłeś, poczekaj chwilę i spróbuj ponownie; w przeciwnym razie sprawdź dane płatności.",
  },

  refusal_unknown: {
    en: "I don't recognise that setup link. Check you've opened the most recent one from your receipt.",
    uk: "Я не впізнаю це посилання. Перевір, чи відкрив найновіше з квитанції.",
    es: "No reconozco ese enlace. Comprueba que has abierto el más reciente de tu recibo.",
    fr: "Je ne reconnais pas ce lien. Vérifie que tu as ouvert le plus récent de ton reçu.",
    de: "Diesen Link kenne ich nicht. Prüf, ob du den neuesten aus deinem Beleg geöffnet hast.",
    it: "Non riconosco quel link. Controlla di aver aperto il più recente della tua ricevuta.",
    pt: "Não reconheço esse link. Verifica se abriste o mais recente do teu recibo.",
    pl: "Nie rozpoznaję tego linku. Sprawdź, czy otworzyłeś najnowszy z potwierdzenia.",
  },

  ob_link_check_failed: {
    en: "Something went wrong checking that link. Please try again in a moment.",
    uk: "Не вдалося перевірити посилання. Спробуй ще раз за хвилину.",
    es: "Algo ha fallado al comprobar ese enlace. Inténtalo de nuevo en un momento.",
    fr: "Une erreur est survenue en vérifiant ce lien. Réessaie dans un instant.",
    de: "Beim Prüfen des Links ist etwas schiefgelaufen. Versuch es gleich noch mal.",
    it: "Qualcosa è andato storto controllando quel link. Riprova tra un momento.",
    pt: "Algo correu mal ao verificar esse link. Tenta outra vez daqui a pouco.",
    pl: "Coś poszło nie tak przy sprawdzaniu linku. Spróbuj za chwilę.",
  },

  // ---- Media forwarding, voice, and translation furniture -------------------
  //
  // The media keys take the emoji as a parameter rather than baking one key per media
  // type. Ten near-identical rows ("Got your photo...", "Got your sticker...") would be
  // ten chances for the noun's gender to be wrong in six languages nobody here can check,
  // and the noun earns nothing: the person just sent the thing, and their partner gets
  // the media itself immediately after this line. The icon carries the type; the sentence
  // stays grammatical everywhere.

  fwd_no_partner: {
    en: (v: any) => `${v.icon} Got it, but there's no partner to forward it to yet.`,
    uk: (v: any) => `${v.icon} Отримав, але поки немає партнера, щоб переслати.`,
    es: (v: any) => `${v.icon} Recibido, pero aún no hay pareja a quien reenviarlo.`,
    fr: (v: any) => `${v.icon} Bien reçu, mais il n'y a pas encore de partenaire à qui le transmettre.`,
    de: (v: any) => `${v.icon} Angekommen, aber es gibt noch niemanden, an den ich es weiterleiten kann.`,
    it: (v: any) => `${v.icon} Ricevuto, ma non c'è ancora un partner a cui inoltrarlo.`,
    pt: (v: any) => `${v.icon} Recebido, mas ainda não há parceiro para quem reencaminhar.`,
    pl: (v: any) => `${v.icon} Mam to, ale nie ma jeszcze partnera, komu przekazać.`,
  },

  fwd_done: {
    en: (v: any) => `${v.icon} Forwarded to your partner.`,
    uk: (v: any) => `${v.icon} Переслав твоєму партнеру.`,
    es: (v: any) => `${v.icon} Reenviado a tu pareja.`,
    fr: (v: any) => `${v.icon} Transmis à ton partenaire.`,
    de: (v: any) => `${v.icon} An deinen Partner weitergeleitet.`,
    it: (v: any) => `${v.icon} Inoltrato al tuo partner.`,
    pt: (v: any) => `${v.icon} Reencaminhado para o teu parceiro.`,
    pl: (v: any) => `${v.icon} Przekazane twojemu partnerowi.`,
  },

  fwd_partner_sent: {
    en: (v: any) => `${v.icon} ${v.name} sent this.`,
    uk: (v: any) => `${v.icon} ${v.name} надіслав(ла) це.`,
    es: (v: any) => `${v.icon} ${v.name} ha enviado esto.`,
    fr: (v: any) => `${v.icon} ${v.name} a envoyé ceci.`,
    de: (v: any) => `${v.icon} ${v.name} hat das geschickt.`,
    it: (v: any) => `${v.icon} ${v.name} ha inviato questo.`,
    pt: (v: any) => `${v.icon} ${v.name} enviou isto.`,
    pl: (v: any) => `${v.icon} ${v.name} to wysłał(a).`,
  },

  fwd_album_done: {
    en: (v: any) => `${v.icon} Album forwarded to your partner (${v.n} item${v.n === 1 ? "" : "s"}).`,
    uk: (v: any) => `${v.icon} Переслав альбом твоєму партнеру (${v.n} ${plUk(v.n, "елемент", "елементи", "елементів")}).`,
    es: (v: any) => `${v.icon} Álbum reenviado a tu pareja (${v.n} elemento${v.n === 1 ? "" : "s"}).`,
    fr: (v: any) => `${v.icon} Album transmis à ton partenaire (${v.n} élément${v.n === 1 ? "" : "s"}).`,
    de: (v: any) => `${v.icon} Album an deinen Partner weitergeleitet (${v.n} Element${v.n === 1 ? "" : "e"}).`,
    it: (v: any) => `${v.icon} Album inoltrato al tuo partner (${v.n} element${v.n === 1 ? "o" : "i"}).`,
    pt: (v: any) => `${v.icon} Álbum reencaminhado para o teu parceiro (${v.n} item${v.n === 1 ? "" : "s"}).`,
    pl: (v: any) => `${v.icon} Album przekazany partnerowi (${v.n} ${plUk(v.n, "element", "elementy", "elementów")}).`,
  },

  fwd_partner_album: {
    en: (v: any) => `${v.icon} ${v.name} sent an album of ${v.n}.`,
    uk: (v: any) => `${v.icon} ${v.name} надіслав(ла) альбом із ${v.n} ${plUk(v.n, "елемента", "елементів", "елементів")}.`,
    es: (v: any) => `${v.icon} ${v.name} ha enviado un álbum de ${v.n}.`,
    fr: (v: any) => `${v.icon} ${v.name} a envoyé un album de ${v.n}.`,
    de: (v: any) => `${v.icon} ${v.name} hat ein Album mit ${v.n} geschickt.`,
    it: (v: any) => `${v.icon} ${v.name} ha inviato un album di ${v.n}.`,
    pt: (v: any) => `${v.icon} ${v.name} enviou um álbum de ${v.n}.`,
    pl: (v: any) => `${v.icon} ${v.name} wysłał(a) album z ${v.n}.`,
  },

  fwd_says: {
    en: (v: any) => `💬 ${v.name} says (${v.lang}):`,
    uk: (v: any) => `💬 ${v.name} каже (${v.lang}):`,
    es: (v: any) => `💬 ${v.name} dice (${v.lang}):`,
    fr: (v: any) => `💬 ${v.name} dit (${v.lang}) :`,
    de: (v: any) => `💬 ${v.name} sagt (${v.lang}):`,
    it: (v: any) => `💬 ${v.name} dice (${v.lang}):`,
    pt: (v: any) => `💬 ${v.name} diz (${v.lang}):`,
    pl: (v: any) => `💬 ${v.name} mówi (${v.lang}):`,
  },

  fwd_said: {
    en: (v: any) => `💬 ${v.name} said (${v.lang}):`,
    uk: (v: any) => `💬 ${v.name} сказав(ла) (${v.lang}):`,
    es: (v: any) => `💬 ${v.name} ha dicho (${v.lang}):`,
    fr: (v: any) => `💬 ${v.name} a dit (${v.lang}) :`,
    de: (v: any) => `💬 ${v.name} sagte (${v.lang}):`,
    it: (v: any) => `💬 ${v.name} ha detto (${v.lang}):`,
    pt: (v: any) => `💬 ${v.name} disse (${v.lang}):`,
    pl: (v: any) => `💬 ${v.name} powiedział(a) (${v.lang}):`,
  },

  translation_header: {
    en: (v: any) => `🔤 Translation (${v.lang}):`,
    uk: (v: any) => `🔤 Переклад (${v.lang}):`,
    es: (v: any) => `🔤 Traducción (${v.lang}):`,
    fr: (v: any) => `🔤 Traduction (${v.lang}) :`,
    de: (v: any) => `🔤 Übersetzung (${v.lang}):`,
    it: (v: any) => `🔤 Traduzione (${v.lang}):`,
    pt: (v: any) => `🔤 Tradução (${v.lang}):`,
    pl: (v: any) => `🔤 Tłumaczenie (${v.lang}):`,
  },

  caption_translation_header: {
    en: (v: any) => `🔤 Caption translation (${v.lang}):`,
    uk: (v: any) => `🔤 Переклад підпису (${v.lang}):`,
    es: (v: any) => `🔤 Traducción del pie (${v.lang}):`,
    fr: (v: any) => `🔤 Traduction de la légende (${v.lang}) :`,
    de: (v: any) => `🔤 Übersetzung der Bildunterschrift (${v.lang}):`,
    it: (v: any) => `🔤 Traduzione della didascalia (${v.lang}):`,
    pt: (v: any) => `🔤 Tradução da legenda (${v.lang}):`,
    pl: (v: any) => `🔤 Tłumaczenie podpisu (${v.lang}):`,
  },


  caption_translation_failed: {
    en: (v: any) => `⚠️ Caption translation failed: ${v.err} The media was still forwarded.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти підпис: ${v.err} Медіа все одно переслано.`,
    es: (v: any) => `⚠️ La traducción del pie ha fallado: ${v.err} El archivo se ha reenviado igualmente.`,
    fr: (v: any) => `⚠️ La traduction de la légende a échoué : ${v.err} Le média a quand même été transmis.`,
    de: (v: any) => `⚠️ Übersetzung der Bildunterschrift fehlgeschlagen: ${v.err} Das Medium wurde trotzdem weitergeleitet.`,
    it: (v: any) => `⚠️ Traduzione della didascalia non riuscita: ${v.err} Il media è stato inoltrato comunque.`,
    pt: (v: any) => `⚠️ A tradução da legenda falhou: ${v.err} O ficheiro foi reencaminhado à mesma.`,
    pl: (v: any) => `⚠️ Tłumaczenie podpisu się nie udało: ${v.err} Plik i tak został przekazany.`,
  },

  voice_heard: {
    en: (v: any) => `🎙️ Heard (${v.lang}):`,
    uk: (v: any) => `🎙️ Почув (${v.lang}):`,
    es: (v: any) => `🎙️ He oído (${v.lang}):`,
    fr: (v: any) => `🎙️ Entendu (${v.lang}) :`,
    de: (v: any) => `🎙️ Gehört (${v.lang}):`,
    it: (v: any) => `🎙️ Sentito (${v.lang}):`,
    pt: (v: any) => `🎙️ Ouvi (${v.lang}):`,
    pl: (v: any) => `🎙️ Usłyszałem (${v.lang}):`,
  },

  voice_reach_failed: {
    en: "Couldn't reach Telegram to fetch the voice file. Try again in a moment.",
    uk: "Не вдалося зв'язатися з Telegram, щоб отримати голосове. Спробуй за хвилину.",
    es: "No he podido contactar con Telegram para obtener el audio. Inténtalo en un momento.",
    fr: "Impossible de joindre Telegram pour récupérer le vocal. Réessaie dans un instant.",
    de: "Telegram war nicht erreichbar, um die Sprachnachricht zu holen. Versuch es gleich noch mal.",
    it: "Non sono riuscito a contattare Telegram per il vocale. Riprova tra un momento.",
    pt: "Não consegui contactar o Telegram para obter o áudio. Tenta daqui a pouco.",
    pl: "Nie udało się połączyć z Telegramem po wiadomość głosową. Spróbuj za chwilę.",
  },

  voice_download_failed: {
    en: "Couldn't download the voice file from Telegram. Try again in a moment.",
    uk: "Не вдалося завантажити голосове з Telegram. Спробуй за хвилину.",
    es: "No he podido descargar el audio de Telegram. Inténtalo en un momento.",
    fr: "Impossible de télécharger le vocal depuis Telegram. Réessaie dans un instant.",
    de: "Die Sprachnachricht konnte nicht heruntergeladen werden. Versuch es gleich noch mal.",
    it: "Non sono riuscito a scaricare il vocale da Telegram. Riprova tra un momento.",
    pt: "Não consegui descarregar o áudio do Telegram. Tenta daqui a pouco.",
    pl: "Nie udało się pobrać wiadomości głosowej z Telegrama. Spróbuj za chwilę.",
  },

  voice_transcribe_failed: {
    en: (v: any) => `⚠️ Transcription failed: ${v.err}\n\nThe audio was saved, so it can be retried later.`,
    uk: (v: any) => `⚠️ Не вдалося розшифрувати: ${v.err}\n\nАудіо збережено, тож можна спробувати пізніше.`,
    es: (v: any) => `⚠️ La transcripción ha fallado: ${v.err}\n\nEl audio se ha guardado, así que puede reintentarse.`,
    fr: (v: any) => `⚠️ La transcription a échoué : ${v.err}\n\nL'audio est enregistré, on pourra réessayer.`,
    de: (v: any) => `⚠️ Transkription fehlgeschlagen: ${v.err}\n\nDas Audio wurde gespeichert und kann später erneut versucht werden.`,
    it: (v: any) => `⚠️ Trascrizione non riuscita: ${v.err}\n\nL'audio è stato salvato, si può riprovare più tardi.`,
    pt: (v: any) => `⚠️ A transcrição falhou: ${v.err}\n\nO áudio foi guardado, por isso pode tentar-se de novo.`,
    pl: (v: any) => `⚠️ Transkrypcja się nie udała: ${v.err}\n\nDźwięk został zapisany, więc można spróbować później.`,
  },


  original_label: {
    en: (v: any) => `<i>Original (${v.lang}):</i>`,
    uk: (v: any) => `<i>Оригінал (${v.lang}):</i>`,
    es: (v: any) => `<i>Original (${v.lang}):</i>`,
    fr: (v: any) => `<i>Original (${v.lang}) :</i>`,
    de: (v: any) => `<i>Original (${v.lang}):</i>`,
    it: (v: any) => `<i>Originale (${v.lang}):</i>`,
    pt: (v: any) => `<i>Original (${v.lang}):</i>`,
    pl: (v: any) => `<i>Oryginał (${v.lang}):</i>`,
  },


  translation_failed_saved: {
    en: (v: any) => `⚠️ Translation failed: ${v.err} Your message was saved.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти: ${v.err} Твоє повідомлення збережено.`,
    es: (v: any) => `⚠️ La traducción ha fallado: ${v.err} Tu mensaje se ha guardado.`,
    fr: (v: any) => `⚠️ La traduction a échoué : ${v.err} Ton message a été enregistré.`,
    de: (v: any) => `⚠️ Übersetzung fehlgeschlagen: ${v.err} Deine Nachricht wurde gespeichert.`,
    it: (v: any) => `⚠️ Traduzione non riuscita: ${v.err} Il tuo messaggio è stato salvato.`,
    pt: (v: any) => `⚠️ A tradução falhou: ${v.err} A tua mensagem foi guardada.`,
    pl: (v: any) => `⚠️ Tłumaczenie się nie udało: ${v.err} Twoja wiadomość została zapisana.`,
  },

  translation_failed_transcript: {
    en: (v: any) => `⚠️ Translation failed: ${v.err} The transcript was saved.`,
    uk: (v: any) => `⚠️ Не вдалося перекласти: ${v.err} Розшифровку збережено.`,
    es: (v: any) => `⚠️ La traducción ha fallado: ${v.err} La transcripción se ha guardado.`,
    fr: (v: any) => `⚠️ La traduction a échoué : ${v.err} La transcription a été enregistrée.`,
    de: (v: any) => `⚠️ Übersetzung fehlgeschlagen: ${v.err} Das Transkript wurde gespeichert.`,
    it: (v: any) => `⚠️ Traduzione non riuscita: ${v.err} La trascrizione è stata salvata.`,
    pt: (v: any) => `⚠️ A tradução falhou: ${v.err} A transcrição foi guardada.`,
    pl: (v: any) => `⚠️ Tłumaczenie się nie udało: ${v.err} Transkrypcja została zapisana.`,
  },


  // ---- Onboarding tail, account deletion ------------------------------------

  ob_step_expired: {
    en: "That setup step is no longer available. Open your invite link again.",
    uk: "Цей крок налаштування вже недоступний. Відкрий своє посилання-запрошення ще раз.",
    es: "Ese paso de configuración ya no está disponible. Abre tu enlace de invitación otra vez.",
    fr: "Cette étape de configuration n'est plus disponible. Rouvre ton lien d'invitation.",
    de: "Dieser Einrichtungsschritt ist nicht mehr verfügbar. Öffne deinen Einladungslink erneut.",
    it: "Questo passaggio non è più disponibile. Riapri il tuo link di invito.",
    pt: "Esse passo já não está disponível. Abre outra vez o teu link de convite.",
    pl: "Ten krok konfiguracji jest już niedostępny. Otwórz ponownie swój link z zaproszeniem.",
  },

  ob_partner_joined: {
    en: (v: any) => `${v.name} just joined. You're both set up — send a message and I'll translate it.`,
    uk: (v: any) => `${v.name} щойно приєднався(лась). Ви обоє готові — надішли повідомлення, і я перекладу.`,
    es: (v: any) => `${v.name} acaba de unirse. Ya estáis listos: envía un mensaje y lo traduzco.`,
    fr: (v: any) => `${v.name} vient de rejoindre. Vous êtes prêts tous les deux — envoie un message et je le traduis.`,
    de: (v: any) => `${v.name} ist gerade beigetreten. Ihr seid beide startklar — schick eine Nachricht, ich übersetze sie.`,
    it: (v: any) => `${v.name} si è appena unito/a. Siete pronti entrambi: manda un messaggio e lo traduco.`,
    pt: (v: any) => `${v.name} acabou de entrar. Estão os dois prontos — envia uma mensagem e eu traduzo.`,
    pl: (v: any) => `${v.name} właśnie dołączył(a). Oboje jesteście gotowi — wyślij wiadomość, a ja ją przetłumaczę.`,
  },

  account_deleted_self: {
    en: "Your account and all its data have been deleted, and your subscription is cancelled. Take care. 🐹",
    uk: "Твій акаунт і всі його дані видалено, підписку скасовано. Бережи себе. 🐹",
    es: "Tu cuenta y todos sus datos se han eliminado, y tu suscripción está cancelada. Cuídate. 🐹",
    fr: "Ton compte et toutes ses données ont été supprimés, et ton abonnement est résilié. Prends soin de toi. 🐹",
    de: "Dein Konto und alle Daten wurden gelöscht, dein Abo ist gekündigt. Mach's gut. 🐹",
    it: "Il tuo account e tutti i suoi dati sono stati eliminati, e l'abbonamento è annullato. Stammi bene. 🐹",
    pt: "A tua conta e todos os dados foram eliminados, e a subscrição foi cancelada. Fica bem. 🐹",
    pl: "Twoje konto i wszystkie dane zostały usunięte, a subskrypcja anulowana. Trzymaj się. 🐹",
  },

  account_deleted_partner: {
    en: "Capybara here — the account you shared has been deleted by its owner. All of its data is gone. Take care. 🐹",
    uk: "Це Capybara — акаунт, який ви ділили, видалено його власником. Усі його дані зникли. Бережи себе. 🐹",
    es: "Soy Capybara: la cuenta que compartíais ha sido eliminada por su propietario. Todos sus datos han desaparecido. Cuídate. 🐹",
    fr: "Ici Capybara — le compte que vous partagiez a été supprimé par son propriétaire. Toutes ses données ont disparu. Prends soin de toi. 🐹",
    de: "Hier ist Capybara — das gemeinsame Konto wurde vom Inhaber gelöscht. Alle Daten sind weg. Mach's gut. 🐹",
    it: "Qui Capybara: l'account che condividevate è stato eliminato dal proprietario. Tutti i suoi dati non ci sono più. Stammi bene. 🐹",
    pt: "Fala a Capybara — a conta que partilhavam foi eliminada pelo dono. Todos os seus dados desapareceram. Fica bem. 🐹",
    pl: "Tu Capybara — konto, które współdzieliliście, zostało usunięte przez właściciela. Wszystkie jego dane zniknęły. Trzymaj się. 🐹",
  },

  // ---- /export ---------------------------------------------------------------

  export_building: {
    en: "⏳ Building your export…",
    uk: "⏳ Готую експорт…",
    es: "⏳ Preparando tu exportación…",
    fr: "⏳ Préparation de ton export…",
    de: "⏳ Export wird erstellt…",
    it: "⏳ Sto preparando l'esportazione…",
    pt: "⏳ A preparar a tua exportação…",
    pl: "⏳ Przygotowuję eksport…",
  },

  export_failed: {
    en: "Couldn't build the export. Check function logs.",
    uk: "Не вдалося зібрати експорт. Перевір логи функції.",
    es: "No he podido generar la exportación. Revisa los registros.",
    fr: "Impossible de générer l'export. Vérifie les journaux.",
    de: "Der Export konnte nicht erstellt werden. Prüf die Logs.",
    it: "Non sono riuscito a creare l'esportazione. Controlla i log.",
    pt: "Não consegui criar a exportação. Verifica os registos.",
    pl: "Nie udało się zbudować eksportu. Sprawdź logi funkcji.",
  },

  export_empty: {
    en: "Nothing to export yet.\n\nUse /vocab and /learn to add words, or turn on /capybara so your corrections build a grammar deck.",
    uk: "Поки нема чого експортувати.\n\nСкористайся /vocab і /learn, щоб додати слова, або увімкни /capybara — і твої виправлення побудують граматичну колоду.",
    es: "Todavía no hay nada que exportar.\n\nUsa /vocab y /learn para añadir palabras, o activa /capybara para que tus correcciones formen un mazo de gramática.",
    fr: "Rien à exporter pour l'instant.\n\nUtilise /vocab et /learn pour ajouter des mots, ou active /capybara pour que tes corrections forment un paquet de grammaire.",
    de: "Noch nichts zu exportieren.\n\nNutz /vocab und /learn, um Wörter hinzuzufügen, oder schalte /capybara ein, damit deine Korrekturen ein Grammatik-Deck bilden.",
    it: "Non c'è ancora nulla da esportare.\n\nUsa /vocab e /learn per aggiungere parole, o attiva /capybara così le tue correzioni creano un mazzo di grammatica.",
    pt: "Ainda não há nada para exportar.\n\nUsa /vocab e /learn para juntar palavras, ou liga o /capybara para que as tuas correções criem um baralho de gramática.",
    pl: "Nie ma jeszcze czego eksportować.\n\nUżyj /vocab i /learn, żeby dodać słowa, albo włącz /capybara, żeby twoje poprawki zbudowały talię gramatyczną.",
  },

  // ---- /learn and /forget ----------------------------------------------------
  //
  // Own-deck and partner-deck are separate keys rather than one key with a
  // "your"/"Kika's" possessive spliced in. English builds a possessive by appending
  // 's to any noun; Ukrainian and Polish inflect the noun itself, and German and
  // Italian restructure the phrase. An interpolated possessive is correct in exactly
  // one of the eight languages.

  learn_lang_unrecognized: {
    en: (v: any) => `Didn't recognise "${v.token}" as a language. Use ${v.codes}.`,
    uk: (v: any) => `Не розпізнав "${v.token}" як мову. Використай ${v.codes}.`,
    es: (v: any) => `No he reconocido "${v.token}" como idioma. Usa ${v.codes}.`,
    fr: (v: any) => `Je n'ai pas reconnu "${v.token}" comme une langue. Utilise ${v.codes}.`,
    de: (v: any) => `"${v.token}" ist keine mir bekannte Sprache. Nimm ${v.codes}.`,
    it: (v: any) => `Non ho riconosciuto "${v.token}" come lingua. Usa ${v.codes}.`,
    pt: (v: any) => `Não reconheci "${v.token}" como idioma. Usa ${v.codes}.`,
    pl: (v: any) => `Nie rozpoznałem "${v.token}" jako języka. Użyj ${v.codes}.`,
  },

  learn_no_learner: {
    en: (v: any) => `Couldn't find anyone learning ${v.lang}. No deck to add to.`,
    uk: (v: any) => `Не знайшов нікого, хто вивчає ${v.lang}. Немає колоди, куди додати.`,
    es: (v: any) => `No he encontrado a nadie que esté aprendiendo ${v.lang}. No hay mazo al que añadir.`,
    fr: (v: any) => `Personne n'apprend ${v.lang}. Aucun paquet où ajouter.`,
    de: (v: any) => `Niemand lernt ${v.lang}. Es gibt kein Deck zum Hinzufügen.`,
    it: (v: any) => `Non ho trovato nessuno che stia imparando ${v.lang}. Nessun mazzo a cui aggiungere.`,
    pt: (v: any) => `Não encontrei ninguém a aprender ${v.lang}. Não há baralho para juntar.`,
    pl: (v: any) => `Nie znalazłem nikogo, kto uczy się ${v.lang}. Nie ma talii, do której dodać.`,
  },

  learn_none_unlearned_own: {
    en: (v: any) => `No unlearned ${v.lang} words available for your deck.\n\nRun /vocab to see the current top words.`,
    uk: (v: any) => `Немає невивчених ${v.lang} слів для твоєї колоди.\n\nЗапусти /vocab, щоб побачити поточні найчастіші слова.`,
    es: (v: any) => `No hay palabras de ${v.lang} sin aprender para tu mazo.\n\nUsa /vocab para ver las más frecuentes.`,
    fr: (v: any) => `Aucun mot de ${v.lang} non appris pour ton paquet.\n\nLance /vocab pour voir les mots les plus fréquents.`,
    de: (v: any) => `Keine ungelernten ${v.lang}-Wörter für dein Deck.\n\nMit /vocab siehst du die häufigsten Wörter.`,
    it: (v: any) => `Nessuna parola di ${v.lang} non ancora imparata per il tuo mazzo.\n\nUsa /vocab per vedere le più frequenti.`,
    pt: (v: any) => `Não há palavras de ${v.lang} por aprender para o teu baralho.\n\nUsa /vocab para veres as mais frequentes.`,
    pl: (v: any) => `Brak nienauczonych słów (${v.lang}) do twojej talii.\n\nUżyj /vocab, żeby zobaczyć najczęstsze słowa.`,
  },

  learn_none_unlearned_partner: {
    en: (v: any) => `No unlearned ${v.lang} words available for ${v.name}'s deck.\n\nRun /vocab to see the current top words.`,
    uk: (v: any) => `Немає невивчених ${v.lang} слів для колоди ${v.name}.\n\nЗапусти /vocab, щоб побачити поточні найчастіші слова.`,
    es: (v: any) => `No hay palabras de ${v.lang} sin aprender para el mazo de ${v.name}.\n\nUsa /vocab para ver las más frecuentes.`,
    fr: (v: any) => `Aucun mot de ${v.lang} non appris pour le paquet de ${v.name}.\n\nLance /vocab pour voir les mots les plus fréquents.`,
    de: (v: any) => `Keine ungelernten ${v.lang}-Wörter für das Deck von ${v.name}.\n\nMit /vocab siehst du die häufigsten Wörter.`,
    it: (v: any) => `Nessuna parola di ${v.lang} non ancora imparata per il mazzo di ${v.name}.\n\nUsa /vocab per vedere le più frequenti.`,
    pt: (v: any) => `Não há palavras de ${v.lang} por aprender para o baralho de ${v.name}.\n\nUsa /vocab para veres as mais frequentes.`,
    pl: (v: any) => `Brak nienauczonych słów (${v.lang}) do talii ${v.name}.\n\nUżyj /vocab, żeby zobaczyć najczęstsze słowa.`,
  },

  learn_added_top_own: {
    en: (v: any) => `✅ Added ${v.n} ${v.lang} word${v.n === 1 ? "" : "s"} to your ${v.deck}:`,
    uk: (v: any) => `✅ Додав ${v.n} ${plUk(v.n, "слово", "слова", "слів")} (${v.lang}) до твоєї колоди ${v.deck}:`,
    es: (v: any) => `✅ Añadidas ${v.n} palabra${v.n === 1 ? "" : "s"} de ${v.lang} a tu ${v.deck}:`,
    fr: (v: any) => `✅ ${v.n} mot${v.n === 1 ? "" : "s"} de ${v.lang} ajouté${v.n === 1 ? "" : "s"} à ton ${v.deck} :`,
    de: (v: any) => `✅ ${v.n} ${v.lang}-Wort${v.n === 1 ? "" : "e"} zu deinem ${v.deck} hinzugefügt:`,
    it: (v: any) => `✅ Aggiunte ${v.n} parol${v.n === 1 ? "a" : "e"} di ${v.lang} al tuo ${v.deck}:`,
    pt: (v: any) => `✅ Adicionadas ${v.n} palavra${v.n === 1 ? "" : "s"} de ${v.lang} ao teu ${v.deck}:`,
    pl: (v: any) => `✅ Dodano ${v.n} ${plUk(v.n, "słowo", "słowa", "słów")} (${v.lang}) do twojej talii ${v.deck}:`,
  },

  learn_added_top_partner: {
    en: (v: any) => `✅ Added ${v.n} ${v.lang} word${v.n === 1 ? "" : "s"} to ${v.name}'s ${v.deck}:`,
    uk: (v: any) => `✅ Додав ${v.n} ${plUk(v.n, "слово", "слова", "слів")} (${v.lang}) до колоди ${v.name} ${v.deck}:`,
    es: (v: any) => `✅ Añadidas ${v.n} palabra${v.n === 1 ? "" : "s"} de ${v.lang} al ${v.deck} de ${v.name}:`,
    fr: (v: any) => `✅ ${v.n} mot${v.n === 1 ? "" : "s"} de ${v.lang} ajouté${v.n === 1 ? "" : "s"} au ${v.deck} de ${v.name} :`,
    de: (v: any) => `✅ ${v.n} ${v.lang}-Wort${v.n === 1 ? "" : "e"} zum ${v.deck} von ${v.name} hinzugefügt:`,
    it: (v: any) => `✅ Aggiunte ${v.n} parol${v.n === 1 ? "a" : "e"} di ${v.lang} al ${v.deck} di ${v.name}:`,
    pt: (v: any) => `✅ Adicionadas ${v.n} palavra${v.n === 1 ? "" : "s"} de ${v.lang} ao ${v.deck} de ${v.name}:`,
    pl: (v: any) => `✅ Dodano ${v.n} ${plUk(v.n, "słowo", "słowa", "słów")} (${v.lang}) do talii ${v.name} ${v.deck}:`,
  },

  learn_capped: {
    en: (v: any) => `\n\n<i>(Capped at ${v.max}; requested ${v.requested}.)</i>`,
    uk: (v: any) => `\n\n<i>(Обмежено до ${v.max}; запитано ${v.requested}.)</i>`,
    es: (v: any) => `\n\n<i>(Limitado a ${v.max}; solicitadas ${v.requested}.)</i>`,
    fr: (v: any) => `\n\n<i>(Limité à ${v.max} ; ${v.requested} demandés.)</i>`,
    de: (v: any) => `\n\n<i>(Auf ${v.max} begrenzt; ${v.requested} angefragt.)</i>`,
    it: (v: any) => `\n\n<i>(Limitato a ${v.max}; richieste ${v.requested}.)</i>`,
    pt: (v: any) => `\n\n<i>(Limitado a ${v.max}; pedidas ${v.requested}.)</i>`,
    pl: (v: any) => `\n\n<i>(Ograniczono do ${v.max}; zażądano ${v.requested}.)</i>`,
  },

  learn_export_hint_own: {
    en: "\n\n<i>Run /export when you want to import into Anki.</i>",
    uk: "\n\n<i>Запусти /export, коли захочеш імпортувати в Anki.</i>",
    es: "\n\n<i>Usa /export cuando quieras importar a Anki.</i>",
    fr: "\n\n<i>Lance /export quand tu veux importer dans Anki.</i>",
    de: "\n\n<i>Nutz /export, wenn du nach Anki importieren willst.</i>",
    it: "\n\n<i>Usa /export quando vuoi importare in Anki.</i>",
    pt: "\n\n<i>Usa /export quando quiseres importar para o Anki.</i>",
    pl: "\n\n<i>Użyj /export, gdy zechcesz zaimportować do Anki.</i>",
  },

  learn_export_hint_partner: {
    en: (v: any) => `\n\n<i>${v.name} can run /export to import into Anki.</i>`,
    uk: (v: any) => `\n\n<i>${v.name} може запустити /export, щоб імпортувати в Anki.</i>`,
    es: (v: any) => `\n\n<i>${v.name} puede usar /export para importar a Anki.</i>`,
    fr: (v: any) => `\n\n<i>${v.name} peut lancer /export pour importer dans Anki.</i>`,
    de: (v: any) => `\n\n<i>${v.name} kann /export nutzen, um nach Anki zu importieren.</i>`,
    it: (v: any) => `\n\n<i>${v.name} può usare /export per importare in Anki.</i>`,
    pt: (v: any) => `\n\n<i>${v.name} pode usar /export para importar para o Anki.</i>`,
    pl: (v: any) => `\n\n<i>${v.name} może użyć /export, żeby zaimportować do Anki.</i>`,
  },

  vocab_word_not_found: {
    en: (v: any) => `Couldn't find "${v.word}" in the ${v.lang} vocabulary.\n\nRun /vocab to see words that have appeared in your conversations.`,
    uk: (v: any) => `Не знайшов "${v.word}" у словнику (${v.lang}).\n\nЗапусти /vocab, щоб побачити слова з ваших розмов.`,
    es: (v: any) => `No he encontrado "${v.word}" en el vocabulario de ${v.lang}.\n\nUsa /vocab para ver las palabras que han aparecido.`,
    fr: (v: any) => `"${v.word}" est introuvable dans le vocabulaire ${v.lang}.\n\nLance /vocab pour voir les mots déjà apparus.`,
    de: (v: any) => `"${v.word}" ist im ${v.lang}-Wortschatz nicht zu finden.\n\nMit /vocab siehst du die bisher aufgetauchten Wörter.`,
    it: (v: any) => `Non trovo "${v.word}" nel vocabolario di ${v.lang}.\n\nUsa /vocab per vedere le parole già comparse.`,
    pt: (v: any) => `Não encontrei "${v.word}" no vocabulário de ${v.lang}.\n\nUsa /vocab para veres as palavras que já apareceram.`,
    pl: (v: any) => `Nie znalazłem "${v.word}" w słownictwie (${v.lang}).\n\nUżyj /vocab, żeby zobaczyć słowa z waszych rozmów.`,
  },

  vocab_word_not_found_short: {
    en: (v: any) => `Couldn't find "${v.word}" in the ${v.lang} vocabulary.`,
    uk: (v: any) => `Не знайшов "${v.word}" у словнику (${v.lang}).`,
    es: (v: any) => `No he encontrado "${v.word}" en el vocabulario de ${v.lang}.`,
    fr: (v: any) => `"${v.word}" est introuvable dans le vocabulaire ${v.lang}.`,
    de: (v: any) => `"${v.word}" ist im ${v.lang}-Wortschatz nicht zu finden.`,
    it: (v: any) => `Non trovo "${v.word}" nel vocabolario di ${v.lang}.`,
    pt: (v: any) => `Não encontrei "${v.word}" no vocabulário de ${v.lang}.`,
    pl: (v: any) => `Nie znalazłem "${v.word}" w słownictwie (${v.lang}).`,
  },

  learn_already_own: {
    en: (v: any) => `"${v.word}" is already in your ${v.deck}.`,
    uk: (v: any) => `"${v.word}" уже є у твоїй колоді ${v.deck}.`,
    es: (v: any) => `"${v.word}" ya está en tu ${v.deck}.`,
    fr: (v: any) => `"${v.word}" est déjà dans ton ${v.deck}.`,
    de: (v: any) => `"${v.word}" ist schon in deinem ${v.deck}.`,
    it: (v: any) => `"${v.word}" è già nel tuo ${v.deck}.`,
    pt: (v: any) => `"${v.word}" já está no teu ${v.deck}.`,
    pl: (v: any) => `"${v.word}" jest już w twojej talii ${v.deck}.`,
  },

  learn_already_partner: {
    en: (v: any) => `"${v.word}" is already in ${v.name}'s ${v.deck}.`,
    uk: (v: any) => `"${v.word}" уже є в колоді ${v.name} ${v.deck}.`,
    es: (v: any) => `"${v.word}" ya está en el ${v.deck} de ${v.name}.`,
    fr: (v: any) => `"${v.word}" est déjà dans le ${v.deck} de ${v.name}.`,
    de: (v: any) => `"${v.word}" ist schon im ${v.deck} von ${v.name}.`,
    it: (v: any) => `"${v.word}" è già nel ${v.deck} di ${v.name}.`,
    pt: (v: any) => `"${v.word}" já está no ${v.deck} de ${v.name}.`,
    pl: (v: any) => `"${v.word}" jest już w talii ${v.name} ${v.deck}.`,
  },

  learn_added_own: {
    en: (v: any) => v.n === 1 ? `✅ Added to your ${v.deck}:` : `✅ Added ${v.n} entries to your ${v.deck}:`,
    uk: (v: any) => v.n === 1 ? `✅ Додав до твоєї колоди ${v.deck}:` : `✅ Додав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} до твоєї колоди ${v.deck}:`,
    es: (v: any) => v.n === 1 ? `✅ Añadido a tu ${v.deck}:` : `✅ Añadidas ${v.n} entradas a tu ${v.deck}:`,
    fr: (v: any) => v.n === 1 ? `✅ Ajouté à ton ${v.deck} :` : `✅ ${v.n} entrées ajoutées à ton ${v.deck} :`,
    de: (v: any) => v.n === 1 ? `✅ Zu deinem ${v.deck} hinzugefügt:` : `✅ ${v.n} Einträge zu deinem ${v.deck} hinzugefügt:`,
    it: (v: any) => v.n === 1 ? `✅ Aggiunto al tuo ${v.deck}:` : `✅ Aggiunte ${v.n} voci al tuo ${v.deck}:`,
    pt: (v: any) => v.n === 1 ? `✅ Adicionado ao teu ${v.deck}:` : `✅ Adicionadas ${v.n} entradas ao teu ${v.deck}:`,
    pl: (v: any) => v.n === 1 ? `✅ Dodano do twojej talii ${v.deck}:` : `✅ Dodano ${v.n} ${plUk(v.n, "wpis", "wpisy", "wpisów")} do twojej talii ${v.deck}:`,
  },

  learn_added_partner: {
    en: (v: any) => v.n === 1 ? `✅ Added to ${v.name}'s ${v.deck}:` : `✅ Added ${v.n} entries to ${v.name}'s ${v.deck}:`,
    uk: (v: any) => v.n === 1 ? `✅ Додав до колоди ${v.name} ${v.deck}:` : `✅ Додав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} до колоди ${v.name} ${v.deck}:`,
    es: (v: any) => v.n === 1 ? `✅ Añadido al ${v.deck} de ${v.name}:` : `✅ Añadidas ${v.n} entradas al ${v.deck} de ${v.name}:`,
    fr: (v: any) => v.n === 1 ? `✅ Ajouté au ${v.deck} de ${v.name} :` : `✅ ${v.n} entrées ajoutées au ${v.deck} de ${v.name} :`,
    de: (v: any) => v.n === 1 ? `✅ Zum ${v.deck} von ${v.name} hinzugefügt:` : `✅ ${v.n} Einträge zum ${v.deck} von ${v.name} hinzugefügt:`,
    it: (v: any) => v.n === 1 ? `✅ Aggiunto al ${v.deck} di ${v.name}:` : `✅ Aggiunte ${v.n} voci al ${v.deck} di ${v.name}:`,
    pt: (v: any) => v.n === 1 ? `✅ Adicionado ao ${v.deck} de ${v.name}:` : `✅ Adicionadas ${v.n} entradas ao ${v.deck} de ${v.name}:`,
    pl: (v: any) => v.n === 1 ? `✅ Dodano do talii ${v.name} ${v.deck}:` : `✅ Dodano ${v.n} ${plUk(v.n, "wpis", "wpisy", "wpisów")} do talii ${v.name} ${v.deck}:`,
  },

  learn_matched_as: {
    en: (v: any) => `\n\nMatched as "${v.lemma}" (dictionary form of "${v.arg}").`,
    uk: (v: any) => `\n\nЗнайдено як "${v.lemma}" (словникова форма "${v.arg}").`,
    es: (v: any) => `\n\nEncontrado como "${v.lemma}" (forma de diccionario de "${v.arg}").`,
    fr: (v: any) => `\n\nTrouvé sous "${v.lemma}" (forme de dictionnaire de "${v.arg}").`,
    de: (v: any) => `\n\nGefunden als "${v.lemma}" (Grundform von "${v.arg}").`,
    it: (v: any) => `\n\nTrovato come "${v.lemma}" (forma base di "${v.arg}").`,
    pt: (v: any) => `\n\nEncontrado como "${v.lemma}" (forma de dicionário de "${v.arg}").`,
    pl: (v: any) => `\n\nDopasowano jako "${v.lemma}" (forma słownikowa "${v.arg}").`,
  },

  learn_skipped: {
    en: (v: any) => `\n\n<i>(${v.n} already in deck, skipped)</i>`,
    uk: (v: any) => `\n\n<i>(${v.n} уже в колоді, пропущено)</i>`,
    es: (v: any) => `\n\n<i>(${v.n} ya en el mazo, omitidas)</i>`,
    fr: (v: any) => `\n\n<i>(${v.n} déjà dans le paquet, ignorés)</i>`,
    de: (v: any) => `\n\n<i>(${v.n} schon im Deck, übersprungen)</i>`,
    it: (v: any) => `\n\n<i>(${v.n} già nel mazzo, saltate)</i>`,
    pt: (v: any) => `\n\n<i>(${v.n} já no baralho, ignoradas)</i>`,
    pl: (v: any) => `\n\n<i>(${v.n} już w talii, pominięto)</i>`,
  },

  forget_not_in_own: {
    en: (v: any) => `"${v.word}" wasn't in your ${v.deck}.`,
    uk: (v: any) => `"${v.word}" не було у твоїй колоді ${v.deck}.`,
    es: (v: any) => `"${v.word}" no estaba en tu ${v.deck}.`,
    fr: (v: any) => `"${v.word}" n'était pas dans ton ${v.deck}.`,
    de: (v: any) => `"${v.word}" war nicht in deinem ${v.deck}.`,
    it: (v: any) => `"${v.word}" non era nel tuo ${v.deck}.`,
    pt: (v: any) => `"${v.word}" não estava no teu ${v.deck}.`,
    pl: (v: any) => `"${v.word}" nie było w twojej talii ${v.deck}.`,
  },

  forget_not_in_partner: {
    en: (v: any) => `"${v.word}" wasn't in ${v.name}'s ${v.deck}.`,
    uk: (v: any) => `"${v.word}" не було в колоді ${v.name} ${v.deck}.`,
    es: (v: any) => `"${v.word}" no estaba en el ${v.deck} de ${v.name}.`,
    fr: (v: any) => `"${v.word}" n'était pas dans le ${v.deck} de ${v.name}.`,
    de: (v: any) => `"${v.word}" war nicht im ${v.deck} von ${v.name}.`,
    it: (v: any) => `"${v.word}" non era nel ${v.deck} di ${v.name}.`,
    pt: (v: any) => `"${v.word}" não estava no ${v.deck} de ${v.name}.`,
    pl: (v: any) => `"${v.word}" nie było w talii ${v.name} ${v.deck}.`,
  },

  forget_removed_own: {
    en: (v: any) => v.n === 1 ? `➖ Removed from your ${v.deck}:` : `➖ Removed ${v.n} entries from your ${v.deck}:`,
    uk: (v: any) => v.n === 1 ? `➖ Прибрав із твоєї колоди ${v.deck}:` : `➖ Прибрав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} із твоєї колоди ${v.deck}:`,
    es: (v: any) => v.n === 1 ? `➖ Eliminado de tu ${v.deck}:` : `➖ Eliminadas ${v.n} entradas de tu ${v.deck}:`,
    fr: (v: any) => v.n === 1 ? `➖ Retiré de ton ${v.deck} :` : `➖ ${v.n} entrées retirées de ton ${v.deck} :`,
    de: (v: any) => v.n === 1 ? `➖ Aus deinem ${v.deck} entfernt:` : `➖ ${v.n} Einträge aus deinem ${v.deck} entfernt:`,
    it: (v: any) => v.n === 1 ? `➖ Rimosso dal tuo ${v.deck}:` : `➖ Rimosse ${v.n} voci dal tuo ${v.deck}:`,
    pt: (v: any) => v.n === 1 ? `➖ Removido do teu ${v.deck}:` : `➖ Removidas ${v.n} entradas do teu ${v.deck}:`,
    pl: (v: any) => v.n === 1 ? `➖ Usunięto z twojej talii ${v.deck}:` : `➖ Usunięto ${v.n} ${plUk(v.n, "wpis", "wpisy", "wpisów")} z twojej talii ${v.deck}:`,
  },

  forget_removed_partner: {
    en: (v: any) => v.n === 1 ? `➖ Removed from ${v.name}'s ${v.deck}:` : `➖ Removed ${v.n} entries from ${v.name}'s ${v.deck}:`,
    uk: (v: any) => v.n === 1 ? `➖ Прибрав із колоди ${v.name} ${v.deck}:` : `➖ Прибрав ${v.n} ${plUk(v.n, "запис", "записи", "записів")} із колоди ${v.name} ${v.deck}:`,
    es: (v: any) => v.n === 1 ? `➖ Eliminado del ${v.deck} de ${v.name}:` : `➖ Eliminadas ${v.n} entradas del ${v.deck} de ${v.name}:`,
    fr: (v: any) => v.n === 1 ? `➖ Retiré du ${v.deck} de ${v.name} :` : `➖ ${v.n} entrées retirées du ${v.deck} de ${v.name} :`,
    de: (v: any) => v.n === 1 ? `➖ Aus dem ${v.deck} von ${v.name} entfernt:` : `➖ ${v.n} Einträge aus dem ${v.deck} von ${v.name} entfernt:`,
    it: (v: any) => v.n === 1 ? `➖ Rimosso dal ${v.deck} di ${v.name}:` : `➖ Rimosse ${v.n} voci dal ${v.deck} di ${v.name}:`,
    pt: (v: any) => v.n === 1 ? `➖ Removido do ${v.deck} de ${v.name}:` : `➖ Removidas ${v.n} entradas do ${v.deck} de ${v.name}:`,
    pl: (v: any) => v.n === 1 ? `➖ Usunięto z talii ${v.name} ${v.deck}:` : `➖ Usunięto ${v.n} ${plUk(v.n, "wpis", "wpisy", "wpisów")} z talii ${v.name} ${v.deck}:`,
  },

  forget_anki_note: {
    en: "\n\n<i>If this card was already imported into Anki, delete it there too.</i>",
    uk: "\n\n<i>Якщо цю картку вже імпортовано в Anki, видали її і там.</i>",
    es: "\n\n<i>Si esta tarjeta ya se importó a Anki, elimínala también allí.</i>",
    fr: "\n\n<i>Si cette carte a déjà été importée dans Anki, supprime-la aussi là-bas.</i>",
    de: "\n\n<i>Falls diese Karte schon in Anki importiert wurde, lösch sie auch dort.</i>",
    it: "\n\n<i>Se questa carta è già stata importata in Anki, eliminala anche lì.</i>",
    pt: "\n\n<i>Se este cartão já foi importado para o Anki, apaga-o também lá.</i>",
    pl: "\n\n<i>Jeśli ta karta trafiła już do Anki, usuń ją również tam.</i>",
  },


  // ---- /recap satellites: pins, notes, reconcile --------------------------------

  msg_not_in_corpus: {
    en: "Couldn't find that message in the corpus.",
    uk: "Не знайшов цього повідомлення в корпусі.",
    es: "No he encontrado ese mensaje en el corpus.",
    fr: "Je ne trouve pas ce message dans le corpus.",
    de: "Diese Nachricht ist nicht im Korpus zu finden.",
    it: "Non trovo quel messaggio nel corpus.",
    pt: "Não encontrei essa mensagem no corpus.",
    pl: "Nie znalazłem tej wiadomości w korpusie.",
  },

  reconcile_usage: {
    en: "Reply to a message with /reconcile to exclude it from /recap results.",
    uk: "Відповідай на повідомлення командою /reconcile, щоб виключити його з результатів /recap.",
    es: "Responde a un mensaje con /reconcile para excluirlo de los resultados de /recap.",
    fr: "Réponds à un message avec /reconcile pour l'exclure des résultats de /recap.",
    de: "Antworte auf eine Nachricht mit /reconcile, um sie aus /recap auszuschließen.",
    it: "Rispondi a un messaggio con /reconcile per escluderlo dai risultati di /recap.",
    pt: "Responde a uma mensagem com /reconcile para a excluir dos resultados de /recap.",
    pl: "Odpowiedz na wiadomość komendą /reconcile, żeby wykluczyć ją z wyników /recap.",
  },

  reconcile_not_found: {
    en: "Couldn't find that message in the corpus. /reconcile works on replies to messages I've stored in this conversation.",
    uk: "Не знайшов цього повідомлення в корпусі. /reconcile працює з відповідями на повідомлення, які я зберіг у цій розмові.",
    es: "No he encontrado ese mensaje en el corpus. /reconcile funciona sobre respuestas a mensajes que he guardado en esta conversación.",
    fr: "Je ne trouve pas ce message dans le corpus. /reconcile fonctionne sur les réponses aux messages que j'ai enregistrés ici.",
    de: "Diese Nachricht ist nicht im Korpus. /reconcile funktioniert bei Antworten auf Nachrichten, die ich hier gespeichert habe.",
    it: "Non trovo quel messaggio nel corpus. /reconcile funziona sulle risposte ai messaggi che ho salvato in questa conversazione.",
    pt: "Não encontrei essa mensagem no corpus. O /reconcile funciona em respostas a mensagens que guardei nesta conversa.",
    pl: "Nie znalazłem tej wiadomości w korpusie. /reconcile działa na odpowiedziach do wiadomości zapisanych w tej rozmowie.",
  },

  reconcile_failed: {
    en: "Couldn't reconcile that message. Check function logs.",
    uk: "Не вдалося виключити це повідомлення. Перевір логи функції.",
    es: "No he podido excluir ese mensaje. Revisa los registros.",
    fr: "Impossible d'exclure ce message. Vérifie les journaux.",
    de: "Die Nachricht konnte nicht ausgeschlossen werden. Prüf die Logs.",
    it: "Non sono riuscito a escludere quel messaggio. Controlla i log.",
    pt: "Não consegui excluir essa mensagem. Verifica os registos.",
    pl: "Nie udało się wykluczyć tej wiadomości. Sprawdź logi funkcji.",
  },

  restore_usage: {
    en: "Reply to a message with /restore to bring it back into /recap results.",
    uk: "Відповідай на повідомлення командою /restore, щоб повернути його в результати /recap.",
    es: "Responde a un mensaje con /restore para devolverlo a los resultados de /recap.",
    fr: "Réponds à un message avec /restore pour le réintégrer aux résultats de /recap.",
    de: "Antworte auf eine Nachricht mit /restore, um sie wieder in /recap aufzunehmen.",
    it: "Rispondi a un messaggio con /restore per riportarlo nei risultati di /recap.",
    pt: "Responde a uma mensagem com /restore para a trazer de volta aos resultados de /recap.",
    pl: "Odpowiedz na wiadomość komendą /restore, żeby wróciła do wyników /recap.",
  },

  restore_failed: {
    en: "Couldn't restore that message. Check function logs.",
    uk: "Не вдалося відновити це повідомлення. Перевір логи функції.",
    es: "No he podido restaurar ese mensaje. Revisa los registros.",
    fr: "Impossible de restaurer ce message. Vérifie les journaux.",
    de: "Die Nachricht konnte nicht wiederhergestellt werden. Prüf die Logs.",
    it: "Non sono riuscito a ripristinare quel messaggio. Controlla i log.",
    pt: "Não consegui restaurar essa mensagem. Verifica os registos.",
    pl: "Nie udało się przywrócić tej wiadomości. Sprawdź logi funkcji.",
  },

  restore_not_reconciled: {
    en: "That message wasn't reconciled.",
    uk: "Це повідомлення не було виключене.",
    es: "Ese mensaje no estaba excluido.",
    fr: "Ce message n'était pas exclu.",
    de: "Diese Nachricht war nicht ausgeschlossen.",
    it: "Quel messaggio non era escluso.",
    pt: "Essa mensagem não estava excluída.",
    pl: "Ta wiadomość nie była wykluczona.",
  },

  restore_ok: {
    en: "✅ Restored. This message is back in /recap.",
    uk: "✅ Відновлено. Це повідомлення знову в /recap.",
    es: "✅ Restaurado. Ese mensaje vuelve a estar en /recap.",
    fr: "✅ Restauré. Ce message est de nouveau dans /recap.",
    de: "✅ Wiederhergestellt. Die Nachricht ist wieder in /recap.",
    it: "✅ Ripristinato. Quel messaggio è di nuovo in /recap.",
    pt: "✅ Restaurada. Essa mensagem voltou ao /recap.",
    pl: "✅ Przywrócono. Ta wiadomość jest znów w /recap.",
  },

  pin_usage: {
    en: "Reply to a message with /pin to mark it as meaningful.",
    uk: "Відповідай на повідомлення командою /pin, щоб позначити його як важливе.",
    es: "Responde a un mensaje con /pin para marcarlo como significativo.",
    fr: "Réponds à un message avec /pin pour le marquer comme important.",
    de: "Antworte auf eine Nachricht mit /pin, um sie als bedeutsam zu markieren.",
    it: "Rispondi a un messaggio con /pin per segnarlo come significativo.",
    pt: "Responde a uma mensagem com /pin para a marcares como importante.",
    pl: "Odpowiedz na wiadomość komendą /pin, żeby oznaczyć ją jako ważną.",
  },

  pin_failed: {
    en: "Couldn't pin that message. Check function logs.",
    uk: "Не вдалося закріпити це повідомлення. Перевір логи функції.",
    es: "No he podido fijar ese mensaje. Revisa los registros.",
    fr: "Impossible d'épingler ce message. Vérifie les journaux.",
    de: "Die Nachricht konnte nicht angeheftet werden. Prüf die Logs.",
    it: "Non sono riuscito a fissare quel messaggio. Controlla i log.",
    pt: "Não consegui fixar essa mensagem. Verifica os registos.",
    pl: "Nie udało się przypiąć tej wiadomości. Sprawdź logi funkcji.",
  },

  unpin_usage: {
    en: "Reply to a pinned message with /unpin to remove the pin.",
    uk: "Відповідай на закріплене повідомлення командою /unpin, щоб зняти позначку.",
    es: "Responde a un mensaje fijado con /unpin para quitar la marca.",
    fr: "Réponds à un message épinglé avec /unpin pour retirer l'épingle.",
    de: "Antworte auf eine angeheftete Nachricht mit /unpin, um sie zu lösen.",
    it: "Rispondi a un messaggio fissato con /unpin per togliere il segno.",
    pt: "Responde a uma mensagem fixada com /unpin para retirares a marca.",
    pl: "Odpowiedz na przypiętą wiadomość komendą /unpin, żeby zdjąć przypięcie.",
  },

  unpin_failed: {
    en: "Couldn't unpin that message. Check function logs.",
    uk: "Не вдалося відкріпити це повідомлення. Перевір логи функції.",
    es: "No he podido quitar la marca. Revisa los registros.",
    fr: "Impossible de retirer l'épingle. Vérifie les journaux.",
    de: "Die Markierung konnte nicht entfernt werden. Prüf die Logs.",
    it: "Non sono riuscito a togliere il segno. Controlla i log.",
    pt: "Não consegui retirar a marca. Verifica os registos.",
    pl: "Nie udało się odpiąć tej wiadomości. Sprawdź logi funkcji.",
  },

  unpin_not_pinned: {
    en: "That message wasn't pinned.",
    uk: "Це повідомлення не було закріплене.",
    es: "Ese mensaje no estaba fijado.",
    fr: "Ce message n'était pas épinglé.",
    de: "Diese Nachricht war nicht angeheftet.",
    it: "Quel messaggio non era fissato.",
    pt: "Essa mensagem não estava fixada.",
    pl: "Ta wiadomość nie była przypięta.",
  },

  unpin_ok: {
    en: "✅ Unpinned.",
    uk: "✅ Відкріплено.",
    es: "✅ Marca quitada.",
    fr: "✅ Épingle retirée.",
    de: "✅ Markierung entfernt.",
    it: "✅ Segno rimosso.",
    pt: "✅ Marca retirada.",
    pl: "✅ Odpięto.",
  },

  pinned_fetch_failed: {
    en: "Couldn't fetch pinned messages. Check function logs.",
    uk: "Не вдалося отримати закріплені повідомлення. Перевір логи функції.",
    es: "No he podido cargar los mensajes fijados. Revisa los registros.",
    fr: "Impossible de charger les messages épinglés. Vérifie les journaux.",
    de: "Angeheftete Nachrichten konnten nicht geladen werden. Prüf die Logs.",
    it: "Non sono riuscito a caricare i messaggi fissati. Controlla i log.",
    pt: "Não consegui carregar as mensagens fixadas. Verifica os registos.",
    pl: "Nie udało się pobrać przypiętych wiadomości. Sprawdź logi funkcji.",
  },

  pinned_empty: {
    en: "No pinned messages yet. Reply to any message with /pin to mark it.",
    uk: "Поки немає закріплених повідомлень. Відповідай на будь-яке командою /pin, щоб позначити.",
    es: "Aún no hay mensajes fijados. Responde a cualquiera con /pin para marcarlo.",
    fr: "Aucun message épinglé pour l'instant. Réponds à n'importe lequel avec /pin.",
    de: "Noch keine angehefteten Nachrichten. Antworte auf eine beliebige mit /pin.",
    it: "Nessun messaggio fissato per ora. Rispondi a uno qualsiasi con /pin.",
    pt: "Ainda não há mensagens fixadas. Responde a qualquer uma com /pin.",
    pl: "Nie ma jeszcze przypiętych wiadomości. Odpowiedz na dowolną komendą /pin.",
  },

  note_usage: {
    en: "Usage: /note &lt;note&gt; (or /remember)\n\nAdds a private note that only your own /ask will find.",
    uk: "Використання: /note &lt;нотатка&gt; (або /remember)\n\nДодає приватну нотатку, яку знайде лише твій власний /ask.",
    es: "Uso: /note &lt;nota&gt; (o /remember)\n\nAñade una nota privada que solo encontrará tu propio /ask.",
    fr: "Usage : /note &lt;note&gt; (ou /remember)\n\nAjoute une note privée que seul ton propre /ask retrouvera.",
    de: "Benutzung: /note &lt;Notiz&gt; (oder /remember)\n\nLegt eine private Notiz an, die nur dein eigenes /ask findet.",
    it: "Uso: /note &lt;nota&gt; (o /remember)\n\nAggiunge una nota privata che solo il tuo /ask troverà.",
    pt: "Uso: /note &lt;nota&gt; (ou /remember)\n\nJunta uma nota privada que só o teu /ask encontra.",
    pl: "Użycie: /note &lt;notatka&gt; (lub /remember)\n\nDodaje prywatną notatkę, którą znajdzie tylko twoje /ask.",
  },

  note_save_failed: {
    en: "Couldn't save that note. Check function logs.",
    uk: "Не вдалося зберегти нотатку. Перевір логи функції.",
    es: "No he podido guardar la nota. Revisa los registros.",
    fr: "Impossible d'enregistrer la note. Vérifie les journaux.",
    de: "Die Notiz konnte nicht gespeichert werden. Prüf die Logs.",
    it: "Non sono riuscito a salvare la nota. Controlla i log.",
    pt: "Não consegui guardar a nota. Verifica os registos.",
    pl: "Nie udało się zapisać notatki. Sprawdź logi funkcji.",
  },

  note_saved: {
    en: "📝 Noted.",
    uk: "📝 Записав.",
    es: "📝 Anotado.",
    fr: "📝 Noté.",
    de: "📝 Notiert.",
    it: "📝 Annotato.",
    pt: "📝 Anotado.",
    pl: "📝 Zapisane.",
  },


  // ---- Leaving a tenant (the second seat's own exit) --------------------------

  leave_confirm: {
    en: (v: any) => `<b>Leave this account?</b>\n\nYou'll lose access to the translation, and these are deleted:\n• your flashcards\n• your private notes\n• your grammar corrections\n\nThe ${v.n} messages already sent stay with ${v.owner}, who owns the account — a shared conversation isn't one person's to erase.\n\nWant your decks? Send /export first and wait for the file.`,
    uk: (v: any) => `<b>Вийти з цього акаунту?</b>\n\nТи втратиш доступ до перекладу, і буде видалено:\n• твої картки\n• твої приватні нотатки\n• твої виправлення граматики\n\nНадіслані повідомлення (${v.n}) залишаться в ${v.owner} — власника акаунту: спільна розмова не належить комусь одному.\n\nПотрібні картки? Спочатку надішли /export і дочекайся файлу.`,
    es: (v: any) => `<b>¿Salir de esta cuenta?</b>\n\nPerderás el acceso a la traducción, y se eliminan:\n• tus tarjetas\n• tus notas privadas\n• tus correcciones de gramática\n\nLos ${v.n} mensajes ya enviados se quedan con ${v.owner}, que es quien tiene la cuenta: una conversación compartida no es de una sola persona.\n\n¿Quieres tus mazos? Envía /export primero y espera el archivo.`,
    fr: (v: any) => `<b>Quitter ce compte ?</b>\n\nTu perdras l'accès à la traduction, et ceci est supprimé :\n• tes cartes\n• tes notes privées\n• tes corrections de grammaire\n\nLes ${v.n} messages déjà envoyés restent chez ${v.owner}, qui détient le compte — une conversation partagée n'appartient pas à une seule personne.\n\nTu veux tes paquets ? Lance /export d'abord et attends le fichier.`,
    de: (v: any) => `<b>Dieses Konto verlassen?</b>\n\nDu verlierst den Zugang zur Übersetzung, und das hier wird gelöscht:\n• deine Karteikarten\n• deine privaten Notizen\n• deine Grammatikkorrekturen\n\nDie ${v.n} bereits gesendeten Nachrichten bleiben bei ${v.owner}, dem das Konto gehört — ein gemeinsames Gespräch gehört nicht einer Person allein.\n\nDu willst deine Decks? Schick erst /export und warte auf die Datei.`,
    it: (v: any) => `<b>Uscire da questo account?</b>\n\nPerderai l'accesso alla traduzione, e verranno eliminati:\n• le tue flashcard\n• le tue note private\n• le tue correzioni di grammatica\n\nI ${v.n} messaggi già inviati restano a ${v.owner}, che possiede l'account: una conversazione condivisa non è di una persona sola.\n\nVuoi i tuoi mazzi? Manda prima /export e aspetta il file.`,
    pt: (v: any) => `<b>Sair desta conta?</b>\n\nVais perder o acesso à tradução, e isto é apagado:\n• os teus cartões\n• as tuas notas privadas\n• as tuas correções de gramática\n\nAs ${v.n} mensagens já enviadas ficam com ${v.owner}, que é dono da conta — uma conversa partilhada não é de uma pessoa só.\n\nQueres os teus baralhos? Envia /export primeiro e espera pelo ficheiro.`,
    pl: (v: any) => `<b>Opuścić to konto?</b>\n\nStracisz dostęp do tłumaczenia, a to zostanie usunięte:\n• twoje fiszki\n• twoje prywatne notatki\n• twoje poprawki gramatyczne\n\nWysłane wiadomości (${v.n}) zostaną u ${v.owner}, właściciela konta — wspólna rozmowa nie należy do jednej osoby.\n\nChcesz swoje talie? Najpierw wyślij /export i poczekaj na plik.`,
  },

  leave_btn: {
    en: "Leave this account", uk: "Вийти з акаунту", es: "Salir de la cuenta",
    fr: "Quitter le compte", de: "Konto verlassen", it: "Esci dall'account",
    pt: "Sair da conta", pl: "Opuść konto",
  },

  leave_done: {
    en: "You've left. You no longer have access, and your decks, notes and corrections are deleted.\n\nIf you ever want Capybara again — with anyone — just message me.",
    uk: "Ти вийшов(ла). Доступу більше немає, а твої картки, нотатки й виправлення видалено.\n\nЯкщо колись знову захочеш Capybara — з ким завгодно — просто напиши мені.",
    es: "Has salido. Ya no tienes acceso, y tus mazos, notas y correcciones se han eliminado.\n\nSi algún día quieres Capybara otra vez —con quien sea— solo escríbeme.",
    fr: "C'est fait. Tu n'as plus accès, et tes paquets, notes et corrections sont supprimés.\n\nSi un jour tu reveux Capybara — avec qui que ce soit — écris-moi.",
    de: "Du bist raus. Du hast keinen Zugang mehr, und deine Decks, Notizen und Korrekturen sind gelöscht.\n\nWenn du Capybara je wieder willst — mit wem auch immer — schreib mir einfach.",
    it: "Sei uscito/a. Non hai più accesso, e i tuoi mazzi, note e correzioni sono stati eliminati.\n\nSe un giorno rivuoi Capybara — con chiunque — scrivimi.",
    pt: "Saíste. Já não tens acesso, e os teus baralhos, notas e correções foram apagados.\n\nSe um dia quiseres o Capybara outra vez — com quem for — é só escreveres.",
    pl: "Gotowe. Nie masz już dostępu, a twoje talie, notatki i poprawki zostały usunięte.\n\nJeśli kiedyś znów zechcesz Capybarę — z kimkolwiek — po prostu napisz.",
  },

  leave_owner_notice: {
    en: (v: any) => `${v.name} has left the account. Your messages and study decks are untouched, and your subscription is unchanged.\n\nThe seat is free — here's a new invite link if you'd like to add someone:`,
    uk: (v: any) => `${v.name} вийшов(ла) з акаунту. Твої повідомлення й картки не змінилися, підписка теж.\n\nМісце звільнилося — ось нове посилання-запрошення, якщо захочеш когось додати:`,
    es: (v: any) => `${v.name} ha salido de la cuenta. Tus mensajes y mazos siguen intactos, y tu suscripción no cambia.\n\nLa plaza está libre — aquí tienes un enlace nuevo por si quieres añadir a alguien:`,
    fr: (v: any) => `${v.name} a quitté le compte. Tes messages et tes paquets sont intacts, et ton abonnement ne change pas.\n\nLa place est libre — voici un nouveau lien d'invitation si tu veux ajouter quelqu'un :`,
    de: (v: any) => `${v.name} hat das Konto verlassen. Deine Nachrichten und Decks sind unverändert, dein Abo auch.\n\nDer Platz ist frei — hier ist ein neuer Einladungslink, falls du jemanden hinzufügen willst:`,
    it: (v: any) => `${v.name} ha lasciato l'account. I tuoi messaggi e mazzi sono intatti, e l'abbonamento non cambia.\n\nIl posto è libero — ecco un nuovo link di invito se vuoi aggiungere qualcuno:`,
    pt: (v: any) => `${v.name} saiu da conta. As tuas mensagens e baralhos estão intactos, e a tua subscrição não muda.\n\nO lugar está livre — aqui tens um novo link de convite, caso queiras juntar alguém:`,
    pl: (v: any) => `${v.name} opuścił(a) konto. Twoje wiadomości i talie są nienaruszone, subskrypcja też.\n\nMiejsce jest wolne — oto nowy link z zaproszeniem, jeśli chcesz kogoś dodać:`,
  },

  leave_owner_cannot: {
    en: "You own this subscription, so leaving would leave it running with nobody able to cancel it. Use /delete_account instead — that cancels the subscription and deletes everything.",
    uk: "Ти власник цієї підписки, тож вихід залишив би її активною, і ніхто не зміг би її скасувати. Скористайся /delete_account — це скасує підписку й видалить усе.",
    es: "Tú tienes esta suscripción, así que salir la dejaría activa sin nadie que pueda cancelarla. Usa /delete_account: cancela la suscripción y lo borra todo.",
    fr: "C'est ton abonnement : partir le laisserait actif sans personne pour l'annuler. Utilise /delete_account — ça résilie l'abonnement et supprime tout.",
    de: "Das Abo gehört dir — zu gehen ließe es weiterlaufen, ohne dass jemand kündigen kann. Nimm /delete_account: das kündigt und löscht alles.",
    it: "L'abbonamento è tuo, quindi uscire lo lascerebbe attivo senza nessuno che possa annullarlo. Usa /delete_account: annulla l'abbonamento ed elimina tutto.",
    pt: "A subscrição é tua, por isso sair deixá-la-ia ativa sem ninguém para a cancelar. Usa /delete_account — cancela a subscrição e apaga tudo.",
    pl: "To twoja subskrypcja, więc odejście zostawiłoby ją aktywną i nikt nie mógłby jej anulować. Użyj /delete_account — anuluje subskrypcję i usuwa wszystko.",
  },

  leave_solo: {
    en: "You're the only person on this account, so there's nobody to leave. Use /delete_account to close it and cancel the subscription.",
    uk: "Ти єдина людина в цьому акаунті, тож виходити нема від кого. Скористайся /delete_account, щоб закрити його й скасувати підписку.",
    es: "Eres la única persona en esta cuenta, así que no hay de quién salir. Usa /delete_account para cerrarla y cancelar la suscripción.",
    fr: "Tu es seul·e sur ce compte, il n'y a donc personne à quitter. Utilise /delete_account pour le fermer et résilier l'abonnement.",
    de: "Du bist die einzige Person in diesem Konto, es gibt also niemanden zu verlassen. Mit /delete_account schließt du es und kündigst das Abo.",
    it: "Sei l'unica persona su questo account, quindi non c'è nessuno da lasciare. Usa /delete_account per chiuderlo e annullare l'abbonamento.",
    pt: "És a única pessoa nesta conta, por isso não há de quem sair. Usa /delete_account para a fechar e cancelar a subscrição.",
    pl: "Jesteś jedyną osobą na tym koncie, więc nie ma kogo opuszczać. Użyj /delete_account, żeby je zamknąć i anulować subskrypcję.",
  },

  leave_failed: {
    en: "I couldn't complete that just now — nothing has been changed. Try again in a moment.",
    uk: "Не вдалося це завершити — нічого не змінено. Спробуй за хвилину.",
    es: "No he podido completarlo ahora — no se ha cambiado nada. Inténtalo en un momento.",
    fr: "Je n'ai pas pu aller au bout — rien n'a été modifié. Réessaie dans un instant.",
    de: "Das hat gerade nicht geklappt — es wurde nichts geändert. Versuch es gleich noch mal.",
    it: "Non sono riuscito a completare — non è stato cambiato nulla. Riprova tra un momento.",
    pt: "Não consegui concluir agora — nada foi alterado. Tenta daqui a pouco.",
    pl: "Nie udało się tego dokończyć — nic nie zostało zmienione. Spróbuj za chwilę.",
  },


  // ---- /management: the account surface (subscription + who is on it) --------

  mgmt_partner_line: {
    en: (v: any) => `\n\n<b>Partner:</b> ${v.name}`,
    uk: (v: any) => `\n\n<b>Партнер:</b> ${v.name}`,
    es: (v: any) => `\n\n<b>Pareja:</b> ${v.name}`,
    fr: (v: any) => `\n\n<b>Partenaire :</b> ${v.name}`,
    de: (v: any) => `\n\n<b>Partner:</b> ${v.name}`,
    it: (v: any) => `\n\n<b>Partner:</b> ${v.name}`,
    pt: (v: any) => `\n\n<b>Parceiro:</b> ${v.name}`,
    pl: (v: any) => `\n\n<b>Partner:</b> ${v.name}`,
  },

  mgmt_seat_free: {
    en: "\n\n<b>Partner:</b> nobody yet — the second seat is free. Send them the invite link below.",
    uk: "\n\n<b>Партнер:</b> поки нікого — друге місце вільне. Надішли їм посилання нижче.",
    es: "\n\n<b>Pareja:</b> nadie aún — la segunda plaza está libre. Envíale el enlace de abajo.",
    fr: "\n\n<b>Partenaire :</b> personne pour l'instant — la deuxième place est libre. Envoie-lui le lien ci-dessous.",
    de: "\n\n<b>Partner:</b> noch niemand — der zweite Platz ist frei. Schick ihnen den Link unten.",
    it: "\n\n<b>Partner:</b> ancora nessuno — il secondo posto è libero. Mandagli il link qui sotto.",
    pt: "\n\n<b>Parceiro:</b> ainda ninguém — o segundo lugar está livre. Envia-lhe o link abaixo.",
    pl: "\n\n<b>Partner:</b> jeszcze nikt — drugie miejsce jest wolne. Wyślij im link poniżej.",
  },

  mgmt_btn_remove: {
    en: "Remove partner", uk: "Прибрати партнера", es: "Quitar a la pareja",
    fr: "Retirer le partenaire", de: "Partner entfernen", it: "Rimuovi il partner",
    pt: "Remover parceiro", pl: "Usuń partnera",
  },

  mgmt_remove_confirm: {
    en: (v: any) => `<b>Remove ${v.name} from this account?</b>\n\nThey lose access immediately, and their flashcards, private notes and grammar corrections are deleted.\n\nThe ${v.n} messages you have exchanged stay — they are your conversation too, and your /ask history is built on them.\n\nThe seat is freed and you get a new invite link, so you can add someone else. ${v.name} will be told.`,
    uk: (v: any) => `<b>Прибрати ${v.name} з цього акаунту?</b>\n\nВони одразу втратять доступ, а їхні картки, приватні нотатки й виправлення граматики буде видалено.\n\nВаші ${v.n} повідомлень залишаться — це і твоя розмова теж, і на ній побудована історія /ask.\n\nМісце звільниться, і ти отримаєш нове посилання-запрошення, щоб додати когось іншого. ${v.name} отримає сповіщення.`,
    es: (v: any) => `<b>¿Quitar a ${v.name} de esta cuenta?</b>\n\nPierde el acceso de inmediato, y sus tarjetas, notas privadas y correcciones se eliminan.\n\nLos ${v.n} mensajes que habéis intercambiado se quedan: también son tu conversación, y tu historial de /ask se basa en ellos.\n\nLa plaza queda libre y recibes un enlace nuevo para añadir a otra persona. Se avisará a ${v.name}.`,
    fr: (v: any) => `<b>Retirer ${v.name} de ce compte ?</b>\n\nIl ou elle perd l'accès immédiatement, et ses cartes, notes privées et corrections sont supprimées.\n\nLes ${v.n} messages échangés restent — c'est ta conversation aussi, et ton historique /ask repose dessus.\n\nLa place se libère et tu reçois un nouveau lien d'invitation pour ajouter quelqu'un d'autre. ${v.name} sera prévenu·e.`,
    de: (v: any) => `<b>${v.name} aus diesem Konto entfernen?</b>\n\nDer Zugang endet sofort, und die Karteikarten, privaten Notizen und Korrekturen werden gelöscht.\n\nDie ${v.n} ausgetauschten Nachrichten bleiben — es ist auch dein Gespräch, und dein /ask baut darauf auf.\n\nDer Platz wird frei und du bekommst einen neuen Einladungslink für jemand anderen. ${v.name} wird benachrichtigt.`,
    it: (v: any) => `<b>Rimuovere ${v.name} da questo account?</b>\n\nPerde l'accesso subito, e le sue flashcard, note private e correzioni vengono eliminate.\n\nI ${v.n} messaggi scambiati restano: è anche la tua conversazione, e la tua cronologia /ask si basa su quelli.\n\nIl posto si libera e ricevi un nuovo link di invito per aggiungere qualcun altro. ${v.name} verrà avvisato/a.`,
    pt: (v: any) => `<b>Remover ${v.name} desta conta?</b>\n\nPerde o acesso imediatamente, e os cartões, notas privadas e correções são apagados.\n\nAs ${v.n} mensagens trocadas ficam — a conversa também é tua, e o teu histórico /ask assenta nelas.\n\nO lugar fica livre e recebes um novo link de convite para juntares outra pessoa. ${v.name} será avisado/a.`,
    pl: (v: any) => `<b>Usunąć ${v.name} z tego konta?</b>\n\nNatychmiast traci dostęp, a jego fiszki, prywatne notatki i poprawki zostaną usunięte.\n\nWymienione wiadomości (${v.n}) zostaną — to także twoja rozmowa, i na niej opiera się twoja historia /ask.\n\nMiejsce się zwolni i dostaniesz nowy link z zaproszeniem, żeby dodać kogoś innego. ${v.name} zostanie powiadomiony(a).`,
  },

  mgmt_removed_owner: {
    en: (v: any) => `${v.name} has been removed. The seat is free — here's a new invite link for whoever comes next:`,
    uk: (v: any) => `${v.name} прибрано. Місце вільне — ось нове посилання-запрошення для наступної людини:`,
    es: (v: any) => `${v.name} ha sido eliminado/a. La plaza está libre — aquí tienes un enlace nuevo para quien venga después:`,
    fr: (v: any) => `${v.name} a été retiré·e. La place est libre — voici un nouveau lien d'invitation pour la prochaine personne :`,
    de: (v: any) => `${v.name} wurde entfernt. Der Platz ist frei — hier ist ein neuer Einladungslink für die nächste Person:`,
    it: (v: any) => `${v.name} è stato/a rimosso/a. Il posto è libero — ecco un nuovo link di invito per la prossima persona:`,
    pt: (v: any) => `${v.name} foi removido/a. O lugar está livre — aqui tens um novo link de convite para a próxima pessoa:`,
    pl: (v: any) => `${v.name} został(a) usunięty(a). Miejsce jest wolne — oto nowy link z zaproszeniem dla następnej osoby:`,
  },

  mgmt_removed_partner: {
    en: (v: any) => `${v.name} has removed you from their Capybara account. You no longer have access, and your flashcards, notes and corrections have been deleted.\n\nIf you'd like Capybara of your own — with anyone — just message me.`,
    uk: (v: any) => `${v.name} прибрав(ла) тебе зі свого акаунту Capybara. Доступу більше немає, а твої картки, нотатки й виправлення видалено.\n\nЯкщо захочеш власну Capybara — з ким завгодно — просто напиши мені.`,
    es: (v: any) => `${v.name} te ha quitado de su cuenta de Capybara. Ya no tienes acceso, y tus tarjetas, notas y correcciones se han eliminado.\n\nSi quieres tu propia Capybara —con quien sea— solo escríbeme.`,
    fr: (v: any) => `${v.name} t'a retiré·e de son compte Capybara. Tu n'as plus accès, et tes cartes, notes et corrections ont été supprimées.\n\nSi tu veux ton propre Capybara — avec qui que ce soit — écris-moi.`,
    de: (v: any) => `${v.name} hat dich aus dem Capybara-Konto entfernt. Du hast keinen Zugang mehr, und deine Karteikarten, Notizen und Korrekturen wurden gelöscht.\n\nWenn du dein eigenes Capybara willst — mit wem auch immer — schreib mir einfach.`,
    it: (v: any) => `${v.name} ti ha rimosso/a dal suo account Capybara. Non hai più accesso, e le tue flashcard, note e correzioni sono state eliminate.\n\nSe vuoi un Capybara tutto tuo — con chiunque — scrivimi.`,
    pt: (v: any) => `${v.name} removeu-te da conta Capybara. Já não tens acesso, e os teus cartões, notas e correções foram apagados.\n\nSe quiseres o teu próprio Capybara — com quem for — é só escreveres.`,
    pl: (v: any) => `${v.name} usunął(-ęła) cię ze swojego konta Capybara. Nie masz już dostępu, a twoje fiszki, notatki i poprawki zostały usunięte.\n\nJeśli chcesz własną Capybarę — z kimkolwiek — po prostu napisz.`,
  },

  mgmt_remove_failed: {
    en: "I couldn't complete that just now — nothing has been changed. Try again in a moment.",
    uk: "Не вдалося це завершити — нічого не змінено. Спробуй за хвилину.",
    es: "No he podido completarlo ahora — no se ha cambiado nada. Inténtalo en un momento.",
    fr: "Je n'ai pas pu aller au bout — rien n'a été modifié. Réessaie dans un instant.",
    de: "Das hat gerade nicht geklappt — es wurde nichts geändert. Versuch es gleich noch mal.",
    it: "Non sono riuscito a completare — non è stato cambiato nulla. Riprova tra un momento.",
    pt: "Não consegui concluir agora — nada foi alterado. Tenta daqui a pouco.",
    pl: "Nie udało się tego dokończyć — nic nie zostało zmienione. Spróbuj za chwilę.",
  },


  // ---- Promotion codes -------------------------------------------------------

  promo_usage: {
    en: "Send the code with the command, like this:\n\n<code>/promo FIRSTMONTH</code>",
    uk: "Надішли код разом із командою, ось так:\n\n<code>/promo FIRSTMONTH</code>",
    es: "Envía el código junto al comando, así:\n\n<code>/promo FIRSTMONTH</code>",
    fr: "Envoie le code avec la commande, comme ceci :\n\n<code>/promo FIRSTMONTH</code>",
    de: "Schick den Code mit dem Befehl, so:\n\n<code>/promo FIRSTMONTH</code>",
    it: "Manda il codice insieme al comando, così:\n\n<code>/promo FIRSTMONTH</code>",
    pt: "Envia o código com o comando, assim:\n\n<code>/promo FIRSTMONTH</code>",
    pl: "Wyślij kod razem z komendą, o tak:\n\n<code>/promo FIRSTMONTH</code>",
  },

  promo_bad_shape: {
    en: "That doesn't look like a code. They're letters and numbers, no spaces — check it and try again.",
    uk: "Це не схоже на код. Вони складаються з літер і цифр, без пробілів — перевір і спробуй ще раз.",
    es: "Eso no parece un código. Son letras y números, sin espacios — compruébalo e inténtalo otra vez.",
    fr: "Ça ne ressemble pas à un code. Ce sont des lettres et des chiffres, sans espaces — vérifie et réessaie.",
    de: "Das sieht nicht nach einem Code aus. Buchstaben und Zahlen, keine Leerzeichen — prüf ihn und versuch es nochmal.",
    it: "Non sembra un codice. Sono lettere e numeri, senza spazi — controlla e riprova.",
    pt: "Isso não parece um código. São letras e números, sem espaços — verifica e tenta outra vez.",
    pl: "To nie wygląda na kod. Kody to litery i cyfry, bez spacji — sprawdź i spróbuj ponownie.",
  },

  promo_applied: {
    en: (v: any) => `Code <b>${v.code}</b> is on the buttons below — you'll see the discount on the payment page before you pay anything. If it isn't valid, the payment page will say so.`,
    uk: (v: any) => `Код <b>${v.code}</b> уже в кнопках нижче — знижку буде видно на сторінці оплати ще до того, як ти щось заплатиш. Якщо код недійсний, сторінка оплати про це скаже.`,
    es: (v: any) => `El código <b>${v.code}</b> está en los botones de abajo — verás el descuento en la página de pago antes de pagar nada. Si no es válido, la página te lo dirá.`,
    fr: (v: any) => `Le code <b>${v.code}</b> est dans les boutons ci-dessous — tu verras la réduction sur la page de paiement avant de payer quoi que ce soit. S'il n'est pas valable, la page te le dira.`,
    de: (v: any) => `Der Code <b>${v.code}</b> steckt in den Buttons unten — den Rabatt siehst du auf der Bezahlseite, bevor du irgendetwas zahlst. Ist er ungültig, sagt die Seite das.`,
    it: (v: any) => `Il codice <b>${v.code}</b> è nei pulsanti qui sotto — vedrai lo sconto sulla pagina di pagamento prima di pagare qualsiasi cosa. Se non è valido, la pagina te lo dirà.`,
    pt: (v: any) => `O código <b>${v.code}</b> está nos botões abaixo — vais ver o desconto na página de pagamento antes de pagares seja o que for. Se não for válido, a página diz.`,
    pl: (v: any) => `Kod <b>${v.code}</b> jest w przyciskach poniżej — zniżkę zobaczysz na stronie płatności, zanim cokolwiek zapłacisz. Jeśli kod jest nieważny, strona to pokaże.`,
  },

  promo_existing_account: {
    en: "You already have a subscription, so a code goes in through the billing portal rather than a new checkout — otherwise you'd end up paying for two. Open /management and tap Manage subscription.",
    uk: "У тебе вже є підписка, тож код вводиться через портал оплати, а не через нову оплату — інакше ти платив(ла) би двічі. Відкрий /management і натисни «Керувати підпискою».",
    es: "Ya tienes una suscripción, así que el código se aplica desde el portal de facturación y no en un pago nuevo — si no, acabarías pagando dos. Abre /management y pulsa Gestionar suscripción.",
    fr: "Tu as déjà un abonnement : le code passe par le portail de facturation, pas par un nouveau paiement — sinon tu en paierais deux. Ouvre /management et appuie sur Gérer l'abonnement.",
    de: "Du hast schon ein Abo, also läuft ein Code über das Abrechnungsportal statt über einen neuen Checkout — sonst zahlst du doppelt. Öffne /management und tipp auf Abo verwalten.",
    it: "Hai già un abbonamento, quindi il codice si inserisce dal portale di fatturazione e non con un nuovo pagamento — altrimenti ne pagheresti due. Apri /management e tocca Gestisci abbonamento.",
    pt: "Já tens uma subscrição, por isso o código entra pelo portal de faturação e não num pagamento novo — senão acabavas a pagar duas. Abre /management e toca em Gerir subscrição.",
    pl: "Masz już subskrypcję, więc kod wpisuje się w portalu płatności, a nie przy nowej płatności — inaczej płaciłbyś za dwie. Otwórz /management i dotknij Zarządzaj subskrypcją.",
  },


  // ---- /mistakes and incremental export --------------------------------------

  mistakes_header: {
    en: "📝 <b>Your recent mistakes</b>\nTap the blur to check yourself.",
    uk: "📝 <b>Твої останні помилки</b>\nТоркнись розмиття, щоб перевірити себе.",
    es: "📝 <b>Tus errores recientes</b>\nToca el difuminado para comprobarte.",
    fr: "📝 <b>Tes erreurs récentes</b>\nTouche le flou pour vérifier.",
    de: "📝 <b>Deine letzten Fehler</b>\nTipp auf die Unschärfe, um dich zu prüfen.",
    it: "📝 <b>I tuoi errori recenti</b>\nTocca la sfocatura per controllarti.",
    pt: "📝 <b>Os teus erros recentes</b>\nToca no borrão para te verificares.",
    pl: "📝 <b>Twoje ostatnie błędy</b>\nDotknij rozmycia, żeby się sprawdzić.",
  },

  mistakes_footer: {
    en: "<i>These are also in /export, tagged by mistake type.</i>",
    uk: "<i>Вони також є в /export, позначені за типом помилки.</i>",
    es: "<i>También están en /export, etiquetados por tipo de error.</i>",
    fr: "<i>Elles sont aussi dans /export, étiquetées par type d'erreur.</i>",
    de: "<i>Die stecken auch in /export, nach Fehlerart getaggt.</i>",
    it: "<i>Ci sono anche in /export, taggati per tipo di errore.</i>",
    pt: "<i>Também estão no /export, etiquetados por tipo de erro.</i>",
    pl: "<i>Są też w /export, otagowane według rodzaju błędu.</i>",
  },

  mistakes_you_wrote: {
    en: (v: any) => `(you wrote: ${v.wrote})`,
    uk: (v: any) => `(ти написав(ла): ${v.wrote})`,
    es: (v: any) => `(escribiste: ${v.wrote})`,
    fr: (v: any) => `(tu as écrit : ${v.wrote})`,
    de: (v: any) => `(du hast geschrieben: ${v.wrote})`,
    it: (v: any) => `(hai scritto: ${v.wrote})`,
    pt: (v: any) => `(escreveste: ${v.wrote})`,
    pl: (v: any) => `(napisałeś(-aś): ${v.wrote})`,
  },

  mistakes_none: {
    en: "Nothing to review — I haven't caught any mistakes yet. Keep writing in the language you're learning and they'll turn up here.",
    uk: "Нема чого повторювати — я поки не помітив помилок. Продовжуй писати мовою, яку вивчаєш, і вони з'являться тут.",
    es: "Nada que repasar — aún no he detectado errores. Sigue escribiendo en el idioma que aprendes y aparecerán aquí.",
    fr: "Rien à revoir — je n'ai encore relevé aucune erreur. Continue à écrire dans la langue que tu apprends et elles apparaîtront ici.",
    de: "Nichts zu wiederholen — mir sind noch keine Fehler aufgefallen. Schreib weiter in der Sprache, die du lernst, dann tauchen sie hier auf.",
    it: "Niente da ripassare — non ho ancora trovato errori. Continua a scrivere nella lingua che stai imparando e appariranno qui.",
    pt: "Nada para rever — ainda não apanhei erros. Continua a escrever na língua que estás a aprender e vão aparecer aqui.",
    pl: "Nie ma czego powtarzać — nie wyłapałem jeszcze błędów. Pisz dalej w języku, którego się uczysz, a się pojawią.",
  },

  mistakes_off: {
    en: "Grammar help is off, so I'm not noting your mistakes. Turn it on with /capybara and they'll collect here as you write.",
    uk: "Допомога з граматикою вимкнена, тож я не занотовую помилки. Увімкни її через /capybara — і вони збиратимуться тут.",
    es: "La ayuda de gramática está desactivada, así que no anoto tus errores. Actívala con /capybara y se irán recogiendo aquí.",
    fr: "L'aide grammaticale est désactivée, je ne note donc pas tes erreurs. Active-la avec /capybara et elles s'accumuleront ici.",
    de: "Die Grammatikhilfe ist aus, ich notiere deine Fehler also nicht. Schalt sie mit /capybara ein, dann sammeln sie sich hier.",
    it: "L'aiuto di grammatica è spento, quindi non annoto i tuoi errori. Attivalo con /capybara e si raccoglieranno qui.",
    pt: "A ajuda de gramática está desligada, por isso não anoto os teus erros. Liga-a com /capybara e vão juntar-se aqui.",
    pl: "Pomoc gramatyczna jest wyłączona, więc nie zapisuję twoich błędów. Włącz ją przez /capybara, a zaczną się tu zbierać.",
  },

  mistakes_failed: {
    en: "Couldn't fetch your corrections. Check function logs.",
    uk: "Не вдалося отримати твої виправлення. Перевір логи функції.",
    es: "No he podido cargar tus correcciones. Revisa los registros.",
    fr: "Impossible de charger tes corrections. Vérifie les journaux.",
    de: "Deine Korrekturen konnten nicht geladen werden. Prüf die Logs.",
    it: "Non sono riuscito a caricare le tue correzioni. Controlla i log.",
    pt: "Não consegui carregar as tuas correções. Verifica os registos.",
    pl: "Nie udało się pobrać twoich poprawek. Sprawdź logi funkcji.",
  },

  export_no_new: {
    en: "Nothing new since your last export. Send /export on its own for the full set.",
    uk: "Нічого нового від часу останнього експорту. Надішли /export без слів, щоб отримати все.",
    es: "Nada nuevo desde tu última exportación. Envía /export a secas para el conjunto completo.",
    fr: "Rien de nouveau depuis ton dernier export. Envoie /export seul pour tout récupérer.",
    de: "Nichts Neues seit deinem letzten Export. Schick /export allein für den ganzen Satz.",
    it: "Niente di nuovo dall'ultima esportazione. Manda /export da solo per l'insieme completo.",
    pt: "Nada de novo desde a última exportação. Envia /export sozinho para o conjunto completo.",
    pl: "Nic nowego od ostatniego eksportu. Wyślij samo /export, żeby dostać całość.",
  },

};

// Looks up a string. Falls back to English on a missing translation and warns, so a gap
// surfaces in logs rather than silently rendering English to that customer forever.
export function t(lang: string | null | undefined, key: string, vars?: any): string {
  const row = STRINGS[key];
  if (!row) {
    console.error(`strings: unknown key "${key}"`);
    return "";
  }
  const l = (lang && (LANGS as string[]).includes(lang) ? lang : "en") as Lang;
  let entry = row[l];
  if (entry === undefined) {
    console.warn(`strings: "${key}" missing for "${l}", falling back to English`);
    entry = row.en;
  }
  return typeof entry === "function" ? entry(vars ?? {}) : entry;
}

// Which language to talk to someone in. Most authoritative first:
//   1. a registered user's chosen native language -- they told us
//   2. a trial user's chosen native language
//   3. Telegram's UI language, which arrives on EVERY update as from.language_code. This
//      is what lets the very first message be in the right language, before the person has
//      told the bot anything -- the case that prompted this whole file.
//   4. English
//
// language_code is a UI-language hint rather than a declaration of a mother tongue, which
// is why anything explicit outranks it. It also arrives regionalised ("uk-UA", "pt-BR"),
// so only the primary subtag is used.
export function viewerLang(
  from: { language_code?: string } | null | undefined,
  user?: { native_language?: string } | null,
  trialRow?: { native_language?: string | null } | null,
): Lang {
  const known = (c: string | null | undefined): Lang | null =>
    c && (LANGS as string[]).includes(c) ? (c as Lang) : null;
  return known(user?.native_language)
    ?? known(trialRow?.native_language)
    ?? known((from?.language_code ?? "").split("-")[0].toLowerCase())
    ?? "en";
}
