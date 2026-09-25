'use client';

// Zasadnutia Junta Directiva a Junta General: plánovanie, návrh programu
// z otvorených vecí, kontrola lehôt podľa stanov (čl. XX, XXII.5) a zákona
// (LPH čl. 19), zápis výsledku bodov a tlač pozvánky / zápisnice.
// Memoria navrhuje body programu, o programe rozhoduje board.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import {
  mt, cleanFormValues, todayIso, addDaysIso, daysBetween, formatMoney,
  MEETING_BODIES, MEETING_STATUSES, AGENDA_ITEM_TYPES, INVITATION_LEAD_DAYS, OPEN_TASK_STATUSES,
} from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';
import { noticeDeadline } from './ContractsPanel';

const EMPTY_FORM = {
  title: '',
  body: 'board',
  meeting_on: '',
  meeting_time: '',
  location: '',
  convened_by: '',
  invitation_sent_on: '',
  status: 'planned',
  attendees: '',
  quorum_reached: '',
  minutes_closed_on: '',
  notes: '',
};
const STATUS_TONE = { planned: 'harbor', held: 'green', cancelled: 'neutral' };

function toForm(m) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = m[key];
    if (key === 'quorum_reached') form[key] = v === null || v === undefined ? '' : v ? 'yes' : 'no';
    else form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

// Kontroly lehôt pre jedno zasadnutie (iba fakty; nič nerozhoduje).
export function meetingChecks(m, lang) {
  const out = [];
  if (m.status === 'cancelled') return out;
  const req = INVITATION_LEAD_DAYS[m.body] || 8;
  const invitationBy = addDaysIso(m.meeting_on, -req);
  if (m.invitation_sent_on) {
    const n = daysBetween(m.invitation_sent_on, m.meeting_on);
    out.push(
      n >= req
        ? { tone: 'green', key: 'invitation', text: mt(lang, 'checkInvitationOk', { n, req }) }
        : { tone: 'red', key: 'invitation', text: mt(lang, 'checkInvitationLate', { n, req }) }
    );
  } else if (m.status === 'planned') {
    out.push(
      invitationBy < todayIso()
        ? { tone: 'red', key: 'invitation', date: invitationBy, text: mt(lang, 'checkInvitationMissed', { date: formatDate(invitationBy, lang) }) }
        : { tone: 'ochre', key: 'invitation', date: invitationBy, text: mt(lang, 'checkInvitationDue', { date: formatDate(invitationBy, lang), req }) }
    );
  }
  if (m.body !== 'board' && m.status === 'held') {
    const minutesBy = addDaysIso(m.meeting_on, 10);
    if (m.minutes_closed_on) {
      out.push(
        m.minutes_closed_on <= minutesBy
          ? { tone: 'green', key: 'minutes', text: mt(lang, 'checkMinutesOk') }
          : { tone: 'red', key: 'minutes', text: mt(lang, 'checkMinutesLate') }
      );
    } else {
      out.push({
        tone: minutesBy < todayIso() ? 'red' : 'ochre',
        key: 'minutes',
        date: minutesBy,
        text: mt(lang, 'checkMinutesDue', { date: formatDate(minutesBy, lang) }),
      });
    }
  }
  return out;
}

