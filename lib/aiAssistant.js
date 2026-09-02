// Pure, dependency-free helper functions for the Community Assistant
// (app/api/ask-ai/route.js). Pulled out into their own module specifically
// so they can be unit tested without mocking Supabase or the Anthropic API -
// this is the most complex server module in the app and previously had zero
// test coverage of its own.

export const MAX_RETRIEVED_ENTRIES = 5;
// Above this word count, a fallbackUsed=true question is treated as a
// genuinely new, substantive topic rather than a brief "what should I
// do next?"-style follow-up - see selectAttachedEntries() for the full
// rationale and the real-world failure this threshold prevents.
export const SHORT_FOLLOWUP_MAX_WORDS = 8;
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
// brackets; it becomes an honest, non-invented fallback phrase, in the
// resident's own preferredLanguage rather than always English.
const UNRESOLVED_PLACEHOLDER_TEXT = {
  en: 'the contact for this is not yet set up in the app - check the Contacts section',
  es: 'este contacto todavía no está configurado en la app - consulta la sección Contactos',
  de: 'dieser Kontakt ist in der App noch nicht eingerichtet - siehe den Bereich Kontakte',
  fr: "ce contact n'est pas encore configuré dans l'application - consultez la section Contacts",
};

function unresolvedText(lang) {
  return UNRESOLVED_PLACEHOLDER_TEXT[lang] || UNRESOLVED_PLACEHOLDER_TEXT.en;
}

export function resolvePlaceholdersInText(text, contacts, config, lang = 'en') {
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
      return unresolvedText(lang);
    }
    if (CONFIG_PLACEHOLDER_KEYS.has(token)) {
      const configRow = (config || []).find((c) => c.key === token);
      if (configRow && configRow.value && configRow.value !== '[TO FILL IN]') return configRow.value;
      return unresolvedText(lang);
    }
    return unresolvedText(lang);
  });
}

// Defensive final check: no literal, unresolved [SOMETHING] pattern should
// ever reach the resident, regardless of where it came from (a scenario
// missing a mapping in CONTACT_PLACEHOLDER_ROLES/CONFIG_PLACEHOLDER_KEYS
// entirely, a typo in logic_json, a future field this function doesn't
// know about yet). This runs as a last-resort net AFTER normal resolution,
// not instead of it.
export function sanitizeUnresolvedPlaceholders(text, lang = 'en') {
  if (typeof text !== 'string') return text;
  return text.replace(/\[[A-Z0-9_]+\]/g, () => unresolvedText(lang));
}

// Some entries have both a role-specific and a general contact resolving to
// the exact same phone/email (e.g. Maintenance and Administrator are often
// the same company for a small community) - showing "Maintenance: 952..."
// and "Administrator: 952..." back to back is just noise even though the
// LABEL differs. Extract the actual phone/email value from each line and
// keep only the first line for each distinct value.
const PHONE_PATTERN = /(\+?\d[\d\s-]{6,}\d)/;
const EMAIL_PATTERN = /([\w.+-]+@[\w-]+\.[\w.-]+)/;

export function dedupeResolvedContactLines(lines) {
  const seenValues = new Set();
  const result = [];
  for (const line of lines) {
    const phoneMatch = line.match(PHONE_PATTERN);
    const emailMatch = line.match(EMAIL_PATTERN);
    const value = (phoneMatch && phoneMatch[1].trim()) || (emailMatch && emailMatch[1].trim()) || line.trim();
    if (seenValues.has(value)) continue;
    seenValues.add(value);
    result.push(line);
  }
  return result;
}

export function resolvePlaceholdersInArray(arr, contacts, config, lang = 'en') {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => resolvePlaceholdersInText(item, contacts, config, lang));
}

// Deterministic, per-scenario structured content (immediate_actions,
// do_not, contact_route, documentation, follow_up) is stored per-language
// as sibling keys (e.g. "immediate_actions_es" alongside the canonical
// English "immediate_actions"), added additively so existing entries never
// need restructuring. Falls back to the English canonical array whenever
// a scenario hasn't been translated into the resident's language yet -
// English content, not an empty section, is always the safe fallback.
export function localizeField(logic, field, lang) {
  if (!logic) return [];
  if (lang && lang !== 'en') {
    const localized = logic[`${field}_${lang}`];
    if (Array.isArray(localized) && localized.length > 0) return localized;
  }
  return Array.isArray(logic[field]) ? logic[field] : [];
}

// ---------------------------------------------------------------------------
// Deterministic, app-side danger detection. This never depends on the
// Anthropic API being reachable — it fires purely on the raw question text
// so a slow/failed AI call can never suppress the emergency banner.
// ---------------------------------------------------------------------------
// Centralized, normalized threat/attack verb vocabulary - the ONE place
// this is defined, reused by the violence/animal-attack hazard family
// below AND by the actor-classification logic in scoreEntry(), so the
// emergency detector and the retrieval-time actor classifier can never
// drift apart on which verb forms count. Written WITHOUT accented
// characters and using "ss" (not ß) - callers must run stripAccents()
// on their input first, which also normalizes ß->ss, so "amenaza",
// "amenazando", "ataca", "atacando", "agrede", "muerde" (ES); "menace",
// "attaque", "mord", "poursuit" (FR); "bedroht", "greift...an"/
// "angreift", "beisst" (from ß), "verfolgt" (DE); "threatens",
// "threatening", "attacks", "attacking", "bites", "chasing" (EN) all
// match uniformly.
const THREAT_ATTACK_VERB_PATTERN = /\bthreat(en|ening|ens)?\b|\bfight(ing)?\b|\battack(ing|s|ed)?\b|\bbit(e|es|ing)?\b|\bchas(e|es|ing)\b|\bamenaz\w*\b|\bpelea\b|\bagresion\b|\bataca\w*\b|\bagred\w*\b|\bmuerd\w*\b|\bmenac\w*\b|\bbagarre\b|\bagress\w*\b|\battaqu\w*\b|\bmord\w*\b|\bpoursuiv\w*\b|\bbedroh\w*\b|\bschlagerei\b|\bangriff\b|\bgreif\w*\b|\bbeiss\w*\b|\bverfolg\w*\b/i;

// Each hazard family is evaluated INDEPENDENTLY: its own positive
// evidence, its own contextual suppression, scoped to the CLAUSE
// containing the specific match (via clauseTextAround below) - not the
// whole message. This is why a historical fight in one clause cannot
// suppress an active gas leak mentioned in a different clause of the
// same message, and why cigarette-smoke nuisance context only ever
// affects the fire/smoke interpretation, never gas or violence.
const HAZARD_FAMILIES = {
  fire_smoke: {
    positive: [
      /\bfire\b|\bsmoke\b|\bburning\b/i,
      /\bfuego\b|\bincendio\b|\bhumo\b/i,
      /\bfeu\b|\bincendie\b|\bfumee\b/i,
      /\bfeuer\b|\brauch\b/i,
      /\bbrennt\b|\bes brennt\b/i,
    ],
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS, ...NUISANCE_SMOKE_PATTERNS],
  },
  gas: {
    positive: [
      /\bgas leak\b|\bsmell(s)?(?: of)? gas\b/i,
      /\bfuga de gas\b|\bhuele.*\bgas\b|\bgas\b.*\bhuele\b/i,
      /\bfuite de gaz\b|\bodeur de gaz\b/i,
      /\bgasgeruch\b|\bgasleck\b|\briech\w*.*\bgas\b|\bgas\b.*\briech\w*/i,
    ],
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS],
  },
  medical_other: {
    // Medical signals OTHER than "not responding" (which has its own
    // bespoke subject-scoped logic elsewhere) and OTHER than drowning
    // verb forms already covered here for completeness.
    positive: [
      /\bunconscious\b|\bnot breathing\b|\bcan'?t breathe\b/i,
      /\binconsciente\b|\bno respira\b/i,
      /\binconscient\b|\bne respire plus\b/i,
      /\bbewusstlos\b|\batmet nicht\b/i,
      /\belectrocut/i,
      /\belectrocu/i,
      /\bexplosion\b/i,
      /\bdrowning\b|\bahogandose\b|\bse ahoga\b|\bse noie\b|\bertrinkt\b/i,
      /\bahogando\b|\bahogandose\b/i,
      /\bnoie\b/i,
      /\bheavy bleeding\b|\bsangrado abundante\b/i,
      /\b112\b/,
    ],
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS],
  },
  threat_or_attack: {
    // Human threat/violence and animal attack share the SAME verb
    // vocabulary (THREAT_ATTACK_VERB_PATTERN) - species disambiguation
    // for RETRIEVAL primary (SEC-04 vs SAF-03) happens separately in
    // scoreEntry(); for the emergencyDetected boolean itself, either
    // species triggering is equally an active-danger signal.
    positive: [THREAT_ATTACK_VERB_PATTERN, /\bviolent\b|\bagresivo\b|\bviolento\b|\baggressiv\b|\bweapon\b|\barma\b/i],
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS],
  },
  structural: {
    positive: [
      // Sparks are dangerous on their own, independent of any water context.
      /\bspark(s|ing)?\b|\bchispas?\b|\betincelles?\b|\bfunken\b/i,
      /\bceiling.*(collaps|falling|caving)|\bcollaps.*ceiling/i,
      /\btecho.*(colaps|cayendo)|\bcolapso.*techo/i,
      /\bplafond.*(effondr)/i,
      /\bdecke.*(einsturz|sturzt)/i,
      /\btrapped\b|\batrapad[oa]\b|\bcoince\b|\beingeklemmt\b/i,
      /\bearthquake\b|\b(the )?building.*(shak|sway)|\bshak\w*.*building\b/i,
      /\bterremoto\b|\bsismo\b|\bedificio.*tiembl|\btiembl\w*.*edificio/i,
      /\btremblement de terre\b|\bseisme\b|\bimmeuble.*tremble|\bbatiment.*tremble/i,
      /\berdbeben\b|\bgebaude.*wackel|\bhaus.*wackel/i,
    ],
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS],
  },
  intruder: {
    positive: [
      /\bintruder\b|\bburglar\b|\bbreaking[\s-]*(in|into)\b|\btrying to break[\s-]*(in|into)\b/i,
      /\bintruso\b|\ballanamiento\b|\bladron(es)?\b|\brobo en curso\b/i,
      /\bintrus\b|\bcambrioleur\b|\beffraction\b/i,
      /\beindringling\b|\beinbrecher\b|\beinbruch\b/i,
    ],
    // Informational-mention suppression (article about/definition
    // question/worry-might) is scoped to ONLY this family, exactly as
    // before - it must never suppress an unrelated hazard.
    suppression: () => [...HISTORICAL_PATTERNS, ...DRILL_PATTERNS, ...INFORMATIONAL_MENTION_PATTERNS],
  },
};

// Finds the clause CONTAINING the match at [startIdx, endIdx) - the
// nearest CLAUSE_BOUNDARY_PATTERNS boundary before startIdx, and the
// nearest one at-or-after endIdx - so a suppression marker ("yesterday",
// "drill") elsewhere in the message, outside this clause, is correctly
// ignored.
function clauseTextAround(text, startIdx, endIdx) {
  let boundaryStart = 0;
  let boundaryEnd = text.length;
  for (const pattern of CLAUSE_BOUNDARY_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const mEnd = m.index + m[0].length;
      if (mEnd <= startIdx && mEnd > boundaryStart) boundaryStart = mEnd;
      if (m.index >= endIdx && m.index < boundaryEnd) boundaryEnd = m.index;
      if (pattern.lastIndex === m.index) pattern.lastIndex += 1;
    }
  }
  return text.slice(boundaryStart, boundaryEnd);
}

function evaluateHazardFamily(text, family) {
  const suppressionPatterns = family.suppression();
  for (const re of family.positive) {
    // Global-flag copy so ALL occurrences of this pattern are checked,
    // not just the first - a suppressed match in one clause must not
    // hide an unsuppressed match of the SAME pattern in a later clause
    // ("I usually smell cigarette smoke, but now thick smoke is coming
    // from the apartment." has two "smoke" occurrences; the first is
    // nuisance-qualified, the second is not and must still register).
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = globalRe.exec(text)) !== null) {
      const clause = clauseTextAround(text, m.index, m.index + m[0].length);
      const suppressed = suppressionPatterns.some((sre) => sre.test(clause));
      const overridden = ACTIVE_NOW_PATTERNS.some((sre) => sre.test(clause)) || STRONG_OVERRIDE_PATTERNS.some((sre) => sre.test(clause));
      if (!suppressed || overridden) return true;
      if (globalRe.lastIndex === m.index) globalRe.lastIndex += 1;
    }
  }
  return false;
}

// Some combinations are only dangerous together - water alone or an
// electrical mention alone is routine, but water near anything electrical
// (a light fitting, socket, wiring) is a real shock/fire hazard even
// though neither word alone would trip the single-pattern list above.
// Normalizes text for accent/diacritic-insensitive AND German ß-insensitive
// matching: lowercase, Unicode NFD decomposition, strip combining marks
// (the same normalization tokenize() already uses for retrieval), plus an
// explicit ß->ss replacement - ß is a distinct letter (not a base
// character + combining accent), so NFD alone never touches it, and
// "beißt"/"beisst" must compare equal for consistent multilingual
// matching. Used for the raw-text WATER_TERMS/ELECTRICAL_TERMS checks,
// and now also for MED-02 subject and SAF-03/SEC-04 actor clause text,
// so accented/unaccented Spanish, French and German forms all match the
// same (unaccented) pattern lists without needing every variant spelled
// out twice.
function stripAccents(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

// Deliberately written WITHOUT accented characters - the text they test
// against is always pre-normalized via stripAccents() first, so both
// "lámpara" and "lampara" match identically. Confirmed bug this fixes:
// the previous versions had accented characters hard-coded into the
// regex itself (e.g. \blámpara\b), which only matched the accented
// spelling and silently failed for the unaccented one.
const WATER_TERMS = /\bwater\b|\brainwater\b|\bwastewater\b|\bstandingwater\b|\bmoisture\b|\bagua\b|\beau\b|\bwasser\b|\bleak(ing)?\b|\bfuga\b|\bfuite\b|\bleck\b|\bgotea\w*\b|\btropft\b|\bcoule\b|\bhumedad\b|\bfeuchtigkeit\b/i;
const ELECTRICAL_TERMS = /\blight(s|ing)?\b|\blamp\b|\blampara\b|\bsocket\b|\boutlet\b|\bpanel\b|\bcuadro\b|\btableau\b|\bschaltschrank\b|\belectric\w*|\belectriqu\w*|\bwir(e|ing)\b|\bluz\b|\benchufe\b|\bcable\b|\blumiere\b|\bluminaire\b|\bprise\b|\bfil\b|\blicht\b|\b\w*lampe\b|\b\w*leuchte\b|\bsteckdose\b|\belektrisch\w*|\bkabel\b/i;

// ============================================================
// ELE-05 water/electrical relationship — Round 11.
//
// Round 10 was, on independent adversarial review, a boolean segment
// evaluator wearing "subject-aware" language: it split text into larger
// segments and then re-tested loose co-presence of a water term, an
// electrical term, and a relation word WITHIN that segment. That is not
// a candidate model - it never confirmed that the electrical term was
// actually the OBJECT or DESTINATION of the specific predicate, nor
// that a negation/modal/temporal marker actually attached to the
// specific candidate rather than to the whole segment.
//
// Round 11 replaces this with a genuine, dependency-free token/mention/
// candidate pipeline:
//   1) tokenizeWithPositions()  - tokens with real start/end offsets
//      into the ORIGINAL text.
//   2) extractMentions()        - water/electrical/wet-state/negation/
//      temporal/modal mentions. Water and electrical mentions are
//      classified by walking forward to find the actual HEAD of their
//      containing noun phrase (stopping at a preposition, a known verb,
//      a clause boundary, or a relative-clause introducer) and
//      classifying by THAT head word against explicit lexicons -
//      "electrical panel installer" resolves to head "installer"
//      (person_or_role), "electrical panel" resolves to head "panel"
//      (electrical_component). A bare token match is never itself an
//      endpoint.
//   3) buildCandidates()        - for each plausible family, confirms
//      the electrical/water mention is structurally the object,
//      destination, subject, or contact/proximity/mixing participant of
//      a SPECIFIC predicate occurrence (bounded object/destination
//      window that stops at a clause boundary OR a relative-clause
//      introducer, so "electrical panel" embedded inside "where the
//      electrical panel documentation is stored" is correctly excluded
//      from being the destination of an outer "entered the bathroom").
//      Negation, modality (hypothetical/conditional), and temporality
//      (historical/current) are each resolved LOCALLY against the
//      specific predicate span of the candidate, not the whole segment.
//   4) analyzeWaterElectricalRelationships() - the public, pure,
//      side-effect-free diagnostic entry point.
// ============================================================


// ============================================================
// ELE-05 water/electrical relationship — Round 12.
//
// Round 11 introduced a genuine candidate model but independent testing
// found five structural gaps: (1) directional search crossed sentence
// boundaries via a raw 120-char window; (2) any water mention appearing
// anywhere before a verb was treated as its subject, regardless of a
// closer, different subject noun phrase; (3) any electrical mention
// inside a wide word-count window was treated as a verb's destination,
// regardless of relative-clause/subordinate-clause boundaries beyond
// just "where/that/which/who"; (4) containment picked the nearest
// electrical mention rather than the true syntactic container; (5)
// capability modals (can/puede/peut/kann) were folded into NEGATION_RE;
// (6) spans were computed against accent-stripped normalized text,
// which can differ in length from the original (e.g. German ß->ss),
// silently misaligning every span.
//
// Round 12 restructures around explicit SENTENCE and CLAUSE boundaries:
//   - tokenizeWithPositions() now tokenizes the RAW text directly, so
//     every span is a raw offset by construction - no post-hoc mapping.
//   - Sentences are the hard outer boundary: no candidate ever spans two
//     sentences.
//   - Within a sentence, CLAUSES are cut at subordinators (while/
//     before/after/when/where/because/that/which/who, ES/FR/DE
//     equivalents) and at coordinators that introduce a genuinely new
//     subject NP (existing new-subject-vs-continuation logic, reused).
//   - Each clause's SUBJECT is the nearest noun phrase before its main
//     verb WITHIN THAT CLAUSE (not "any water mention anywhere
//     earlier") - or, for a bare coordinated continuation with no
//     subject NP of its own, the immediately preceding clause's already-
//     established subject.
//   - Negation ("cannot"/"no puede"/"kann nicht") and modality-only
//     capability words ("can"/"puede"/"kann") are now disjoint sets.
// ============================================================

function tokenizeWithPositions(rawText) {
  const text = rawText || '';
  const tokens = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿßœŒ]+|[.,;!?:—–\n\/]/g;
  let m;
  let sentenceIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const value = m[0];
    const isPunct = /^[.,;!?:—–\n\/]$/.test(value);
    tokens.push({
      value,
      normalized: isPunct ? value : stripAccents(value),
      start: m.index,
      end: m.index + value.length,
      sentenceIndex,
      isPunct,
    });
    if (isPunct && /[.!?]/.test(value)) sentenceIndex += 1;
  }
  return tokens;
}

