// Memoria — návod: zoznam článkov (ku ktorej karte patria) a vyhľadávanie.
// Texty sú v lib/memoriaHelp/{en,es,fr,de}.json (rovnaké id vo všetkých jazykoch).
// Vyhľadávanie funguje bez AI: toleruje preklepy v tvaroch slov, diakritiku aj
// otázky celou vetou („kde nájdem všetky ponuky na čistenie bazénov?“).

import en from './memoriaHelp/en.json';
import es from './memoriaHelp/es.json';
import fr from './memoriaHelp/fr.json';
import de from './memoriaHelp/de.json';

const CONTENT = { en, es, fr, de };

// Poradie a skupiny = poradie v návode aj v PDF. tab = karta, ktorú otvorí tlačidlo „Otvoriť túto obrazovku“.
export const HELP_SECTIONS = [
  { key: 'start', tab: 'home', ids: ['open', 'today', 'demo', 'ask', 'attachments'] },
  { key: 'governance', tab: 'tasks', ids: ['task-new', 'task-progress', 'obligation-new', 'obligation-done', 'meeting-plan', 'meeting-print', 'meeting-outcome', 'minutes-import', 'decision-new', 'decision-link', 'mandate-new', 'mandate-end', 'email-settings', 'case-new'] },
  { key: 'money', tab: 'suppliers', ids: ['supplier-new', 'supplier-find', 'supplier-rate', 'tender-new', 'quotes-upload', 'quotes-find', 'quotes-analyse', 'tender-choose', 'contract-new', 'contract-notice', 'invoices-import', 'invoice-single', 'invoice-urgent', 'invoice-find', 'budget-setup', 'reserve'] },
  { key: 'reports', tab: 'report', ids: ['overview', 'handover', 'activity', 'export'] },
];

export const HELP_TAB = {
  open: 'home', today: 'home', demo: 'home', ask: 'ask', attachments: null,
  'task-new': 'tasks', 'task-progress': 'tasks', 'obligation-new': 'calendar', 'obligation-done': 'calendar',
  'meeting-plan': 'meetings', 'meeting-print': 'meetings', 'meeting-outcome': 'meetings', 'minutes-import': 'meetings',
  'decision-new': 'decisions', 'decision-link': 'decisions', 'mandate-new': 'mandates', 'mandate-end': 'mandates',
  'email-settings': 'mandates', 'case-new': 'cases',
  'supplier-new': 'suppliers', 'supplier-find': 'suppliers', 'supplier-rate': 'suppliers',
  'tender-new': 'tenders', 'quotes-upload': 'tenders', 'quotes-find': 'tenders', 'quotes-analyse': 'tenders', 'tender-choose': 'tenders',
  'contract-new': 'contracts', 'contract-notice': 'contracts',
  'invoices-import': 'invoices', 'invoice-single': 'invoices', 'invoice-urgent': 'invoices', 'invoice-find': 'invoices',
  'budget-setup': 'budget', reserve: 'budget',
  overview: 'report', handover: 'handover', activity: 'activity', export: 'export',
};

// Otázky, ktoré sa ukážu pred prvým hľadaním (id článkov).
export const HELP_POPULAR = ['quotes-find', 'quotes-analyse', 'minutes-import', 'task-new', 'contract-notice', 'invoices-import', 'meeting-plan', 'handover'];

export const HELP_IDS = HELP_SECTIONS.flatMap((s) => s.ids);
export const MEMORIA_TABS = ['home', 'tasks', 'calendar', 'meetings', 'decisions', 'mandates', 'cases', 'suppliers', 'tenders', 'contracts', 'invoices', 'budget', 'ask', 'report', 'handover', 'activity', 'export', 'help'];

export function helpArticles(lang) {
  const c = CONTENT[lang] || CONTENT.en;
  return HELP_IDS.map((id) => ({ id, tab: HELP_TAB[id], ...(c[id] || CONTENT.en[id]) }));
}

export function helpArticle(lang, id) {
  const c = CONTENT[lang] || CONTENT.en;
  const a = c[id] || CONTENT.en[id];
  return a ? { id, tab: HELP_TAB[id], ...a } : null;
}

// ---- vyhľadávanie ----

const STOP = new Set(
  (
    // en
    'a an the and or of to in on at for with from by is are be do does did can could how what where which who when why i we you my our me it this that these those there all any some see find show get make want need please about into up out then than also its as if so' +
    // es
    ' el la los las un una unos unas y o de del al en con por para como que qué donde dónde cual cuál quien quién cuando cuándo es son ser puedo puede podemos quiero ver mostrar todos todas todo toda mi mis nuestro nuestra se lo le les su sus hay hacer esta este estos estas' +
    // fr
    ' le la les un une des et ou de du au aux en avec par pour comment que quoi où qui quand est sont je nous vous mon ma mes notre nos voir trouver tous toutes tout faire ce cette ces il elle' +
    // de
    ' der die das den dem des ein eine einen und oder von zu im in am an mit für wie was wo wer wann ist sind ich wir sie mein unser alle alles sehen finden zeigen machen kann können'
  ).split(/\s+/)
);

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ß]+/g, ' ')
    .trim();
}

