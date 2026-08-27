// Pure, dependency-free helper functions for the Community Assistant
// (app/api/ask-ai/route.js). Pulled out into their own module specifically
// so they can be unit tested without mocking Supabase or the Anthropic API -
// this is the most complex server module in the app and previously had zero
// test coverage of its own.

export const MAX_RETRIEVED_ENTRIES = 5;
export const ALLOWED_URGENCY = ['yellow', 'orange', 'red'];
export const ALLOWED_SOURCE_STATUS = [
  'unknown',
  'private_own',
  'private_other',
  'communal',
  'external_or_unknown',
  'criminal_act',
  'contractor',
  'not_applicable',
];
export const MAX_RELATED_INTENTS = 5;

// ---------------------------------------------------------------------------
// V2 knowledge base: entries contain bracket placeholders like
// [MAINTENANCE_PHONE] instead of a hardcoded number, so the LLM never even
// sees a real phone number to copy or misremember. The app resolves these
// itself from two different sources of truth: people/companies come from
// the `contacts` table (managed on the Contacts admin page), while
// community facts (address, hours, access points) come from
// `community_config`.
// ---------------------------------------------------------------------------
const CONTACT_PLACEHOLDER_ROLES = {
  MAINTENANCE_PHONE: { role: 'maintenance', field: 'phone' },
  SECURITY_PHONE: { role: 'security', field: 'phone' },
  '24H_COMMUNITY_EMERGENCY_PHONE': { role: '24h community emergency', field: 'phone' },
  ADMINISTRATOR_EMAIL: { role: 'administrator', field: 'email' },
  BOARD_EMAIL: { role: 'board', field: 'email' },
  ELEVATOR_EMERGENCY_PHONE: { role: 'elevator emergency', field: 'phone' },
  WATER_UTILITY: { role: 'water utility', field: 'phone' },
  ELECTRICITY_UTILITY: { role: 'electricity utility', field: 'phone' },
  GAS_EMERGENCY_CONTACT: { role: 'gas emergency', field: 'phone' },
  POOL_MAINTENANCE_CONTACT: { role: 'pool maintenance', field: 'phone' },
  GARDENING_CONTACT: { role: 'gardening', field: 'phone' },
  PEST_CONTROL_CONTACT: { role: 'pest control', field: 'phone' },
  LOCKSMITH_CONTACT: { role: 'locksmith', field: 'phone' },
  COMMUNITY_INSURANCE_CONTACT: { role: 'community insurance', field: 'phone' },
};

// These map 1:1 to community_config keys (see the V2 import migration).
const CONFIG_PLACEHOLDER_KEYS = new Set([
  'COMMUNITY_NAME',
  'FULL_COMMUNITY_ADDRESS',
  'EMERGENCY_ACCESS_POINT',
  'EVACUATION_MEETING_POINT',
  'QUIET_HOURS',
  'RENOVATION_ALLOWED_HOURS',
  'VISITOR_ACCESS_PROCESS',
]);

function findContactByRole(contacts, wantedRole) {
  const target = wantedRole.toLowerCase();
  return (
    (contacts || []).find((c) => (c.role_label || '').toLowerCase() === target) ||
    (contacts || []).find((c) => (c.role_label || '').toLowerCase().includes(target))
  );
}

// Per ai_behavior_rules: "If a configured field is missing, say that the
// contact is not available in the app and give the safe general action" -
// so an unresolved placeholder must never just vanish or show literal
// brackets; it becomes an honest, non-invented fallback phrase.
const UNRESOLVED_PLACEHOLDER_TEXT = 'the contact for this is not yet set up in the app - check with the Community Administrator';

export function resolvePlaceholdersInText(text, contacts, config) {
  if (typeof text !== 'string') return text;
  return text.replace(/\[([A-Z0-9_]+)\]/g, (match, token) => {
    const contactSpec = CONTACT_PLACEHOLDER_ROLES[token];
    if (contactSpec) {
      const contact = findContactByRole(contacts, contactSpec.role);
      const value = contact?.[contactSpec.field] || contact?.phone || contact?.email;
      if (value) return value;
      // The contact row exists but has neither phone nor email (e.g. a
      // locksmith we only have an address/notes for) - showing the real
      // name/notes is more useful than the generic "not set up" fallback,
      // and it's still never an invented number.
      if (contact?.name) return contact.notes ? `${contact.name} (${contact.notes})` : contact.name;
      return UNRESOLVED_PLACEHOLDER_TEXT;
    }
    if (CONFIG_PLACEHOLDER_KEYS.has(token)) {
      const configRow = (config || []).find((c) => c.key === token);
      if (configRow && configRow.value && configRow.value !== '[TO FILL IN]') return configRow.value;
      return UNRESOLVED_PLACEHOLDER_TEXT;
    }
    return UNRESOLVED_PLACEHOLDER_TEXT;
  });
}