// Builds a token-joined normalized string (single space between tokens)
// so multi-word regex patterns can still be matched the same way as
// before, PLUS a lookup that converts any [start,end) range in that
// joined string back into a RAW-text span via the tokens it covers -
// this is what actually fixes the ß->ss span-drift bug: every span
// returned to the caller is built from token.start/token.end on the
// ORIGINAL text, never from arithmetic on the normalized string itself.
function buildNormalizedIndex(tokens) {
  let normalizedConcat = '';
  const tokenSpans = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const normStart = normalizedConcat.length;
    normalizedConcat += t.normalized;
    const normEnd = normalizedConcat.length;
    tokenSpans.push({ tokenIndex: i, normStart, normEnd });
    if (i < tokens.length - 1) normalizedConcat += ' ';
  }
  return { normalizedConcat, tokenSpans };
}

function normRangeToRawSpan(tokenSpans, tokens, normStart, normEnd) {
  let firstTok = null;
  let lastTok = null;
  for (const ts of tokenSpans) {
    if (ts.normEnd > normStart && firstTok === null) firstTok = ts;
    if (ts.normStart < normEnd) lastTok = ts;
  }
  if (!firstTok || !lastTok) return null;
  return { start: tokens[firstTok.tokenIndex].start, end: tokens[lastTok.tokenIndex].end };
}


// --- Lexicons ---------------------------------------------------------

// General rule (not a blacklist): when "water" modifies a LATER head
// noun ("water bottle", "water meter", "water resistance"), the
// compound is liquid water ONLY if that head noun is itself a water/
// leak/moisture synonym - never because of what the head ISN'T. Any
// head not in this whitelist (device, container, sensor, document,
// financial term, or anything else) makes the compound non-hazardous,
// without needing to enumerate every possible non-water noun.
const WATER_LIQUID_HEAD_SYNONYMS = new Set([
  'water', 'rainwater', 'wastewater', 'standingwater', 'leak', 'leaking', 'leakage', 'flood', 'flooding', 'puddle', 'stream', 'spill', 'spillage', 'moisture', 'dampness', 'wetness', 'drip', 'dripping',
  'agua', 'fuga', 'inundacion', 'charco', 'humedad', 'goteo',
  'eau', 'fuite', 'inondation', 'flaque', 'humidite', 'ecoulement',
  'wasser', 'leck', 'ueberschwemmung', 'pfuetze', 'feuchtigkeit',
]);

const ELECTRICAL_COMPONENT_HEAD_WORDS = new Set([
  'socket', 'outlet', 'panel', 'wiring', 'wire', 'wires', 'cable', 'fitting', 'lamp', 'light', 'lights', 'fixture', 'switch', 'breaker',
  'enchufe', 'cuadro', 'lampara', 'luz', 'cable', 'instalacion',
  'prise', 'tableau', 'lampe', 'luminaire', 'fil', 'cablage',
  'steckdose', 'schaltschrank', 'kabel', 'leuchte', 'licht', 'verkabelung',
]);
const PERSON_ROLE_HEAD_WORDS = new Set([
  'technician', 'contractor', 'engineer', 'worker', 'electrician', 'plumber', 'staff', 'supplier', 'installer', 'person', 'man', 'woman', 'resident', 'neighbour', 'neighbor', 'someone',
  'instalador', 'tecnico', 'contratista', 'ingeniero', 'electricista', 'obrero', 'persona',
  'installateur', 'technicien', 'electricien', 'ouvrier',
  'techniker', 'monteur', 'arbeiter',
]);
const NONCOMPONENT_HEAD_WORDS = new Set([
  'wrench', 'discussion', 'price', 'prices', 'cap', 'market', 'bill', 'bills', 'documentation', 'paint', 'mixer', 'installer', 'technician', 'contractor', 'engineer', 'van', 'bottle', 'tank', 'bracket',
]);
const NONHAZARD_PRENOMINAL_MODIFIER = new Set(['discussion', 'review', 'expert', 'advisory', 'light-blue', 'blue']);

const WET_PREDICATE_RE = /\b(?:wet|mojad\w*|mojand\w*|mouill\w*|nass\w*)\b/i;
const WET_NONPREDICATE_RE = /\bwet[\s-]?(?:tested|paint|resistant)\b|\bwet\s+paint\b/i;

const VERB_STOP_WORDS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'entered', 'entering', 'enters', 'enter', 'reached', 'reaching', 'reaches', 'reach', 'leaked', 'leaking', 'leaks', 'leak',
  'dripped', 'dripping', 'drips', 'drip', 'came', 'coming', 'comes', 'come', 'went', 'going', 'goes', 'go', 'got', 'getting', 'gets', 'get',
  'contains', 'contained', 'containing', 'contain', 'stored', 'storing', 'store', 'kept', 'keeping', 'keep', 'found', 'finding', 'find',
  'works', 'worked', 'working', 'work', 'damaged', 'damaging', 'damage', 'inspected', 'inspecting', 'inspect', 'installed', 'installing', 'install',
  'repaired', 'repairing', 'repair', 'stopped', 'stopping', 'stop', 'ended', 'ending', 'end', 'checked', 'checking', 'check', 'monitored', 'monitoring', 'monitor',
  'rising', 'rise', 'rose', 'mixing', 'mixed', 'mix', 'said', 'says', 'say', 'asked', 'asking', 'ask', 'remained', 'remaining', 'remain', 'will', 'would', 'could', 'might', 'may', 'can',
  'se', 'esta', 'estan', 'son', 'fue', 'fueron', 'entra', 'entro', 'entrando', 'entrara', 'llega', 'llego', 'llegando', 'llegara', 'tiene', 'tienen', 'dano', 'puede', 'podria',
  'est', 'sont', 'etait', 'entre', 'entree', 'entrant', 'entrera', 'atteint', 'atteindra', 'ont', 'abime', 'peut', 'pourrait',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'hat', 'haben', 'tritt', 'gelangt', 'beschadigt', 'kann', 'konnte',
]);
const PREPOSITION_STOP_WORDS = new Set([
  'of', 'in', 'on', 'at', 'with', 'from', 'to', 'into', 'near', 'around', 'next', 'beside', 'for', 'by', 'through', 'inside', 'insider', 'cerca', 'junto', 'alrededor',
  'de', 'en', 'con', 'desde', 'para', 'por', 'dentro',
  'dans', 'avec', 'depuis', 'pour', 'par', 'pres', 'autour',
  'von', 'mit', 'fur', 'durch', 'im', 'nahe', 'neben',
]);
const DETERMINER_WORDS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'el', 'la', 'los', 'las', 'un', 'una', 'mi', 'su', 'le', 'les', 'un', 'une', 'mon', 'ma', 'son', 'sa', 'der', 'die', 'das', 'ein', 'eine', 'mein', 'sein']);
const NP_STOP_EXTRA_WORDS = new Set([
  'yesterday', 'today', 'tomorrow', 'now', 'and', 'but', 'while', 'because', 'ago', 'later', 'earlier', 'night', 'morning', 'tonight', 'last', 'next',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'hour', 'hours', 'minute', 'minutes', 'day', 'days', 'week', 'weeks',
  'ayer', 'hoy', 'manana', 'ahora', 'y', 'pero', 'mientras', 'porque', 'hace', 'antes', 'noche', 'anoche', 'un', 'una', 'dos', 'tres', 'hora', 'horas', 'pasada', 'pasado',
  'hier', 'aujourdhui', 'demain', 'maintenant', 'et', 'mais', 'tandis', 'parce', 'plus', 'tot', 'soir', 'un', 'une', 'deux', 'trois', 'heure', 'heures', 'derniere', 'dernier',
  'gestern', 'heute', 'morgen', 'jetzt', 'und', 'aber', 'wahrend', 'weil', 'vor', 'fruher', 'abend', 'ein', 'eine', 'zwei', 'drei', 'stunde', 'stunden', 'letzte', 'letzten',
  'not', 'no', 'never', 'cannot', 'nunca', 'jamas', 'jamais', 'pas', 'nie', 'niemals', 'nicht', 'kein', 'keine', 'doubt', 'n', 's',
  'previously', 'formerly', 'used', 'to', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'according', 'right',
  'anteriormente', 'precedemment', 'auparavant', 'vorher', 'zuvor',
]);

// Subordinators - each one starts an EMBEDDED clause with its own
// subject scope. Content on either side of one of these belongs to a
// DIFFERENT clause and must not share subject/object binding.
const SUBORDINATOR_RE = /\b(?:while|before|after|when|where|that|which|who|because|antes\s+de\s+que|despues\s+de\s+que|mientras|cuando|donde|que|quien|porque|avant\s+que|apres\s+que|pendant\s+que|lorsque|ou|qui|parce\s+que|bevor|nachdem|wahrend|wenn|wo|weil)\b/gi;
// Reporting/uncertainty/imagination verbs introduce their own complement
// clause even without an explicit "that"/"whether" - "A resident SAYS
// water is entering..." / "We tested WHETHER water reached..." / "I
// IMAGINED water entering..." each start a fresh clause for the
// complement, with its own subject search (so "water" is never treated
// as the object of "says"/"tested"/"imagined" itself).
const REPORTING_COMPLEMENT_RE = /\b(?:says?|said|reports?|reported|stated?)\b/gi;
const UNCERTAIN_COMPLEMENT_RE = /\b(?:tested|test|asked|whether)\b/gi;
const IMAGINED_COMPLEMENT_RE = /\b(?:imagined|imagine|supposed|suppose)\b/gi;
const DENIAL_COMPLEMENT_RE = /\b(?:denied|denies|denying|doubted|doubts|doubting)\b/gi;
const COORDINATOR_RE = /\b(?:and|but|y|pero|et|mais|und|aber)\b/gi;
const CONTINUATION_PREDICATE_START = /^(?:reach(?:ing|es|ed)?|enter(?:ing|s|ed)?|leak(?:ing|ed)?|drip(?:ping|ped|s)?|com(?:e|ing|es)?|go(?:es|ing|ne)?|got?(?:ten)?|is|are|was|were|becomes?|became|getting|gets|got|contains?|has|have|had|se|esta|estan|est|sont|wird|werden|ist|sind|gelangt\w*|dring\w*|gotea\w*|corr\w*|coul\w*|tropft\w*|lauft\w*|entr\w*|llega\w*|atteint\w*|erreicht\w*|tritt\w*)\b/i;

// --- Negation vs modality (Round-12 fix: strictly disjoint) ----------
const NEGATION_RE = /\b(?:not(?!\s+only)|no(?!\s+doubt|\s+question)|isn|aren|wasn|weren|never|cannot|can\s?t|could\s?n?\s?t|couldn\s?t|didn\s?t|nunca|jamas|no\s+puede|no\s+pudo|jamais|ne\s+peut\s+pas|ne\s+pouvait\s+pas|nie|niemals|kann\s+nicht|konnte\s+nicht|sin|pas(?:\s+de)?|n\s?est\s+pas|n\s?a\s+jamais|sans|kein\w*|nicht|ohne|dano|abime|beschadigt)\b/i;
const CAPABILITY_MODAL_RE = /\bcan\b|\bcould\b|\bmight\b|\bmay\b|\bwould\b|\bpuede\b|\bpodria\b|\bpeut\b|\bpourrait\b|\bkann\b|\bkonnte\b/i;
const FUTURE_MODAL_RE = /\bwill\b|\bgoing\s+to\b|\bva\s+a\b|\bentrara\b|\bllegara\b|\bva\b|\bentrera\b|\batteindra\b/i;
const HYPOTHETICAL_INTRO_RE = /\b(?:if|suppose|assuming|in\s+case|what\s+if|could|would|si|supongamos|en\s+caso\s+de\s+que|podria|wenn|angenommen|falls|konnte)\b/i;
const MODAL_INTRODUCER_RE = /^(?:if|si|wenn)\b/i;
const EVIDENTIAL_ACTUAL_RE = /\bcan\s+(?:clearly\s+|actually\s+|plainly\s+|still\s+)?be\s+seen\b|\bcan\s+(?:clearly\s+|actually\s+|plainly\s+|still\s+)?see\b|\bcan\s+(?:clearly\s+|actually\s+|plainly\s+|still\s+)?hear\b|\bpuede\s+verse\b|\bpuede\s+ver\b|\bpuede\s+oir\b|\bpeut\s+(?:etre\s+)?vu\b|\bpeut\s+voir\b|\bpeut\s+entendre\b|\bkann\s+gesehen\s+werden\b|\bkann\s+sehen\b|\bkann\s+horen\b/i;

const TEMPORAL_HISTORICAL_RE = /\b(?:yesterday|last\s+week|last\s+night|last\s+monday|last\s+tuesday|last\s+wednesday|last\s+thursday|last\s+friday|last\s+saturday|last\s+sunday|used\s+to|previously|formerly|earlier|\d+\s+\w*\s*ago|ago|this\s+morning|ayer|la\s+semana\s+pasada|anoche|antes|anteriormente|hace\s+\w*\s*horas?|esta\s+manana|hier|aujourdhui\s+plus\s+tot|hier\s+soir|plus\s+tot|precedemment|auparavant|il\s+y\s+a\s+\w*\s*heures?|ce\s+matin|gestern|letzte\s+woche|fruher|vorher|zuvor|gestern\s+abend|vor\s+\w*\s*stunden|heute\s+morgen)\b/i;
const TEMPORAL_ACTIVE_RE = /\b(?:now|right\s+now|currently|ahora|maintenant|jetzt|gerade)\b/i;
const TEMPORAL_FUTURE_RE = /\b(?:tomorrow|later|manana|demain|morgen)\b/i;

const CONTACT_PHRASE_RE = /\bin\s+(?:direct\s+)?contact\s+with\b|\bcome\s+into\s+(?:direct\s+)?contact\s+with\b|\bhas\s+made\s+contact\s+with\b|\bmade\s+contact\s+with\b|\btouch(?:ed|es|ing)?\b|\ben\s+contacto\s+(?:directo\s+)?con\b|\ben\s+contact\s+(?:direct\s+)?avec\b|\bin\s+(?:direktem\s+)?kontakt\s+mit\b/i;
const PROXIMITY_WORD_RE = /\b(?:near|around|next\s+to|beside|cerca\s+de(?:l)?|junto\s+a(?:l)?|alrededor\s+de(?:l)?|pres\s+de|a\s+cote\s+de|autour\s+de|nahe|neben)\b/i;
const MIX_VERB_RE = /\bmix\w*\b|\bmezcl\w*\b|\bmelang\w*\b|\bmisch\w*\b/i;
const CONTAINMENT_VERB_RE = /\bcontain\w*\b|\bhas\s+water(?:\s+in\s+it)?\b|\btiene\s+agua\b|\bhat\s+wasser\b/i;
const CONTAINMENT_PREP_RE = /\binsid\w*\b|\bdentro\b|\bdans\b|\bim\b|\bin\s+der\b|\bin\s+dem\b|\bfound\s+water\s+in\b|\bin\b|\ben\b/i;
const DIRECTIONAL_VERB_RE = /\b(?:reach(?:ing|es|ed)?|enter(?:ing|s|ed)?|leak(?:ing|ed)?\s+into|drip(?:ping|ped|s)?|com(?:e|ing|es)?|go(?:es|ing|ne)?|got?(?:ten)?\s+into|flow(?:ing|s|ed)?|pour(?:ing|s|ed)?|seep(?:ing|s|ed)?|splash(?:ing|es|ed)?|llega\w*|entr\w*|atteint\w*|atteindr\w*|erreicht\w*|erreichen\w*|tritt\w*|treten\w*|gelangt\w*|gelangen\w*|dring\w*|dringen\w*|gotea\w*|corr\w*|coul\w*|tropft\w*|lauft\w*|fluye\w*|fluy\w*|infiltr\w*|s.infiltr\w*|flie(?:sst|\u00dft)\w*)\b/i;


