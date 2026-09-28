// Memoria — čítanie zápisnice (spoločná logika pre API a obrazovku; bez závislostí, testovateľné).
//
// AI dostane zápisnicu a krátky zoznam toho, čo už v Memorii je (otvorené úlohy, dodávatelia,
// otvorené zákazky, platné zmluvy), každú položku pod skratkou (T1, S1, Z1, C1). Vráti návrh:
// body programu, rozhodnutia, nové úlohy a zmeny stavu existujúcich úloh. Skratky sa tu
// prevedú späť na skutočné záznamy. Nič sa neukladá – o uložení rozhoduje board.

export const EXECUTOR_ROLES = ['administrator', 'president', 'vice_president', 'board_member', 'site_manager', 'supplier', 'other'];
export const TASK_STATUSES = ['not_started', 'in_progress', 'done', 'blocked', 'cancelled'];
export const MEETING_BODIES = ['board', 'general_ordinary', 'general_extraordinary'];
export const ITEM_TYPES = ['information', 'decision', 'review'];

export const MAX_TEXT_CHARS = 150000;

const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD' };
const REFS = (prefix, what) => ({ type: 'array', items: { type: 'string' }, description: `References (${prefix}1, ${prefix}2 …) of existing ${what} from the Memoria list that this point is clearly about. Empty if none.` });

export const MINUTES_TOOL = {
  name: 'record_minutes',
  description: 'Record what the minutes say: the meeting, each agenda point, each decision, each action with its deadline, and progress reported on existing tasks. Use null for anything not stated. Never invent.',
  input_schema: {
    type: 'object',
    properties: {
      is_minutes: { type: 'boolean', description: 'False if the document is not the minutes (acta) of a meeting.' },
      meeting: {
        type: 'object',
        properties: {
          title: { type: ['string', 'null'], description: 'Short title, e.g. "Board meeting 30 September 2026".' },
          body: { type: 'string', enum: MEETING_BODIES, description: 'board = Junta Directiva; general_ordinary / general_extraordinary = Junta General de Propietarios.' },
          meeting_on: DATE,
          meeting_time: { type: ['string', 'null'], description: 'HH:MM start time.' },
          location: { type: ['string', 'null'], description: 'Place, or "Microsoft Teams" / "online".' },
          convened_by: { type: ['string', 'null'] },
          attendees: { type: ['string', 'null'], description: 'Present (and absent / represented) as written, one line.' },
          quorum_reached: { type: ['boolean', 'null'] },
          next_meeting_on: DATE,
        },
        required: ['body', 'meeting_on'],
      },
      items: {
        type: 'array',
        description: 'Every agenda point in order, including approval of previous minutes and any other business.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Agenda point title, output language.' },
            item_type: { type: 'string', enum: ITEM_TYPES, description: 'decision if something was decided/approved/rejected; review if progress of earlier matters was reviewed; information otherwise.' },
            summary: { type: ['string', 'null'], description: 'Neutral 1–3 sentence summary of the discussion. No names of owners; roles are fine.' },
            outcome: { type: ['string', 'null'], description: 'What was agreed, as it would be recorded in the minutes.' },
            decision: {
              type: ['object', 'null'],
              description: 'Only if a formal decision was taken on this point.',
              properties: {
                title: { type: 'string', description: 'Short title of the decision.' },
                decision: { type: 'string', description: 'The decision in one or two sentences.' },
                rationale: { type: ['string', 'null'], description: 'Why, only if the minutes give reasons.' },
                votes_for: { type: ['integer', 'null'] },
                votes_against: { type: ['integer', 'null'] },
                votes_abstain: { type: ['integer', 'null'] },
                unanimous: { type: ['boolean', 'null'] },
              },
              required: ['title', 'decision'],
            },
            supplier_refs: REFS('S', 'suppliers'),
            tender_refs: REFS('Z', 'tenders'),
            contract_refs: REFS('C', 'contracts'),
            page: { type: ['integer', 'null'], description: 'Page of the document where this point starts, if known.' },
          },
          required: ['title', 'item_type'],
        },
      },
      actions: {
        type: 'array',
        description: 'Every NEW action someone must carry out, with its deadline. One entry per action.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The action, imperative, output language, e.g. "Request three quotes for the gate repair".' },
            description: { type: ['string', 'null'] },
            item_index: { type: ['integer', 'null'], description: '0-based index in items of the point this action comes from.' },
            executor_role: { type: 'string', enum: EXECUTOR_ROLES, description: 'Who must do it. Resolutions are executed by the administrator unless the minutes say otherwise.' },
            executor_name: { type: ['string', 'null'], description: 'Person or company as written.' },
            supervisor_name: { type: ['string', 'null'], description: 'Board member who follows it up, if stated.' },
            due_date: { ...DATE, description: 'Deadline YYYY-MM-DD. If the minutes give a relative or vague deadline (e.g. "within two weeks", "before the end of October"), compute the date from the meeting date and put the original words in due_text.' },
            due_text: { type: ['string', 'null'], description: 'The deadline exactly as written, when it is not a plain date.' },
            priority: { type: 'string', enum: ['normal', 'high'] },
            tender_ref: { type: ['string', 'null'], description: 'Z-reference if the action belongs to an existing tender.' },
            contract_ref: { type: ['string', 'null'], description: 'C-reference if the action belongs to an existing contract.' },
          },
          required: ['title', 'executor_role', 'priority'],
        },
      },
      task_updates: {
        type: 'array',
        description: 'Progress the minutes report on EXISTING tasks from the Memoria list (T-references). Only when clearly the same task.',
        items: {
          type: 'object',
          properties: {
            task_ref: { type: 'string' },
            new_status: { type: ['string', 'null'], enum: [...TASK_STATUSES, null], description: 'Only if the minutes clearly state it (done, blocked, cancelled, in progress).' },
            note: { type: 'string', description: 'What the minutes say about it, one sentence, output language.' },
          },
          required: ['task_ref', 'note'],
        },
      },
      uncertain: { type: 'array', items: { type: 'string' }, description: 'Short notes on anything unclear, contradictory or computed (e.g. a deadline you calculated), output language.' },
    },
    required: ['is_minutes', 'meeting', 'items', 'actions', 'task_updates', 'uncertain'],
  },
};