export function resolvePlaceholdersInArray(arr, contacts, config) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => resolvePlaceholdersInText(item, contacts, config));
}

// ---------------------------------------------------------------------------
// Deterministic, app-side danger detection. This never depends on the
// Anthropic API being reachable — it fires purely on the raw question text
// so a slow/failed AI call can never suppress the emergency banner.
// ---------------------------------------------------------------------------
const EMERGENCY_PATTERNS = [
  /\bfire\b|\bsmoke\b|\bburning\b/i,
  /\bfuego\b|\bincendio\b|\bhumo\b/i,
  /\bfeu\b|\bincendie\b|\bfumée\b/i,
  /\bfeuer\b|\brauch\b/i,
  /\bgas leak\b|\bsmell(s)? of gas\b/i,
  /\bfuga de gas\b|\bhuele.*\bgas\b|\bgas\b.*\bhuele\b/i,
  /\bfuite de gaz\b|\bodeur de gaz\b/i,
  /\bgasgeruch\b|\bgasleck\b|\briech\w*.*\bgas\b|\bgas\b.*\briech\w*/i,
  /\bunconscious\b|\bnot breathing\b|\bcan'?t breathe\b/i,
  /\binconsciente\b|\bno respira\b/i,
  /\binconscient\b|\bne respire plus\b/i,
  /\bbewusstlos\b|\batmet nicht\b/i,
  /\belectrocut/i,
  /\belectrocu/i,
  /\bexplosion\b|\bexplosión\b|\bexplosión\b|\bexplosion\b/i,
  /\bdrowning\b|\bahogándose\b|\bse ahoga\b|\bse noie\b|\bertrinkt\b/i,
  /\bviolent\b|\bagresivo\b|\bviolento\b|\bviolent\b|\baggressiv\b|\bweapon\b|\barma\b/i,
  /\bheavy bleeding\b|\bsangrado abundante\b/i,
  /\b112\b/,
  // Sparks are dangerous on their own, independent of any water context.
  /\bspark(s|ing)?\b|\bchispas?\b|\bétincelles?\b|\bfunken\b/i,
  // Structural danger.
  /\bceiling.*(collaps|falling|caving)|\bcollaps.*ceiling/i,
  /\btecho.*(colaps|cayendo)|\bcolapso.*techo/i,
  /\bplafond.*(effondr)/i,
  /\bdecke.*(einsturz|stürzt)/i,
  // A person physically trapped is an emergency regardless of cause.
  /\btrapped\b|\batrapad[oa]\b|\bcoinc[ée]\b|\beingeklemmt\b/i,
];

// Some combinations are only dangerous together - water alone or an
// electrical mention alone is routine, but water near anything electrical
// (a light fitting, socket, wiring) is a real shock/fire hazard even
// though neither word alone would trip the single-pattern list above.
const WATER_TERMS = /\bwater\b|\bagua\b|\beau\b|\bwasser\b|\bleak(ing)?\b|\bfuga\b|\bfuite\b|\bleck\b/i;
const ELECTRICAL_TERMS = /\blight(s|ing)?\b|\blamp\b|\bsocket\b|\belectric|\bwir(e|ing)\b|\bluz\b|\blámpara\b|\benchufe\b|\beléctric|\bcable\b|\blumière\b|\bprise\b|\bélectriq|\bfil\b|\blicht\b|\blampe\b|\bsteckdose\b|\belektrisch|\bkabel\b/i;

export function hasDangerousCombo(text) {
  return WATER_TERMS.test(text) && ELECTRICAL_TERMS.test(text);
}

export function detectEmergency(text) {
  return EMERGENCY_PATTERNS.some((re) => re.test(text)) || hasDangerousCombo(text);
}

