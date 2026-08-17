import { getAuthedProfile } from '../../../lib/serverAuth';

const DAILY_LIMIT = 30;
const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_TURNS = 2;
const MAX_RETRIEVED_ENTRIES = 5;

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
];

function detectEmergency(text) {
  return EMERGENCY_PATTERNS.some((re) => re.test(text));
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
  if (questionTokens.size === 0) return [];

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

  if (matched.length > 0) return matched.map((s) => s.entry);

  // No keyword match at all: fall back to a small set of general entries so
  // the assistant isn't completely silent, rather than guessing.
  return entries.filter((e) => (e.category || '').toLowerCase() === 'general').slice(0, 3);
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

If the provided rules and contacts don't clearly cover the question, say so honestly in "answer" rather than guessing, and leave "contacts"/"sources" reflecting only what you actually used.

${emergencyDetected ? 'NOTE: the app has detected likely emergency language in this question. Treat this as potentially urgent — lead with immediate safety steps and set "call112": true unless the provided rules clearly indicate otherwise.\n' : ''}
RELEVANT COMMUNITY PROCEDURES (only use these, cite their intent_code in "sources"):
${rulesText || '(no specific procedure matched this question)'}

COMMUNITY FACTS (current, from the Board):
${configText}

CURRENT CONTACTS (use ONLY these — never invent a different number/email):
${contactsText}

Respond ONLY with a JSON object in exactly this shape:
{
  "urgency": "info" | "yellow" | "orange" | "red",
  "answer": "string, written in the same language as the question, concise and friendly",
  "immediateActions": ["short imperative steps, empty array if none needed"],
  "doNot": ["short warnings, empty array if none needed"],
  "contacts": [{"label": "string", "name": "string", "phone": "string", "email": "string"}],
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

export async function POST(request) {
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
      relevantEntries = retrieveRelevantEntries(entries, question);
    }

    const [{ data: contacts }, { data: config }] = await Promise.all([
      adminClient.from('contacts').select('role_label, name, phone, email').order('sort_order', { ascending: true }),
      adminClient.from('community_config').select('key, label, value'),
    ]);

    const rulesText = relevantEntries
      .map((e) => `[${e.intent_code || e.id}] ${e.title}\n${e.content}`)
      .join('\n\n');

    const contactsText = (contacts || [])
      .map((c) => `- ${c.role_label}: ${c.name || ''} ${c.phone || ''} ${c.email || ''}`.trim())
      .join('\n') || '(no contacts configured yet)';

    const configText = (config || [])
      .filter((c) => c.value && c.value !== '[TO FILL IN]')
      .map((c) => `- ${c.label}: ${c.value}`)
      .join('\n') || '(no community facts configured yet)';

    const systemPrompt = buildSystemPrompt({ rulesText, contactsText, configText, emergencyDetected });

    const messages = [];
    for (const turn of clientHistory) {
      if (!turn || typeof turn.question !== 'string' || typeof turn.answer !== 'string') continue;
      messages.push({ role: 'user', content: turn.question.slice(0, MAX_QUESTION_LENGTH) });
      messages.push({ role: 'assistant', content: turn.answer.slice(0, 2000) });
    }
    messages.push({ role: 'user', content: question });

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

    if (!parsed || typeof parsed.answer !== 'string') {
      console.error('ask-ai: could not parse structured AI response:', rawText);
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
      });
    }

    return Response.json({
      urgency: parsed.urgency || (emergencyDetected ? 'red' : 'info'),
      answer: parsed.answer,
      immediateActions: Array.isArray(parsed.immediateActions) ? parsed.immediateActions : [],
      doNot: Array.isArray(parsed.doNot) ? parsed.doNot : [],
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      call112: Boolean(parsed.call112) || emergencyDetected,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      emergencyDetected,
    });
  } catch (error) {
    console.error('ask-ai unexpected error:', error);
    return Response.json({ error: 'The Community Assistant is temporarily unavailable. Please try again later.' }, { status: 500 });
  }
}
