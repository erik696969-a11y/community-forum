import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildContext, normalizeProposal, matchMeeting, buildImportPayload, MINUTES_TOOL } from '../memoriaMinutes';
import { docxToText, documentXmlToText } from '../docxText';

const ctx = buildContext({
  tasks: [{ id: 't-1', title: 'Obtain the 3rd camera quote', due_date: '2026-09-20', status: 'in_progress' }],
  suppliers: [{ id: 's-1', name: 'Piscinas Mediterráneo S.L.' }],
  tenders: [{ id: 'z-1', title: 'Garage cameras' }],
  contracts: [{ id: 'c-1', subject: 'Gardening', ends_on: '2026-12-31' }],
});

describe('buildContext', () => {
  it('gives each record a short reference and keeps the mapping', () => {
    expect(ctx.text).toContain('T1 Obtain the 3rd camera quote (due 2026-09-20) [in_progress]');
    expect(ctx.text).toContain('S1 Piscinas Mediterráneo S.L.');
    expect(ctx.refs).toEqual({ T1: 't-1', S1: 's-1', Z1: 'z-1', C1: 'c-1' });
  });
});

describe('normalizeProposal', () => {
  const raw = {
    is_minutes: true,
    meeting: { title: 'Board meeting', body: 'board', meeting_on: '2026-09-30', meeting_time: '9:30', quorum_reached: true, next_meeting_on: '2026-10-28' },
    items: [
      { title: 'Approval of previous minutes', item_type: 'decision', outcome: 'Approved', decision: null },
      {
        title: 'Pool 3 pump',
        item_type: 'decision',
        decision: { title: 'Ratify pump repair', decision: 'Ratified', votes_for: 5, votes_against: -1, unanimous: true },
        supplier_refs: ['S1', 'S9', 'T1'],
        tender_refs: ['Z1'],
      },
      { title: 'Cameras', item_type: 'weird' },
    ],
    actions: [
      { title: 'Pay the invoice', item_index: 1, executor_role: 'administrator', due_date: '2026-10-15', priority: 'high', tender_ref: 'C1' },
      { title: 'Chase quote', item_index: 7, executor_role: 'wizard', due_date: 'end of October', due_text: 'before end of October', contract_ref: 'C1' },
      { title: '  ' },
    ],
    task_updates: [
      { task_ref: 'T1', new_status: 'done', note: 'Received' },
      { task_ref: 'T1', new_status: 'blocked', note: 'dup' },
      { task_ref: 'T7', new_status: 'done', note: 'unknown' },
      { task_ref: 'S1', new_status: 'done', note: 'wrong kind' },
    ],
    uncertain: ['Deadline computed', ''],
  };
  const p = normalizeProposal(raw, ctx.refs);

  it('maps references back to real records and drops unknown or wrong-kind ones', () => {
    expect(p.items[1].supplier_ids).toEqual(['s-1']);
    expect(p.items[1].tender_ids).toEqual(['z-1']);
    expect(p.actions[0].tender_id).toBeNull(); // C1 is not a tender
    expect(p.actions[1].contract_id).toBe('c-1');
    expect(p.task_updates).toEqual([{ task_id: 't-1', new_status: 'done', note: 'Received' }]);
  });

  it('keeps only safe values', () => {
    expect(p.meeting.meeting_time).toBe('09:30');
    expect(p.items[1].decision.votes_against).toBeNull();
    expect(p.items[2].item_type).toBe('information');
    expect(p.actions).toHaveLength(2);
    expect(p.actions[1].executor_role).toBe('administrator');
    expect(p.actions[1].item_index).toBeNull();
    expect(p.actions[1].due_date).toBeNull();
    expect(p.actions[1].due_text).toBe('before end of October');
    expect(p.uncertain).toEqual(['Deadline computed']);
  });

  it('flags a document that is not minutes', () => {
    expect(normalizeProposal({ is_minutes: false }).is_minutes).toBe(false);
  });
});

