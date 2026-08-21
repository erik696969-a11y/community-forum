import { getAuthedProfile } from '../../../lib/serverAuth';
import {
  detectEmergency,
  keywordPoolForEntry,
  retrieveRelevantEntries,
  selectAttachedEntries,
  computeRelatedIntents,
  applyDeterministicBranching,
  resolveModules,
  resolvePlaceholdersInText,
  resolvePlaceholdersInArray,
  safeParseJson,
  clampUrgency,
  validateSources,
  ALLOWED_SOURCE_STATUS,
} from '../../../lib/aiAssistant';

const DAILY_LIMIT = 30;
const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_TURNS = 2;

const AI_BEHAVIOR_RULES = [
  "Respond in the same language as the user's question unless the user asks for another language.",
  'Lead with the action that matters now. In urgent situations, do not begin with background explanations.',
  'If there is an immediate threat to life, serious injury, fire, major smoke, explosion risk, serious structural danger, violence, drowning, or another clearly dangerous situation, tell the user to call 112 immediately.',
  'If the severity is uncertain but a plausible immediate danger exists, state the safety precaution first and tell the user when 112 is appropriate. Ask at most one short clarifying question only when the answer materially changes the immediate action.',
  'Never invent a community contact, telephone number, opening time, apartment number, technical fact, rule or policy. If a configured field is missing, say that the contact is not available in the app and give the safe general action.',
  'Never tell a resident to perform dangerous electrical, gas, elevator, structural, fire-suppression or technical repairs. Allow only simple isolation actions that can clearly be done without entering a hazardous area.',
  'Do not determine legal liability, insurance liability, fault, ownership of a pipe, responsibility for repair costs or whether a resident is legally entitled to enter another apartment. Route those issues to the administrator, insurer or competent professional.',
  'When multiple hazards are present, prioritize the highest-risk hazard. Example: water through a light fitting is an electrical-safety issue first and a water-damage issue second.',
  "For incidents involving another private apartment, do not advise forced entry. Use the community's authorized emergency-access procedure or emergency services where justified.",
  'For crime or suspicious behavior, prioritize personal safety and evidence preservation. Do not advise confrontation, pursuit or physical intervention.',
  'For medical emergencies, do not diagnose. Tell the user to call 112 for serious or potentially serious symptoms and to follow the operator\'s instructions.',
  'For poisoning or chemical exposure, serious symptoms or immediate danger require 112. The Spanish Toxicological Information Service is +34 91 562 04 20 and operates 24/7.',
  'When damage may lead to an insurance or community claim, recommend photos/video, time, location, affected apartment(s) and a concise incident record after people are safe.',
  'Keep crisis responses short enough to scan quickly: ideally 4-8 action lines plus contact details. Offer further detail only after the immediate steps.',
  'Do not overwhelm a panicked user with every possible scenario. Surface only the steps relevant to the described incident.',
  'If official authorities issue an evacuation, weather, wildfire, flood, earthquake or tsunami instruction, their directions override the general guidance in this knowledge base.',
  'For area-wide disasters (wildfire, earthquake, major flooding, storms), you must never independently decide between sheltering in place and evacuating - that decision belongs to 112, firefighters, INFOCA, Guardia Civil/Policía or the community\'s designated crisis leadership. Reproduce their official instruction; use the guidance in this knowledge base only as a general starting framework while no official instruction has been given.',
  'During an earthquake tremor, never advise running outside or using the stairs while the ground is still shaking - advise staying inside, protecting the head and neck, moving away from windows, and getting near sturdy furniture or an interior wall. Only after the shaking has fully stopped should you advise checking for hazards (cracks, gas smell, fire, falling debris) and then evacuating via stairs to an open area away from façades if needed.',
  'For wildfire or urban-wildland fire risk, do not advise evacuation just because smoke or fire is visible in the distance - wait for an official evacuation or shelter order. If evacuation is officially ordered, advise avoiding routes toward valleys or ravines and avoiding uphill routes in the direction the fire is spreading.',
  'For flash flooding or torrential rain, advise moving to higher ground rather than automatically heading toward the main gate/Gatehouse, never entering an underground garage, and never crossing moving water on foot or by vehicle.',
  'If a resident describes being unable to safely reach the main exit (e.g. a smoke-filled stairwell), do not insist they evacuate anyway - advise sealing themselves in a room with a window or terrace, signalling from it, and calling 112 with the exact block and apartment number.',
  'For property-damage incidents, separate immediate safety from post-incident handling. Do not overload the first answer with insurance detail until the immediate situation is stable.',
  'For insurance routing, use source_status values: unknown, private_own, private_other, communal, external_or_unknown, criminal_act, contractor, not_applicable. Keep source_status=unknown until the cause is reasonably confirmed.',
  "If the user's own property is damaged, the assistant may advise notifying the user's own insurer promptly even while source/liability is unresolved.",
  'If another private apartment is confirmed as the technical source, advise informing that owner and asking them to notify their insurer. Never state that this confirmation alone establishes legal liability.',
  'If communal infrastructure/common elements are confirmed as the source, route the Community Administrator to the Community repair/insurance process while affected owners may also notify their own insurers.',
  'Reusable follow-up modules are authoritative. The LLM must not invent an insurance branch outside the modules supplied by the server.',
];