const CONTROL_PARTICIPLE_WORDS_GLOBAL = new Set(['carrying', 'carried', 'holding', 'held', 'prevented', 'prevents', 'preventing', 'stopped', 'stops', 'stopping', 'caught', 'catches', 'catching', 'keeping', 'kept', 'seeing', 'saw', 'seen', 'hearing', 'heard', 'watching', 'watched', 'avoided', 'avoids', 'avoiding', 'denied', 'denies', 'denying', 'doubted', 'doubts', 'doubting']);
function isVerbToken(normalized) {
  if (VERB_STOP_WORDS.has(normalized)) return true;
  if (CONTROL_PARTICIPLE_WORDS_GLOBAL.has(normalized)) return true;
  if (/^touch(?:ed|es|ing)?$/i.test(normalized)) return true;
  if (new RegExp('^(?:' + DIRECTIONAL_VERB_RE.source + ')$', 'i').test(normalized)) return true;
  if (new RegExp('^(?:' + MIX_VERB_RE.source + ')$', 'i').test(normalized)) return true;
  if (new RegExp('^(?:' + CONTAINMENT_VERB_RE.source + ')$', 'i').test(normalized)) return true;
  if (new RegExp('^(?:' + WET_PREDICATE_RE.source + ')$', 'i').test(normalized)) return true;
  return false;
}

function findNounPhraseHead(tokens, startIdx) {
  let headIdx = startIdx;
  let i = startIdx + 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.isPunct) break;
    const norm = t.normalized;
    if (isVerbToken(norm) || PREPOSITION_STOP_WORDS.has(norm) || DETERMINER_WORDS.has(norm) || NP_STOP_EXTRA_WORDS.has(norm)) break;
    headIdx = i;
    i += 1;
  }
  return headIdx;
}
function hasNonhazardPrenominalModifier(tokens, mentionTokenIdx) {
  if (mentionTokenIdx <= 0) return false;
  const prev = tokens[mentionTokenIdx - 1];
  if (!prev || prev.isPunct) return false;
  if (NONHAZARD_PRENOMINAL_MODIFIER.has(prev.normalized)) return true;
  if (PERSON_ROLE_HEAD_WORDS.has(prev.normalized)) return true;
  return false;
}
function classifyWaterHead(headNormalized) {
  if (WATER_LIQUID_HEAD_SYNONYMS.has(headNormalized)) return 'liquid_water';
  return 'non_liquid_compound';
}
function classifyElectricalHead(headNormalized) {
  if (PERSON_ROLE_HEAD_WORDS.has(headNormalized)) return 'person_or_role';
  if (NONCOMPONENT_HEAD_WORDS.has(headNormalized)) return 'non_electrical_compound';
  if (ELECTRICAL_COMPONENT_HEAD_WORDS.has(headNormalized)) return 'electrical_component';
  return 'modifier_only';
}

// --- Sentence/clause segmentation on RAW-token-derived indices --------

// Splits token index range [0, tokens.length) into SENTENCES using
// sentence-ending punctuation tokens.
function segmentSentences(tokens) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].isPunct && /[.!?]/.test(tokens[i].value)) {
      sentences.push({ startTok: start, endTok: i + 1 });
      start = i + 1;
    }
  }
  if (start < tokens.length) sentences.push({ startTok: start, endTok: tokens.length });
  return sentences;
}

// Within a sentence's token range, cuts CLAUSES at subordinators and at
// coordinators that introduce a genuinely new subject NP (bare
// coordinator followed directly by a continuation-predicate verb form
// does NOT cut - the clause continues with an inherited subject).
function segmentClauses(tokens, startTok, endTok) {
  const cuts = new Set([startTok, endTok]);
  for (let i = startTok; i < endTok; i += 1) {
    const t = tokens[i];
    if (t.isPunct) { cuts.add(i); cuts.add(i + 1); continue; }
    if (SUBORDINATOR_RE.test(t.normalized)) { SUBORDINATOR_RE.lastIndex = 0; cuts.add(i); cuts.add(i + 1); continue; }
    REPORTING_COMPLEMENT_RE.lastIndex = 0; UNCERTAIN_COMPLEMENT_RE.lastIndex = 0; IMAGINED_COMPLEMENT_RE.lastIndex = 0; DENIAL_COMPLEMENT_RE.lastIndex = 0;
    if (REPORTING_COMPLEMENT_RE.test(t.normalized) || UNCERTAIN_COMPLEMENT_RE.test(t.normalized) || IMAGINED_COMPLEMENT_RE.test(t.normalized) || DENIAL_COMPLEMENT_RE.test(t.normalized)) {
      REPORTING_COMPLEMENT_RE.lastIndex = 0; UNCERTAIN_COMPLEMENT_RE.lastIndex = 0; IMAGINED_COMPLEMENT_RE.lastIndex = 0; DENIAL_COMPLEMENT_RE.lastIndex = 0;
      cuts.add(i + 1);
      continue;
    }
    if (COORDINATOR_RE.test(t.normalized)) {
      COORDINATOR_RE.lastIndex = 0;
      const after = tokens[i + 1];
      const before = i > startTok ? tokens[i - 1] : null;
      const isCompoundEndpointJoin = before && after
        && (new RegExp('^(?:' + WATER_TERMS.source + '|' + ELECTRICAL_TERMS.source + ')$', 'i').test(before.normalized))
        && (new RegExp('^(?:' + WATER_TERMS.source + '|' + ELECTRICAL_TERMS.source + ')$', 'i').test(after.normalized));
      if (!isCompoundEndpointJoin && (!after || !CONTINUATION_PREDICATE_START.test(after.normalized))) {
        cuts.add(i); cuts.add(i + 1);
      }
      continue;
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const clauses = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cStart = sorted[i];
    const cEnd = sorted[i + 1];
    if (cEnd > cStart) {
      // skip clauses that are purely the subordinator/coordinator/punct
      // token itself
      const content = tokens.slice(cStart, cEnd).filter((t) => !t.isPunct && !SUBORDINATOR_RE.test(t.normalized) && !COORDINATOR_RE.test(t.normalized));
      SUBORDINATOR_RE.lastIndex = 0; COORDINATOR_RE.lastIndex = 0;
      if (content.length > 0) clauses.push({ startTok: cStart, endTok: cEnd });
    }
  }
  return clauses;
}

// Determines the SUBJECT of a clause: the first water/electrical
// mention (by head classification) appearing before the clause's first
// verb-stop-word token, i.e. the nearest preceding noun phrase. Returns
// null if the clause has no verb or no NP before it (bare continuation
// - subject must be inherited by the caller from the previous clause).
const MODAL_AUXILIARY_WORDS = new Set(['could', 'would', 'can', 'might', 'may', 'will', 'should', 'podria', 'puede', 'pourrait', 'peut', 'konnte', 'kann', 'wird']);

function findClauseSubjectMention(tokens, clause, mentions) {
  const CONTROL_PARTICIPLE_WORDS = new Set(['carrying', 'carried', 'holding', 'held', 'prevented', 'prevents', 'preventing', 'stopped', 'stops', 'stopping', 'caught', 'catches', 'catching', 'keeping', 'kept', 'seeing', 'saw', 'seen', 'hearing', 'heard', 'watching', 'watched']);
  let firstVerbIdx = null;
  for (let i = clause.startTok; i < clause.endTok; i += 1) {
    if (MODAL_AUXILIARY_WORDS.has(tokens[i].normalized)) continue;
    if (isVerbToken(tokens[i].normalized)) { firstVerbIdx = i; break; }
  }
  if (firstVerbIdx === null) return { subjectMention: null, hasOwnSubjectNP: false };
  const hasModalBeforeVerb = tokens.slice(clause.startTok, firstVerbIdx).some((t) => MODAL_AUXILIARY_WORDS.has(t.normalized));
  // find the NEAREST noun-phrase mention (person, water, or electrical)
  // before the verb - a person subject must be recognized as such so it
  // is never silently skipped in favor of an unrelated water/electrical
  // mention that merely happens to be nearby.
  const candidates = mentions.filter((m) => (m.kind === 'water' || m.kind === 'electrical' || m.kind === 'actor_or_subject') && m.tokenIndex !== null && m.tokenIndex >= clause.startTok && m.tokenIndex < firstVerbIdx);
  if (candidates.length === 0) {
    // German V2 word order: "jetzt TRITT Wasser in die Steckdose ein" -
    // fronting an adverb pushes the verb to position 2, with the
    // subject immediately AFTER it. Restricted to intransitive
    // directional verb forms (the V2 pattern), never generic transitive
    // verbs like "carried" - "who CARRIED water" must not treat "water"
    // as carried's inverted subject; it is carried's direct object.
    const INTRANSITIVE_V2_VERBS = /^(?:tritt\w*|gelangt\w*|dring\w*|kommt|geht|lauft\w*|tropft\w*)$/i;
    const PERCEPTION_SMALL_CLAUSE_VERBS = /^(?:seeing|hearing|watching)$/i;
    if (INTRANSITIVE_V2_VERBS.test(tokens[firstVerbIdx].normalized) || PERCEPTION_SMALL_CLAUSE_VERBS.test(tokens[firstVerbIdx].normalized)) {
      const invertedCandidates = mentions.filter((m) => (m.kind === 'water' || m.kind === 'electrical' || m.kind === 'actor_or_subject') && m.tokenIndex !== null && m.tokenIndex > firstVerbIdx && m.tokenIndex <= firstVerbIdx + 2);
      if (invertedCandidates.length > 0) return { subjectMention: invertedCandidates[0], hasOwnSubjectNP: true };
    }
    return { subjectMention: null, hasOwnSubjectNP: false };
  }
  if (hasModalBeforeVerb) {
    // Modal constructions (EN "water CAN reach", DE "Wasser KANN die
    // Steckdose ERREICHEN" - verb-final) always put the true subject
    // FIRST, before the modal - not nearest to the (possibly
    // clause-final) main verb, which in German would incorrectly select
    // the object instead.
    candidates.sort((a, b) => a.tokenIndex - b.tokenIndex);
    return { subjectMention: candidates[0], hasOwnSubjectNP: true };
  }
  candidates.sort((a, b) => b.tokenIndex - a.tokenIndex);
  // A mention that is the OBJECT of an immediately-preceding preposition
  // or proximity phrase ("next to the electrical panel") is a modifier
  // of the real subject, not the subject itself - skip it and prefer an
  // earlier candidate.
  for (const cand of candidates) {
    let isPpObject = false;
    let back = 1;
    while (back <= 6) {
      const beforeIdx = cand.tokenIndex - back;
      if (beforeIdx < clause.startTok) break;
      const beforeTok = tokens[beforeIdx];
      if (DETERMINER_WORDS.has(beforeTok.normalized)) { back += 1; continue; }
      if (PREPOSITION_STOP_WORDS.has(beforeTok.normalized) || beforeTok.normalized === 'to' || beforeTok.normalized === 'next') { isPpObject = true; break; }
      if (CONTROL_PARTICIPLE_WORDS.has(beforeTok.normalized)) { isPpObject = true; break; }
      if (isVerbToken(beforeTok.normalized) || SUBORDINATOR_RE.test(beforeTok.normalized) || COORDINATOR_RE.test(beforeTok.normalized) || beforeTok.isPunct) { SUBORDINATOR_RE.lastIndex = 0; COORDINATOR_RE.lastIndex = 0; break; }
      // still within the same noun-phrase run (e.g. "electrical" before
      // "panel") - keep scanning backward for the true boundary.
      back += 1;
    }
    if (!isPpObject) return { subjectMention: cand, hasOwnSubjectNP: true };
  }
  return { subjectMention: candidates[candidates.length - 1], hasOwnSubjectNP: true };
}


// --- Mention extraction (on the token-joined normalized string, mapped
// back to raw spans via tokenSpans) --------------------------------

function extractMentions(tokens, normalizedText, tokenSpans) {
  const mentions = [];
  let idCounter = 0;
  const nextId = (kind) => `${kind}_${idCounter++}`;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.isPunct) continue;
    if (new RegExp('^(?:' + WATER_TERMS.source + ')$', 'i').test(t.normalized)) {
      const headIdx = findNounPhraseHead(tokens, i);
      const head = tokens[headIdx];
      const entityType = headIdx === i ? 'liquid_water' : classifyWaterHead(head.normalized);
      mentions.push({
        id: nextId('water'), kind: 'water', text: t.value, start: t.start, end: t.end,
        head: head.value, entityType, tokenIndex: i, headTokenIndex: headIdx, sentenceIndex: t.sentenceIndex,
      });
    } else if (new RegExp('^(?:' + ELECTRICAL_TERMS.source + ')$', 'i').test(t.normalized)) {
      const headIdx = findNounPhraseHead(tokens, i);
      const head = tokens[headIdx];
      let entityType = headIdx === i ? 'electrical_component' : classifyElectricalHead(head.normalized);
      if (entityType === 'electrical_component' && hasNonhazardPrenominalModifier(tokens, i)) entityType = 'non_electrical_compound';
      mentions.push({
        id: nextId('electrical'), kind: 'electrical', text: t.value, start: t.start, end: t.end,
        head: head.value, entityType, tokenIndex: i, headTokenIndex: headIdx, sentenceIndex: t.sentenceIndex,
      });
    } else if (PERSON_ROLE_HEAD_WORDS.has(t.normalized)) {
      mentions.push({
        id: nextId('actor'), kind: 'actor_or_subject', text: t.value, start: t.start, end: t.end,
        head: t.value, entityType: 'person_or_role', tokenIndex: i, headTokenIndex: i, sentenceIndex: t.sentenceIndex,
      });
    }
  }

  const wetGlobal = new RegExp(WET_PREDICATE_RE.source, 'gi');
  let wm;
  while ((wm = wetGlobal.exec(normalizedText)) !== null) {
    const surrounding = normalizedText.slice(Math.max(0, wm.index - 15), wm.index + wm[0].length + 15);
    if (WET_NONPREDICATE_RE.test(surrounding)) { if (wetGlobal.lastIndex === wm.index) wetGlobal.lastIndex += 1; continue; }
    const span = normRangeToRawSpan(tokenSpans, tokens, wm.index, wm.index + wm[0].length);
    if (span) mentions.push({ id: nextId('wet'), kind: 'wet_state', text: wm[0], start: span.start, end: span.end, head: wm[0], entityType: null, tokenIndex: null, headTokenIndex: null, sentenceIndex: null, normIndex: wm.index });
    if (wetGlobal.lastIndex === wm.index) wetGlobal.lastIndex += 1;
  }

  const relationRes = [
    [DIRECTIONAL_VERB_RE, 'directional'], [CONTACT_PHRASE_RE, 'contact'], [PROXIMITY_WORD_RE, 'proximity'],
    [MIX_VERB_RE, 'mixing'], [CONTAINMENT_VERB_RE, 'containment'], [CONTAINMENT_PREP_RE, 'containment'],
  ];
  for (const [re, fam] of relationRes) {
    const g = new RegExp(re.source, 'gi');
    let rm;
    while ((rm = g.exec(normalizedText)) !== null) {
      const span = normRangeToRawSpan(tokenSpans, tokens, rm.index, rm.index + rm[0].length);
      if (span) mentions.push({ id: nextId('relation'), kind: 'relation', text: rm[0], start: span.start, end: span.end, head: rm[0], entityType: fam, tokenIndex: null, headTokenIndex: null, sentenceIndex: null, normIndex: rm.index });
      if (g.lastIndex === rm.index) g.lastIndex += 1;
    }
  }

  const negGlobal = new RegExp(NEGATION_RE.source, 'gi');
  let nm;
  while ((nm = negGlobal.exec(normalizedText)) !== null) {
    const span = normRangeToRawSpan(tokenSpans, tokens, nm.index, nm.index + nm[0].length);
    if (span) mentions.push({ id: nextId('neg'), kind: 'negation', text: nm[0], start: span.start, end: span.end, head: nm[0], entityType: null, tokenIndex: null, headTokenIndex: null, sentenceIndex: null, normIndex: nm.index });
    if (negGlobal.lastIndex === nm.index) negGlobal.lastIndex += 1;
  }

  for (const [re, kindLabel] of [[CAPABILITY_MODAL_RE, 'possible'], [FUTURE_MODAL_RE, 'future_planned'], [HYPOTHETICAL_INTRO_RE, 'hypothetical']]) {
    const g = new RegExp(re.source, 'gi');
    let mm;
    while ((mm = g.exec(normalizedText)) !== null) {
      const span = normRangeToRawSpan(tokenSpans, tokens, mm.index, mm.index + mm[0].length);
      if (span) mentions.push({ id: nextId('modal'), kind: 'modal', text: mm[0], start: span.start, end: span.end, head: mm[0], entityType: kindLabel, tokenIndex: null, headTokenIndex: null, sentenceIndex: null, normIndex: mm.index });
      if (g.lastIndex === mm.index) g.lastIndex += 1;
    }
  }

  for (const [re, kindLabel] of [[TEMPORAL_HISTORICAL_RE, 'historical'], [TEMPORAL_ACTIVE_RE, 'active_now'], [TEMPORAL_FUTURE_RE, 'future']]) {
    const g = new RegExp(re.source, 'gi');
    let tm;
    while ((tm = g.exec(normalizedText)) !== null) {
      const span = normRangeToRawSpan(tokenSpans, tokens, tm.index, tm.index + tm[0].length);
      if (span) mentions.push({ id: nextId('temporal'), kind: 'temporal', text: tm[0], start: span.start, end: span.end, head: tm[0], entityType: kindLabel, tokenIndex: null, headTokenIndex: null, sentenceIndex: null, normIndex: tm.index });
      if (g.lastIndex === tm.index) g.lastIndex += 1;
    }
  }

  return mentions.sort((a, b) => a.start - b.start);
}

