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