function buildSystemPrompt({ primary, attached, moduleSummaries, configText, sourceStatus, emergencyDetected }) {
  const scenarioBlocks = attached
    .map((e) => {
      const l = e.logic_json || {};
      return `[${e.intent_code}] ${e.title} (severity: ${e.urgency})\nImmediate actions (already shown to the resident verbatim - do not repeat them, just refer to them naturally): ${(l.immediate_actions || []).join(' | ')}\nDo not: ${(l.do_not || []).join(' | ')}`;
    })
    .join('\n\n');

  const moduleText = moduleSummaries
    .map((m) => `[${m.module_code}] ${m.title}: ${(m.content_json?.trigger) || ''}`)
    .join('\n');

  return `You are the Community Assistant for a residential complex in Spain. You must respond with a single valid JSON object and nothing else — no markdown, no code fences, no commentary outside the JSON.

BEHAVIOR RULES (all apply, in order of general importance):
${AI_BEHAVIOR_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${emergencyDetected ? 'NOTE: the app has detected likely emergency language in this question independently of the rules above - treat this as potentially urgent.\n' : ''}
PRIMARY SCENARIO: ${primary ? `[${primary.intent_code}] ${primary.title}` : '(no specific scenario matched - answer generally and cautiously, and say so if you cannot help)'}

ATTACHED SCENARIOS (for context; their immediate_actions/do_not are already being shown to the resident by the app - your job is to write a short connecting narrative, not to restate these lists):
${scenarioBlocks || '(none)'}

AVAILABLE FOLLOW-UP MODULES (only reference these by module_code in "modules_used" if genuinely relevant to this turn; never invent a module not listed here):
${moduleText || '(none)'}

CURRENT KNOWN source_status FOR THIS CONVERSATION: "${sourceStatus}"
Only change source_status if this message provides new, reasonably confirmed evidence about the technical cause. Otherwise return it unchanged.

COMMUNITY FACTS:
${configText}

Respond ONLY with a JSON object in exactly this shape:
{
  "answer": "string, written in the same language as the question - a short narrative connecting the situation to the actions already shown, plus anything the attached lists don't cover",
  "urgency": "yellow" | "orange" | "red",
  "call112": true | false,
  "source_status": "unknown" | "private_own" | "private_other" | "communal" | "external_or_unknown" | "criminal_act" | "contractor" | "not_applicable",
  "modules_used": ["module codes from AVAILABLE FOLLOW-UP MODULES that apply this turn"],
  "clarifying_question": "one short question, or empty string if none needed"
}`;
}

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
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.status !== 'approved') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const adminClient = auth.adminClient;

    const body = await request.json();
    const question = (body.question || '').trim();
    const clientHistory = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
    // The client's own PRIOR STATE (what our server returned last turn) -
    // treated as an untrusted hint only; every field is re-validated below
    // against real data before use.
    const clientState = body.state && typeof body.state === 'object' ? body.state : {};
    const testIntentId = auth.profile.role === 'board' ? body.testIntentId : null;

    if (!question) return Response.json({ error: 'No question provided' }, { status: 400 });
    if (question.length > MAX_QUESTION_LENGTH) return Response.json({ error: 'Question is too long' }, { status: 400 });

    if (!testIntentId) {
      const { data: allowed, error: rateLimitError } = await adminClient.rpc('check_and_increment_rate_limit', {
        p_user_id: auth.user.id,
        p_endpoint: 'ask-ai',
        p_limit: DAILY_LIMIT,
      });
      if (rateLimitError) {
        console.error('ask-ai rate limit check failed:', rateLimitError);
        return Response.json({ error: 'The Community Assistant is temporarily unavailable. Please try again later.' }, { status: 503 });
      }
      if (!allowed) return Response.json({ error: 'Daily question limit reached. Please try again tomorrow.' }, { status: 429 });
    }

    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI assistant is not configured yet' }, { status: 500 });

    const emergencyDetected = detectEmergency(question);

    const [{ data: allEntries }, { data: contacts }, { data: config }, { data: allModules }] = await Promise.all([
      adminClient.from('ai_knowledge_base').select('id, intent_code, title, category, urgency, keywords, logic_json').eq('active', true),
      adminClient.from('contacts').select('role_label, name, phone, email'),
      adminClient.from('community_config').select('key, value'),
      adminClient.from('ai_response_modules').select('module_code, title, content_json').eq('active', true),
    ]);

    if (!allEntries || allEntries.length === 0) return Response.json({ noKnowledge: true });

    let primary = null;
    let attached = [];
    let fallbackUsed = false;

    if (testIntentId) {
      const single = allEntries.find((e) => e.id === testIntentId);
      if (single) {
        primary = single;
        attached = [single];
      }
    } else {
      // Retrieval scores against intent_tags + tokenized example_user_queries
      // for richer multilingual matching.
      const entriesForRetrieval = allEntries.map((e) => ({ ...e, keywords: keywordPoolForEntry(e) }));
      const retrieval = retrieveRelevantEntries(entriesForRetrieval, question);
      fallbackUsed = retrieval.fallbackUsed;

      const priorPrimaryCode = typeof clientState.primaryIntent === 'string' ? clientState.primaryIntent : null;
      const priorRelatedCodes = Array.isArray(clientState.relatedIntents) ? clientState.relatedIntents : [];

      const selection = selectAttachedEntries(allEntries, retrieval.entries, fallbackUsed, priorPrimaryCode, priorRelatedCodes);
      primary = selection.primary;
      attached = selection.attached;
    }

    const priorSourceStatus = ALLOWED_SOURCE_STATUS.includes(clientState.sourceStatus) ? clientState.sourceStatus : 'unknown';

    const configText = (config || [])
      .filter((c) => c.value && c.value !== '[TO FILL IN]')
      .map((c) => `- ${c.key}: ${c.value}`)
      .join('\n') || '(no community facts configured yet)';

    // Candidate modules for this turn: whatever the attached scenarios
    // themselves reference via followup_modules.
    const candidateModuleCodes = new Set(attached.flatMap((e) => e.logic_json?.followup_modules || []));
    const candidateModules = (allModules || []).filter((m) => candidateModuleCodes.has(m.module_code));

    const systemPrompt = buildSystemPrompt({
      primary,
      attached,
      moduleSummaries: candidateModules,
      configText,
      sourceStatus: priorSourceStatus,
      emergencyDetected,
    });

    const historyQuestions = clientHistory
      .map((h) => (h && typeof h.question === 'string' ? h.question.trim().slice(0, MAX_QUESTION_LENGTH) : null))
      .filter(Boolean);
    const userContent = historyQuestions.length > 0
      ? `${historyQuestions.map((q) => `Previous question: ${q}`).join('\n')}\nFollow-up question: ${question}`
      : question;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const attachedCodes = attached.map((e) => e.intent_code || e.id);

    if (!res.ok) {
      const errText = await res.text();
      console.error('ask-ai Anthropic request failed:', errText);
      if (!testIntentId) {
        await logAiQuery(adminClient, {
          user_id: auth.user.id,
          matched_sources: attachedCodes,
          emergency_detected: emergencyDetected,
          fallback_used: fallbackUsed,
          had_error: true,
          latency_ms: Date.now() - requestStartedAt,
        });
      }
      return Response.json({ error: 'The Community Assistant is temporarily unavailable. Please try again later.', emergencyDetected, call112: emergencyDetected }, { status: 500 });
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || '';
    const parsed = safeParseJson(rawText);
    const usage = data.usage || {};

    // Deterministic, server-owned response content - never LLM-authored.
    const primaryLogic = primary?.logic_json || {};
    const immediateActions = resolvePlaceholdersInArray(primaryLogic.immediate_actions, contacts, config);
    const doNot = resolvePlaceholdersInArray(primaryLogic.do_not, contacts, config);
    const contactRoute = resolvePlaceholdersInArray(primaryLogic.contact_route, contacts, config);
    const documentation = primaryLogic.documentation || [];
    const followUp = resolvePlaceholdersInArray(primaryLogic.follow_up, contacts, config);

    if (!parsed || typeof parsed.answer !== 'string') {
      console.error('ask-ai: could not parse structured AI response:', rawText);
      const logId = testIntentId ? null : await logAiQuery(adminClient, {
        user_id: auth.user.id,
        matched_sources: attachedCodes,
        emergency_detected: emergencyDetected,
        fallback_used: fallbackUsed,
        parse_error: true,
        latency_ms: Date.now() - requestStartedAt,
        input_tokens: usage.input_tokens || null,
        output_tokens: usage.output_tokens || null,
      });
      return Response.json({
        urgency: clampUrgency(primary?.urgency, emergencyDetected ? 'red' : 'yellow'),
        answer: rawText || 'The Community Assistant could not generate a clear answer. Please contact the Board directly.',
        immediateActions, doNot, contactRoute, documentation, followUp,
        primaryIntent: primary?.intent_code || null,
        relatedIntents: computeRelatedIntents(primary, attached),
        sourceStatus: priorSourceStatus,
        modulesUsed: [],
        call112: emergencyDetected,
        sources: attachedCodes,
        emergencyDetected,
        parseError: true,
        logId,
      });
    }

    const validatedSourceStatus = ALLOWED_SOURCE_STATUS.includes(parsed.source_status) ? parsed.source_status : priorSourceStatus;
    const branchedModuleCodes = applyDeterministicBranching(primary, validatedSourceStatus);
    const requestedModuleCodes = [...(Array.isArray(parsed.modules_used) ? parsed.modules_used : []), ...branchedModuleCodes];
    const modulesUsed = resolveModules(requestedModuleCodes, candidateModules);
    const validatedUrgency = clampUrgency(primary?.urgency, emergencyDetected ? 'red' : 'yellow');
    const validatedSources = validateSources(attachedCodes, attached);

    const logId = testIntentId ? null : await logAiQuery(adminClient, {
      user_id: auth.user.id,
      matched_sources: attachedCodes,
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
      immediateActions,
      doNot,
      contactRoute,
      documentation,
      followUp,
      primaryIntent: primary?.intent_code || null,
      relatedIntents: computeRelatedIntents(primary, attached),
      sourceStatus: validatedSourceStatus,
      modulesUsed,
      call112: Boolean(parsed.call112) || emergencyDetected,
      clarifyingQuestion: typeof parsed.clarifying_question === 'string' ? parsed.clarifying_question : '',
      sources: validatedSources,
      emergencyDetected,
      logId,
    });
  } catch (error) {
    console.error('ask-ai unexpected error:', error);
    return Response.json({ error: 'The Community Assistant is temporarily unavailable. Please try again later.' }, { status: 500 });
  }
}