const ADJUNCT_PREPOSITION_STOP_WORDS = new Set(['with', 'beside', 'by', 'near', 'around', 'next', 'inside', 'insider', 'con', 'junto', 'avec', 'mit', 'neben', 'dentro', 'dans', 'im']);

const PRENOMINAL_PARTICIPLE_WORDS = new Set(['damaged', 'installed', 'repaired', 'broken', 'exposed', 'wet', 'newly', 'freshly', 'recently', 'beschadigt', 'installiert', 'repariert', 'freiliegend', 'danado', 'instalado', 'reparado', 'expuesto', 'endommage', 'installe', 'repare', 'expose']);

function findObjectWindowEndTok(tokens, clause, fromTok) {
  let end = clause.endTok;
  for (let i = fromTok; i < clause.endTok; i += 1) {
    if (PRENOMINAL_PARTICIPLE_WORDS.has(tokens[i].normalized)) continue;
    if (SUBORDINATOR_RE.test(tokens[i].normalized) || COORDINATOR_RE.test(tokens[i].normalized) || tokens[i].isPunct || isVerbToken(tokens[i].normalized) || ADJUNCT_PREPOSITION_STOP_WORDS.has(tokens[i].normalized)) {
      end = i; break;
    }
  }
  SUBORDINATOR_RE.lastIndex = 0; COORDINATOR_RE.lastIndex = 0;
  return Math.min(end, fromTok + 10);
}

function clauseSpan(tokens, clause) {
  const first = tokens[clause.startTok];
  const last = tokens[clause.endTok - 1];
  return { start: first.start, end: last.end };
}