// ---------------------------------------------------------------------------
// Retrieval: send Claude 2-5 relevant scenarios instead of the whole
// knowledge base on every question.
// ---------------------------------------------------------------------------

// Common function words (articles, pronouns, generic verbs/prepositions,
// question words) across EN/ES/FR/DE. These carry no discriminating signal
// for matching a question to a specific scenario, but a keyword phrase can
// easily end up containing one incidentally (e.g. a Session-16 translation
// like "no puedo contactar al vecino" embeds "puedo" = "I can", an
// extremely common word in Spanish questions generally). Without this
// filter, ANY Spanish question phrased as "¿Dónde puedo...?" ("Where can
// I...?") would false-positive match that emergency scenario purely on
// the word "puedo", regardless of topic - exactly the bug this fixes.
const STOPWORDS = new Set([
  // English
  'the','and','for','are','can','you','your','this','that','with','have',
  'from','what','when','where','how','why','who','will','would','should',
  'could','does','did','was','were','been','being','has','had','not','but',
  'all','any','some','into','than','then','them','they','their','there',
  'here','about','over','under','out','off','get','got','need','know',
  'like','just','also','one','two','our','ours','its','his','her',
  // Spanish
  'que','como','cuando','donde','puedo','puede','pueden','podemos','sobre',
  'para','por','con','las','los','del','una','uno','unos','unas','ese',
  'esa','esos','esas','este','esta','estos','estas','hay','soy','eres',
  'somos','son','estan','mas','muy','sin','entre','tras','hacia','desde',
  'tengo','tiene','tienen','nuestra','nuestro','todos','todas','otro',
  'otra','ser','estar','hace','hacer',
  // French
  'comme','quand','peux','peut','pouvez','pouvons','pour','avec','les',
  'des','une','ces','cette','ceci','cela','sont','suis','es','sommes',
  'plus','tres','sans','entre','vers','depuis','notre','tout','toute',
  'tous','toutes','fait','faire','dans','sur','elle','nous','vous',
  // German
  'dass','wenn','kann','können','über','für','mit','die','der','das',
  'eine','einen','diese','dieser','sind','bin','bist','sehr','ohne',
  'zwischen','seit','habe','haben','hat','unser','unsere','alle','wird',
  'werden','sein',
]);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "fuga" ~ "fugó" etc.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// Topic-adjacent but non-diagnostic words: common enough in ordinary
// community chatter (bookings, events, general questions) that a SINGLE
// match on one of these must never be enough, by itself, to activate an
// incident/safety scenario. This is what "comunidad" and "puedo" both
// were: real, unaccented, non-stopword tokens that nonetheless carry near
// zero discriminating signal for WHICH scenario a question is about.
// Kept separate from STOPWORDS (which are pure grammar words with zero
// content value everywhere) - these still count as real words, they just
// can't single-handedly justify a scenario match.
const GENERIC_TERMS = new Set([
  // EN
  'community', 'apartment', 'building', 'problem', 'contact', 'neighbour',
  'neighbor', 'help', 'information', 'question', 'thanks', 'please',
  'resident', 'residents', 'complex', 'admin', 'administrator',
  'common', 'area', 'areas', 'zone',
  // ES
  'comunidad', 'apartamento', 'edificio', 'problema', 'contacto', 'vecino',
  'ayuda', 'informacion', 'pregunta', 'gracias', 'residente', 'residentes',
  'piso', 'administrador', 'comun', 'zona', 'zonas',
  // FR
  'communaute', 'appartement', 'immeuble', 'probleme', 'contact', 'voisin',
  'aide', 'information', 'question', 'merci', 'resident', 'residents',
  'gestionnaire', 'commune', 'communs', 'zone',
  // DE
  'gemeinschaft', 'wohnung', 'gebaude', 'problem', 'kontakt', 'nachbar',
  'hilfe', 'information', 'frage', 'danke', 'bewohner', 'verwalter',
  'gemeinsam', 'bereich',
]);

