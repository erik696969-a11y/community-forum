'use client';

// Board a mandáty: kto zastáva akú funkciu, od kedy do kedy, kto ho zvolil
// a kto má prístup do Memorie. Pri skončení mandátu pripomenie odobratie prístupu.
// O prístupe rozhoduje board — obrazovka iba ukazuje fakty a vykoná zmenu na pokyn.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, cleanFormValues, todayIso } from '../../../lib/memoriaI18n';
import { MANDATE_POSITIONS, BOARD_POSITIONS, mandateChecks, mandateState, mandateEnd } from '../../../lib/memoriaMandates';
import { Field, Pill, ErrorBox, DetailRow, DemoPill } from './MemoriaUi';
import Attachments, { removeEntityExtras } from './Attachments';
import EmailSettings from './EmailSettings';

const EMPTY_FORM = {
  person_name: '',
  profile_id: '',
  position: 'board_member',
  starts_on: '',
  ends_on: '',
  ended_on: '',
  appointed_by: '',
  decision_id: '',
  access_granted_on: '',
  access_removed_on: '',
  notes: '',
};

function toForm(m) {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const v = m[key];
    form[key] = v === null || v === undefined ? '' : String(v);
  }
  return form;
}

const POSITION_ORDER = Object.fromEntries(MANDATE_POSITIONS.map((p, i) => [p, i]));

