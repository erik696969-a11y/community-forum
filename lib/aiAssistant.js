// Pure, dependency-free helper functions for the Community Assistant
// (app/api/ask-ai/route.js). Pulled out into their own module specifically
// so they can be unit tested without mocking Supabase or the Anthropic API -
// this is the most complex server module in the app and previously had zero
// test coverage of its own.

export const MAX_RETRIEVED_ENTRIES = 5;
export const ALLOWED_URGENCY = ['info', 'yellow', 'orange', 'red'];

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
export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "fuga" ~ "fugó" etc.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function retrieveRelevantEntries(entries, question) {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return { entries: [], fallbackUsed: false };

  const scored = entries.map((entry) => {
    const keywordTokens = (entry.keywords || []).flatMap((k) => tokenize(k));
    const fallbackTokens = keywordTokens.length ? [] : tokenize(`${entry.title} ${entry.category || ''}`);
    const pool = keywordTokens.length ? keywordTokens : fallbackTokens;

    let score = 0;
    for (const tok of pool) {
      if (questionTokens.has(tok)) score += keywordTokens.length ? 2 : 1; // explicit keywords weigh more
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0).slice(0, MAX_RETRIEVED_ENTRIES);

  if (matched.length > 0) return { entries: matched.map((s) => s.entry), fallbackUsed: false };

  // No keyword match at all: fall back to a small set of general entries so
  // the assistant isn't completely silent, rather than guessing.
  return { entries: entries.filter((e) => (e.category || '').toLowerCase() === 'general').slice(0, 3), fallbackUsed: true };
}

// Follow-up fix: a question like "what if the neighbour isn't home?" often
// has no keyword overlap with the water-leak scenario the previous turn
// already surfaced. Carry forward whatever sources our own server actually
// returned in the last turn(s), without trusting anything else from the
// client (previousSourceCodes must come from our own prior responses).
export function mergeCarriedSources(entries, relevantEntries, previousSourceCodes) {
  if (!previousSourceCodes || previousSourceCodes.size === 0) return relevantEntries;
  const alreadyIncludedIds = new Set(relevantEntries.map((e) => e.id));
  const carried = entries.filter(
    (e) => !alreadyIncludedIds.has(e.id) && previousSourceCodes.has(e.intent_code || e.id)
  );
  return [...relevantEntries, ...carried];
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
