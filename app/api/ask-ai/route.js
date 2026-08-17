import { getAuthedProfile } from '../../../lib/serverAuth';

const DAILY_LIMIT = 30;
const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_TURNS = 2;
const MAX_RETRIEVED_ENTRIES = 5;
const ALLOWED_URGENCY = ['info', 'yellow', 'orange', 'red'];

// Deterministic, app-side danger detection. This never depends on the
// Anthropic API being reachable — it fires purely on the raw question text
// so a slow/failed AI call can never suppress the emergency banner.
const EMERGENCY_PATTERNS = [
  /\bfire\b|\bsmoke\b|\bburning\b/i,
  /\bfuego\b|\bincendio\b|\bhumo\b/i,
  /\bfeu\b|\bincendie\b|\bfumée\b/i,
  /\bfeuer\b|\brauch\b/i,
  /\bgas leak\b|\bsmell(s)? of gas\b/i,
  /\bfuga de gas\b|\bhuele a gas\b/i,
  /\bfuite de gaz\b/i,
  /\bgasgeruch\b|\bgasleck\b/i,
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

function hasDangerousCombo(text) {
  return WATER_TERMS.test(text) && ELECTRICAL_TERMS.test(text);
}

function detectEmergency(text) {
  return EMERGENCY_PATTERNS.some((re) => re.test(text)) || hasDangerousCombo(text);
}

// Very small, dependency-free keyword retrieval. Scores each active KB entry
// against the question so we only send Claude 2-5 relevant scenarios instead
// of the whole knowledge base on every question.
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "fuga" ~ "fugó" etc.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function retrieveRelevantEntries(entries, question) {
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

function buildSystemPrompt({ rulesText, contactsText, configText, emergencyDetected }) {
  return `You are the Community Assistant for a residential complex. You answer residents' questions using ONLY the information provided below. You must respond with a single valid JSON object and nothing else — no markdown, no code fences, no commentary outside the JSON.

SAFETY HIERARCHY (overrides everything else):
Human safety always comes before community rules or procedures.
If there is any possible immediate danger to a person: the first priority in your answer is always to get them to safety and, if appropriate, call the emergency number 112. Community procedures come after that.

YOU MUST NEVER:
- instruct a resident to repair electrical equipment
- instruct a resident to repair or investigate a gas installation
- instruct a resident to force open an elevator door
- instruct a resident to enter another private apartment
- instruct a resident to confront an aggressive or violent person
- diagnose a medical condition or give medical treatment instructions
- invent a phone number, email, name, opening hour, or procedure that is not explicitly given to you below
- state or imply legal or insurance responsibility/liability

If the provided rules and contacts don't clearly cover the question, say so honestly in "answer" rather than guessing, and leave "contactRoles"/"sources" reflecting only what you actually used.

${emergencyDetected ? 'NOTE: the app has detected likely emergency language in this question. Treat this as potentially urgent — lead with immediate safety steps and set "call112": true unless the provided rules clearly indicate otherwise.\n' : ''}
RELEVANT COMMUNITY PROCEDURES (only use these, cite their intent_code in "sources"):
${rulesText || '(no specific procedure matched this question)'}

COMMUNITY FACTS (current, from the Board):
${configText}

CURRENT CONTACTS (for reference only — you do NOT know their phone/email, the app fills that in):
${contactsText}

Respond ONLY with a JSON object in exactly this shape:
{
  "urgency": "info" | "yellow" | "orange" | "red",
  "answer": "string, written in the same language as the question, concise and friendly",
  "immediateActions": ["short imperative steps, empty array if none needed"],
  "doNot": ["short warnings, empty array if none needed"],
  "contactRoles": ["exact role_label string(s) from CURRENT CONTACTS above that the resident should contact, empty array if none needed — NEVER include a phone number or email yourself, only the role_label text"],
  "call112": true | false,
  "sources": ["intent codes you actually used, e.g. WAT-01"]
}`;
}

function safeParseJson(raw) {
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

function clampUrgency(value, fallback) {
  return ALLOWED_URGENCY.includes(value) ? value : fallback;
}

// The model is told to reference contacts only by their role_label - it
// never sees or invents an actual phone number/email. The app looks the
// real contact up here, so a hallucinated or malformed role simply matches
// nothing and is silently dropped rather than shown to the resident.
function resolveContactRoles(requestedRoles, contacts) {
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

// Best-effort, anonymous telemetry - never stores question/answer text,
// just enough to see which scenarios get used, where the AI falls back or
// fails, and roughly what it costs. Never throws: a logging failure must
// never break the actual answer the resident is waiting for.
async function logAiQuery(adminClient, fields) {
  try {
    const { data } = await adminClient.from('ai_query_log').insert(fields).select('id').single();
    return data?.id || null;
  } catch (err) {
    console.error('ask-ai: telemetry logging failed (non-fatal):', err);
    return null;
  }
}

export async function POST(request) {
  const requestStartedAt = Date.now();
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const adminClient = auth.adminClient;

    const body = await request.json();
    const question = (body.question || '').trim();
    // The client only ever sends its own PAST QUESTIONS and the SOURCE CODES
    // our server previously returned for them - never free-form "assistant"
    // text. That text would otherwise be forwarded to Anthropic as a
    // trusted `assistant` turn, which is an unnecessary prompt-injection
    // surface (a user could fabricate a fake "previous AI answer" in their
    // own request). Sources are safe to echo back because we re-validate
    // them against the real knowledge base below regardless.
    const clientHistory = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
    // Only board members can force-test a single (possibly inactive) entry
    // from the admin "Test this entry" preview.
    const testIntentId = auth.profile.role === 'board' ? body.testIntentId : null;

    if (!question) {
      return Response.json({ error: 'No question provided' }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return Response.json({ error: 'Question is too long' }, { status: 400 });
    }

    if (!testIntentId) {
      // Per-user daily rate limit, so a single account can't rack up a large
      // Anthropic bill by hammering this endpoint. Test previews (board only,
      // used sparingly) skip the resident rate limit.
      const { data: allowed, error: rateLimitError } = await adminClient.rpc('check_and_increment_rate_limit', {
        p_user_id: auth.user.id,
        p_endpoint: 'ask-ai',
        p_limit: DAILY_LIMIT,
      });

      if (rateLimitError) {
        console.error('ask-ai rate limit check failed:', rateLimitError);
        return Response.json(
          { error: 'The Community Assistant is temporarily unavailable. Please try again later.' },
          { status: 503 }
        );
      }
      if (!allowed) {
        return Response.json({ error: 'Daily question limit reached. Please try again tomorrow.' }, { status: 429 });
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI assistant is not configured yet' }, { status: 500 });
    }

    const emergencyDetected = detectEmergency(question);

    let relevantEntries = [];
    let fallbackUsed = false;
    if (testIntentId) {
      const { data: single } = await adminClient
        .from('ai_knowledge_base')
        .select('id, intent_code, title, content, category, urgency, keywords')
        .eq('id', testIntentId)
        .single();
      if (single) relevantEntries = [single];
    } else {
      const { data: entries } = await adminClient
        .from('ai_knowledge_base')
        .select('id, intent_code, title, content, category, urgency, keywords')
        .eq('active', true)
        .order('updated_at', { ascending: true });

      if (!entries || entries.length === 0) {
        return Response.json({ noKnowledge: true });
      }
      const retrieval = retrieveRelevantEntries(entries, question);
      relevantEntries = retrieval.entries;
      fallbackUsed = retrieval.fallbackUsed;

      // Follow-up fix: a question like "what if the neighbour isn't home?"
      // often has no keyword overlap with the water-leak scenario the
      // previous turn already surfaced. Carry forward whatever sources our
      // own server actually returned in the last turn(s) so context isn't
      // silently dropped, without trusting anything else from the client.
      const previousSourceCodes = new Set(
        clientHistory.flatMap((h) => (Array.isArray(h?.sources) ? h.sources : []))
      );
      if (previousSourceCodes.size > 0) {
        const alreadyIncludedIds = new Set(relevantEntries.map((e) => e.id));
        const carried = entries.filter(
          (e) => !alreadyIncludedIds.has(e.id) && previousSourceCodes.has(e.intent_code || e.id)
        );
        relevantEntries = [...relevantEntries, ...carried];
      }
    }

    const [{ data: contacts }, { data: config }] = await Promise.all([
      adminClient.from('contacts').select('role_label, name, phone, email').order('sort_order', { ascending: true }),
      adminClient.from('community_config').select('key, label, value'),
    ]);

    const rulesText = relevantEntries
      .map((e) => `[${e.intent_code || e.id}] ${e.title}\n${e.content}`)
      .join('\n\n');

    // Contacts shown to the model omit phone/email entirely - it only ever
    // sees role labels, so it physically has no real number to copy or
    // misremember. See resolveContactRoles() for how the app fills in the
    // real details afterwards.
    const contactsText = (contacts || [])
      .map((c) => `- ${c.role_label}`)
      .join('\n') || '(no contacts configured yet)';

    const configText = (config || [])
      .filter((c) => c.value && c.value !== '[TO FILL IN]')
      .map((c) => `- ${c.label}: ${c.value}`)
      .join('\n') || '(no community facts configured yet)';

    const systemPrompt = buildSystemPrompt({ rulesText, contactsText, configText, emergencyDetected });

    // Only the resident's own past QUESTIONS are folded into the prompt, as
    // a single user turn - never a fabricated "assistant" turn built from
    // client-supplied text. This keeps the Anthropic messages array trivially
    // valid (single user message, no alternation to get wrong) and removes
    // the prompt-injection surface entirely.
    const historyQuestions = clientHistory
      .map((h) => (h && typeof h.question === 'string' ? h.question.trim().slice(0, MAX_QUESTION_LENGTH) : null))
      .filter(Boolean);

    const userContent = historyQuestions.length > 0
      ? `${historyQuestions.map((q) => `Previous question: ${q}`).join('\n')}\nFollow-up question: ${question}`
      : question;

    const messages = [{ role: 'user', content: userContent }];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('ask-ai Anthropic request failed:', errText);
      if (!testIntentId) {
        await logAiQuery(adminClient, {
          user_id: auth.user.id,
          matched_sources: relevantEntries.map((e) => e.intent_code || e.id),
          emergency_detected: emergencyDetected,
          fallback_used: fallbackUsed,
          had_error: true,
          latency_ms: Date.now() - requestStartedAt,
        });
      }
      return Response.json(
        {
          error: 'The Community Assistant is temporarily unavailable. Please try again later.',
          emergencyDetected,
          call112: emergencyDetected,
        },
        { status: 500 }
      );
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || '';
    const parsed = safeParseJson(rawText);
    const usage = data.usage || {};

    if (!parsed || typeof parsed.answer !== 'string') {
      console.error('ask-ai: could not parse structured AI response:', rawText);
      const logId = testIntentId ? null : await logAiQuery(adminClient, {
        user_id: auth.user.id,
        matched_sources: relevantEntries.map((e) => e.intent_code || e.id),
        emergency_detected: emergencyDetected,
        fallback_used: fallbackUsed,
        parse_error: true,
        latency_ms: Date.now() - requestStartedAt,
        input_tokens: usage.input_tokens || null,
        output_tokens: usage.output_tokens || null,
      });
      return Response.json({
        urgency: emergencyDetected ? 'red' : 'info',
        answer: rawText || 'The Community Assistant could not generate a clear answer. Please contact the Board directly.',
        immediateActions: [],
        doNot: [],
        contacts: [],
        call112: emergencyDetected,
        sources: [],
        emergencyDetected,
        parseError: true,
        logId,
      });
    }

    // Never trust the model's own claims about which sources/contacts it
    // used - re-validate everything against what we actually retrieved and
    // what actually exists in the contacts table.
    const validSourceCodes = new Set(relevantEntries.map((e) => e.intent_code || e.id));
    const validatedSources = (Array.isArray(parsed.sources) ? parsed.sources : []).filter((s) => validSourceCodes.has(s));
    const validatedContacts = resolveContactRoles(parsed.contactRoles, contacts || []);
    const validatedUrgency = clampUrgency(parsed.urgency, emergencyDetected ? 'red' : 'info');

    const logId = testIntentId ? null : await logAiQuery(adminClient, {
      user_id: auth.user.id,
      matched_sources: relevantEntries.map((e) => e.intent_code || e.id),
      urgency: validatedUrgency,
      emergency_detected: emergencyDetected,
      fallback_used: fallbackUsed,
      latency_ms: Date.now() - requestStartedAt,
      input_tokens: usage.input_tokens || null,
      output_tokens: usage.output_tokens || null,
    });

    return Response.json({
      urgency: validatedUrgency,
      answer: parsed.answer,
      immediateActions: Array.isArray(parsed.immediateActions) ? parsed.immediateActions : [],
      doNot: Array.isArray(parsed.doNot) ? parsed.doNot : [],
      contacts: validatedContacts,
      call112: Boolean(parsed.call112) || emergencyDetected,
      sources: validatedSources,
      emergencyDetected,
      logId,
    });
  } catch (error) {
    console.error('ask-ai unexpected error:', error);
    return Response.json({ error: 'The Community Assistant is temporarily unavailable. Please try again later.' }, { status: 500 });
  }
}