function buildCandidates(tokens, normalizedText, tokenSpans, mentions) {
  const candidates = [];
  let idCounter = 0;
  const nextId = () => `cand_${idCounter++}`;
  const sentences = segmentSentences(tokens);

  const waterMentions = mentions.filter((m) => m.kind === 'water');
  const electricalMentions = mentions.filter((m) => m.kind === 'electrical');
  const wetMentions = mentions.filter((m) => m.kind === 'wet_state');


  function negationNear(normStart, normEnd) {
    return mentions.some((m) => m.kind === 'negation' && m.normIndex !== undefined && m.normIndex >= normStart && m.normIndex < normEnd);
  }
  function modalityNear(normStart, normEnd) {
    const m = mentions.find((mm) => mm.kind === 'modal' && mm.normIndex !== undefined && mm.normIndex >= normStart && mm.normIndex < normEnd);
    return m ? m.entityType : null;
  }
  function temporalNear(normStart, normEnd) {
    const found = mentions.filter((mm) => mm.kind === 'temporal' && mm.normIndex !== undefined && mm.normIndex >= normStart && mm.normIndex < normEnd);
    if (found.some((f) => f.entityType === 'active_now')) return 'current';
    if (found.some((f) => f.entityType === 'future')) return 'future';
    if (found.some((f) => f.entityType === 'historical')) return 'historical';
    return null;
  }

  for (const sentence of sentences) {
    const clauses = segmentClauses(tokens, sentence.startTok, sentence.endTok);
    let inheritedSubject = null;

    for (const clause of clauses) {
      const { subjectMention, hasOwnSubjectNP } = findClauseSubjectMention(tokens, clause, mentions);
      const effectiveSubject = hasOwnSubjectNP ? subjectMention : inheritedSubject;
      if (hasOwnSubjectNP) inheritedSubject = subjectMention;

      const cSpan = clauseSpan(tokens, clause);
      const normStartOfClause = tokenSpans[clause.startTok].normStart;
      const normEndOfClause = tokenSpans[clause.endTok - 1].normEnd;
      const clauseNormText = normalizedText.slice(normStartOfClause, normEndOfClause);

      // Reported/uncertain/imagined complement detection: look at the
      // few tokens immediately before this clause (across the boundary
      // just cut) for a governing verb that changes how this
      // complement's modality/temporality must be interpreted -
      // "tested WHETHER water reached..." / "I IMAGINED water
      // entering..." are informational, not current emergencies, while
      // "A resident SAYS water is entering..." is a reported CURRENT
      // observation and must not be suppressed.
      let forcedNonActual = null;
      let forcedNegative = false;
      for (let bi = clause.startTok - 1; bi >= Math.max(0, clause.startTok - 5); bi -= 1) {
        const bt = tokens[bi];
        if (bt.isPunct) break;
        UNCERTAIN_COMPLEMENT_RE.lastIndex = 0; IMAGINED_COMPLEMENT_RE.lastIndex = 0; DENIAL_COMPLEMENT_RE.lastIndex = 0;
        if (UNCERTAIN_COMPLEMENT_RE.test(bt.normalized)) { forcedNonActual = 'uncertain'; break; }
        if (IMAGINED_COMPLEMENT_RE.test(bt.normalized)) { forcedNonActual = 'hypothetical'; break; }
        if (DENIAL_COMPLEMENT_RE.test(bt.normalized)) { forcedNonActual = 'uncertain'; forcedNegative = true; break; }
        if (bt.normalized === 'evidence' && tokens[bi - 1] && tokens[bi - 1].normalized === 'no') { forcedNonActual = 'uncertain'; forcedNegative = true; break; }
      }
      const candidatesLenBeforeClause = candidates.length;

      // DIRECTIONAL: subject must be a liquid_water mention (own or
      // inherited), a directional verb token must exist in this clause,
      // and the destination NP (bounded object window, stopping at
      // subordinator/coordinator/punct/next verb) must contain a valid
      // electrical_component mention.
      if (effectiveSubject && effectiveSubject.kind === 'water' && effectiveSubject.entityType === 'liquid_water') {
        for (let i = clause.startTok; i < clause.endTok; i += 1) {
          const tk = tokens[i];
          const windowTokens = tokens.slice(i, Math.min(i + 3, clause.endTok)).map((t) => t.normalized).join(' ');
          const anchoredMatch = windowTokens.match(new RegExp('^(?:' + DIRECTIONAL_VERB_RE.source + ')', 'i'));
          if (!anchoredMatch) continue;
          // determine how many tokens this multi-word verb match spans
          const matchedWordCount = anchoredMatch[0].trim().split(/\s+/).length;
          const verbEndTokIdx = i + matchedWordCount - 1;
          // verb must come AFTER the subject's token position (or the
          // clause has no own subject NP, meaning this verb IS the
          // clause's sole content and subject is inherited)
          const subjBeforeVerb = hasOwnSubjectNP && effectiveSubject.tokenIndex < i;
          const subjInvertedAfterVerb = hasOwnSubjectNP && effectiveSubject.tokenIndex > i && effectiveSubject.tokenIndex <= i + 2;
          if (hasOwnSubjectNP && !subjBeforeVerb && !subjInvertedAfterVerb) continue;
          if (subjBeforeVerb) {
            const CONTROL_VERBS_BETWEEN = new Set(['prevented', 'prevents', 'preventing', 'stopped', 'stops', 'stopping', 'caught', 'catches', 'catching', 'kept', 'keeping', 'saw', 'seeing', 'watched', 'watching', 'avoided', 'avoids', 'avoiding', 'denied', 'denies', 'denying', 'doubted', 'doubts', 'doubting']);
            const between = tokens.filter((t) => !t.isPunct && t.start >= tokens[effectiveSubject.tokenIndex].end && t.end <= tokens[i].start);
            if (between.some((t) => CONTROL_VERBS_BETWEEN.has(t.normalized))) continue;
          }
          // Negation must be scoped to THIS specific coordinated
          // predicate, not the whole clause - "Water did NOT damage the
          // floor AND is entering the socket" must not let "not"
          // (attached to "damage") apply to "entering". Find the
          // nearest coordinator token before this verb, within the
          // clause, and only search for negation from there forward.
          let predicateLocalStartTok = clause.startTok;
          for (let bi = i - 1; bi >= clause.startTok; bi -= 1) {
            if (COORDINATOR_RE.test(tokens[bi].normalized)) { COORDINATOR_RE.lastIndex = 0; predicateLocalStartTok = bi + 1; break; }
            COORDINATOR_RE.lastIndex = 0;
          }
          const predicateLocalNormStart = tokenSpans[predicateLocalStartTok].normStart;
          let predicateLocalEndTok = clause.endTok;
          for (let ai = verbEndTokIdx + 1; ai < clause.endTok; ai += 1) {
            if (COORDINATOR_RE.test(tokens[ai].normalized)) { COORDINATOR_RE.lastIndex = 0; predicateLocalEndTok = ai; break; }
            COORDINATOR_RE.lastIndex = 0;
          }
          const predicateLocalNormEnd = tokenSpans[predicateLocalEndTok - 1].normEnd;
          const objWindowEnd = findObjectWindowEndTok(tokens, clause, verbEndTokIdx + 1);
          let validElectrical = electricalMentions.find((e) => e.tokenIndex !== null && e.tokenIndex >= verbEndTokIdx + 1 && e.tokenIndex < objWindowEnd && e.entityType === 'electrical_component');
          if (!validElectrical && hasOwnSubjectNP) {
            // Modal verb-final constructions ("Wasser KANN die Steckdose
            // ERREICHEN") place the object BEFORE the verb, between the
            // subject and it - search backward too.
            validElectrical = electricalMentions.find((e) => e.tokenIndex !== null && e.tokenIndex > effectiveSubject.tokenIndex && e.tokenIndex < i && e.entityType === 'electrical_component');
          }
          if (!validElectrical) continue;
          const verbNormStart = tokenSpans[i].normStart;
          const verbNormEnd = tokenSpans[verbEndTokIdx].normEnd;
          const negated = negationNear(predicateLocalNormStart, verbNormStart);
          const modality = modalityNear(predicateLocalNormStart, verbNormEnd + 20) || (negated ? null : 'actual');
          let temporality = temporalNear(predicateLocalNormStart, predicateLocalNormEnd) || 'current';
          const nestedPossibilityBeforeVerb = (() => {
            const bt = tokens[i - 1];
            if (!bt || bt.isPunct) return false;
            return /^(?:could|might|puede|podria|peut|pourrait|kann|konnte)$/i.test(bt.normalized);
          })();
          const evidentialActual = EVIDENTIAL_ACTUAL_RE.test(clauseNormText) && !nestedPossibilityBeforeVerb;
          let finalModality = evidentialActual ? 'actual' : (modality || 'actual');
          if (evidentialActual) temporality = 'current';
          if (finalModality === 'future_planned') temporality = 'future';
          if (finalModality === 'possible' && temporality === 'current') temporality = 'unknown';
          candidates.push({
            id: nextId(), family: 'directional',
            waterMentionId: effectiveSubject.id, electricalMentionId: validElectrical.id,
            waterEvidenceSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
            electricalSpan: { start: validElectrical.start, end: validElectrical.end },
            relationSpan: { start: tk.start, end: tokens[verbEndTokIdx].end },
            predicateSpan: { start: tk.start, end: tokens[verbEndTokIdx].end },
            subjectSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
            objectOrDestinationSpan: { start: validElectrical.start, end: validElectrical.end },
            subjectMentionId: effectiveSubject.id, objectOrDestinationMentionId: validElectrical.id,
            polarity: negated ? 'negative' : 'positive',
            modality: finalModality,
            temporality,
            valid: true, rejectionReasons: [],
          });
        }
      }

      // WET_STATE: subject must be an electrical_component mention (own
      // or inherited).
      if (effectiveSubject && effectiveSubject.kind === 'electrical' && effectiveSubject.entityType === 'electrical_component') {
        const wetInClauseText = wetMentions.filter((w) => w.start >= cSpan.start && w.end <= cSpan.end);
        const LINKING_WORDS = new Set(['is', 'are', 'was', 'were', 'becomes', 'becoming', 'became', 'getting', 'gets', 'got', 'not', 'no', 'isn', 'aren', 'wasn', 'weren', 'se', 'esta', 'estan', 'est', 'sont', 'wird', 'werden', 'ist', 'sind', 'war', 'waren', 'the', 'a', 'an', 'this', 'that', 'durch', 'wasser', 'das', 'dem']);
        for (const wet of wetInClauseText) {
          if (wet.start <= effectiveSubject.end) continue;
          // Find the nearest coordinator between subject and wet - the
          // linking-only gap check applies from THAT point (or the
          // subject itself if no coordinator), so a coordinated
          // predicate ("is not damaged BUT is wet") is correctly
          // accepted while an unrelated noun phrase further in the same
          // clause ("beside wet towels") is still rejected.
          let gapStart = effectiveSubject.end;
          for (const t of tokens) {
            if (t.start >= effectiveSubject.end && t.end <= wet.start && COORDINATOR_RE.test(t.normalized)) { COORDINATOR_RE.lastIndex = 0; gapStart = t.end; }
            COORDINATOR_RE.lastIndex = 0;
          }
          const betweenTokens = tokens.filter((t) => !t.isPunct && t.start >= gapStart && t.end <= wet.start);
          const linkingOnly = betweenTokens.every((t) => LINKING_WORDS.has(t.normalized));
          if (!linkingOnly) continue;
          // predicate-local scoping: find nearest coordinator before
          // the wet predicate's token position, within the clause.
          let wetTokIdx = null;
          for (let ti = clause.startTok; ti < clause.endTok; ti += 1) {
            if (tokens[ti].start >= wet.start && tokens[ti].start < wet.end) { wetTokIdx = ti; break; }
          }
          let pStartTok = clause.startTok;
          let pEndTok = clause.endTok;
          if (wetTokIdx !== null) {
            for (let bi = wetTokIdx - 1; bi >= clause.startTok; bi -= 1) {
              if (COORDINATOR_RE.test(tokens[bi].normalized)) { COORDINATOR_RE.lastIndex = 0; pStartTok = bi + 1; break; }
              COORDINATOR_RE.lastIndex = 0;
            }
            for (let ai = wetTokIdx + 1; ai < clause.endTok; ai += 1) {
              if (COORDINATOR_RE.test(tokens[ai].normalized)) { COORDINATOR_RE.lastIndex = 0; pEndTok = ai; break; }
              COORDINATOR_RE.lastIndex = 0;
            }
          }
          const pNormStart = tokenSpans[pStartTok].normStart;
          const pNormEnd = tokenSpans[pEndTok - 1].normEnd;
          const negated = negationNear(pNormStart, pNormEnd);
          const modality = modalityNear(pNormStart, pNormEnd);
          let temporality = temporalNear(pNormStart, pNormEnd) || 'current';
          let finalModality = modality || 'actual';
          if (finalModality === 'future_planned') temporality = 'future';
          candidates.push({
            id: nextId(), family: 'wet_state',
            waterMentionId: null, electricalMentionId: effectiveSubject.id,
            waterEvidenceSpan: { start: wet.start, end: wet.end },
            electricalSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
            relationSpan: { start: wet.start, end: wet.end }, predicateSpan: { start: wet.start, end: wet.end },
            subjectSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
            objectOrDestinationSpan: null,
            subjectMentionId: effectiveSubject.id, objectOrDestinationMentionId: null,
            polarity: negated ? 'negative' : 'positive',
            modality: finalModality, temporality,
            valid: true, rejectionReasons: [],
          });
        }
      }

      // CONTAINMENT: container must be the clause's SUBJECT (not just
      // nearest electrical before the relation phrase) - "The
      // technician next to the electrical panel HAS WATER in his
      // bottle." has subject "technician" (a person), so no containment
      // candidate is built even though "electrical panel" is textually
      // nearby.
      // Containment where electrical is subject: requires the CONTAINMENT
      // predicate's own object to be a genuine water mention - "The
      // electrical panel CONTAINS A FUSE" must not match just because
      // "contains" appears; the object of "contains" must itself be
      // water (checked by finding a water mention within a short,
      // predicate-bound window immediately after the containment verb).
      const containVerbMatch = clauseNormText.match(/\bcontain\w*\b|\bhas\b/i);
      if (containVerbMatch && effectiveSubject && effectiveSubject.kind === 'electrical' && effectiveSubject.entityType === 'electrical_component') {
        const verbAbsStart = normStartOfClause + containVerbMatch.index;
        const verbAbsEnd = verbAbsStart + containVerbMatch[0].length;
        const verbSpan = normRangeToRawSpan(tokenSpans, tokens, verbAbsStart, verbAbsEnd);
        if (verbSpan) {
          // the object must be a liquid_water mention within a tight
          // window (<=4 words) directly after the containment verb -
          // this is the verb's OWN direct object, not just "water
          // somewhere in the clause".
          const objectWaterMention = waterMentions.find((w) => w.entityType === 'liquid_water' && w.start >= verbSpan.end
            && (tokens.filter((t) => !t.isPunct && t.start >= verbSpan.end && t.end <= w.start).length <= 4));
          if (objectWaterMention) {
            const negated = negationNear(normStartOfClause, normEndOfClause);
            const modality = modalityNear(normStartOfClause, normEndOfClause);
            const temporality = temporalNear(normStartOfClause, normEndOfClause) || 'current';
            candidates.push({
              id: nextId(), family: 'containment',
              waterMentionId: objectWaterMention.id, electricalMentionId: effectiveSubject.id,
              waterEvidenceSpan: { start: objectWaterMention.start, end: objectWaterMention.end },
              electricalSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
              relationSpan: verbSpan, predicateSpan: verbSpan,
              subjectSpan: { start: effectiveSubject.start, end: effectiveSubject.end },
              objectOrDestinationSpan: { start: objectWaterMention.start, end: objectWaterMention.end },
              subjectMentionId: effectiveSubject.id, objectOrDestinationMentionId: objectWaterMention.id,
              polarity: negated ? 'negative' : 'positive', modality: modality || 'actual', temporality,
              valid: true, rejectionReasons: [],
            });
          }
        }
      }
      // Containment via preposition ("water inside the electrical
      // panel", "there is water inside the panel") - water is subject,
      // electrical is the container object within the same clause.
      const containPrepMatch = clauseNormText.match(new RegExp(CONTAINMENT_PREP_RE.source, 'i'));
      if (containPrepMatch) {
        const prepAbsStart = normStartOfClause + containPrepMatch.index;
        const prepAbsEnd = prepAbsStart + containPrepMatch[0].length;
        const prepSpan = normRangeToRawSpan(tokenSpans, tokens, prepAbsStart, prepAbsEnd);
        const waterInClause = waterMentions.find((w) => {
          if (!(w.start >= cSpan.start && w.end <= cSpan.end && w.entityType === 'liquid_water')) return false;
          // exclude water embedded as the object of a control-participle
          // ("technician CARRYING water stored...") - it is not the
          // theme/subject of THIS containment event.
          if (w.tokenIndex !== null) {
            const prevTok = tokens[w.tokenIndex - 1];
            if (prevTok && CONTROL_PARTICIPLE_WORDS_GLOBAL.has(prevTok.normalized)) return false;
          }
          return true;
        });
        // The electrical mention must be the DIRECT complement of THIS
        // preposition - within a tight window, with no other adjunct
        // preposition (beside/with/near) intervening ("inside a sealed
        // bottle BESIDE the electrical panel" must not bind "electrical
        // panel" to "inside", since "beside" introduces a different PP).
        const elecInClause = prepSpan ? electricalMentions.find((e) => {
          if (e.entityType !== 'electrical_component' || e.start < prepSpan.end) return false;
          const between = tokens.filter((t) => !t.isPunct && t.start >= prepSpan.end && t.end <= e.start);
          if (between.length > 4) return false;
          return !between.some((t) => ADJUNCT_PREPOSITION_STOP_WORDS.has(t.normalized) || SUBORDINATOR_RE.test(t.normalized) || (COORDINATOR_RE.test(t.normalized) && (SUBORDINATOR_RE.lastIndex = 0, true)));
        }) : null;
        if (waterInClause && elecInClause && prepSpan) {
          let pStartTok = clause.startTok;
          let pEndTok = clause.endTok;
          for (let ti = clause.startTok; ti < clause.endTok; ti += 1) {
            if (tokens[ti].end <= prepSpan.start && COORDINATOR_RE.test(tokens[ti].normalized)) { COORDINATOR_RE.lastIndex = 0; pStartTok = ti + 1; }
            COORDINATOR_RE.lastIndex = 0;
          }
          for (let ti = clause.startTok; ti < clause.endTok; ti += 1) {
            if (tokens[ti].start >= prepSpan.end && COORDINATOR_RE.test(tokens[ti].normalized)) { COORDINATOR_RE.lastIndex = 0; pEndTok = ti; break; }
            COORDINATOR_RE.lastIndex = 0;
          }
          const pNormStart = tokenSpans[pStartTok].normStart;
          const pNormEnd = tokenSpans[pEndTok - 1].normEnd;
          const negated = negationNear(pNormStart, pNormEnd);
          const modality = modalityNear(pNormStart, pNormEnd);
          const temporality = temporalNear(pNormStart, pNormEnd) || 'current';
          candidates.push({
            id: nextId(), family: 'containment',
            waterMentionId: waterInClause.id, electricalMentionId: elecInClause.id,
            waterEvidenceSpan: { start: waterInClause.start, end: waterInClause.end },
            electricalSpan: { start: elecInClause.start, end: elecInClause.end },
            relationSpan: prepSpan, predicateSpan: prepSpan,
            subjectSpan: { start: waterInClause.start, end: waterInClause.end },
            objectOrDestinationSpan: { start: elecInClause.start, end: elecInClause.end },
            subjectMentionId: waterInClause.id, objectOrDestinationMentionId: elecInClause.id,
            polarity: negated ? 'negative' : 'positive', modality: modality || 'actual', temporality,
            valid: true, rejectionReasons: [],
          });
        }
      }

      // CONTACT / PROXIMITY / MIXING: both water and electrical
      // mentions must be within THIS clause, with valid entity types.
      for (const [re, fam] of [[CONTACT_PHRASE_RE, 'contact'], [PROXIMITY_WORD_RE, 'proximity']]) {
        const relM = clauseNormText.match(new RegExp(re.source, 'i'));
        if (!relM) continue;
        const relAbsStart = normStartOfClause + relM.index;
        const relAbsEnd = relAbsStart + relM[0].length;
        const relSpan = normRangeToRawSpan(tokenSpans, tokens, relAbsStart, relAbsEnd) || cSpan;
        // No verb token may sit between the relation phrase and the
        // candidate mention - "next to the electrical PANEL HAS water"
        // has "has" between them, meaning "water" is the argument of a
        // DIFFERENT predicate, not a participant of THIS proximity
        // relation, even though it is textually close.
        const COPULA_WORDS = new Set(['is', 'are', 'was', 'were', 'get', 'gets', 'getting', 'got', 'se', 'esta', 'estan', 'est', 'sont', 'etait', 'ist', 'sind', 'war', 'waren', 'wird', 'werden']);
        const AUXILIARY_BEFORE_RELATION_WORDS = new Set(['has', 'have', 'had', 'hat', 'haben', 'a', 'ont']);
        const noVerbBetween = (m) => {
          const lo = Math.min(relSpan.end, m.start);
          const hi = Math.max(relSpan.start, m.end);
          for (let ti = clause.startTok; ti < clause.endTok; ti += 1) {
            const tk = tokens[ti];
            if (tk.start >= m.start && tk.end <= m.end) continue; // skip the mention's own token(s)
            if (tk.start >= lo && tk.end <= hi && isVerbToken(tk.normalized) && !COPULA_WORDS.has(tk.normalized)) {
              // "has"/"have"/"had" immediately before the relation
              // phrase itself ("water HAS COME into contact") is an
              // auxiliary forming ONE verb phrase with the relation -
              // not a separate blocking predicate. The same word
              // elsewhere ("panel next to X HAS water") is a genuine
              // different predicate and must still block.
              if (AUXILIARY_BEFORE_RELATION_WORDS.has(tk.normalized) && tk.end <= relSpan.start) {
                const between2 = tokens.filter((t2) => !t2.isPunct && t2.start >= tk.end && t2.end <= relSpan.start);
                if (between2.length === 0) continue;
              }
              return false;
            }
          }
          return true;
        };
        const nearRel = (m) => {
          const isAfter = m.start >= relSpan.end;
          const isBefore = m.end <= relSpan.start;
          if (!isAfter && !isBefore) return false;
          const lo = isAfter ? relSpan.end : m.end;
          const hi = isAfter ? m.start : relSpan.start;
          const between = tokens.filter((t) => !t.isPunct && t.start >= lo && t.end <= hi);
          if (between.length > 5) return false;
          // no other adjunct preposition (a DIFFERENT PP) may intervene
          // between the relation phrase and this mention - "in contact
          // with a bracket BESIDE the electrical panel" must not bind
          // "electrical panel" to "in contact with".
          if (between.some((t) => ADJUNCT_PREPOSITION_STOP_WORDS.has(t.normalized))) return false;
          return noVerbBetween(m);
        };
        const waterInClause = waterMentions.filter((w) => w.start >= cSpan.start && w.end <= cSpan.end && w.entityType === 'liquid_water' && nearRel(w));
        const elecInClause = electricalMentions.filter((e) => e.start >= cSpan.start && e.end <= cSpan.end && e.entityType === 'electrical_component' && nearRel(e));
        if (waterInClause.length === 0 || elecInClause.length === 0) continue;
        const water = waterInClause[0]; const electrical = elecInClause[0];
        const negated = negationNear(normStartOfClause, normEndOfClause);
        const modality = modalityNear(normStartOfClause, normEndOfClause);
        const temporality = temporalNear(normStartOfClause, normEndOfClause) || 'current';
        candidates.push({
          id: nextId(), family: fam,
          waterMentionId: water.id, electricalMentionId: electrical.id,
          waterEvidenceSpan: { start: water.start, end: water.end }, electricalSpan: { start: electrical.start, end: electrical.end },
          relationSpan: relSpan, predicateSpan: relSpan,
          subjectSpan: water.start < electrical.start ? { start: water.start, end: water.end } : { start: electrical.start, end: electrical.end },
          objectOrDestinationSpan: water.start < electrical.start ? { start: electrical.start, end: electrical.end } : { start: water.start, end: water.end },
          subjectMentionId: water.id, objectOrDestinationMentionId: electrical.id,
          polarity: negated ? 'negative' : 'positive', modality: modality || 'actual', temporality,
          valid: true, rejectionReasons: [],
        });
      }

      // MIXING: compound-subject-aware, water+electrical anywhere in
      // clause with a mix verb.
      const MIX_WITH_RE = new RegExp('(?:' + MIX_VERB_RE.source + ')(?:\\s+(?:with|con|avec|mit))?', 'i');
      const mixM = clauseNormText.match(MIX_WITH_RE);
      if (mixM) {
        const mixAbsStart = normStartOfClause + mixM.index;
        const mixAbsEnd = mixAbsStart + mixM[0].length;
        const mixSpan = normRangeToRawSpan(tokenSpans, tokens, mixAbsStart, mixAbsEnd);
        const isPrecededByAdjunctPrep = (m) => {
          if (m.tokenIndex === null) return false;
          let back = 1;
          while (back <= 6) {
            const bt = tokens[m.tokenIndex - back];
            if (!bt) break;
            if (DETERMINER_WORDS.has(bt.normalized)) { back += 1; continue; }
            if (ADJUNCT_PREPOSITION_STOP_WORDS.has(bt.normalized)) {
              // A preposition that is itself part of the relation
              // phrase's own match (e.g. "with" in "mixing WITH") is not
              // a blocking adjunct - it IS the relation's connector.
              if (mixSpan && bt.start >= mixSpan.start && bt.end <= mixSpan.end) { back += 1; continue; }
              return true;
            }
            if (isVerbToken(bt.normalized) || SUBORDINATOR_RE.test(bt.normalized) || COORDINATOR_RE.test(bt.normalized) || bt.isPunct) { SUBORDINATOR_RE.lastIndex = 0; COORDINATOR_RE.lastIndex = 0; break; }
            // still within the same noun-phrase run (e.g. "electrical"
            // before "panel") - keep scanning backward.
            back += 1;
          }
          return false;
        };
        const nearMix = (m) => {
          if (!mixSpan) return false;
          if (isPrecededByAdjunctPrep(m)) return false;
          const isAfter = m.start >= mixSpan.end;
          const lo = isAfter ? mixSpan.end : m.end;
          const hi = isAfter ? m.start : mixSpan.start;
          const between = tokens.filter((t) => !t.isPunct && t.start >= lo && t.end <= hi);
          if (between.length > 5) return false;
          return !between.some((t) => ADJUNCT_PREPOSITION_STOP_WORDS.has(t.normalized));
        };
        const waterInClause = waterMentions.filter((w) => w.start >= cSpan.start && w.end <= cSpan.end && w.entityType === 'liquid_water' && nearMix(w));
        const elecInClause = electricalMentions.filter((e) => e.start >= cSpan.start && e.end <= cSpan.end && e.entityType === 'electrical_component' && nearMix(e));
        if (waterInClause.length && elecInClause.length) {
          const water = waterInClause[0]; const electrical = elecInClause[0];
          const negated = negationNear(normStartOfClause, normEndOfClause);
          const modality = modalityNear(normStartOfClause, normEndOfClause);
          const temporality = temporalNear(normStartOfClause, normEndOfClause) || 'current';
          candidates.push({
            id: nextId(), family: 'mixing',
            waterMentionId: water.id, electricalMentionId: electrical.id,
            waterEvidenceSpan: { start: water.start, end: water.end }, electricalSpan: { start: electrical.start, end: electrical.end },
            relationSpan: mixSpan, predicateSpan: mixSpan,
            subjectSpan: { start: water.start, end: water.end }, objectOrDestinationSpan: { start: electrical.start, end: electrical.end },
            subjectMentionId: water.id, objectOrDestinationMentionId: electrical.id,
            polarity: negated ? 'negative' : 'positive', modality: modality || 'actual', temporality,
            valid: true, rejectionReasons: [],
          });
        }
      }
      if (forcedNonActual) {
        for (let ci = candidatesLenBeforeClause; ci < candidates.length; ci += 1) {
          candidates[ci].modality = forcedNonActual;
          if (candidates[ci].temporality === 'current') candidates[ci].temporality = 'unknown';
          if (forcedNegative) candidates[ci].polarity = 'negative';
        }
      }
    }
  }

  return candidates;
}

export function analyzeWaterElectricalRelationships(rawText) {
  const tokens = tokenizeWithPositions(rawText || '');
  const { normalizedConcat, tokenSpans } = buildNormalizedIndex(tokens);
  const mentions = extractMentions(tokens, normalizedConcat, tokenSpans);
  const candidates = buildCandidates(tokens, normalizedConcat, tokenSpans, mentions);

  const anyRelationshipAtAll = candidates.some((c) => c.valid && c.polarity === 'positive');
  const anyCurrentRelationship = candidates.some((c) => c.valid && c.polarity === 'positive' && c.modality === 'actual' && c.temporality === 'current');

  return { normalizedText: normalizedConcat, tokens, mentions, candidates, anyRelationshipAtAll, anyCurrentRelationship };
}

export function hasDangerousCombo(text) {
  return analyzeWaterElectricalRelationships(text).anyCurrentRelationship;
}



// ============================================================
// CONTEXT LAYER — separate from retrieval and separate from the base
// emergency-pattern match above.
//
// Architectural principle: RETRIEVAL answers "what kind of incident/topic
// is this?" and must NOT be suppressed by historical/drill/nuisance
// wording (a resident asking about a resolved break-in still deserves
// the right informational scenario). EMERGENCY DETECTION answers "is
// this active/immediate right now?" and MUST be context-sensitive - a
// safety anchor word appearing in a drill, a test, a resolved incident,
// or a nuisance-qualified complaint must not trip the same red-urgency
// escalation as a genuine active hazard.
//
// This is intentionally NOT a naive "contains 'yesterday' -> no
// emergency" rule: a strong, independent description of an actually
// ongoing hazard (STRONG_OVERRIDE_PATTERNS below) always wins regardless
// of historical/drill/nuisance wording elsewhere in the same sentence.
// ============================================================

const HISTORICAL_PATTERNS = [
  /\blast week\b|\byesterday\b|\balready (over|ended|resolved)\b|\bit'?s over\b|\bnobody(?:'s| is)? there (now|anymore)\b/i,
  /\bla semana pasada\b|\bayer\b|\bya termin[oó]\b|\bahora no hay nadie\b|\bya (pas[oó]|acab[oó])\b/i,
  /\bla semaine derni[eè]re\b|\bhier\b|\best termin[eé]e?\b/i,
  /\bletzte woche\b|\bgestern\b|\bist vorbei\b/i,
];

