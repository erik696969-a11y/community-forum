'use client';

// Plnenie uznesení (action tracker). Stanovy čl. XXII.4.f: Junta Directiva
// dohliada na plnenie uznesení; administrátor ich vykonáva (čl. XXVII).
// Každá úloha má vykonávateľa, kontrolóra z boardu, termín a históriu postupu.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import {
  mt, cleanFormValues, todayIso, daysUntil, relativeDue,
  TASK_STATUSES, OPEN_TASK_STATUSES, EXECUTOR_ROLES,
} from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox, DetailRow, DemoPill, StatTile } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';

const EMPTY_FORM = {
  title: '',
  description: '',
  decision_id: '',
  executor_role: 'administrator',
  executor_name: '',
  supervisor_name: '',
  due_date: '',
  priority: 'normal',
  status: 'not_started',
  blocked_reason: '',
  completed_on: '',
  tender_id: '',
  contract_id: '',
};
const STATUS_TONE = { not_started: 'neutral', in_progress: 'harbor', blocked: 'red', done: 'green', cancelled: 'neutral' };

function toForm(t) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = t[key];
    form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

export function isTaskOverdue(t) {
  return OPEN_TASK_STATUSES.includes(t.status) && t.due_date && t.due_date < todayIso();
}

export default function TasksPanel({ lang, onChanged, presetDecisionId = null }) {
  const [tasks, setTasks] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [updates, setUpdates] = useState({});
  const [names, setNames] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [view, setView] = useState('open'); // open | overdue | blocked | done | all
  const [roleFilter, setRoleFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState(presetDecisionId || '');
  const [expanded, setExpanded] = useState({});
  const [noteDraft, setNoteDraft] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    const [tRes, dRes, tdRes, cRes] = await Promise.all([
      supabase.from('memoria_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('memoria_decisions').select('id, title, decided_on, is_demo').order('decided_on', { ascending: false }),
      supabase.from('memoria_tenders').select('id, title').order('created_at', { ascending: false }),
      supabase.from('memoria_contracts').select('id, subject').order('created_at', { ascending: false }),
    ]);
    const firstError = tRes.error || dRes.error || tdRes.error || cRes.error;
    setLoadError(firstError ? firstError.message : '');
    setTasks(tRes.data || []);
    setDecisions(dRes.data || []);
    setTenders(tdRes.data || []);
    setContracts(cRes.data || []);
    setLoadingData(false);
  }

  async function loadUpdates(taskId) {
    const { data } = await supabase
      .from('memoria_task_updates')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    const list = data || [];
    setUpdates((prev) => ({ ...prev, [taskId]: list }));
    const missing = [...new Set(list.map((u) => u.created_by).filter(Boolean))].filter((id) => !(id in names));
    if (missing.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
      setNames((prev) => ({ ...prev, ...Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])) }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (presetDecisionId) setDecisionFilter(presetDecisionId);
  }, [presetDecisionId]);

  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const tenderTitle = useMemo(() => Object.fromEntries(tenders.map((t) => [t.id, t.title])), [tenders]);
  const contractSubject = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c.subject])), [contracts]);

  const stats = useMemo(() => {
    const open = tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
    return {
      open: open.length,
      overdue: open.filter(isTaskOverdue).length,
      blocked: open.filter((t) => t.status === 'blocked').length,
      done: tasks.filter((t) => t.status === 'done').length,
    };
  }, [tasks]);

  const visible = tasks
    .filter((t) => {
      if (view === 'open' && !OPEN_TASK_STATUSES.includes(t.status)) return false;
      if (view === 'overdue' && !isTaskOverdue(t)) return false;
      if (view === 'blocked' && t.status !== 'blocked') return false;
      if (view === 'done' && t.status !== 'done') return false;
      if (roleFilter && t.executor_role !== roleFilter) return false;
      if (decisionFilter && t.decision_id !== decisionFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [t.title, t.description, t.executor_name, t.supervisor_name, decisionById[t.decision_id]?.title]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Po termíne navrch, potom podľa termínu, bez termínu na koniec.
      const ao = isTaskOverdue(a) ? 0 : 1;
      const bo = isTaskOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1;
    });

  function openNew() {
    setForm({ ...EMPTY_FORM, decision_id: decisionFilter || '' });
    setFormError('');
    setEditingId('new');
  }

  function openEdit(t) {
    setForm(toForm(t));
    setFormError('');
    setEditingId(t.id);
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
    if (!values.title) {
      setFormError(`${mt(lang, 'title')}: ${mt(lang, 'required')}`);
      return;
    }
    if (values.status === 'blocked' && !values.blocked_reason) {
      setFormError(`${mt(lang, 'blockedReason')} — ${mt(lang, 'required')}`);
      return;
    }
    if (values.status !== 'blocked') values.blocked_reason = null;
    if (values.status === 'done' && !values.completed_on) values.completed_on = todayIso();
    if (values.status !== 'done') values.completed_on = null;
    setSaving(true);
    setFormError('');
    const { error } =
      editingId === 'new'
        ? await supabase.from('memoria_tasks').insert(values)
        : await supabase.from('memoria_tasks').update(values).eq('id', editingId);
    setSaving(false);
    if (error) {
      setFormError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    closeForm();
    await load();
    onChanged?.();
  }

  async function changeStatus(t, newStatus) {
    if (newStatus === t.status) return;
    let blockedReason = null;
    if (newStatus === 'blocked') {
      blockedReason = window.prompt(mt(lang, 'blockedReason'));
      if (!blockedReason || !blockedReason.trim()) return;
    }
    const note = newStatus === 'blocked' ? blockedReason : window.prompt(mt(lang, 'statusNotePrompt'));
    if (note === null) return; // zrušené
    const patch = {
      status: newStatus,
      blocked_reason: newStatus === 'blocked' ? blockedReason.trim() : null,
      completed_on: newStatus === 'done' ? todayIso() : null,
    };
    const { error } = await supabase.from('memoria_tasks').update(patch).eq('id', t.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await supabase.from('memoria_task_updates').insert({
      task_id: t.id,
      note: note.trim() || mt(lang, 'statusChangedTo', { status: mt(lang, `taskStatus_${newStatus}`) }),
      new_status: newStatus,
      is_demo: t.is_demo,
    });
    await load();
    if (expanded[t.id]) await loadUpdates(t.id);
    onChanged?.();
  }

  async function addNote(t) {
    const note = (noteDraft[t.id] || '').trim();
    if (!note) return;
    const { error } = await supabase.from('memoria_task_updates').insert({ task_id: t.id, note, is_demo: t.is_demo });
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    setNoteDraft((p) => ({ ...p, [t.id]: '' }));
    await loadUpdates(t.id);
    onChanged?.();
  }

  async function handleDelete(t) {
    if (!window.confirm(mt(lang, 'confirmDelete', { name: t.title }))) return;
    const { error } = await supabase.from('memoria_tasks').delete().eq('id', t.id);
    if (error) {
      window.alert(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await removeEntityExtras('task', t.id);
    await load();
    onChanged?.();
  }

  function toggle(t) {
    const next = !expanded[t.id];
    setExpanded((p) => ({ ...p, [t.id]: next }));
    if (next) loadUpdates(t.id);
  }

  const formBlock = (
    <form onSubmit={handleSave} className="card p-4 space-y-4 mb-6 border-2 border-ochre/40">
      <h3 className="font-display text-lg text-harbor">{editingId === 'new' ? mt(lang, 'newTask') : mt(lang, 'edit')}</h3>
      <Field label={mt(lang, 'title')} required>
        <input className="input-field" value={form.title} onChange={(e) => setField('title', e.target.value)} />
      </Field>
      <Field label={mt(lang, 'fromDecision')}>
        <select className="input-field" value={form.decision_id} onChange={(e) => setField('decision_id', e.target.value)}>
          <option value="">{mt(lang, 'none')}</option>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>{formatDate(d.decided_on, lang)} · {d.title}{d.is_demo ? ' (DEMO)' : ''}</option>
          ))}
        </select>
      </Field>
      <Field label={mt(lang, 'description')}>
        <textarea rows={3} className="input-field" value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'executorRole')}>
          <select className="input-field" value={form.executor_role} onChange={(e) => setField('executor_role', e.target.value)}>
            {EXECUTOR_ROLES.map((r) => (
              <option key={r} value={r}>{mt(lang, `role_${r}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'executorName')}>
          <input className="input-field" value={form.executor_name} onChange={(e) => setField('executor_name', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'supervisor')}>
          <input className="input-field" value={form.supervisor_name} onChange={(e) => setField('supervisor_name', e.target.value)} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={mt(lang, 'dueDate')}>
          <input type="date" className="input-field" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} />
        </Field>
        <Field label={mt(lang, 'priority')}>
          <select className="input-field" value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
            <option value="normal">{mt(lang, 'priority_normal')}</option>
            <option value="high">{mt(lang, 'priority_high')}</option>
          </select>
        </Field>
        <Field label={mt(lang, 'status')}>
          <select className="input-field" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{mt(lang, `taskStatus_${s}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      {form.status === 'blocked' && (
        <Field label={mt(lang, 'blockedReason')} required>
          <input className="input-field" value={form.blocked_reason} onChange={(e) => setField('blocked_reason', e.target.value)} />
        </Field>
      )}
      {form.status === 'done' && (
        <Field label={mt(lang, 'completedOn')}>
          <input type="date" className="input-field" value={form.completed_on} onChange={(e) => setField('completed_on', e.target.value)} />
        </Field>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={mt(lang, 'tender')}>
          <select className="input-field" value={form.tender_id} onChange={(e) => setField('tender_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'contract')}>
          <select className="input-field" value={form.contract_id} onChange={(e) => setField('contract_id', e.target.value)}>
            <option value="">{mt(lang, 'none')}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.subject}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox message={formError} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
        <button type="button" className="btn-secondary" onClick={closeForm}>{mt(lang, 'cancel')}</button>
      </div>
    </form>
  );

  return (
    <div>
      <p className="text-sm text-ink/60 mb-4">{mt(lang, 'tasksIntro')}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatTile label={mt(lang, 'statOpen')} value={stats.open} active={view === 'open'} onClick={() => setView('open')} />
        <StatTile label={mt(lang, 'statOverdue')} value={stats.overdue} tone={stats.overdue ? 'red' : 'neutral'} active={view === 'overdue'} onClick={() => setView('overdue')} />
        <StatTile label={mt(lang, 'statBlocked')} value={stats.blocked} tone={stats.blocked ? 'ochre' : 'neutral'} active={view === 'blocked'} onClick={() => setView('blocked')} />
        <StatTile label={mt(lang, 'statDone')} value={stats.done} tone="green" active={view === 'done'} onClick={() => setView('done')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="input-field !w-auto flex-1 min-w-[12rem]" placeholder={mt(lang, 'search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input-field !w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{mt(lang, 'executorRole')}: {mt(lang, 'all')}</option>
          {EXECUTOR_ROLES.map((r) => (
            <option key={r} value={r}>{mt(lang, `role_${r}`)}</option>
          ))}
        </select>
        <select className="input-field !w-auto max-w-[16rem]" value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
          <option value="">{mt(lang, 'fromDecision')}: {mt(lang, 'all')}</option>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        {view !== 'all' && (
          <button className="text-sm text-harbor hover:underline" onClick={() => setView('all')}>{mt(lang, 'all')}</button>
        )}
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newTask')}</button>
        )}
      </div>

      {editingId === 'new' && formBlock}
      <ErrorBox message={loadError} />

      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : tasks.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'noMatches')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => {
            if (editingId === t.id) return <div key={t.id}>{formBlock}</div>;
            const overdue = isTaskOverdue(t);
            const dec = decisionById[t.decision_id];
            const left = daysUntil(t.due_date);
            return (
              <div key={t.id} className={`card p-4 ${overdue ? 'border-l-4 border-l-red-500' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {t.priority === 'high' && <span className="text-red-600">! </span>}
                      {t.title} <DemoPill show={t.is_demo} />
                    </p>
                    {dec && <p className="text-xs text-ink/60 mt-0.5">⚖️ {formatDate(dec.decided_on, lang)} · {dec.title}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Pill tone={STATUS_TONE[t.status]}>{mt(lang, `taskStatus_${t.status}`)}</Pill>
                      {t.due_date && (
                        <span className={`text-xs ${overdue ? 'text-red-700 font-semibold' : 'text-ink/60'}`}>
                          {mt(lang, 'dueDate')}: {formatDate(t.due_date, lang)}
                          {OPEN_TASK_STATUSES.includes(t.status) && left !== null && ` (${relativeDue(t.due_date, lang)})`}
                        </span>
                      )}
                      <span className="text-xs text-ink/60">
                        👤 {mt(lang, `role_${t.executor_role}`)}
                        {t.executor_name && t.executor_name !== mt(lang, `role_${t.executor_role}`) ? `: ${t.executor_name}` : ''}
                      </span>
                      {t.supervisor_name && <span className="text-xs text-ink/60">🔎 {t.supervisor_name}</span>}
                    </div>
                    {t.status === 'blocked' && t.blocked_reason && (
                      <p className="text-xs text-red-700 mt-1">⛔ {t.blocked_reason}</p>
                    )}
                  </div>
                  {editingId === null && (
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <select
                        className="input-field !w-auto text-sm py-1"
                        value={t.status}
                        onChange={(e) => changeStatus(t, e.target.value)}
                        aria-label={mt(lang, 'status')}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>{mt(lang, `taskStatus_${s}`)}</option>
                        ))}
                      </select>
                      <div className="flex gap-3 text-sm">
                        <button className="text-harbor hover:underline" onClick={() => openEdit(t)}>{mt(lang, 'edit')}</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleDelete(t)}>{mt(lang, 'delete')}</button>
                      </div>
                    </div>
                  )}
                </div>
                <button className="text-xs text-harbor/70 hover:text-harbor mt-3" onClick={() => toggle(t)}>
                  {expanded[t.id] ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
                </button>
                {expanded[t.id] && (
                  <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                    <DetailRow label={mt(lang, 'description')}>{t.description}</DetailRow>
                    <DetailRow label={mt(lang, 'completedOn')}>{t.completed_on ? formatDate(t.completed_on, lang) : null}</DetailRow>
                    <DetailRow label={mt(lang, 'tender')}>{tenderTitle[t.tender_id] || null}</DetailRow>
                    <DetailRow label={mt(lang, 'contract')}>{contractSubject[t.contract_id] || null}</DetailRow>
                    <div>
                      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">{mt(lang, 'progressLog')}</p>
                      <div className="flex gap-2 mb-2">
                        <input
                          className="input-field !w-auto flex-1 text-sm"
                          placeholder={mt(lang, 'notePlaceholder')}
                          value={noteDraft[t.id] || ''}
                          onChange={(e) => setNoteDraft((p) => ({ ...p, [t.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNote(t);
                            }
                          }}
                        />
                        <button className="btn-secondary text-sm" onClick={() => addNote(t)}>{mt(lang, 'addNote')}</button>
                      </div>
                      {(updates[t.id] || []).length === 0 ? (
                        <p className="text-xs text-ink/40">—</p>
                      ) : (
                        <ul className="space-y-1">
                          {(updates[t.id] || []).map((u) => (
                            <li key={u.id} className="text-sm text-ink">
                              <span className="text-xs text-ink/50">
                                {formatDate(u.created_at, lang)} · {names[u.created_by] || mt(lang, 'someone')}
                              </span>
                              {u.new_status && (
                                <span className="ml-2"><Pill tone={STATUS_TONE[u.new_status]}>{mt(lang, `taskStatus_${u.new_status}`)}</Pill></span>
                              )}
                              <span className="block">{u.note}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Attachments lang={lang} entityType="task" entityId={t.id} defaultType="other" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