const MIN_MEANINGFUL_TOKENS = 2; // weak evidence needs at least 2 independent hits
const MIN_PHRASE_TOKENS = 2; // a "phrase" that reduces to 1 word after generic
                              // filtering is just a single word wearing a
                              // phrase's clothing - it must not get the full
                              // phrase bonus (this is exactly how "no water"
                              // -> ["water"] let WAT-06 outrank WAT-01 for a
                              // ceiling-leak question that only shares the
                              // single word "water").
const PHRASE_MATCH_SCORE = 5; // a full multi-word phrase match is strong evidence
const TOKEN_MATCH_SCORE = 1;

// Scores one entry against the question. Two independent, additive kinds
// of evidence:
//   1) PHRASE evidence - every (non-generic) word of one of the entry's
//      own keyword phrases appears in the question, AND the phrase still
//      has at least MIN_PHRASE_TOKENS words after generic-term removal.
//      This is what "fuga de agua arriba" matching "fuga de agua ...
//      arriba" represents: a specific, curated multi-word signal, not a
//      coincidence.
//   2) TOKEN evidence - individual non-generic word overlap (from keyword
//      phrases that didn't fully qualify as a phrase match, and from
//      tokenized example_user_queries, which are richer natural phrasings
//      but not curated phrase-by-phrase).
// A candidate is only eligible at all if it has a full phrase match OR at
// least MIN_MEANINGFUL_TOKENS independent non-generic token hits - a
// single word (whether a bare keyword or a "phrase" that collapsed to one
// word) can never be enough by itself.
function scoreEntry(entry, questionTokens) {
  let phraseMatched = false;
  const meaningfulMatches = new Set();

  for (const phrase of entry.keywords || []) {
    const phraseTokens = tokenize(phrase).filter((t) => !GENERIC_TERMS.has(t));
    if (phraseTokens.length === 0) continue; // phrase carried no real signal at all
    const allPresent = phraseTokens.every((t) => questionTokens.has(t));
    if (allPresent && phraseTokens.length >= MIN_PHRASE_TOKENS) {
      phraseMatched = true;
      phraseTokens.forEach((t) => meaningfulMatches.add(t));
    } else {
      phraseTokens.forEach((t) => { if (questionTokens.has(t)) meaningfulMatches.add(t); });
    }
  }

  const exampleTokens = (entry.logic_json?.example_user_queries || [])
    .flatMap((q) => tokenize(q))
    .filter((t) => !GENERIC_TERMS.has(t));
  exampleTokens.forEach((t) => { if (questionTokens.has(t)) meaningfulMatches.add(t); });

  const eligible = phraseMatched || meaningfulMatches.size >= MIN_MEANINGFUL_TOKENS;
  if (!eligible) return { score: 0, phraseMatched: false, meaningfulMatches: [] };

  const score = (phraseMatched ? PHRASE_MATCH_SCORE : 0) + meaningfulMatches.size * TOKEN_MATCH_SCORE;
  return { score, phraseMatched, meaningfulMatches: [...meaningfulMatches] };
}

export function retrieveRelevantEntries(entries, question) {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return { entries: [], fallbackUsed: false };

  const scored = entries.map((entry) => ({ entry, ...scoreEntry(entry, questionTokens) }));

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0).slice(0, MAX_RETRIEVED_ENTRIES);

  if (matched.length > 0) return { entries: matched.map((s) => s.entry), fallbackUsed: false };

  // Low confidence is intentionally a dead end here, not a fallback to
  // "general" entries: no deterministic scenario match is better than a
  // wrong one. The question is still answered normally (community_config
  // facts + the LLM's own knowledge), just without an incident/safety
  // scenario forced onto it.
  return { entries: [], fallbackUsed: true };
}