// Informational/hypothetical/educational MENTION of a bare
// intruder/burglar-class noun - a discussion, a definition question, or
// a worry about a possible future event, none of which describe a
// current active presence. Confirmed false positive this fixes: "I read
// an article about a burglar." previously set emergencyDetected=true
// purely from the bare word "burglar", with no active-presence evidence
// at all.
const INFORMATIONAL_MENTION_PATTERNS = [
  /\barticle about\b|\bread (an|about)\b|\bwhat does\b.*\bmean\b|\bmeaning of\b|\bdefinition of\b|\bworried that\b|\bworried\b.*\bmight\b|\bmight (come|break|happen)\b|\bi wonder if\b/i,
  /\bart[ií]culo sobre\b|\ble[ií] sobre\b|\bqu[ée] significa\b|\bpreocupa(do|da)? de que\b|\bpodr[ií]a\b.*\b(venir|entrar)\b/i,
  /\barticle sur\b|\bj'?ai lu\b.*\bsur\b|\bque signifie\b|\bqu'?est-ce que\b.*\bsignifie\b|\binqui[eè]te?\b.*\bque\b|\bpourrait venir\b/i,
  /\bartikel [uü]ber\b|\bhabe\b.*\bgelesen\b|\bwas bedeutet\b|\bsorge\b.*\bdass\b|\bk[oö]nnte kommen\b/i,
];

const DRILL_PATTERNS = [
  /\bdrill\b|\b(is|are) being tested\b|\bexercise\b|\bpractice run\b/i,
  /\bsimulacro\b|\bprueba de la alarma\b|\bejercicio de\b/i,
  /\bexercice\b|\btest de l'alarme\b/i,
  /[uü]bung\b|\bwird getestet\b/i,
];

const NUISANCE_SMOKE_PATTERNS = [
  /\bcigarette\b|\btobacco\b|\bcigar\b/i,
  /\bcigarrillo\b|\btabaco\b/i,
  /\bcigarette\b|\btabac\b/i,
  /\bzigarette\b|\btabak\b/i,
];

// Multi-word phrases that cannot survive normal tokenized phrase-matching
// because they depend on a grammar word STOPWORDS correctly strips
// everywhere else ("not"). Matched directly against the raw question
// text, independent of tokenization. Deliberately tiny and per-intent -
// not a general-purpose mechanism to route around STOPWORDS.
const RAW_REGEX_ANCHORS = {
  'MED-02': [
    /\bnot responding\b|\bis(?:n'?t| not) responding\b|\bare(?:n'?t| not) responding\b|\bnon[\s-]?responsive\b|\bunresponsive\b/i,
    /\bno responde(n)?\b/i,
    /\bne r[ée]pond(ent)? pas\b/i,
    /\breagier(t|en)\s*nicht\b/i,
  ],
};

// Explicit HUMAN SUBJECT words - if one of these appears in the
// sentence, "not responding" is treated as describing a person and
// emergencyDetected must be true REGARDLESS of a nearby location/
// service word (a location word must never suppress explicit human
// evidence). Deliberately excludes role/service nouns like
// "administrator"/"maintenance"/"contact", which are handled by
// SERVICE_ROLE_NOT_RESPONDING_PATTERNS below instead.
const HUMAN_SUBJECT_PATTERNS = [
  /\bthey\b|\bhe\b|\bshe\b|\bman\b|\bwoman\b|\bperson\b|\bsomeone\b|\bresident\b|\bneighbour\b|\bneighbor\b|\bchild\b|\belderly\b|\bvictim\b/i,
  /\bella\b|\bél\b|\bhombre\b|\bmujer\b|\bpersona\b|\balguien\b|\bresidente\b|\bvecino\b|\bni[ñn]o\b/i,
  /\bil\b|\belle\b|\bhomme\b|\bfemme\b|\bpersonne\b|\bquelqu'?un\b|\br[ée]sident\b|\bvoisin\b|\benfant\b/i,
  /\ber\b|\bsie\b|\bmann\b|\bfrau\b|\bperson\b|\bjemand\b|\bbewohner\b|\bnachbar\b|\bkind\b/i,
];

// Service/role/system nouns that, WITHOUT an explicit human-subject word
// also present, indicate an escalation/maintenance complaint rather than
// a person found unresponsive.
const SERVICE_ROLE_NOT_RESPONDING_PATTERNS = [
  /\badministrator\b|\bmaintenance\b|\bcontact\b|\bsecurity\b|\bsupport\b|\blift\b|\belevator\b|\bapp\b|\bapplication\b|\bgate\b|\bremote\b|\bsystem\b|\bwifi\b|\bintercom\b|\bwebsite\b|\bphone\b|\bmobile\b|\bradio\b|\bcamera\b|\bsensor\b|\balarm\b/i,
  /\badministrador\b|\bmantenimiento\b|\bcontacto\b|\bseguridad\b|\bascensor\b|\baplicacion\b|\bpuerta\b|\bmando\b|\bsistema\b|\bportero\b|\btel[eé]fono\b|\bm[oó]vil\b|\bradio\b|\bc[aá]mara\b|\bsensor\b|\balarma\b/i,
  /\badministrateur\b|\bentretien\b|\bcontact\b|\bs[ée]curit[ée]\b|\bascenseur\b|\bapplication\b|\bporte\b|\bt[ée]l[ée]commande\b|\bsysteme\b|\binterphone\b|\bt[ée]l[ée]phone\b|\bportable\b|\bradio\b|\bcam[ée]ra\b|\bcapteur\b|\balarme\b/i,
  /\bverwalter\b|\bwartung\b|\bkontakt\b|\bsicherheit\b|\baufzug\b|\banwendung\b|\btor\b|\bfernbedienung\b|\bsystem\b|\bgegensprechanlage\b|\btelefon\b|\bhandy\b|\bfunkger[aä]t\b|\bkamera\b|\bsensor\b|\balarm\b/i,
];

// Genuine drowning/immersion evidence - ONLY this (not a bare "pool"
// word) should defer to MED-04 instead of MED-02. A person simply
// located near/beside a pool who is not responding is still a MED-02
// medical emergency.
const DROWNING_EVIDENCE_PATTERNS = [
  /\bdrown\w*\b|\bunderwater\b|\bimmersi\w*\b|\bpulled from (the )?(pool|water)\b|\bfound (in|under) (the )?water\b/i,
  /\bahog\w*\b|\bbajo el agua\b|\bsacad\w* d(el|e la) (piscina|agua)\b/i,
  /\bnoy\w*\b|\bsous l'?eau\b|\bsorti\w* de (la piscine|l'eau)\b/i,
  /\bertrink\w*\b|\bunter wasser\b|\baus dem (pool|wasser) gezogen\b/i,
];

// Boundaries that start a NEW clause/subject scope: reporting verbs
// ("says", "dice", "sagt"...) and clause-separating punctuation/
// conjunctions (comma, period, "while"/"but"/"mientras"/"pero"/
// "tandis que"/"mais"/"während"/"aber"). Used to find the nearest clause
// containing a given predicate, so that a noun in an EARLIER clause (a
// reporter, or an unrelated mention) is not mistaken for that
// predicate's subject.
const CLAUSE_BOUNDARY_PATTERNS = [
  /\bsays\b|\bsaid\b|\breports?\b|\btells?\b|\bnotes?\b/gi,
  /\bdice\b|\bdijo\b|\binforma\b|\breporta\b/gi,
  /\bdit\b|\brapporte\b|\bindique\b/gi,
  /\bsagt\b|\bberichtet\b|\bmeldet\b/gi,
  /[.,;]|\bwhile\b|\bbut\b|\bmientras\b|\bpero\b|\btandis que\b|\bmais\b|\bwährend\b|\baber\b/gi,
];

// Returns the substring of `text` between the nearest clause boundary
// BEFORE `anchorIndex` and `anchorIndex` itself - i.e. "the clause
// leading up to this predicate/verb", excluding anything from an
// earlier clause (a reporting subject, an unrelated prior mention).
function clauseTextBefore(text, anchorIndex) {
  let boundaryEnd = 0;
  for (const pattern of CLAUSE_BOUNDARY_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const endIdx = m.index + m[0].length;
      if (endIdx <= anchorIndex && endIdx > boundaryEnd) boundaryEnd = endIdx;
      if (pattern.lastIndex === m.index) pattern.lastIndex += 1;
    }
  }
  return text.slice(boundaryEnd, anchorIndex);
}

// Strips modifier phrases that describe or possess the real subject
// without THEMSELVES being the subject - narrowly bounded (never
// greedy-to-end-of-string) so only the modifier itself is removed:
//   - English possessive, with an optional single adjective before the
//     possessor noun ("neighbour's app" / "elderly neighbour's app" ->
//     "app" remains as the head candidate)
//   - "with X inside" (a device containing a person is still the
//     device: "the lift with a resident inside")
//   - "next to X" / "near X" (a device located near a person is still
//     the device: "the app next to a resident")
//   - "responsible for X" / "for X" (a role modified by who it serves)
//   - "belonging to X" / "owned by X" (an owner is not the actor)
//   - Spanish/French trailing possessive via "de"/"del"/"du"/"de la"
//     ("el teléfono DE MI VECINO", "l'application DU résident" - the
//     HEAD comes first in these languages, the possessor trails)
//   - German genitive possessive pronoun + noun ("das Telefon MEINES
//     NACHBARN" - same trailing-possessor shape as ES/FR)
// Used by BOTH the MED-02 subject check and the SAF-03/SEC-04 actor
// check, since both need "who/what does this predicate/verb actually
// apply to", not any noun merely mentioned nearby.
function stripNonHeadModifiers(clauseText) {
  let s = clauseText;
  s = s.replace(/\b(?:\w+\s+)?\w+'s\s+/gi, '');
  s = s.replace(/\bwith\s+(a|an|the)?\s*\w+\s+inside\b/gi, '');
  s = s.replace(/\b(?:next to|near|beside)\s+(a|an|the)?\s*\w+\b/gi, '');
  s = s.replace(/\bresponsible for\s+(a|an|the)?\s*\w+\s*/gi, '');
  s = s.replace(/\bfor\s+(a|an|the)?\s*(resident|neighbour|neighbor|man|woman|person|someone|child)\b/gi, '');
  s = s.replace(/\bbelonging to\s+(a|an|the)?\s*\w+\s*/gi, '');
  s = s.replace(/\bowned by\s+(a|an|the)?\s*\w+\s*/gi, '');
  // ES/FR trailing possessive: "de/del/du/de la/de los/de mi/..." + noun.
  s = s.replace(/\b(?:del|du)\s+\w+\b/gi, '');
  s = s.replace(/\bde\s+(?:mi|tu|su|mis|tus|sus|el|la|los|las|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|votre|leur)?\s*\w+\b/gi, '');
  // German genitive possessive pronoun + noun: "meines/meiner Nachbarn".
  s = s.replace(/\b(?:meines|meiner|deines|deiner|seines|seiner|ihres|ihrer|unseres|unserer)\s+\w+\b/gi, '');
  return s;
}

// Finds which candidate - a human subject word, or a service/device
// word - occurs FIRST (leftmost) in the already-stripped clause, and
// classifies based on THAT, rather than unconditionally checking human
// before service. This is the deterministic subject-head rule: whoever/
// whatever the sentence actually names first as its subject wins, not
// "any human word anywhere wins".
function classifySubjectHead(strippedClause) {
  let earliestHuman = Infinity;
  for (const re of HUMAN_SUBJECT_PATTERNS) {
    const m = strippedClause.match(re);
    if (m && m.index < earliestHuman) earliestHuman = m.index;
  }
  let earliestService = Infinity;
  for (const re of SERVICE_ROLE_NOT_RESPONDING_PATTERNS) {
    const m = strippedClause.match(re);
    if (m && m.index < earliestService) earliestService = m.index;
  }
  if (earliestHuman === Infinity && earliestService === Infinity) return true; // unknown -> safety default
  return earliestHuman < earliestService;
}

// Iterates over EVERY not-responding anchor occurrence independently -
// not just the first. For each occurrence: find the clause containing
// it, classify its subject head, and if human, check historical/drill
// suppression scoped to THAT occurrence's clause only. A device/service
// occurrence is simply ignored (not treated as suppressing anything) -
// checking continues to later occurrences. This replaces the previous
// single-occurrence isMedTwoActiveSubject() and the global
// "if (personNotResponding) return true" early return in
// detectEmergency(), which could never see a second, different-subject
// occurrence in the same message.
//
// Returns:
//   anyHumanAtAll     - true if ANY occurrence has a human subject,
//                        regardless of historical/drill suppression -
//                        used for RETRIEVAL eligibility (historical
//                        wording may still retrieve MED-02
//                        informationally).
//   anyCurrentHuman   - true if ANY human occurrence is NOT suppressed
//                        (or is overridden back active) - used for
//                        emergencyDetected.
function evaluateMedicalNotResponding(rawQuestion) {
  if (!rawQuestion) return { anyHumanAtAll: false, anyCurrentHuman: false };
  const normalized = stripAccents(rawQuestion);
  const anchors = RAW_REGEX_ANCHORS['MED-02'] || [];

  let anyHumanAtAll = false;
  let anyCurrentHuman = false;
  for (const re of anchors) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = globalRe.exec(normalized)) !== null) {
      const occClause = clauseTextAround(normalized, m.index, m.index + m[0].length);
      // Drowning/immersion evidence in this occurrence's clause defers
      // to MED-04 instead - this specific occurrence is not a MED-02
      // signal at all (neither retrieval nor emergency), but other
      // occurrences in the message are still evaluated independently.
      if (DROWNING_EVIDENCE_PATTERNS.some((dre) => dre.test(occClause))) {
        if (globalRe.lastIndex === m.index) globalRe.lastIndex += 1;
        continue;
      }
      const subjectClause = stripNonHeadModifiers(clauseTextBefore(normalized, m.index));
      const isHuman = classifySubjectHead(subjectClause);
      if (isHuman) {
        anyHumanAtAll = true;
        const suppressed = HISTORICAL_PATTERNS.some((sre) => sre.test(occClause)) || DRILL_PATTERNS.some((sre) => sre.test(occClause));
        const overridden = ACTIVE_NOW_PATTERNS.some((sre) => sre.test(occClause)) || STRONG_OVERRIDE_PATTERNS.some((sre) => sre.test(occClause));
        if (!suppressed || overridden) anyCurrentHuman = true;
      }
      if (globalRe.lastIndex === m.index) globalRe.lastIndex += 1;
    }
  }
  return { anyHumanAtAll, anyCurrentHuman };
}


// Words indicating the "threatening"/"amenaza"-class SEC-04 evidence
// concerns an ANIMAL, not a person - paired with the absence of a human-
// actor word below, this routes to SAF-03 (dangerous animal) instead of
// the human violence/threat procedure.
const ANIMAL_ACTOR_PATTERNS = [
  /\bdog\b|\bdogs\b/i,
  /\bperro\b|\bperros\b/i,
  /\bchien\b|\bchiens\b/i,
  /\bhund\b|\bhunde\b/i,
];

// Explicit human-actor words that, if present alongside an animal word
// (e.g. "a man is threatening people, and their dog is too"), correctly
// keep the human threat procedure active rather than suppressing it.
const HUMAN_ACTOR_PATTERNS = [
  /\bman\b|\bwoman\b|\bperson\b|\bsomeone\b|\bresident\b|\bneighbour\b|\bneighbor\b/i,
  /\bhombre\b|\bmujer\b|\bpersona\b|\balguien\b|\bresidente\b|\bvecino\b/i,
  /\bhomme\b|\bfemme\b|\bpersonne\b|\bquelqu'?un\b|\bresident\b|\bvoisin\b/i,
  /\bmann\b|\bfrau\b|\bperson\b|\bjemand\b|\bbewohner\b|\bnachbar\b/i,
];

// Genuine active-right-now markers. Deliberately NOT a bare "now" (too
// fragile - "nobody is there now" is part of a HISTORICAL/resolved
// pattern above, not an active-danger signal) - these require a
// stronger, more specific active-tense construction.
const ACTIVE_NOW_PATTERNS = [
  /\bright now\b|\bhappening now\b|\bstill happening\b|\bagain now\b|\bcurrently\b/i,
  /\ben este momento\b|\btodav[ií]a (est[aá]|sigue)\b|\bahora mismo\b/i,
  /\ben ce moment\b|\btoujours en cours\b|\bmaintenant m[eê]me\b/i,
  /\bgerade (jetzt|eben)\b|\bimmer noch\b|\bjetzt gerade\b/i,
];