// Hrubé zjednotenie tvarov slov (množné číslo, bežné koncovky) pre EN/ES/FR/DE.
export function stem(word) {
  let w = word;
  if (w.length > 5) w = w.replace(/(ations|ation|ing|ments|ment|ciones|cion|iones|ion|ungen|ung)$/, '');
  if (w.length > 4) w = w.replace(/(es|en|er|s|e|n)$/, '');
  return w;
}

export function tokens(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
    .filter(Boolean);
}

function fieldTokens(article) {
  return {
    title: new Set(tokens(article.title)),
    keywords: new Set(tokens(article.keywords)),
    body: new Set(tokens([article.summary, ...(article.steps || []), ...(article.tips || [])].join(' '))),
  };
}

const INDEX_CACHE = {};
function index(lang) {
  if (!INDEX_CACHE[lang]) {
    const list = helpArticles(lang);
    const enById = Object.fromEntries(helpArticles('en').map((a) => [a.id, a]));
    INDEX_CACHE[lang] = list.map((a) => {
      const f = fieldTokens(a);
      // Anglické kľúčové slová platia vždy (ľudia často píšu „pool“, „email“, „excel“).
      if (lang !== 'en') for (const t of tokens(enById[a.id].keywords)) f.keywords.add(t);
      return { article: a, f };
    });
  }
  return INDEX_CACHE[lang];
}

function hit(set, q) {
  if (set.has(q)) return 1;
  if (q.length >= 4) {
    for (const t of set) if (t.length >= 4 && (t.startsWith(q) || q.startsWith(t))) return 0.7;
  }
  return 0;
}

// Vráti články zoradené podľa zhody; prázdna otázka → [].
export function searchHelp(lang, query, limit = 8) {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const results = [];
  for (const { article, f } of index(lang)) {
    let score = 0;
    let matched = 0;
    for (const w of q) {
      const s = 3 * hit(f.title, w) + 2 * hit(f.keywords, w) + 1 * hit(f.body, w);
      if (s > 0) matched += 1;
      score += s;
    }
    if (!score) continue;
    // Uprednostni články, ktoré pokrývajú viac slov otázky.
    score *= 0.5 + matched / q.length;
    results.push({ ...article, score: Math.round(score * 100) / 100 });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Pre „Ask Memoria“: najrelevantnejšie články ako text do promptu.
export function helpForPrompt(lang, question, limit = 3) {
  const found = searchHelp(lang, question, limit).filter((a) => a.score >= 3);
  return found
    .map((a) => [`[guide id=${a.id} tab=${a.tab}] ${a.title}`, ...a.steps.map((s, i) => `${i + 1}. ${s}`), ...(a.tips || []).map((t) => `Tip: ${t}`)].join('\n'))
    .join('\n\n');
}

// Z odpovede AI vyberie značky [[open:tab]] a [[help:id]] (iba platné) a odstráni ich z textu.
export function extractHelpLinks(answer) {
  const links = [];
  const seen = new Set();
  const text = String(answer || '').replace(/\[\[(open|help):([a-z0-9-]+)\]\]/gi, (m, kind, val) => {
    const k = kind.toLowerCase();
    const v = val.toLowerCase();
    const ok = k === 'open' ? MEMORIA_TABS.includes(v) && v !== 'help' : HELP_IDS.includes(v);
    const key = `${k}:${v}`;
    if (ok && !seen.has(key) && links.length < 4) {
      seen.add(key);
      links.push({ kind: k, value: v });
    }
    return '';
  });
  return { text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), links };
}

// Karta → (ikona, i18n kľúč názvu) – pre tlačidlá „Otvoriť…“.
export const TAB_LABELS = {
  home: ['🏠', 'tabHome'], tasks: ['✅', 'tabTasks'], calendar: ['📅', 'tabCalendar'], meetings: ['🗓️', 'tabMeetings'],
  decisions: ['⚖️', 'tabDecisions'], mandates: ['👥', 'tabMandates'], cases: ['🛡️', 'tabCases'], suppliers: ['🏢', 'tabSuppliers'],
  tenders: ['🧾', 'tabTenders'], contracts: ['📑', 'tabContracts'], invoices: ['💶', 'tabInvoices'], budget: ['💰', 'tabBudget'],
  ask: ['💬', 'tabAsk'], report: ['📊', 'tabReport'], handover: ['📦', 'tabHandover'], activity: ['🕒', 'tabActivity'],
  export: ['💾', 'tabExport'], help: ['❓', 'tabHelp'],
};

// Snímka obrazovky k článku: ES má vlastné, FR/DE použijú anglické.
export function helpImage(id, lang) {
  return `/help/memoria/${id}.${lang === 'es' ? 'es' : 'en'}.webp`;
}