// Zoznam existujúcich záznamov pre AI (iba názvy a termíny, žiadne osobné údaje vlastníkov).
export function buildContext({ tasks = [], suppliers = [], tenders = [], contracts = [] } = {}) {
  const refs = {};
  const lines = [];
  const add = (prefix, list, label, fmt) => {
    if (!list.length) return;
    lines.push(`${label}:`);
    list.forEach((row, i) => {
      const ref = `${prefix}${i + 1}`;
      refs[ref] = row.id;
      lines.push(`${ref} ${fmt(row)}`);
    });
  };
  add('T', tasks, 'Open tasks', (t) => `${t.title}${t.due_date ? ` (due ${t.due_date})` : ''} [${t.status}]`);
  add('S', suppliers, 'Suppliers', (s) => s.name);
  add('Z', tenders, 'Open tenders', (z) => z.title);
  add('C', contracts, 'Active contracts', (c) => `${c.subject}${c.ends_on ? ` (ends ${c.ends_on})` : ''}`);
  return { text: lines.join('\n'), refs };
}

function mapRefs(list, refs, prefix) {
  return [...new Set((list || []).filter((r) => typeof r === 'string' && r.startsWith(prefix) && refs[r]).map((r) => refs[r]))];
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

// Prevedie odpoveď AI na čistý návrh so skutočnými id a bezpečnými hodnotami.
export function normalizeProposal(data, refs = {}) {
  const d = data || {};
  const m = d.meeting || {};
  const items = (Array.isArray(d.items) ? d.items : []).map((it) => {
    const dec = it.decision && str(it.decision.decision) ? it.decision : null;
    return {
      title: str(it.title) || '—',
      item_type: ITEM_TYPES.includes(it.item_type) ? it.item_type : dec ? 'decision' : 'information',
      summary: str(it.summary),
      outcome: str(it.outcome),
      decision: dec
        ? {
            title: str(dec.title) || str(it.title) || '—',
            decision: str(dec.decision),
            rationale: str(dec.rationale),
            votes_for: int(dec.votes_for),
            votes_against: int(dec.votes_against),
            votes_abstain: int(dec.votes_abstain),
            unanimous: dec.unanimous === true,
          }
        : null,
      supplier_ids: mapRefs(it.supplier_refs, refs, 'S'),
      tender_ids: mapRefs(it.tender_refs, refs, 'Z'),
      contract_ids: mapRefs(it.contract_refs, refs, 'C'),
      page: int(it.page),
    };
  });
  const actions = (Array.isArray(d.actions) ? d.actions : [])
    .filter((a) => str(a.title))
    .map((a) => ({
      title: str(a.title),
      description: str(a.description),
      item_index: int(a.item_index) !== null && a.item_index < items.length ? a.item_index : null,
      executor_role: EXECUTOR_ROLES.includes(a.executor_role) ? a.executor_role : 'administrator',
      executor_name: str(a.executor_name),
      supervisor_name: str(a.supervisor_name),
      due_date: isDate(a.due_date) ? a.due_date : null,
      due_text: str(a.due_text),
      priority: a.priority === 'high' ? 'high' : 'normal',
      tender_id: (typeof a.tender_ref === 'string' && refs[a.tender_ref] && a.tender_ref.startsWith('Z')) ? refs[a.tender_ref] : null,
      contract_id: (typeof a.contract_ref === 'string' && refs[a.contract_ref] && a.contract_ref.startsWith('C')) ? refs[a.contract_ref] : null,
    }));
  const seen = new Set();
  const task_updates = (Array.isArray(d.task_updates) ? d.task_updates : [])
    .filter((u) => typeof u.task_ref === 'string' && u.task_ref.startsWith('T') && refs[u.task_ref] && !seen.has(u.task_ref) && seen.add(u.task_ref))
    .map((u) => ({
      task_id: refs[u.task_ref],
      new_status: TASK_STATUSES.includes(u.new_status) ? u.new_status : null,
      note: str(u.note) || '—',
    }));
  return {
    is_minutes: d.is_minutes !== false,
    meeting: {
      title: str(m.title),
      body: MEETING_BODIES.includes(m.body) ? m.body : 'board',
      meeting_on: isDate(m.meeting_on) ? m.meeting_on : null,
      meeting_time: typeof m.meeting_time === 'string' && /^\d{1,2}:\d{2}$/.test(m.meeting_time.trim()) ? m.meeting_time.trim().padStart(5, '0') : null,
      location: str(m.location),
      convened_by: str(m.convened_by),
      attendees: str(m.attendees),
      quorum_reached: typeof m.quorum_reached === 'boolean' ? m.quorum_reached : null,
      next_meeting_on: isDate(m.next_meeting_on) ? m.next_meeting_on : null,
    },
    items,
    actions,
    task_updates,
    uncertain: (Array.isArray(d.uncertain) ? d.uncertain : []).map(str).filter(Boolean),
  };
}

// Existujúce zasadnutie, ktoré zápisnica popisuje (rovnaký deň a orgán; inak rovnaký deň).
export function matchMeeting(meetings, meeting) {
  if (!meeting?.meeting_on) return null;
  const sameDay = (meetings || []).filter((x) => x.meeting_on === meeting.meeting_on);
  return sameDay.find((x) => x.body === meeting.body) || sameDay[0] || null;
}

// Údaje pre uloženie (vstup funkcie memoria_import_minutes) z návrhu, ktorý board skontroloval.
export function buildImportPayload({ meetingId, meeting, items, actions, taskUpdates, document, isDemo, contextNote }) {
  const chosenItems = items.filter((it) => it.selected);
  const indexMap = new Map();
  items.forEach((it, i) => {
    if (it.selected) indexMap.set(i, indexMap.size);
  });
  const links = (it) => [
    ...it.supplier_ids.map((id) => ({ entity_type: 'supplier', entity_id: id })),
    ...it.tender_ids.map((id) => ({ entity_type: 'tender', entity_id: id })),
    ...it.contract_ids.map((id) => ({ entity_type: 'contract', entity_id: id })),
  ];
  return {
    meeting_id: meetingId || null,
    meeting: {
      title: meeting.title,
      body: meeting.body,
      meeting_on: meeting.meeting_on,
      meeting_time: meeting.meeting_time,
      location: meeting.location,
      convened_by: meeting.convened_by,
      attendees: meeting.attendees,
      quorum_reached: meeting.quorum_reached,
    },
    is_demo: Boolean(isDemo),
    items: chosenItems.map((it) => ({
      title: it.title,
      item_type: it.item_type,
      outcome: it.outcome,
      decision:
        it.makeDecision && it.decision?.decision
          ? {
              ...it.decision,
              context: [contextNote, it.page ? `p. ${it.page}` : null, it.summary].filter(Boolean).join(' · ') || null,
            }
          : null,
      links: it.makeDecision ? links(it) : [],
    })),
    tasks: actions
      .filter((a) => a.selected)
      .map((a) => ({
        ...a,
        selected: undefined,
        due_text: undefined,
        item_index: a.item_index !== null && indexMap.has(a.item_index) && items[a.item_index].makeDecision ? indexMap.get(a.item_index) : null,
        description: [a.description, a.due_text ? `(${a.due_text})` : null].filter(Boolean).join(' ') || null,
      })),
    task_updates: taskUpdates.filter((u) => u.selected).map(({ task_id, new_status, note }) => ({ task_id, new_status, note })),
    document: document || null,
  };
}
