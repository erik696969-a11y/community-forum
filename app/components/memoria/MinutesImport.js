'use client';

// Import zápisnice: board nahrá schválenú zápisnicu (PDF, Word, foto alebo vložený text),
// AI navrhne body, rozhodnutia, úlohy s termínmi a stav existujúcich úloh, board návrh
// skontroluje a jedným potvrdením uloží (funkcia memoria_import_minutes – všetko alebo nič).
// Princíp MIA: AI iba prepisuje, čo je v zápisnici; nerozhoduje.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, MAX_UPLOAD_BYTES, EXECUTOR_ROLES, MEETING_BODIES } from '../../../lib/memoriaI18n';
import { matchMeeting, buildImportPayload, MAX_TEXT_CHARS, TASK_STATUSES } from '../../../lib/memoriaMinutes';
import { Field, Pill, ErrorBox } from './MemoriaUi';

function safeName(name) {
  return String(name || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.docx,.txt';

export default function MinutesImport({ lang, meetings, presetMeetingId, onClose, onSaved }) {
  const input = useRef(null);
  const box = useRef(null);
  const [stage, setStage] = useState('pick'); // pick | reading | review | saving | done
  const [error, setError] = useState('');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState(null); // { path, name }
  const [meetingId, setMeetingId] = useState(presetMeetingId || '');
  const [meeting, setMeeting] = useState(null);
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [uncertain, setUncertain] = useState([]);
  const [nextMeetingOn, setNextMeetingOn] = useState(null);
  const [planNext, setPlanNext] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [names, setNames] = useState({ supplier: {}, tender: {}, contract: {}, task: {} });
  const [result, setResult] = useState(null);

  useEffect(() => {
    const preset = meetings.find((m) => m.id === presetMeetingId);
    if (preset?.is_demo) setIsDemo(true);
  }, [meetings, presetMeetingId]);

  async function loadNames() {
    const [s, z, c, t] = await Promise.all([
      supabase.from('memoria_suppliers').select('id, name'),
      supabase.from('memoria_tenders').select('id, title'),
      supabase.from('memoria_contracts').select('id, subject'),
      supabase.from('memoria_tasks').select('id, title, status, due_date, is_demo'),
    ]);
    const map = (rows, key) => Object.fromEntries((rows || []).map((r) => [r.id, r[key]]));
    setNames({
      supplier: map(s.data, 'name'),
      tender: map(z.data, 'title'),
      contract: map(c.data, 'subject'),
      task: Object.fromEntries((t.data || []).map((r) => [r.id, r])),
    });
    return (t.data || []).some((r) => r.is_demo);
  }

  async function read({ fileObj, text }) {
    setError('');
    try {
      let body;
      if (fileObj) {
        if (fileObj.size > MAX_UPLOAD_BYTES) return setError(mt(lang, 'fileTooLarge'));
        if (!/\.(pdf|png|jpe?g|webp|docx|txt)$/i.test(fileObj.name)) return setError(mt(lang, 'importUnsupported'));
        setStage('reading');
        const path = `inbox/${crypto.randomUUID()}/${safeName(fileObj.name)}`;
        const up = await supabase.storage.from('memoria').upload(path, fileObj, { contentType: fileObj.type || undefined });
        if (up.error) throw new Error(up.error.message);
        setFile({ path, name: fileObj.name });
        body = { path, lang };
      } else {
        const clean = (text || '').trim();
        if (!clean) return;
        if (clean.length > MAX_TEXT_CHARS) return setError(mt(lang, 'minTextTooLong'));
        setStage('reading');
        // Vložený text sa uloží ako .txt, aby zápisnica ostala pri zasadnutí.
        const path = `inbox/${crypto.randomUUID()}/minutes.txt`;
        const up = await supabase.storage.from('memoria').upload(path, new Blob([clean], { type: 'text/plain' }), { contentType: 'text/plain' });
        setFile(up.error ? null : { path, name: mt(lang, 'minPastedTitle') });
        body = { text: clean, lang };
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/memoria/extract-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      const demoData = await loadNames();
      const p = json.proposal;
      if (!p.is_minutes) setError(mt(lang, 'minNotMinutes'));
      const matched = presetMeetingId ? meetings.find((m) => m.id === presetMeetingId) : matchMeeting(meetings, p.meeting);
      setMeetingId(matched?.id || '');
      if (matched?.is_demo || (!matched && demoData)) setIsDemo(Boolean(matched ? matched.is_demo : demoData));
      setMeeting({
        ...p.meeting,
        title: p.meeting.title || (matched ? matched.title : ''),
        meeting_on: p.meeting.meeting_on || matched?.meeting_on || '',
      });
      setItems(p.items.map((it) => ({ ...it, selected: true, makeDecision: Boolean(it.decision) })));
      setActions(p.actions.map((a) => ({ ...a, selected: true })));
      setUpdates(p.task_updates.map((u) => ({ ...u, selected: true })));
      setUncertain(p.uncertain);
      setNextMeetingOn(p.meeting.next_meeting_on);
      setStage('review');
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
      setStage('pick');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const setItem = (i, patch) => setItems((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setDecision = (i, patch) => setItems((p) => p.map((x, j) => (j === i ? { ...x, decision: { ...(x.decision || {}), ...patch } } : x)));
  const setAction = (i, patch) => setActions((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setUpdate = (i, patch) => setUpdates((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!meetingId && !meeting?.meeting_on) return setError(mt(lang, 'minMeetingDateRequired'));
    setError('');
    setStage('saving');
    const target = meetings.find((m) => m.id === meetingId);
    const payload = buildImportPayload({
      meetingId: meetingId || null,
      meeting: { ...meeting, title: meeting.title || `${mt(lang, `meetingBody_${meeting.body}`)} ${meeting.meeting_on}` },
      items,
      actions,
      taskUpdates: updates,
      document: file ? { title: file.name, storage_path: file.path, document_date: meeting.meeting_on || null } : null,
      isDemo,
      contextNote: `${mt(lang, 'doc_minutes')}: ${target?.title || meeting.title || ''} (${formatDate(target?.meeting_on || meeting.meeting_on, lang)})`,
    });
    const { data, error: rpcError } = await supabase.rpc('memoria_import_minutes', { p: payload });
    if (rpcError) {
      setError(mt(lang, 'saveError', { error: rpcError.message }));
      setStage('review');
      return;
    }
    if (planNext && nextMeetingOn && !meetings.some((m) => m.meeting_on === nextMeetingOn)) {
      await supabase.from('memoria_meetings').insert({
        title: `${mt(lang, `meetingBody_${meeting.body}`)} ${formatDate(nextMeetingOn, lang)}`,
        body: meeting.body,
        meeting_on: nextMeetingOn,
        status: 'planned',
        is_demo: isDemo,
      });
    }
    setResult(data);
    setStage('done');
    setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    onSaved?.(data?.meeting_id);
  }

  const chip = (type, id) => (
    <Pill key={`${type}:${id}`} tone="neutral">
      {mt(lang, type)}: {names[type]?.[id] || '…'}
    </Pill>
  );

  return (
    <div ref={box} className="card p-4 mb-6 border-2 border-sea/50 space-y-4 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-harbor">📄 {mt(lang, 'minImportTitle')}</h3>
          <p className="text-xs text-ink/60 mt-1">🤖 {mt(lang, 'minPrinciple')}</p>
        </div>
        <button className="text-sm text-harbor hover:underline flex-shrink-0" onClick={onClose}>✕</button>
      </div>

      {(stage === 'pick' || stage === 'reading') && (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{mt(lang, 'minImportIntro')}</p>
          {stage === 'reading' ? (
            <p className="text-sm text-harbor animate-pulse">🤖 {mt(lang, 'minReading')}</p>
          ) : (
            <>
              <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => read({ fileObj: e.target.files?.[0] })} />
              <button type="button" className="btn-primary text-sm" onClick={() => input.current?.click()}>📎 {mt(lang, 'minChooseFile')}</button>
              <textarea rows={5} className="input-field text-sm" placeholder={mt(lang, 'minOrPaste')} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              {pasted.trim() && (
                <button type="button" className="btn-secondary text-sm" onClick={() => read({ text: pasted })}>🤖 {mt(lang, 'minReadText')}</button>
              )}
            </>
          )}
        </div>
      )}

      <ErrorBox message={error} />

      {(stage === 'review' || stage === 'saving') && meeting && (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-harbor">{mt(lang, 'minReviewTitle')}</h4>
            <p className="text-xs text-ink/60">{mt(lang, 'minReviewHint')}</p>
          </div>

          {uncertain.length > 0 && (
            <div className="rounded-md border border-ochre/50 bg-ochre/10 px-3 py-2 text-sm">
              <p className="font-semibold text-ink">⚠ {mt(lang, 'minSectionUncertain')}</p>
              <ul className="list-disc pl-5 text-ink/80">
                {uncertain.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </div>
          )}

          {/* Zasadnutie */}
          <section className="space-y-2">
            <h5 className="text-sm font-semibold text-harbor">1 · {mt(lang, 'minSectionMeeting')}</h5>
            <Field label={mt(lang, 'minUseExisting')}>
              <select className="input-field text-sm" value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
                <option value="">{mt(lang, 'minCreateNew')}</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>{formatDate(m.meeting_on, lang)} · {m.title}</option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-sea">
              {meetingId ? mt(lang, 'minMatchedMeeting', { name: meetings.find((m) => m.id === meetingId)?.title || '' }) : mt(lang, 'minNewMeeting')}
            </p>
            <div className="grid sm:grid-cols-4 gap-2">
              {!meetingId && (
                <>
                  <Field label={mt(lang, 'title')} className="sm:col-span-2">
                    <input className="input-field text-sm" value={meeting.title || ''} onChange={(e) => setMeeting({ ...meeting, title: e.target.value })} />
                  </Field>
                  <Field label={mt(lang, 'meetingBody')}>
                    <select className="input-field text-sm" value={meeting.body} onChange={(e) => setMeeting({ ...meeting, body: e.target.value })}>
                      {MEETING_BODIES.map((b) => <option key={b} value={b}>{mt(lang, `meetingBody_${b}`)}</option>)}
                    </select>
                  </Field>
                  <Field label={mt(lang, 'meetingOn')} required>
                    <input type="date" className="input-field text-sm" value={meeting.meeting_on || ''} onChange={(e) => setMeeting({ ...meeting, meeting_on: e.target.value })} />
                  </Field>
                </>
              )}
              <Field label={mt(lang, 'meetingTime')}>
                <input type="time" className="input-field text-sm" value={meeting.meeting_time || ''} onChange={(e) => setMeeting({ ...meeting, meeting_time: e.target.value })} />
              </Field>
              <Field label={mt(lang, 'location')}>
                <input className="input-field text-sm" value={meeting.location || ''} onChange={(e) => setMeeting({ ...meeting, location: e.target.value })} />
              </Field>
              <Field label={mt(lang, 'quorumReached')}>
                <select
                  className="input-field text-sm"
                  value={meeting.quorum_reached === null ? '' : meeting.quorum_reached ? 'yes' : 'no'}
                  onChange={(e) => setMeeting({ ...meeting, quorum_reached: e.target.value === '' ? null : e.target.value === 'yes' })}
                >
                  <option value="">—</option>
                  <option value="yes">✓</option>
                  <option value="no">✗</option>
                </select>
              </Field>
              <Field label={mt(lang, 'attendees')} className="sm:col-span-4">
                <input className="input-field text-sm" value={meeting.attendees || ''} onChange={(e) => setMeeting({ ...meeting, attendees: e.target.value })} />
              </Field>
            </div>
          </section>

          {/* Body a rozhodnutia */}
          <section className="space-y-2">
            <h5 className="text-sm font-semibold text-harbor">2 · {mt(lang, 'minSectionItems')} ({items.filter((x) => x.selected).length})</h5>
            <ol className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className={`rounded-md border p-3 ${it.selected ? 'border-ink/15' : 'border-ink/5 opacity-50'}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1.5" checked={it.selected} onChange={(e) => setItem(i, { selected: e.target.checked })} />
                    <span className="font-display text-harbor w-6 flex-shrink-0 mt-1">{i + 1}.</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input className="input-field text-sm font-semibold" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                      <div className="flex flex-wrap gap-2 items-center">
                        <Pill tone={it.item_type === 'decision' ? 'harbor' : 'neutral'}>{mt(lang, `itemType_${it.item_type}`)}</Pill>
                        {it.page && <span className="text-xs text-ink/50">{mt(lang, 'minPage', { n: it.page })}</span>}
                      </div>
                      {it.summary && <p className="text-xs text-ink/60 italic">{it.summary}</p>}
                      <textarea rows={2} className="input-field text-sm" placeholder={mt(lang, 'outcome')} value={it.outcome || ''} onChange={(e) => setItem(i, { outcome: e.target.value })} />
                      {it.decision && (
                        <div className="rounded-md bg-harbor/5 p-2 space-y-2">
                          <label className="flex items-center gap-2 text-sm text-harbor font-semibold">
                            <input type="checkbox" checked={it.makeDecision} onChange={(e) => setItem(i, { makeDecision: e.target.checked })} />
                            ⚖️ {mt(lang, 'minRecordDecision')}
                          </label>
                          {it.makeDecision && (
                            <>
                              <Field label={mt(lang, 'minDecisionText')}>
                                <textarea rows={2} className="input-field text-sm" value={it.decision.decision || ''} onChange={(e) => setDecision(i, { decision: e.target.value })} />
                              </Field>
                              <Field label={mt(lang, 'minRationale')}>
                                <input className="input-field text-sm" value={it.decision.rationale || ''} onChange={(e) => setDecision(i, { rationale: e.target.value })} />
                              </Field>
                              <div className="flex flex-wrap items-end gap-2">
                                <Field label={mt(lang, 'minVotes')}>
                                  <div className="flex gap-1">
                                    {['votes_for', 'votes_against', 'votes_abstain'].map((k) => (
                                      <input
                                        key={k}
                                        type="number"
                                        min="0"
                                        className="input-field !w-16 text-sm"
                                        value={it.decision[k] ?? ''}
                                        onChange={(e) => setDecision(i, { [k]: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                      />
                                    ))}
                                  </div>
                                </Field>
                                {it.decision.unanimous && <Pill tone="green">{mt(lang, 'minUnanimous')}</Pill>}
                              </div>
                              {(it.supplier_ids.length > 0 || it.tender_ids.length > 0 || it.contract_ids.length > 0) && (
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="text-xs text-ink/60">🔗 {mt(lang, 'minLinkedTo')}:</span>
                                  {it.supplier_ids.map((id) => chip('supplier', id))}
                                  {it.tender_ids.map((id) => chip('tender', id))}
                                  {it.contract_ids.map((id) => chip('contract', id))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Nové úlohy */}
          <section className="space-y-2">
            <h5 className="text-sm font-semibold text-harbor">3 · {mt(lang, 'minSectionActions')} ({actions.filter((x) => x.selected).length})</h5>
            {actions.length === 0 ? (
              <p className="text-sm text-ink/50">{mt(lang, 'minNoActions')}</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className={`rounded-md border p-3 ${a.selected ? 'border-ink/15' : 'border-ink/5 opacity-50'}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1.5" checked={a.selected} onChange={(e) => setAction(i, { selected: e.target.checked })} />
                      <div className="flex-1 min-w-0 space-y-2">
                        <input className="input-field text-sm font-semibold" value={a.title} onChange={(e) => setAction(i, { title: e.target.value })} />
                        <div className="flex flex-wrap gap-2 items-center text-xs text-ink/60">
                          {a.item_index !== null && <span>↳ {mt(lang, 'minFromPoint', { n: a.item_index + 1 })}</span>}
                          {a.priority === 'high' && <Pill tone="red">{mt(lang, 'priority_high')}</Pill>}
                          {a.tender_id && chip('tender', a.tender_id)}
                          {a.contract_id && chip('contract', a.contract_id)}
                        </div>
                        <div className="grid sm:grid-cols-4 gap-2">
                          <Field label={mt(lang, 'executorRole')}>
                            <select className="input-field text-sm" value={a.executor_role} onChange={(e) => setAction(i, { executor_role: e.target.value })}>
                              {EXECUTOR_ROLES.map((r) => <option key={r} value={r}>{mt(lang, `role_${r}`)}</option>)}
                            </select>
                          </Field>
                          <Field label={mt(lang, 'executorName')}>
                            <input className="input-field text-sm" value={a.executor_name || ''} onChange={(e) => setAction(i, { executor_name: e.target.value || null })} />
                          </Field>
                          <Field label={mt(lang, 'supervisor')}>
                            <input className="input-field text-sm" value={a.supervisor_name || ''} onChange={(e) => setAction(i, { supervisor_name: e.target.value || null })} />
                          </Field>
                          <Field label={mt(lang, 'dueDate')}>
                            <input type="date" className="input-field text-sm" value={a.due_date || ''} onChange={(e) => setAction(i, { due_date: e.target.value || null })} />
                          </Field>
                        </div>
                        {a.due_text ? (
                          <p className="text-xs text-ochre">⏰ {mt(lang, 'minDueAsWritten', { text: a.due_text })}</p>
                        ) : (
                          !a.due_date && <p className="text-xs text-ink/50">⏰ {mt(lang, 'minNoDue')}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stav existujúcich úloh */}
          {updates.length > 0 && (
            <section className="space-y-2">
              <h5 className="text-sm font-semibold text-harbor">4 · {mt(lang, 'minSectionUpdates')} ({updates.filter((x) => x.selected).length})</h5>
              <ul className="space-y-2">
                {updates.map((u, i) => {
                  const task = names.task[u.task_id];
                  return (
                    <li key={i} className={`rounded-md border p-3 ${u.selected ? 'border-ink/15' : 'border-ink/5 opacity-50'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1.5" checked={u.selected} onChange={(e) => setUpdate(i, { selected: e.target.checked })} />
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-sm font-semibold text-ink">
                            {task?.title || '…'}{' '}
                            {task && <Pill tone="neutral">{mt(lang, `taskStatus_${task.status}`)}</Pill>}
                          </p>
                          <div className="grid sm:grid-cols-3 gap-2">
                            <Field label={mt(lang, 'minNewStatus')}>
                              <select className="input-field text-sm" value={u.new_status || ''} onChange={(e) => setUpdate(i, { new_status: e.target.value || null })}>
                                <option value="">{mt(lang, 'minKeepStatus')}</option>
                                {TASK_STATUSES.map((s) => <option key={s} value={s}>{mt(lang, `taskStatus_${s}`)}</option>)}
                              </select>
                            </Field>
                            <Field label={mt(lang, 'notes')} className="sm:col-span-2">
                              <input className="input-field text-sm" value={u.note} onChange={(e) => setUpdate(i, { note: e.target.value })} />
                            </Field>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="space-y-2 border-t border-ink/10 pt-3">
            {nextMeetingOn && !meetings.some((m) => m.meeting_on === nextMeetingOn) && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={planNext} onChange={(e) => setPlanNext(e.target.checked)} />
                📅 {mt(lang, 'minNextMeeting', { date: formatDate(nextMeetingOn, lang) })} — {mt(lang, 'minCreateNextMeeting')}
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-ink/70">
              <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
              {mt(lang, 'minAsDemo')}
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={stage === 'saving'} onClick={save}>
                {stage === 'saving' ? mt(lang, 'minSaving') : `✓ ${mt(lang, 'minSaveAll')}`}
              </button>
              <button className="btn-secondary" disabled={stage === 'saving'} onClick={onClose}>{mt(lang, 'minDiscard')}</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="rounded-md border border-sea/40 bg-sea/10 px-3 py-3 space-y-2">
          <p className="text-sm text-ink font-semibold">
            ✓ {mt(lang, 'minSaved', { items: result.items, decisions: result.decisions, tasks: result.tasks, updates: result.task_updates })}
          </p>
          <p className="text-sm text-ink/70">{mt(lang, 'minWhereNext')}</p>
          <button className="btn-secondary text-sm" onClick={onClose}>OK</button>
        </div>
      )}
    </div>
  );
}