// Chooses the primary scenario for this turn and the full set of entries
// whose content gets attached to the prompt/response: the new top match,
// any other current matches, and whatever the previous turn's confirmed
// primary/related intents were (carried forward per the deployment doc's
// multi-turn example: WAT-01 -> +BLD-08 -> +ELE-05, never dropped just
// because a later message didn't repeat the same words).
export function selectAttachedEntries(allEntries, currentMatches, fallbackUsed, priorPrimaryCode, priorRelatedCodes) {
  const byCode = new Map(allEntries.map((e) => [e.intent_code || e.id, e]));
  const attached = [];
  const seen = new Set();

  function add(entry) {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    attached.push(entry);
  }

  if (!fallbackUsed && currentMatches.length > 0) {
    currentMatches.forEach(add);
  } else if (priorPrimaryCode && byCode.has(priorPrimaryCode)) {
    add(byCode.get(priorPrimaryCode));
    currentMatches.forEach(add); // fallback/general entries, lower priority
  } else {
    currentMatches.forEach(add);
  }

  const primary = attached[0] || null;

  // Carry forward the previous related intents and previous primary (if it
  // isn't already the new primary) so context genuinely persists.
  if (priorPrimaryCode && byCode.has(priorPrimaryCode)) add(byCode.get(priorPrimaryCode));
  for (const code of priorRelatedCodes || []) {
    if (byCode.has(code)) add(byCode.get(code));
  }
  // The new primary's own declared related_intents.
  for (const code of primary?.logic_json?.related_intents || []) {
    if (byCode.has(code)) add(byCode.get(code));
  }

  return { primary, attached: attached.slice(0, MAX_RETRIEVED_ENTRIES + MAX_RELATED_INTENTS) };
}

export function computeRelatedIntents(primary, attached) {
  if (!primary) return [];
  const primaryCode = primary.intent_code || primary.id;
  return attached
    .map((e) => e.intent_code || e.id)
    .filter((code) => code !== primaryCode)
    .slice(0, MAX_RELATED_INTENTS);
}

// Deterministic, server-owned branching: the LLM never invents which
// insurance/follow-up module applies once a source_status is confirmed -
// the primary scenario's own post_incident_branching rules decide that.
export function applyDeterministicBranching(primary, sourceStatus) {
  const rules = primary?.logic_json?.post_incident_branching || [];
  const modules = [];
  for (const rule of rules) {
    const match = /^source_status\s*==\s*(\w+)$/.exec(rule.when || '');
    if (match && match[1] === sourceStatus && Array.isArray(rule.apply)) {
      modules.push(...rule.apply);
    }
  }
  return modules;
}

// Never trust the model's own list of which modules it "used" - only
// modules we actually attached (via the scenario's followup_modules or
// deterministic branching) may appear in the final response.
export function resolveModules(requestedCodes, candidateModules) {
  const byCode = new Map(candidateModules.map((m) => [m.module_code, m]));
  const resolved = [];
  const seen = new Set();
  for (const code of requestedCodes || []) {
    if (typeof code !== 'string' || seen.has(code)) continue;
    const mod = byCode.get(code);
    if (mod) {
      seen.add(code);
      resolved.push({
        code: mod.module_code,
        title: mod.title,
        actions: mod.content_json?.actions || [],
        doNot: mod.content_json?.do_not || [],
      });
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Output validation - never trust the model's own claims about which
// sources/contacts it used or what urgency applies.
// ---------------------------------------------------------------------------
export function safeParseJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // Strip accidental code fences even though the prompt forbids them.
  text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function clampUrgency(value, fallback) {
  return ALLOWED_URGENCY.includes(value) ? value : fallback;
}

export function validateSources(parsedSources, relevantEntries) {
  const validSourceCodes = new Set(relevantEntries.map((e) => e.intent_code || e.id));
  return (Array.isArray(parsedSources) ? parsedSources : []).filter((s) => validSourceCodes.has(s));
}

// The model is told to reference contacts only by their role_label - it
// never sees or invents an actual phone number/email. The app looks the
// real contact up here, so a hallucinated or malformed role simply matches
// nothing and is silently dropped rather than shown to the resident.
export function resolveContactRoles(requestedRoles, contacts) {
  if (!Array.isArray(requestedRoles) || !Array.isArray(contacts)) return [];
  const resolved = [];
  const usedLabels = new Set();

  for (const role of requestedRoles) {
    if (typeof role !== 'string' || !role.trim()) continue;
    const wanted = role.trim().toLowerCase();

    const exact = contacts.find((c) => (c.role_label || '').toLowerCase() === wanted);
    const fuzzy = exact || contacts.find((c) => (c.role_label || '').toLowerCase().includes(wanted));
    const match = exact || fuzzy;

    if (match && !usedLabels.has(match.role_label)) {
      usedLabels.add(match.role_label);
      resolved.push({ label: match.role_label, name: match.name || '', phone: match.phone || '', email: match.email || '' });
    }
  }
  return resolved;
}