describe('matchMeeting', () => {
  const meetings = [
    { id: 'a', meeting_on: '2026-09-30', body: 'general_ordinary' },
    { id: 'b', meeting_on: '2026-09-30', body: 'board' },
  ];
  it('prefers the same day and body', () => {
    expect(matchMeeting(meetings, { meeting_on: '2026-09-30', body: 'board' }).id).toBe('b');
    expect(matchMeeting(meetings, { meeting_on: '2026-10-01', body: 'board' })).toBeNull();
  });
});

describe('buildImportPayload', () => {
  const items = [
    { selected: true, title: 'Minutes', item_type: 'decision', outcome: 'Approved', decision: null, makeDecision: false, supplier_ids: [], tender_ids: [], contract_ids: [] },
    { selected: false, title: 'Dropped', item_type: 'information', decision: null, makeDecision: false, supplier_ids: [], tender_ids: [], contract_ids: [] },
    {
      selected: true, title: 'Pump', item_type: 'decision', outcome: 'Ratified', summary: 'Urgent repair', page: 2,
      decision: { title: 'Ratify', decision: 'Ratified', votes_for: 5 }, makeDecision: true,
      supplier_ids: ['s-1'], tender_ids: [], contract_ids: ['c-1'],
    },
  ];
  const actions = [
    { selected: true, title: 'Pay', item_index: 2, executor_role: 'administrator', due_date: '2026-10-15', due_text: 'within 2 weeks', description: null, priority: 'normal' },
    { selected: true, title: 'Other', item_index: 0, executor_role: 'president', due_date: null, due_text: null, description: 'x', priority: 'normal' },
    { selected: false, title: 'Skip', item_index: null, executor_role: 'other' },
  ];
  const payload = buildImportPayload({
    meetingId: 'm-1', meeting: { meeting_on: '2026-09-30', body: 'board' }, items, actions,
    taskUpdates: [{ selected: true, task_id: 't-1', new_status: 'done', note: 'ok' }, { selected: false, task_id: 't-2', note: 'no' }],
    document: { title: 'acta.pdf', storage_path: 'inbox/x/acta.pdf' }, isDemo: true, contextNote: 'Minutes: Board (30/09/2026)',
  });

  it('saves only ticked items and links tasks to the right decision', () => {
    expect(payload.items.map((i) => i.title)).toEqual(['Minutes', 'Pump']);
    expect(payload.items[1].decision.context).toBe('Minutes: Board (30/09/2026) · p. 2 · Urgent repair');
    expect(payload.items[1].links).toEqual([{ entity_type: 'supplier', entity_id: 's-1' }, { entity_type: 'contract', entity_id: 'c-1' }]);
    expect(payload.items[0].decision).toBeNull();
    expect(payload.tasks).toHaveLength(2);
    expect(payload.tasks[0].item_index).toBe(1); // position among saved items
    expect(payload.tasks[1].item_index).toBeNull(); // point 0 has no decision
    expect(payload.tasks[0].description).toBe('(within 2 weeks)');
    expect(payload.task_updates).toEqual([{ task_id: 't-1', new_status: 'done', note: 'ok' }]);
    expect(payload.is_demo).toBe(true);
  });
});

describe('MINUTES_TOOL', () => {
  it('requires the parts the review screen needs', () => {
    expect(MINUTES_TOOL.input_schema.required).toEqual(expect.arrayContaining(['meeting', 'items', 'actions', 'task_updates']));
  });
});

describe('docx text', () => {
  const xml =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>MINUTES &amp; RESOLUTIONS</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Point 1: </w:t></w:r><w:r><w:tab/><w:t>Approved</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Action</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Due</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>Pay invoice</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15/10/2026</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>';

  it('keeps paragraphs and table rows readable', () => {
    expect(documentXmlToText(xml)).toBe('MINUTES & RESOLUTIONS\nPoint 1: Approved\nAction | Due\nPay invoice | 15/10/2026');
  });

  it('reads a real .docx package', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', xml);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    expect(await docxToText(buf)).toContain('Pay invoice | 15/10/2026');
  });
});