export default function MeetingsPanel({ lang, onChanged }) {
  const [meetings, setMeetings] = useState([]);
  const [items, setItems] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [newItem, setNewItem] = useState({}); // meetingId -> {title, item_type}
  const [outcomeDraft, setOutcomeDraft] = useState({}); // itemId -> text
  const [suggestions, setSuggestions] = useState({}); // meetingId -> [{key,title,source_type,source_id,item_type,checked}]
  const [printing, setPrinting] = useState(null); // {meeting, mode}

  async function load() {
    const { data, error } = await supabase.from('memoria_meetings').select('*').order('meeting_on', { ascending: false });
    setLoadError(error ? error.message : '');
    setMeetings(data || []);
    setLoadingData(false);
  }

  async function loadItems(meetingId) {
    const { data } = await supabase
      .from('memoria_meeting_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setItems((p) => ({ ...p, [meetingId]: data || [] }));
    return data || [];
  }

  useEffect(() => {
    load();
  }, []);

  // Najbližšie plánované zasadnutie otvorené automaticky.
  const nextPlannedId = useMemo(() => {
    const planned = meetings.filter((m) => m.status === 'planned').sort((a, b) => (a.meeting_on < b.meeting_on ? -1 : 1));
    return planned[0]?.id || null;
  }, [meetings]);

  useEffect(() => {
    if (nextPlannedId && expanded[nextPlannedId] === undefined) {
      setExpanded((p) => ({ ...p, [nextPlannedId]: true }));
      loadItems(nextPlannedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPlannedId]);

  const sorted = useMemo(() => {
    // Plánované (najbližšie hore), potom konané od najnovších.
    const planned = meetings.filter((m) => m.status === 'planned').sort((a, b) => (a.meeting_on < b.meeting_on ? -1 : 1));
    const rest = meetings.filter((m) => m.status !== 'planned');
    return [...planned, ...rest];
  }, [meetings]);

  function openNew() {
    setForm({ ...EMPTY_FORM, meeting_on: addDaysIso(todayIso(), 14) });
    setFormError('');
    setEditingId('new');
  }

  function openEdit(m) {
    setForm(toForm(m));
    setFormError('');
    setEditingId(m.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError('');
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const values = cleanFormValues(form);
    if (!values.title || !values.meeting_on) {
      setFormError(`${mt(lang, 'title')}, ${mt(lang, 'meetingOn')}: ${mt(lang, 'required')}`);
      return;
    }
    values.quorum_reached = form.quorum_reached === '' ? null : form.quorum_reached === 'yes';
    setSaving(true);
    setFormError('');
    const res =
      editingId === 'new'
        ? await supabase.from('memoria_meetings').insert(values).select('id').single()
        : await supabase.from('memoria_meetings').update(values).eq('id', editingId);
    setSaving(false);
    if (res.error) {
      setFormError(mt(lang, 'saveError', { error: res.error.message }));
      return;
    }
    const newId = editingId === 'new' ? res.data?.id : null;
    closeForm();
    await load();
    if (newId) {
      setExpanded((p) => ({ ...p, [newId]: true }));
      await loadItems(newId);
    }
    onChanged?.();
  }

  async function handleDelete(m) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: m.title }))) return;
    const { error } = await supabase.from('memoria_meetings').delete().eq('id', m.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('meeting', m.id);
    await load();
    onChanged?.();
  }

  function toggle(m) {
    const next = !expanded[m.id];
    setExpanded((p) => ({ ...p, [m.id]: next }));
    if (next) loadItems(m.id);
  }

  // ---------- Program ----------
  async function addItem(m) {
    const draft = newItem[m.id] || {};
    const title = (draft.title || '').trim();
    if (!title) return;
    const list = items[m.id] || [];
    const { error } = await supabase.from('memoria_meeting_items').insert({
      meeting_id: m.id,
      position: list.length ? Math.max(...list.map((i) => i.position)) + 1 : 1,
      title,
      item_type: draft.item_type || 'decision',
      source_type: 'manual',
      is_demo: m.is_demo,
    });
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    setNewItem((p) => ({ ...p, [m.id]: { title: '', item_type: 'decision' } }));
    await loadItems(m.id);
  }

  async function moveItem(m, index, dir) {
    const list = [...(items[m.id] || [])];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    await Promise.all(list.map((it, idx) => (it.position !== idx + 1 ? supabase.from('memoria_meeting_items').update({ position: idx + 1 }).eq('id', it.id) : null)));
    await loadItems(m.id);
  }

  async function deleteItem(m, it) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: it.title }))) return;
    await supabase.from('memoria_meeting_items').delete().eq('id', it.id);
    await loadItems(m.id);
  }

  async function saveOutcome(m, it) {
    const outcome = (outcomeDraft[it.id] ?? it.outcome ?? '').trim();
    const { error } = await supabase.from('memoria_meeting_items').update({ outcome: outcome || null }).eq('id', it.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await loadItems(m.id);
  }

  async function recordDecision(m, it) {
    const outcome = (outcomeDraft[it.id] ?? it.outcome ?? '').trim();
    if (!outcome) {
      window.alert(mt(lang, 'outcomeRequired'));
      return;
    }
    const isBoard = m.body === 'board';
    const { data: dec, error } = await supabase
      .from('memoria_decisions')
      .insert({
        title: it.title,
        decided_on: m.meeting_on,
        body: isBoard ? 'board' : 'general_meeting',
        authority_basis: isBoard ? 'Estatutos art. XXII' : 'Estatutos art. XX–XXI; LPH art. 17',
        context: `${m.title} (${formatDate(m.meeting_on, lang)})`,
        decision: outcome,
        status: 'active',
        is_demo: m.is_demo,
      })
      .select('id')
      .single();
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await supabase.from('memoria_meeting_items').update({ outcome, decision_id: dec.id }).eq('id', it.id);
    if (window.confirm(mt(lang, 'createFollowUpTask'))) {
      await supabase.from('memoria_tasks').insert({
        title: it.title,
        description: outcome,
        decision_id: dec.id,
        executor_role: 'administrator',
        due_date: addDaysIso(m.meeting_on, 30),
        is_demo: m.is_demo,
      });
    }
    await loadItems(m.id);
    onChanged?.();
  }

  // Návrh programu z otvorených vecí v Memorii (iba zoznam; vyberá board).
  async function suggest(m) {
    const today = todayIso();
    const soon = addDaysIso(m.meeting_on, 60);
    const [tRes, cRes, oRes, iRes, tdRes] = await Promise.all([
      supabase.from('memoria_tasks').select('id, title, due_date, status').in('status', OPEN_TASK_STATUSES),
      supabase.from('memoria_contracts').select('id, subject, ends_on, auto_renew, notice_period_days, status').eq('status', 'active'),
      supabase.from('memoria_obligations').select('id, title, next_due_on, active').eq('active', true).lte('next_due_on', soon),
      supabase.from('memoria_invoices').select('id, invoice_number, description, total_amount, currency, is_urgent_unbudgeted, ratified_by_decision_id').eq('is_urgent_unbudgeted', true).is('ratified_by_decision_id', null),
      supabase.from('memoria_tenders').select('id, title, status').eq('status', 'collecting'),
    ]);
    const existing = new Set((items[m.id] || []).map((i) => `${i.source_type}:${i.source_id}`));
    const list = [];
    const push = (source_type, source_id, title, item_type = 'decision') => {
      if (existing.has(`${source_type}:${source_id}`)) return;
      list.push({ key: `${source_type}:${source_id}`, source_type, source_id, title, item_type, checked: true });
    };
    for (const inv of iRes.data || []) {
      const name = [inv.invoice_number, inv.description, formatMoney(inv.total_amount, inv.currency, lang)].filter(Boolean).join(' · ');
      push('invoice', inv.id, mt(lang, 'sug_invoice_unratified', { name }));
    }
    for (const c of cRes.data || []) {
      const notice = noticeDeadline(c);
      if (notice && notice >= today && notice <= soon) {
        push('contract', c.id, mt(lang, 'sug_contract_notice', { date: formatDate(notice, lang), name: c.subject }));
      } else if (c.ends_on && c.ends_on <= addDaysIso(m.meeting_on, 90)) {
        push('contract', c.id, mt(lang, 'sug_contract_end', { date: formatDate(c.ends_on, lang), name: c.subject }));
      }
    }
    for (const td of tdRes.data || []) push('tender', td.id, mt(lang, 'sug_tender_open', { name: td.title }));
    for (const t of tRes.data || []) {
      if (t.status === 'blocked') push('task', t.id, mt(lang, 'sug_task_blocked', { name: t.title }), 'review');
      else if (t.due_date && t.due_date < m.meeting_on) push('task', t.id, mt(lang, 'sug_task_overdue', { name: t.title }), 'review');
    }
    for (const o of oRes.data || []) {
      push('obligation', o.id, mt(lang, 'sug_obligation', { date: formatDate(o.next_due_on, lang), name: o.title }), 'information');
    }
    setSuggestions((p) => ({ ...p, [m.id]: list }));
  }

  async function addSuggestions(m) {
    const chosen = (suggestions[m.id] || []).filter((s) => s.checked);
    const current = items[m.id] || [];
    const rows = [];
    let pos = current.length ? Math.max(...current.map((i) => i.position)) : 0;
    if (current.length === 0) {
      rows.push({ title: mt(lang, 'fixedItemMinutes'), item_type: 'decision', source_type: 'manual' });
      rows.push({ title: mt(lang, 'fixedItemFollowUp'), item_type: 'review', source_type: 'manual' });
    }
    for (const s of chosen) rows.push({ title: s.title, item_type: s.item_type, source_type: s.source_type, source_id: s.source_id });
    if (current.length === 0) rows.push({ title: mt(lang, 'fixedItemAob'), item_type: 'information', source_type: 'manual' });
    const payload = rows.map((r) => ({ ...r, meeting_id: m.id, position: ++pos, is_demo: m.is_demo }));
    if (payload.length > 0) {
      const { error } = await supabase.from('memoria_meeting_items').insert(payload);
      if (error) {
        window.alert(mt(lang, 'saveError', { error: error.message }));
        return;
      }
    }
    setSuggestions((p) => {
      const n = { ...p };
      delete n[m.id];
      return n;
    });
    await loadItems(m.id);
  }

  async function doPrint(m, mode) {
    const list = items[m.id] || (await loadItems(m.id));
    setPrinting({ meeting: m, mode, list });
    setTimeout(() => window.print(), 100);
  }

  // ---------- Formulár ----------
  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newMeeting') : mt(lang, 'edit')}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'title')} required>
          <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'meetingBody')}>
          <select className="input-field" value={form.body} onChange={(e) => setField('body', e.target.value)}>
            {MEETING_BODIES.map((b) => (
              <option key={b} value={b}>{mt(lang, `meetingBody_${b}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label={mt(lang, 'meetingOn')} required>
          <input type="date" className="input-field" value={form.meeting_on} onChange={(e) => setField('meeting_on', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'meetingTime')}>
          <input type="time" className="input-field" value={form.meeting_time} onChange={(e) => setField('meeting_time', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'location')} className="sm:col-span-2">
          <input className="input-field" value={form.location} onChange={(e) => setField('location', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'convenedBy')}>
          <input className="input-field" value={form.convened_by} onChange={(e) => setField('convened_by', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'invitationSentOn')}>
          <input type="date" className="input-field" value={form.invitation_sent_on} onChange={(e) => setField('invitation_sent_on', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {MEETING_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `meetingStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      {form.status === 'held' && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label={mt(lang, 'attendees')} className="sm:col-span-3">
            <textarea rows={2} className="input-field" value={form.attendees} onChange={(e) => setField('attendees', e.target.value)} />
          </Field>
          <Field label={mt(lang, 'quorumReached')}>
            <select className="input-field" value={form.quorum_reached} onChange={(e) => setField('quorum_reached', e.target.value)}>
              <option value="">—</option>
              <option value="yes">✓</option>
              <option value="no">✗</option>
            </select>
          </Field>
          {form.body !== 'board' && (
            <Field label={mt(lang, 'minutesClosedOn')}>
              <input type="date" className="input-field" value={form.minutes_closed_on} onChange={(e) => setField('minutes_closed_on', e.target.value)} />
            </Field>
          )}
        </div>
      )}
      <Field label={mt(lang, 'notes')}>
        <textarea rows={2} className="input-field" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
      </Field>
      <p className="text-xs text-ink/50">{mt(lang, form.body === 'board' ? 'quorumRuleBoard' : 'quorumRuleGeneral')}</p>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={closeForm}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="print:hidden">
        <p className="text-sm text-ink/60 mb-4">{mt(lang, 'meetingsIntro')}</p>
        <div className="flex justify-end mb-4">
          {editingId === null && (
            <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newMeeting')}</button>
          )}
        </div>
        {editingId === 'new' && formBlock}
        <ErrorBox message={loadError} />

        {loadingData ? (
          <p className="text-ink/60">{mt(lang, 'loading')}</p>
        ) : meetings.length === 0 ? (
          <p className="text-ink/60">{mt(lang, 'noMeetings')}</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((m) => {
              if (editingId === m.id) return <div key={m.id}>{formBlock}</div>;
              const checks = meetingChecks(m, lang);
              const list = items[m.id] || [];
              const sugg = suggestions[m.id];
              return (
                <div key={m.id} className={`card p-4 ${m.id === nextPlannedId ? 'border-2 border-harbor/30' : ''}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{m.title} <DemoPill show={m.is_demo} /></p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Pill tone={STATUS_TONE[m.status]}>{mt(lang, `meetingStatus_${m.status}`)}</Pill>
                        <span className="text-xs text-ink/60">
                          {mt(lang, `meetingBody_${m.body}`)} · {formatDate(m.meeting_on, lang)}
                          {m.meeting_time ? ` · ${m.meeting_time}` : ''}
                          {m.location ? ` · ${m.location}` : ''}
                        </span>
                      </div>
                      {checks.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {checks.map((c) => (
                            <li key={c.key} className={`text-xs ${c.tone === 'red' ? 'text-red-700' : c.tone === 'ochre' ? 'text-ink' : 'text-sea'}`}>
                              {c.tone === 'green' ? '✓' : c.tone === 'red' ? '⚠' : '⏰'} {c.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {editingId === null && (
                      <div className="flex gap-3 text-sm flex-shrink-0">
                        <button className="text-harbor hover:underline" onClick={() => openEdit(m)}>{mt(lang, 'edit')}</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleDelete(m)}>{mt(lang, 'delete')}</button>
                      </div>
                    )}
                  </div>

                  <button className="text-xs text-harbor/70 hover:text-harbor mt-3" onClick={() => toggle(m)}>
                    {expanded[m.id] ? `▾ ${mt(lang, 'agenda')}` : `▸ ${mt(lang, 'agenda')}`}
                  </button>

                  {expanded[m.id] && (
                    <div className="mt-3 space-y-4 border-t border-ink/10 pt-3">
                      <div className="flex flex-wrap gap-2">
                        {m.status !== 'held' && (
                          <button className="btn-secondary text-sm" onClick={() => suggest(m)}>💡 {mt(lang, 'suggestAgenda')}</button>
                        )}
                        <button className="btn-secondary text-sm" onClick={() => doPrint(m, 'invitation')}>🖨 {mt(lang, 'printInvitation')}</button>
                        {m.status === 'held' && (
                          <button className="btn-secondary text-sm" onClick={() => doPrint(m, 'minutes')}>🖨 {mt(lang, 'printMinutes')}</button>
                        )}
                      </div>

                      {sugg && (
                        <div className="rounded-md bg-sand/60 p-3">
                          <p className="text-xs text-ink/60 italic mb-2">{mt(lang, 'suggestAgendaHint')}</p>
                          {sugg.length === 0 ? (
                            <p className="text-sm text-ink/60">{mt(lang, 'noSuggestions')}</p>
                          ) : (
                            <ul className="space-y-1 mb-2">
                              {sugg.map((s, idx) => (
                                <li key={s.key}>
                                  <label className="flex items-start gap-2 text-sm text-ink">
                                    <input
                                      type="checkbox"
                                      className="mt-1"
                                      checked={s.checked}
                                      onChange={(e) =>
                                        setSuggestions((p) => ({
                                          ...p,
                                          [m.id]: p[m.id].map((x, j) => (j === idx ? { ...x, checked: e.target.checked } : x)),
                                        }))
                                      }
                                    />
                                    <span>{s.title}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex gap-2">
                            <button className="btn-primary text-sm" onClick={() => addSuggestions(m)}>{mt(lang, 'addSelected')}</button>
                            <button
                              className="btn-secondary text-sm"
                              onClick={() =>
                                setSuggestions((p) => {
                                  const n = { ...p };
                                  delete n[m.id];
                                  return n;
                                })
                              }
                            >
                              {mt(lang, 'cancel')}
                            </button>
                          </div>
                        </div>
                      )}

                      {list.length === 0 ? (
                        <p className="text-sm text-ink/50">{mt(lang, 'agendaEmpty')}</p>
                      ) : (
                        <ol className="space-y-2">
                          {list.map((it, idx) => (
                            <li key={it.id} className="rounded-md border border-ink/10 p-3">
                              <div className="flex items-start gap-2">
                                <span className="font-display text-harbor w-6 flex-shrink-0">{idx + 1}.</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-ink">
                                    {it.title} <DemoPill show={it.is_demo && !m.is_demo} />
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    <Pill tone={it.item_type === 'decision' ? 'harbor' : 'neutral'}>{mt(lang, `itemType_${it.item_type}`)}</Pill>
                                    {it.decision_id && <Pill tone="green">⚖️ {mt(lang, 'decisionRecorded')}</Pill>}
                                  </div>
                                  {m.status === 'held' && (
                                    <div className="mt-2 space-y-2">
                                      <textarea
                                        rows={2}
                                        className="input-field text-sm"
                                        placeholder={mt(lang, 'outcome')}
                                        value={outcomeDraft[it.id] ?? it.outcome ?? ''}
                                        onChange={(e) => setOutcomeDraft((p) => ({ ...p, [it.id]: e.target.value }))}
                                      />
                                      <div className="flex flex-wrap gap-2">
                                        <button className="btn-secondary text-xs" onClick={() => saveOutcome(m, it)}>{mt(lang, 'saveOutcome')}</button>
                                        {it.item_type === 'decision' && !it.decision_id && (
                                          <button className="btn-primary text-xs" onClick={() => recordDecision(m, it)}>⚖️ {mt(lang, 'createDecision')}</button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {m.status !== 'held' && it.outcome && <p className="text-xs text-ink/60 mt-1">{it.outcome}</p>}
                                </div>
                                <div className="flex flex-col gap-1 text-xs flex-shrink-0">
                                  <button className="text-harbor disabled:opacity-30" disabled={idx === 0} onClick={() => moveItem(m, idx, -1)} aria-label={mt(lang, 'moveUp')}>▲</button>
                                  <button className="text-harbor disabled:opacity-30" disabled={idx === list.length - 1} onClick={() => moveItem(m, idx, 1)} aria-label={mt(lang, 'moveDown')}>▼</button>
                                  <button className="text-red-600" onClick={() => deleteItem(m, it)} aria-label={mt(lang, 'delete')}>✕</button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <input
                          className="input-field !w-auto flex-1 min-w-[12rem] text-sm"
                          placeholder={mt(lang, 'addAgendaItem')}
                          value={newItem[m.id]?.title || ''}
                          onChange={(e) => setNewItem((p) => ({ ...p, [m.id]: { ...(p[m.id] || {}), title: e.target.value } }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addItem(m);
                            }
                          }}
                        />
                        <select
                          className="input-field !w-auto text-sm"
                          value={newItem[m.id]?.item_type || 'decision'}
                          onChange={(e) => setNewItem((p) => ({ ...p, [m.id]: { ...(p[m.id] || {}), item_type: e.target.value } }))}
                        >
                          {AGENDA_ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>{mt(lang, `itemType_${t}`)}</option>
                          ))}
                        </select>
                        <button className="btn-secondary text-sm" onClick={() => addItem(m)}>+ {mt(lang, 'addAgendaItem')}</button>
                      </div>

                      <DetailRow label={mt(lang, 'convenedBy')}>{m.convened_by}</DetailRow>
                      <DetailRow label={mt(lang, 'invitationSentOn')}>{m.invitation_sent_on ? formatDate(m.invitation_sent_on, lang) : null}</DetailRow>
                      <DetailRow label={mt(lang, 'attendees')}>{m.attendees}</DetailRow>
                      <DetailRow label={mt(lang, 'quorumReached')}>{m.quorum_reached === null ? null : m.quorum_reached ? '✓' : '✗'}</DetailRow>
                      <DetailRow label={mt(lang, 'minutesClosedOn')}>{m.minutes_closed_on ? formatDate(m.minutes_closed_on, lang) : null}</DetailRow>
                      <DetailRow label={mt(lang, 'notes')}>{m.notes}</DetailRow>
                      <Attachments lang={lang} entityType="meeting" entityId={m.id} defaultType="minutes" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {printing && (
        <div className="hidden print:block text-ink">
          <p className="text-sm">{mt(lang, 'communityName')}</p>
          <h1 className="text-2xl font-display mt-4">
            {mt(lang, printing.mode === 'invitation' ? 'invitationHeading' : 'minutesHeading')} — {mt(lang, `meetingBody_${printing.meeting.body}`)}
          </h1>
          <p className="mt-2">
            <strong>{printing.meeting.title}</strong>
            <br />
            {formatDate(printing.meeting.meeting_on, lang)}
            {printing.meeting.meeting_time ? `, ${printing.meeting.meeting_time}` : ''}
            {printing.meeting.location ? ` · ${printing.meeting.location}` : ''}
          </p>
          {printing.meeting.convened_by && (
            <p className="mt-1 text-sm">{mt(lang, 'convenedBy')}: {printing.meeting.convened_by}</p>
          )}
          {printing.mode === 'minutes' && printing.meeting.attendees && (
            <p className="mt-1 text-sm">{mt(lang, 'attendees')}: {printing.meeting.attendees}</p>
          )}
          <h2 className="text-lg font-display mt-6 mb-2">{mt(lang, 'agenda')}</h2>
          <ol className="list-decimal pl-6 space-y-2">
            {printing.list.map((it) => (
              <li key={it.id}>
                {it.title}
                {printing.mode === 'minutes' && it.outcome && <p className="text-sm mt-1 whitespace-pre-wrap">{it.outcome}</p>}
              </li>
            ))}
          </ol>
          <p className="text-xs mt-6">{mt(lang, printing.meeting.body === 'board' ? 'quorumRuleBoard' : 'quorumRuleGeneral')}</p>
          <div className="mt-16 grid grid-cols-2 gap-8 text-sm">
            <div className="border-t border-ink pt-1">{mt(lang, 'signaturePresident')}</div>
            {printing.mode === 'minutes' && <div className="border-t border-ink pt-1">{mt(lang, 'signatureSecretary')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