export default function MandatesPanel({ lang, profile, onChanged }) {
  const [mandates, setMandates] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const today = todayIso();

  async function load() {
    const [mRes, pRes, dRes] = await Promise.all([
      supabase.from('memoria_mandates').select('*').order('starts_on', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, status, apartment_number').eq('status', 'approved').order('full_name', { ascending: true }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
    ]);
    const firstError = mRes.error || pRes.error || dRes.error;
    setLoadError(firstError ? firstError.message : '');
    setMandates(mRes.data || []);
    setProfiles(pRes.data || []);
    setDecisions(dRes.data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    load();
  }, []);

  const profileById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const checks = useMemo(() => mandateChecks(mandates, profiles, today), [mandates, profiles, today]);

  const byState = useMemo(() => {
    const groups = { current: [], future: [], past: [] };
    for (const m of mandates) groups[mandateState(m, today)].push(m);
    groups.current.sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) || a.person_name.localeCompare(b.person_name));
    return groups;
  }, [mandates, today]);

  function openNew() {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId('new');
  }

  function openEdit(m) {
    setForm(toForm(m));
    setFormError('');
    setEditingId(m.id);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const values = cleanFormValues(form);
    if (!values.person_name || !values.position || !values.starts_on) {
      setFormError(`${mt(lang, 'personName')}, ${mt(lang, 'position')}, ${mt(lang, 'mandateStarts')}: ${mt(lang, 'required')}`);
      return;
    }
    if ((values.ends_on && values.ends_on < values.starts_on) || (values.ended_on && values.ended_on < values.starts_on)) {
      setFormError(mt(lang, 'mandateDatesInvalid'));
      return;
    }
    setSaving(true);
    const res =
      editingId === 'new'
        ? await supabase.from('memoria_mandates').insert(values)
        : await supabase.from('memoria_mandates').update(values).eq('id', editingId);
    setSaving(false);
    if (res.error) {
      setFormError(mt(lang, 'saveError', { error: res.error.message }));
      return;
    }
    setEditingId(null);
    await load();
    onChanged?.();
  }

  async function handleDelete(m) {
    if (!window.confirm(mt(lang, 'confirmDelete'))) return;
    await removeEntityExtras('mandate', m.id);
    const { error } = await supabase.from('memoria_mandates').delete().eq('id', m.id);
    if (error) {
      setActionError(mt(lang, 'saveError', { error: error.message }));
      return;
    }
    await load();
    onChanged?.();
  }

  async function grantAccess(m) {
    const p = profileById[m.profile_id];
    if (!p) return;
    if (!window.confirm(mt(lang, 'confirmGrantAccess', { name: p.full_name || m.person_name }))) return;
    setBusyId(m.id);
    setActionError('');
    const { error } = await supabase.from('profiles').update({ role: 'board' }).eq('id', p.id);
    if (!error) {
      await supabase.from('memoria_mandates').update({ access_granted_on: today, access_removed_on: null }).eq('id', m.id);
    }
    setBusyId(null);
    if (error) setActionError(mt(lang, 'saveError', { error: error.message }));
    await load();
    onChanged?.();
  }

  async function removeAccess(profileId, mandateId, name) {
    setActionError('');
    if (profileId === profile?.id) {
      setActionError(mt(lang, 'cannotRemoveSelf'));
      return;
    }
    const boardCount = profiles.filter((p) => p.role === 'board').length;
    if (boardCount <= 1) {
      setActionError(mt(lang, 'cannotRemoveLast'));
      return;
    }
    if (!window.confirm(mt(lang, 'confirmRemoveAccess', { name }))) return;
    setBusyId(mandateId || profileId);
    const { error } = await supabase.from('profiles').update({ role: 'owner' }).eq('id', profileId);
    if (!error && mandateId) {
      await supabase.from('memoria_mandates').update({ access_removed_on: today }).eq('id', mandateId);
    }
    setBusyId(null);
    if (error) setActionError(mt(lang, 'saveError', { error: error.message }));
    await load();
    onChanged?.();
  }

  function accessLine(m) {
    if (mandateState(m, today) === 'past' && m.access_removed_on) {
      return <Pill>{`${mt(lang, 'accessRemovedOn')} ${formatDate(m.access_removed_on, lang)}`}</Pill>;
    }
    if (!m.profile_id) return <Pill>{mt(lang, 'noLinkedAccount')}</Pill>;
    const p = profileById[m.profile_id];
    if (!p) return <Pill>{mt(lang, 'noLinkedAccount')}</Pill>;
    const has = p.role === 'board';
    return <Pill tone={has ? 'green' : 'neutral'}>{has ? mt(lang, 'hasBoardAccess') : mt(lang, 'noBoardAccess')}</Pill>;
  }

  function accessButton(m) {
    const p = m.profile_id ? profileById[m.profile_id] : null;
    if (!p || !BOARD_POSITIONS.includes(m.position)) return null;
    const state = mandateState(m, today);
    if (state === 'current' && p.role !== 'board') {
      return (
        <button className="btn-secondary text-sm py-1" disabled={busyId === m.id} onClick={() => grantAccess(m)}>
          {mt(lang, 'grantAccess')}
        </button>
      );
    }
    const stillCurrentElsewhere = mandates.some(
      (o) => o.id !== m.id && o.profile_id === m.profile_id && mandateState(o, today) === 'current' && BOARD_POSITIONS.includes(o.position)
    );
    if (state === 'past' && p.role === 'board' && !stillCurrentElsewhere) {
      return (
        <button className="btn-secondary text-sm py-1 !border-red-300 !text-red-700" disabled={busyId === m.id} onClick={() => removeAccess(p.id, m.id, p.full_name || m.person_name)}>
          {mt(lang, 'removeAccess')}
        </button>
      );
    }
    return null;
  }

  function renderMandate(m) {
    const end = mandateEnd(m);
    const d = m.decision_id ? decisionById[m.decision_id] : null;
    const open = expanded[m.id];
    return (
      <li key={m.id} className="card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-harbor">
              {m.person_name} <DemoPill show={m.is_demo} />
            </p>
            <p className="text-sm text-ink/70">
              {mt(lang, `pos_${m.position}`)} · {formatDate(m.starts_on, lang)}
              {end ? ` – ${formatDate(end, lang)}` : ''}
              {m.ended_on ? ` (${mt(lang, 'mandateEndedLabel', { date: formatDate(m.ended_on, lang) })})` : ''}
            </p>
            {m.appointed_by && <p className="text-xs text-ink/50">{m.appointed_by}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {BOARD_POSITIONS.includes(m.position) && accessLine(m)}
            {accessButton(m)}
          </div>
        </div>
        <div className="flex gap-3 mt-2 text-xs">
          <button className="text-harbor hover:underline" onClick={() => setExpanded((x) => ({ ...x, [m.id]: !x[m.id] }))}>
            {open ? `▾ ${mt(lang, 'showLess')}` : `▸ ${mt(lang, 'showMore')}`}
          </button>
          <button className="text-harbor hover:underline" onClick={() => openEdit(m)}>{mt(lang, 'edit')}</button>
          <button className="text-red-700 hover:underline" onClick={() => handleDelete(m)}>{mt(lang, 'delete')}</button>
        </div>
        {open && (
          <div className="mt-3 space-y-2">
            {d && <DetailRow label={mt(lang, 'approvedByDecision')}>{`${formatDate(d.decided_on, lang)} · ${d.title}`}</DetailRow>}
            {m.profile_id && profileById[m.profile_id] && (
              <DetailRow label={mt(lang, 'linkedAccount')}>{profileById[m.profile_id].full_name}</DetailRow>
            )}
            <DetailRow label={mt(lang, 'accessGrantedOn')}>{m.access_granted_on ? formatDate(m.access_granted_on, lang) : null}</DetailRow>
            <DetailRow label={mt(lang, 'accessRemovedOn')}>{m.access_removed_on ? formatDate(m.access_removed_on, lang) : null}</DetailRow>
            <DetailRow label={mt(lang, 'notes')}>{m.notes}</DetailRow>
            <Attachments lang={lang} entityType="mandate" entityId={m.id} defaultType="minutes" />
          </div>
        )}
      </li>
    );
  }

  const tone = { ending: 'bg-ochre', leftover_access: 'bg-red-500', no_mandate: 'bg-ink/30' };
  function checkText(c) {
    if (c.kind === 'ending') return mt(lang, 'alertMandateEnding', { name: c.name, position: mt(lang, `pos_${c.position}`), date: formatDate(c.date, lang) });
    if (c.kind === 'leftover_access') return mt(lang, 'alertLeftoverAccess', { name: c.name, date: formatDate(c.date, lang) });
    return mt(lang, 'alertNoMandate', { name: c.name });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink/70 max-w-2xl">{mt(lang, 'mandatesIntro')}</p>
        {editingId === null && (
          <button className="btn-primary text-sm" onClick={openNew}>+ {mt(lang, 'newMandate')}</button>
        )}
      </div>

      <ErrorBox message={loadError} />
      <ErrorBox message={actionError} />

      {checks.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-harbor mb-2">🔔 {mt(lang, 'alertsTitle')}</p>
          <ul className="space-y-2">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 flex-wrap text-sm">
                <span className="flex items-start gap-2">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${tone[c.kind]}`} />
                  <span>{checkText(c)}</span>
                </span>
                {c.kind !== 'ending' && c.profileId && c.profileId !== profile?.id && (
                  <button
                    className="btn-secondary text-xs py-1 !border-red-300 !text-red-700"
                    disabled={busyId === (c.mandateId || c.profileId)}
                    onClick={() => removeAccess(c.profileId, c.mandateId, c.name)}
                  >
                    {mt(lang, 'removeAccess')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/40 italic mt-3">{mt(lang, 'alertsFactsOnly')}</p>
        </div>
      )}

      {editingId !== null && (
        <form onSubmit={handleSave} className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={mt(lang, 'personName')} required>
              <input className="input-field" value={form.person_name} onChange={(e) => setField('person_name', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'position')} required>
              <select className="input-field" value={form.position} onChange={(e) => setField('position', e.target.value)}>
                {MANDATE_POSITIONS.map((p) => (
                  <option key={p} value={p}>{mt(lang, `pos_${p}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={mt(lang, 'linkedAccount')}>
              <select
                className="input-field"
                value={form.profile_id}
                onChange={(e) => {
                  const id = e.target.value;
                  setField('profile_id', id);
                  if (id && !form.person_name) setField('person_name', profileById[id]?.full_name || '');
                }}
              >
                <option value="">{mt(lang, 'noLinkedAccount')}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}{p.apartment_number ? ` · ${p.apartment_number}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={mt(lang, 'appointedBy')}>
              <input className="input-field" value={form.appointed_by} onChange={(e) => setField('appointed_by', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'mandateStarts')} required>
              <input type="date" className="input-field" value={form.starts_on} onChange={(e) => setField('starts_on', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'mandateEndsPlanned')} hint={mt(lang, 'mandateEndsHint')}>
              <input type="date" className="input-field" value={form.ends_on} onChange={(e) => setField('ends_on', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'mandateEndedOn')}>
              <input type="date" className="input-field" value={form.ended_on} onChange={(e) => setField('ended_on', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'approvedByDecision')}>
              <select className="input-field" value={form.decision_id} onChange={(e) => setField('decision_id', e.target.value)}>
                <option value="">{mt(lang, 'none')}</option>
                {decisions.map((d) => (
                  <option key={d.id} value={d.id}>{`${formatDate(d.decided_on, lang)} · ${d.title}`}</option>
                ))}
              </select>
            </Field>
            <Field label={mt(lang, 'accessGrantedOn')}>
              <input type="date" className="input-field" value={form.access_granted_on} onChange={(e) => setField('access_granted_on', e.target.value)} />
            </Field>
            <Field label={mt(lang, 'accessRemovedOn')}>
              <input type="date" className="input-field" value={form.access_removed_on} onChange={(e) => setField('access_removed_on', e.target.value)} />
            </Field>
          </div>
          <Field label={mt(lang, 'notes')}>
            <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </Field>
          <ErrorBox message={formError} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? mt(lang, 'saving') : mt(lang, 'save')}</button>
            <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>{mt(lang, 'cancel')}</button>
          </div>
        </form>
      )}

      {loadingData ? (
        <p className="text-sm text-ink/60">{mt(lang, 'loading')}</p>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-semibold text-ink/50 uppercase tracking-wide mb-2">{mt(lang, 'mandatesCurrent')}</h2>
            {byState.current.length === 0 ? <p className="text-sm text-ink/60">{mt(lang, 'empty')}</p> : <ul className="space-y-3">{byState.current.map(renderMandate)}</ul>}
          </section>
          {byState.future.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-ink/50 uppercase tracking-wide mb-2">{mt(lang, 'mandatesFuture')}</h2>
              <ul className="space-y-3">{byState.future.map(renderMandate)}</ul>
            </section>
          )}
          {byState.past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-ink/50 uppercase tracking-wide mb-2">{mt(lang, 'mandatesPast')}</h2>
              <ul className="space-y-3">{byState.past.map(renderMandate)}</ul>
            </section>
          )}
        </>
      )}

      <EmailSettings lang={lang} profile={profile} />
    </div>
  );
}