// A strong, independent description of an actually-ongoing hazard -
// overrides historical/drill/nuisance suppression even when those
// markers are also present in the same sentence, per the explicit
// requirement that context suppression must never hide a real current
// emergency (e.g. "we were doing a drill BUT the building is actually
// shaking").
const STRONG_OVERRIDE_PATTERNS = [
  /\bactually shaking\b|\breally shaking\b|\bstill shaking\b/i,
  /\bthick (black )?smoke\b|\bblack smoke\b/i,
  /\bbreaking in again\b|\bagain now\b/i,
  /\bthreatening (me )?now\b/i,
  /\brealmente temblando\b|\bhumo espeso\b|\bhumo negro\b/i,
  /\br[ée]ellement en train de trembler\b|\bfum[ée]e ([ée]paisse|noire)\b/i,
  /\btats[aä]chlich (wackelt|zittert)\b|\bdicker (schwarzer )?rauch\b/i,
];

export function detectSafetyContext(text) {
  const historical_or_resolved = HISTORICAL_PATTERNS.some((re) => re.test(text));
  const drill_or_test = DRILL_PATTERNS.some((re) => re.test(text));
  const nuisance_smoke = NUISANCE_SMOKE_PATTERNS.some((re) => re.test(text));
  const informational_or_hypothetical = INFORMATIONAL_MENTION_PATTERNS.some((re) => re.test(text));
  const active_now = ACTIVE_NOW_PATTERNS.some((re) => re.test(text));
  const strong_override = STRONG_OVERRIDE_PATTERNS.some((re) => re.test(text));
  return { active_now, historical_or_resolved, drill_or_test, nuisance_smoke, informational_or_hypothetical, strong_override };
}

// Intruder/burglar family evaluated on its own, with informational/
// hypothetical-mention suppression SCOPED to this family only ("I read
// an article about a burglar." must not read as an active break-in) -
// see INFORMATIONAL_MENTION_PATTERNS. This must never be combined into
// the general suppressingContext check below, since that would also
// suppress an unrelated fire/gas/medical/violence emergency mentioned
// in the same message purely because an informational marker like
// "worried that" happens to co-occur.
// Every hazard family EXCEPT water/electrical (medical-not-responding plus
// the generic HAZARD_FAMILIES loop). Factored out so the Phase 3B hybrid
// ELE-05 pipeline can compose "all other emergencies OR hybrid
// water/electrical decision" at the route level without duplicating this
// logic or forcing detectEmergency() itself to become async. See
// ARCHITECTURE_DECISION.md.
export function detectEmergencyExcludingWaterElectrical(text) {
  if (evaluateMedicalNotResponding(text).anyCurrentHuman) return true;
  const normalizedForFamilies = stripAccents(text);
  for (const family of Object.values(HAZARD_FAMILIES)) {
    if (evaluateHazardFamily(normalizedForFamilies, family)) return true;
  }
  return false;
}

export function detectEmergency(text) {
  // "not responding"/"no responde" etc. describing a PERSON is a
  // medical-safety emergency signal - evaluated per OCCURRENCE (not a
  // single global check), so a device occurrence earlier in the message
  // can never hide a genuine human occurrence later in it, or vice
  // versa. See evaluateMedicalNotResponding() above.
  if (evaluateMedicalNotResponding(text).anyCurrentHuman) return true;

  // Water+electrical hazard - evaluated as a real clause-local
  // relationship between specific occurrences (not "do both words
  // appear anywhere in the message"). See
  // evaluateWaterElectricalRelationship() above.
  if (analyzeWaterElectricalRelationships(text).anyCurrentRelationship) return true;

  // Every OTHER hazard family (fire/smoke, gas, medical_other,
  // threat_or_attack, structural, intruder) is evaluated fully
  // independently - its own positive evidence, its own suppression,
  // scoped to the CLAUSE containing that specific match - and combined
  // with OR. This is why a historical fight in one clause can never
  // suppress an active gas leak mentioned in a different clause of the
  // same message, and why cigarette-smoke context only ever suppresses
  // the fire/smoke interpretation, never gas or violence. Evaluated
  // against stripAccents()-normalized text (accents stripped, German ß
  // -> ss) so accented Spanish/French input and German ß both match the
  // (now uniformly unaccented) family pattern lists - confirmed gap this
  // closes: "Ein Hund beißt einen Bewohner." previously tested the raw
  // "beißt" against a literal "beiss" pattern and never matched.
  const normalizedForFamilies = stripAccents(text);
  for (const family of Object.values(HAZARD_FAMILIES)) {
    if (evaluateHazardFamily(normalizedForFamilies, family)) return true;
  }
  return false;
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
  // "chez" (at/near) + "moi" (me) are pure grammar/location-pronoun words
  // with zero diagnostic value - confirmed false-positive cause: "...
  // entrer chez moi" (an intruder/break-in sentence with NO fire-related
  // word at all) was accumulating weak evidence toward FIR-01 purely
  // because that scenario's own French phrase "incendie chez moi"
  // contributed "chez"+"moi" as partial-credit tokens once "incendie"
  // itself was absent from the question.
  'chez','moi',
  // German
  'dass','wenn','kann','können','über','für','mit','die','der','das',
  'eine','einen','diese','dieser','sind','bin','bist','sehr','ohne',
  'zwischen','seit','habe','haben','hat','unser','unsere','alle','wird',
  'werden','sein',
  // "ein" (a/an) and "ist" (is) are pure grammar words - confirmed gap
  // that let "Ein Eindringling ist im Gebäude." accumulate weak
  // unrelated-scenario evidence purely from these two function words.
  'ein','ist',
]);

// A very small, explicitly curated set of short (<3 char) abbreviations
// that are real, specific words in their own right and would otherwise
// be silently dropped by the length>=3 filter below - confirmed gap:
// "EV" (electric vehicle) never became a token at all, so an EV-specific
// scenario had no way to outrank a generic garage-fire scenario on
// wording like "smoke from an EV in the garage." Kept deliberately tiny;
// adding entries here should be as rare and reviewed as adding to
// HIGH_CONFIDENCE_SINGLETONS.
const ALLOWED_SHORT_TOKENS = new Set(['ev']);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "fuga" ~ "fugó" etc.
    .replace(/ß/g, 'ss') // "beißt" ~ "beisst" - ß is not accent-decomposable via NFD
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => (w.length >= 3 || ALLOWED_SHORT_TOKENS.has(w)) && !STOPWORDS.has(w));
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
  // Confirmed false-positive source (same pattern as "right"/"now"
  // below): "very" and "people" carry near-zero topic signal but are
  // common enough to appear in many scenarios' example_user_queries.
  // "in the apartment above me are very loudy people, it is 2 am and I
  // can sleep" (a genuine NUI-01 noise complaint) matched SAF-05
  // (chemical fumes) instead, purely because SAF-05's own example
  // queries happened to also contain "very" and "people".
  'very', 'people',
  'muy', 'gente', 'personas',
  'tres', 'gens', 'personnes',
  'sehr', 'leute', 'personen', 'menschen',
  // Temporal/function words: real, non-generic-DOMAIN content in the
  // sense that they're not filler grammar (so they stay out of
  // STOPWORDS, which would also strip them from phrase-match contexts
  // that legitimately need them), but they carry near-zero signal for
  // WHICH scenario a question is about - "right now" appears constantly
  // across every topic. Confirmed false-positive source: shared
  // "right"/"now" tokens between "Someone is threatening me right now."
  // and an unrelated SEC-01 phrase/example query containing the same
  // words caused a SEC-04 question to misroute to SEC-01. These remain
  // fully visible to detectSafetyContext() (which reads raw text via
  // regex, entirely independent of this tokenize-based scoring list).
  'now', 'right', 'currently', 'today', 'yesterday', 'already', 'still', 'again', 'then', 'soon', 'later',
  'ahora', 'todavia', 'hoy', 'ayer', 'ya',
  'maintenant', 'encore', 'hier', 'deja', 'aujourd', 'toujours',
  'jetzt', 'gerade', 'gestern', 'schon', 'noch', 'heute',
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
const SINGLETON_ANCHOR_SCORE = 4; // deliberately between a weak token hit and a
                                   // full phrase match - strong, but a real
                                   // multi-word phrase should still outrank it
                                   // when both are candidates for the same turn.

// Short relational/negation/state words ("no", "sin", "ohne"...) are
// normally dropped by the length>=3 filter or STOPWORDS before they ever
// get a chance to matter. But "no electricity" is a fundamentally
// different (and far stronger) signal than "electricity" alone - it is a
// genuine two-word STATE pattern, not a coincidence. These words are kept
// ONLY when evaluating a stored keyword phrase for a full-phrase match
// (never as free-floating single-token evidence elsewhere), so "no" can
// never itself become meaningful evidence in isolation.
const STATE_MARKERS = new Set([
  'no', 'sin', 'ohne', 'sans', 'kein', 'keine', 'pas', 'plus', 'without', 'out', 'off',
]);

function tokenizeForPhraseMatch(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => ((w.length >= 3 || ALLOWED_SHORT_TOKENS.has(w)) && !STOPWORDS.has(w)) || STATE_MARKERS.has(w));
}

// A very small, explicitly curated list of single words that are
// themselves narrow/technical enough (rare or unambiguous outside their
// one true meaning) to justify a match completely alone - unlike generic
// domain nouns ("electricity", "water", "power") which show up constantly
// in unrelated questions (bills, meters, maintenance, "is this included
// in the fees" etc). NOT inferred automatically from any keyword list -
// each entry here is a deliberate, reviewed exception, scoped to one
// specific scenario.
const HIGH_CONFIDENCE_SINGLETONS = {
  // 'blackout' (EN) is deliberately NOT here: it can also mean loss of
  // consciousness/memory, colliding with medical scenarios (MED-02). For
  // a safety-oriented assistant, primary: null is preferable to routing
  // a possible medical event into an electrical-outage workflow. Its
  // electrical meaning is still reachable through phrase patterns (e.g.
  // "power blackout", "blackout block") in ELE-02's keywords, following
  // the normal phrase-matching path rather than a singleton exception.
  // 'apagón' (ES) and 'Stromausfall' (DE) don't carry this ambiguity in
  // ordinary usage, so they remain safe as singletons.
  'ELE-02': ['apagon', 'stromausfall'],
  // 'intruder'/'intruso'/'intrus'/'eindringling' are narrow, unambiguous
  // words with essentially one real-world meaning (someone unlawfully
  // present) - unlike generic security nouns, they don't show up in
  // routine community chatter. 'cambrioleur'/'einbrecher' (burglar) are
  // equally unambiguous and cover the "someone is breaking in" phrasing
  // that doesn't use the word "intruder" itself.
  'SEC-01': [
    'intruder', 'intruso', 'intrus', 'eindringling', 'cambrioleur', 'einbrecher',
    // Verb-form morphology for "actively breaking in" phrasing that
    // doesn't use the noun "intruder"/"burglar" itself. Spanish gerunds
    // ("robando"/"entrando") are grammatically inherently present-tense/
    // active, which is why they're accepted as singletons here despite
    // being ordinary verbs - the -ando/-iendo form itself signals
    // "in the process of", not a completed/historical action.
    'robando', 'entrando', 'einbrechen', 'bricht', 'effraction',
  ],
  // Threat/violence morphology - each of these is reasonably specific
  // in ordinary community-chat context (unlikely to appear in routine
  // unrelated messages), covering noun and verb forms so bare/short
  // phrasing still resolves correctly.
  'SEC-04': [
    'threatening', 'threat', 'threatened', 'fighting', 'violent', 'violence',
    'amenaza', 'amenazando', 'pelea', 'peleando',
    'menace', 'bagarre',
    'schlagerei', 'schlagt', 'bedroht',
  ],
  // Earthquake terms are unambiguous across all four languages and never
  // appear in ordinary community discussion outside this exact meaning.
  'WEA-04': ['earthquake', 'terremoto', 'seismo', 'seisme', 'erdbeben'],
  // German "brennt" (is burning) is a specific verb form with no other
  // common meaning - confirmed gap: "In meiner Wohnung brennt es." had
  // no reliable path to FIR-01 without this, since "wohnung" is generic
  // and no protected-phrase combination existed for this exact wording.
  'FIR-01': ['brennt'],
  // Drowning verb forms - "ahogando"/"ahogandose" (accent-stripped from
  // "ahogándose"), French "noie", German "ertrinkt". Narrow enough in
  // practice to stand alone (the rare idiomatic non-literal use, e.g.
  // Spanish "ahogarse en llanto", is an acceptable false-positive-toward-
  // safety tradeoff for a drowning scenario).
  'MED-04': ['ahogando', 'ahogandose', 'noie', 'ertrinkt'],
  // 'unwell' is a narrow, unambiguous medical-condition word (no other
  // common meaning). Needed as a singleton specifically because the
  // canonical example "A resident is very unwell." now filters BOTH
  // 'resident' (pre-existing generic term) and 'very' (added as generic
  // per the confirmed NUI-01/SAF-05 false-positive fix above), leaving
  // 'unwell' as the only remaining content word - below the 2-token
  // MIN_MEANINGFUL_TOKENS minimum without this singleton exception.
  'MED-01': ['unwell'],
};

// Explicit, individually-reviewed per-intent safety phrases that are
// allowed to retain a normally-generic context word (apartment/
// building/neighbour/common area/etc) when paired with a genuinely
// diagnostic safety word. Each phrase here was reviewed one at a time -
// this is NOT auto-generated from every keyword, and does NOT remove
// "apartment"/"building"/"neighbour" from GENERIC_TERMS globally (doing
// so would reintroduce the exact broad false-positive class this
// architecture exists to prevent, e.g. "comunidad"/"puedo"). Matched
// against RAW tokens (not generic-filtered), so these specific,
// curated combinations can reach full phrase-match weight even though
// one of their words would normally be stripped as too generic to be
// diagnostic on its own.
const PROTECTED_SAFETY_PHRASES = {
  'FIR-01': [
    'fire apartment', 'fire flat', 'apartment fire', 'flat fire',
    'incendio apartamento', 'apartamento fuego', 'incendio piso', 'fuego apartamento',
    'feu appartement', 'appartement feu', 'incendie appartement',
    'wohnung brennt', 'feuer wohnung', 'brennt wohnung',
  ],
  'FIR-02': [
    'smoke neighbour', 'smoke neighbor', 'smoke apartment', 'neighbour smoke',
    'smoke next door', 'smoke door', 'smoke upstairs', 'smoke downstairs',
    'humo vecino', 'humo apartamento', 'vecino humo', 'humo puerta',
    'fumee voisin', 'fumee appartement', 'voisin fumee', 'fumee porte',
    'rauch nachbar', 'rauch wohnung', 'nachbar rauch', 'rauch tur',
  ],
  'FIR-04': [
    // "EV" is a real, specific abbreviation (electric vehicle) that would
    // otherwise be silently dropped by tokenize()'s length>=3 filter -
    // see ALLOWED_SHORT_TOKENS below, which lets it survive as a token
    // specifically so these phrases can match.
    'ev garage', 'ev smoke', 'ev smoking', 'ev fire', 'ev charging',
    'electric car smoke', 'electric car smoking', 'battery smoke', 'battery smoking',
    'coche electrico humo', 'bateria humo', 'humo vehiculo electrico',
    'voiture electrique fumee', 'batterie fumee', 'fumee vehicule electrique',
    'elektroauto rauch', 'batterie raucht', 'e auto rauch',
  ],
  'SEC-04': [
    'neighbour threatening', 'neighbor threatening', 'threatening neighbour',
    'threatening neighbor', 'fight common area', 'fight common',
    'vecino amenazando', 'amenazando vecino', 'pelea zona comun', 'pelea comun',
    'voisin menace', 'menace voisin', 'bagarre zone commune', 'bagarre commune',
    'nachbar bedroht', 'bedroht nachbar',
  ],
  'WEA-04': [
    'building shaking', 'shaking building',
    'edificio temblando', 'temblando edificio',
    'immeuble tremble', 'batiment tremble', 'tremble immeuble',
    'gebaude wackelt', 'haus wackelt', 'wackelt gebaude',
  ],
  // Water alone ("dripping through my ceiling") is a plain leak (WAT-01)
  // - the electrocution-relevant distinction is water reaching a light
  // fitting/socket specifically, not just "through the ceiling". These
  // phrases require BOTH a water word and a light/socket/fitting word
  // together, so an ordinary ceiling leak does not become ELE-05.
  'ELE-05': [
    'water light', 'water lamp', 'water socket', 'leak light', 'leak socket',
    'dripping light', 'dripping socket', 'water fitting', 'leak fitting',
    'agua lampara', 'gotea lampara', 'agua enchufe', 'gotea enchufe', 'agua luz',
    'eau luminaire', 'eau lampe', 'eau prise', 'coule luminaire', 'coule lampe',
    'wasser lampe', 'wasser steckdose', 'tropft lampe', 'tropft steckdose',
    'wasser deckenlampe', 'tropft deckenlampe',
  ],
  // SAF-03's own production keywords use adjective forms ("perro
  // agresivo"/"chien agressif") but not verb forms - these phrases let
  // SAF-03 win once SEC-04's animal-actor suppression has correctly
  // ruled out the human-threat procedure, for phrasing that uses a
  // threat/violence VERB with a dog as the actor.
  'SAF-03': [
    'dog threatening', 'dog attacking', 'dog biting', 'dog chasing',
    'perro amenaza', 'perro amenazando', 'perro ataca', 'perro atacando',
    'perro agrede', 'perro muerde', 'perro mordiendo',
    'chien menace', 'chien attaque', 'chien mord', 'chien poursuit',
    'hund bedroht', 'hund greift', 'hund beisst', 'hund verfolgt',
  ],
};

// Scores one entry against the question. Three independent, additive
// kinds of evidence:
//   1) PHRASE evidence - every (non-generic) word of one of the entry's
//      own keyword phrases appears in the question, AND the phrase still
//      has at least MIN_PHRASE_TOKENS words after generic-term removal.
//      This includes STATE_MARKERS-aware matching, so "no electricity" as
//      a stored phrase can match "There is no electricity..." as a
//      genuine 2-word phrase, without "electricity" ever becoming
//      sufficient on its own.
//   2) TOKEN evidence - individual non-generic word overlap (from keyword
//      phrases that didn't fully qualify as a phrase match, and from
//      tokenized example_user_queries).
//   3) SINGLETON anchor evidence - a small, explicit, per-scenario list of
//      genuinely unambiguous single words (see HIGH_CONFIDENCE_SINGLETONS).
// A candidate is only eligible if it has a full phrase match, a singleton
// anchor hit, OR at least MIN_MEANINGFUL_TOKENS independent token hits - a
// single generic/ambiguous word can never be enough by itself.
function scoreEntry(entry, questionTokens, questionPhraseTokens, rawQuestion) {
  let phraseMatched = false;
  const meaningfulMatches = new Set();

  // Classify the actor WITHIN the clause containing the threat verb (not
  // anywhere in the whole sentence): find the verb, then look only at
  // the subject-scope text before it within the SAME clause (reusing
  // clauseTextBefore - a reporting verb or clause boundary like "while"/
  // "but" starts a new scope, matching the MED-02 subject-classification
  // fix). Computed early so it can gate BOTH SEC-04's own singleton
  // evidence AND SAF-03's protected phrases (an animal mentioned in an
  // unrelated earlier clause must not credit SAF-03 either).
  //   animal actor only  -> suppress ALL SEC-04 evidence (SAF-03 alone)
  //   human actor only   -> SEC-04 unaffected, SAF-03 phrases gated off
  //   animal AND human   -> SEC-04 NOT suppressed and gets a decisive
  //                          priority bonus below; SAF-03 remains
  //                          separately scoreable as a related intent
  //   animal in an EARLIER, unrelated clause -> irrelevant to either
  //
  // Iterates over EVERY threat/violence verb occurrence (not just the
  // first) - a second clause with a different actor must not be
  // ignored: "A dog is threatening a resident, but a man is threatening
  // another resident." has two separate threat clauses, one animal-only
  // and one human-only, and must still combine to "SEC-04 primary, SAF-03
  // related" exactly like a single mixed clause would.
  // Uses the SAME THREAT_ATTACK_VERB_PATTERN as the emergency detector's
  // threat_or_attack hazard family (see HAZARD_FAMILIES above) - one
  // shared vocabulary, not two that could drift apart. Runs on
  // stripAccents()-normalized text so accented Spanish/French forms and
  // German ß both match the (unaccented, ss-only) shared pattern without
  // needing every variant spelled out twice; clause indices are taken
  // from this SAME normalized text throughout, so clauseTextBefore/
  // stripNonHeadModifiers/ANIMAL_ACTOR_PATTERNS/HUMAN_ACTOR_PATTERNS all
  // operate consistently on it.
  const normalizedQuestionForActor = rawQuestion ? stripAccents(rawQuestion) : '';
  const threatVerbRegex = new RegExp(THREAT_ATTACK_VERB_PATTERN.source, 'gi');
  let hasAnimalActorInClause = false; // true if ANY threat clause has an animal actor
  let hasHumanActorAnywhere = false; // true if ANY threat clause has a human actor
  let anyThreatVerbFound = false;
  if (normalizedQuestionForActor) {
    threatVerbRegex.lastIndex = 0;
    let vm;
    while ((vm = threatVerbRegex.exec(normalizedQuestionForActor)) !== null) {
      anyThreatVerbFound = true;
      const actorClause = stripNonHeadModifiers(clauseTextBefore(normalizedQuestionForActor, vm.index));
      if (ANIMAL_ACTOR_PATTERNS.some((re) => re.test(actorClause))) hasAnimalActorInClause = true;
      if (HUMAN_ACTOR_PATTERNS.some((re) => re.test(actorClause))) hasHumanActorAnywhere = true;
      if (threatVerbRegex.lastIndex === vm.index) threatVerbRegex.lastIndex += 1;
    }
  }
  const isAnimalOnlyActor = hasAnimalActorInClause && !hasHumanActorAnywhere;
  const isMixedActor = hasAnimalActorInClause && hasHumanActorAnywhere;

  // SAF-03 must accrue ZERO evidence (not just be denied its protected
  // phrase) when a threat/violence verb IS present but none of its
  // occurrences have a genuine animal actor - otherwise SAF-03's own
  // canonical example_user_queries (which legitimately contain
  // "threatening", e.g. "A dog is threatening people...") leak weak
  // evidence via the exampleTokens mechanism below whenever "dog" and
  // "threatening" both appear anywhere in the message, even when the
  // dog is in a wholly unrelated clause. Scoped to ONLY apply when a
  // threat verb was actually found - an ordinary SAF-03 report with no
  // threat verb at all ("There is an aggressive dog loose near the
  // pool.") must not be affected.
  if (entry.intent_code === 'SAF-03' && anyThreatVerbFound && !hasAnimalActorInClause) {
    return { score: 0, phraseMatched: false, meaningfulMatches: [] };
  }

  // MED-02 must accrue ZERO evidence through ANY path (not just the
  // RAW_REGEX_ANCHORS mechanism below) when NO occurrence in the message
  // has a human subject - otherwise MED-02's own regular keywords (which
  // legitimately include "no responde"/"reagiert nicht" etc, the same
  // phrase family) independently satisfy the ordinary phrase-match loop
  // and completely bypass subject classification. Uses
  // evaluateMedicalNotResponding()'s anyHumanAtAll across ALL
  // occurrences, not just the first - "The app is not responding, but a
  // resident is not responding." must still be eligible from the SECOND
  // occurrence even though the first is a device.
  if (entry.intent_code === 'MED-02') {
    const hasAnchor = (RAW_REGEX_ANCHORS['MED-02'] || []).some((re) => rawQuestion && re.test(rawQuestion));
    if (hasAnchor && !evaluateMedicalNotResponding(rawQuestion).anyHumanAtAll) {
      return { score: 0, phraseMatched: false, meaningfulMatches: [] };
    }
  }

  for (const phrase of entry.keywords || []) {
    const phraseTokens = tokenizeForPhraseMatch(phrase).filter((t) => !GENERIC_TERMS.has(t));
    if (phraseTokens.length === 0) continue; // phrase carried no real signal at all
    const allPresent = phraseTokens.every((t) => questionPhraseTokens.has(t));
    if (allPresent && phraseTokens.length >= MIN_PHRASE_TOKENS) {
      phraseMatched = true;
      phraseTokens.filter((t) => !STATE_MARKERS.has(t)).forEach((t) => meaningfulMatches.add(t));
    } else {
      phraseTokens.forEach((t) => { if (questionTokens.has(t)) meaningfulMatches.add(t); });
    }
  }

  // Explicit, reviewed safety phrases (see PROTECTED_SAFETY_PHRASES above)
  // - matched against RAW question tokens, not the generic-filtered set,
  // since these specific combinations were individually reviewed to
  // confirm they're diagnostic together even though one word would
  // normally be too generic to count alone.
  const protectedPhrases = PROTECTED_SAFETY_PHRASES[entry.intent_code] || [];
  // Cigarette/tobacco smoke is a nuisance complaint, not a fire - skip
  // FIR-02's smoke-related protected phrases in that context so NUI-04's
  // own keywords can win instead, UNLESS a strong independent
  // description of an actually-ongoing fire is also present (see
  // STRONG_OVERRIDE_PATTERNS), in which case the real hazard must win.
  const skipForNuisance = entry.intent_code === 'FIR-02'
    && rawQuestion
    && NUISANCE_SMOKE_PATTERNS.some((re) => re.test(rawQuestion))
    && !STRONG_OVERRIDE_PATTERNS.some((re) => re.test(rawQuestion));
  // SAF-03's "dog threatening"-class phrases require the animal to
  // genuinely be the actor of THIS clause's threat verb - a dog
  // mentioned only in an unrelated earlier clause ("A dog is nearby
  // while a man is threatening a resident.") must not credit SAF-03,
  // even though "dog" and "threatening" both appear somewhere in the
  // sentence.
  const skipForUnrelatedAnimal = entry.intent_code === 'SAF-03'
    && !hasAnimalActorInClause;
  for (const phrase of (skipForNuisance || skipForUnrelatedAnimal) ? [] : protectedPhrases) {
    const phraseTokens = tokenizeForPhraseMatch(phrase);
    if (phraseTokens.length < 2) continue; // still require genuine multi-word specificity
    if (phraseTokens.every((t) => questionTokens.has(t))) {
      phraseMatched = true;
      phraseTokens.forEach((t) => meaningfulMatches.add(t));
    }
  }

  const exampleTokens = (entry.logic_json?.example_user_queries || [])
    .flatMap((q) => tokenize(q))
    .filter((t) => !GENERIC_TERMS.has(t));
  exampleTokens.forEach((t) => { if (questionTokens.has(t)) meaningfulMatches.add(t); });

  const singletonAnchors = HIGH_CONFIDENCE_SINGLETONS[entry.intent_code] || [];
  let singletonMatched = singletonAnchors.some((word) => questionTokens.has(word));

  // SEC-04 threat/violence words (threatening/amenaza/bedroht/menace...)
  // require a HUMAN AGGRESSOR, not merely a human word anywhere in the
  // sentence. Confirmed production false positives:
  //   "A dog is threatening people in the garden." (SEC-04 should not
  if (entry.intent_code === 'SEC-04' && isAnimalOnlyActor) {
    singletonMatched = false;
    phraseMatched = false;
    meaningfulMatches.clear();
  }

  // Raw-text regex anchors, independent of tokenization entirely - for
  // phrases that cannot survive normal phrase-matching because they rely
  // on a grammar word that is otherwise correctly filtered everywhere
  // else (STOPWORDS strips "not", which is right for every OTHER use of
  // "not" - but "not responding"/"no responde"/"ne répond pas" describing
  // a PERSON is a specific, reviewed medical-safety phrase). Confirmed
  // production gap: "They are not responding." never reached MED-02 at
  // all under the normal phrase/token pipeline. Occurrence-based
  // evaluateMedicalNotResponding() keeps this scoped to genuine human
  // subjects, across every occurrence in the message.
  const rawAnchorMatched = (RAW_REGEX_ANCHORS[entry.intent_code] || []).some((re) => rawQuestion && re.test(rawQuestion));
  if (rawAnchorMatched) {
    const isNonPersonContext = entry.intent_code === 'MED-02' && !evaluateMedicalNotResponding(rawQuestion).anyHumanAtAll;
    if (!isNonPersonContext) {
      phraseMatched = true;
    }
  }

  // ELE-05 (water + explicit electrical fitting) must never become
  // eligible without a real clause-local water/electrical RELATIONSHIP
  // (see evaluateWaterElectricalRelationship() above) - not merely both
  // terms appearing somewhere in the message. Uses anyRelationshipAtAll
  // (not anyCurrentRelationship) so historical wording can still
  // retrieve ELE-05 informationally, matching detectEmergency()'s use of
  // the SAME evaluator for the emergency flag - retrieval and emergency
  // detection share one gate, never contradictory ones. Confirmed
  // production regression this replaces: "Water is coming through my
  // ceiling." (no electrical involvement) incorrectly outranked WAT-01
  // via weak evidence leaking from ELE-05's own example_user_queries.
  // Scoped to ELE-05 only.
  let eligible;
  if (entry.intent_code === 'ELE-05') {
    eligible = analyzeWaterElectricalRelationships(rawQuestion).anyRelationshipAtAll;
    // The explicit relationship match above IS the match for ELE-05 -
    // treat it as a genuine phrase-level match so scoring reflects real
    // eligibility rather than potentially falling through to a near-zero
    // score.
    if (eligible) phraseMatched = true;
  } else {
    eligible = phraseMatched || singletonMatched || meaningfulMatches.size >= MIN_MEANINGFUL_TOKENS;
  }
  if (!eligible) return { score: 0, phraseMatched: false, meaningfulMatches: [] };

  const score = (phraseMatched ? PHRASE_MATCH_SCORE : 0)
    + (singletonMatched && !phraseMatched ? SINGLETON_ANCHOR_SCORE : 0)
    + meaningfulMatches.size * TOKEN_MATCH_SCORE
    // When both an animal and a human are actors of the SAME threat
    // clause ("A dog and a man are threatening a resident."), SEC-04
    // must win as primary (the human-involvement procedure takes
    // priority) while SAF-03 remains separately scoreable as a related
    // intent via its own protected phrases. Without this, SEC-04's
    // singleton-only score (~5) can lose to SAF-03's full phrase-match
    // score (~7) even though suppression correctly did not apply -
    // this closes that gap with an explicit, documented margin rather
    // than an incidental near-tie.
    + (entry.intent_code === 'SEC-04' && isMixedActor ? PHRASE_MATCH_SCORE : 0);
  return { score, phraseMatched, meaningfulMatches: [...meaningfulMatches] };
}

export function retrieveRelevantEntries(entries, question) {
  const questionTokens = new Set(tokenize(question));
  const questionPhraseTokens = new Set(tokenizeForPhraseMatch(question).filter((t) => !GENERIC_TERMS.has(t)));
  if (questionTokens.size === 0) return { entries: [], fallbackUsed: false };

  const scored = entries.map((entry) => ({ entry, ...scoreEntry(entry, questionTokens, questionPhraseTokens, question) }));

  // A tie in score must NOT depend on whatever row order Postgres happens
  // to return (the query has no ORDER BY, so that order is not guaranteed
  // stable between requests) - break ties deterministically by intent_code
  // so the same question always produces the same result.
  scored.sort((a, b) => b.score - a.score || (a.entry.intent_code || '').localeCompare(b.entry.intent_code || ''));
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
export function selectAttachedEntries(allEntries, currentMatches, fallbackUsed, priorPrimaryCode, priorRelatedCodes, question) {
  const byCode = new Map(allEntries.map((e) => [e.intent_code || e.id, e]));
  const attached = [];
  const seen = new Set();

  function add(entry) {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    attached.push(entry);
  }

  // Whether THIS turn's question, on its own, is short enough to
  // plausibly be a brief "what should I do next?"/"is it safe now?"
  // style follow-up with no topic signal of its own - computed BEFORE
  // any primary/attached decision below, since it must gate every place
  // prior-turn context could otherwise leak in, not just the final
  // carry-forward block. See the full rationale further down.
  const isShortQuestion = typeof question === 'string' && question.trim().split(/\s+/).length <= SHORT_FOLLOWUP_MAX_WORDS;

  if (!fallbackUsed && currentMatches.length > 0) {
    currentMatches.forEach(add);
  } else if (fallbackUsed && isShortQuestion && priorPrimaryCode && byCode.has(priorPrimaryCode)) {
    // Only reuse the prior primary here when this turn's own lack of a
    // match is plausibly explained by a brief follow-up, not by the
    // question simply being about an unrelated domain the
    // knowledge_base doesn't cover at all (e.g. administrative/AGM
    // questions, answered via community_config + document retrieval).
    add(byCode.get(priorPrimaryCode));
    currentMatches.forEach(add);
  } else {
    currentMatches.forEach(add);
  }

  const primary = attached[0] || null;
  const primaryCode = primary?.intent_code || primary?.id || null;

  // Only carry forward prior turn's RELATED context (beyond the primary
  // itself, already handled above) when the current question is
  // genuinely a continuation of the SAME topic: either (a) the new
  // primary IS the same scenario as the prior one, or (b) this was a
  // short-question fallback reuse (isShortQuestion path above).
  //
  // Confirmed real-world failure this whole fix addresses: an earlier
  // turn's emergency-scenario context (gas leak / unresponsive
  // neighbour) kept silently accumulating onto every subsequent
  // question in the same conversation, including a completely
  // unrelated, substantive administrative question ("what happened
  // with the tourist licence applications at the last AGM?", 12 words,
  // fallbackUsed=true since AGM topics have no knowledge_base
  // presence at all) - the model then appended an unprompted "your
  // previous emergency is life-threatening, call 112 now" warning,
  // with call112 flowing into the server-owned response field, onto an
  // answer about tourist licences.
  const isContinuation = (primaryCode !== null && primaryCode === priorPrimaryCode) || (fallbackUsed && isShortQuestion);

  if (isContinuation) {
    if (priorPrimaryCode && byCode.has(priorPrimaryCode)) add(byCode.get(priorPrimaryCode));
    for (const code of priorRelatedCodes || []) {
      if (byCode.has(code)) add(byCode.get(code));
    }
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
