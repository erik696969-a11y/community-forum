'use client';

// Site Manager reporting — obrazovka modulu (Log · Report · Committee).
// Kto čo vidí a smie, rozhoduje databáza (sm_me / sm_read / sm_add_*); táto stránka len zobrazuje.
// Jazyk nástroja aj reportov je angličtina (podmienka funkcie Site Managera, board nehovorí po španielsky).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import Header from '../components/Header';
import {
  LOCATIONS, TYPES, URGENCIES, TYPE_LABEL, URGENCY_LABEL, STATUS_LABEL, STATE_LABEL,
  deriveEntry, workingMs, durationText, periodSummary, committeeSummary, targetValues, fmtDateTime, fmtShort,
} from '../../lib/siteKpi';

const STATE_TONE = { met: 'text-green-700', below: 'text-amber-700', missed: 'text-red-700', none: 'text-ink/50' };

// Zmenšenie fotky v prehliadači (ako v pôvodnom nástroji), aby slabý mobilný signál nebol prekážkou.
function shrinkImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) return resolve(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        let { width: w, height: h } = img;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; }
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob((b) => resolve(b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.75);
      };
      img.onerror = () => resolve(file);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadTo(prefix, file) {
  const small = await shrinkImage(file);
  const ext = small.type === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('site').upload(path, small, { contentType: small.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

async function openFile(path) {
  const { data } = await supabase.storage.from('site').createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}

async function authedPost(url, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function Msg({ msg }) {
  if (!msg) return null;
  return <div className={`rounded-md px-3 py-2 text-sm mb-4 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</div>;
}

function Chips({ values, value, onChange, labels, danger }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full border px-4 py-2 text-sm ${value === v ? (danger && v === 'high' ? 'bg-red-700 border-red-700 text-white font-semibold' : 'bg-harbor border-harbor text-white font-semibold') : 'bg-white border-sand text-ink/70'}`}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

function Integrity({ integrity }) {
  if (!integrity) return null;
  return integrity.ok ? (
    <p className="text-xs text-ink/50 mt-6">Record integrity verified · fingerprint <span className="font-mono">{integrity.fingerprint}</span> · {integrity.count} records. Every report carries this fingerprint.</p>
  ) : (
    <p className="text-sm text-red-700 font-semibold mt-6">Record integrity check FAILED at record {integrity.broken_at}. An earlier record no longer matches its fingerprint — inform the Committee.</p>
  );
}

function ConflictNote({ conflicts }) {
  if (!conflicts?.length) return null;
  return (
    <div className="rounded-md border-l-4 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-ink mb-4">
      <b>Not part of the authorisation:</b> {conflicts.map((c) => c.name).join(', ')} — declared relationship with the Site Manager
      {conflicts[0].minute_ref ? ` (minute ${conflicts[0].minute_ref})` : ''}. This protects both sides; it is not a suspicion.
    </div>
  );
}

const EMPTY_ENTRY = { type: '', location: '', block: '', description: '', urgency: '' };
const EMPTY_WORK = { description: '', estimate: '', recommended: '', reason: '', approver: 'To be confirmed at review' };

export default function SitePage() {
  const router = useRouter();
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [tab, setTab] = useState('log');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [photo, setPhoto] = useState(null);
  const [work, setWork] = useState(EMPTY_WORK);
  const [quotes, setQuotes] = useState([{}, {}, {}]);

  const [kind, setKind] = useState('weekly');
  const [note, setNote] = useState('');
  const [monthly, setMonthly] = useState({ maintenance_due: '', maintenance_done: '', inspections: '' });
  const [days, setDays] = useState(90);
  const [comment, setComment] = useState('');
  const [access, setAccess] = useState([]);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!loading && !session) router.replace('/login?next=/site');
  }, [loading, session, router]);

  const load = useCallback(async () => {
    const { data: meData } = await supabase.rpc('sm_me');
    setMe(meData || {});
    if (!meData?.site_manager && !meData?.point_of_contact) return;
    const [{ data: d, error }, { data: c }] = await Promise.all([
      supabase.rpc('sm_read', { p_scope: 'screen' }),
      supabase.rpc('sm_active_conflicts'),
    ]);
    if (error) setMsg({ ok: false, text: error.message });
    setData(d || null);
    setConflicts(c || []);
    if (meData.point_of_contact && !meData.site_manager) {
      setTab((t) => (t === 'log' ? 'committee' : t));
      const { data: log } = await supabase.rpc('sm_read_access_log', { p_limit: 20 });
      setAccess(log || []);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const t = useMemo(() => targetValues(data?.targets), [data]);
  const derived = useMemo(() => (data?.entries || []).map(deriveEntry).sort((a, b) => b.createdAt - a.createdAt), [data]);
  const summary = useMemo(() => (data ? periodSummary({ entries: data.entries, reports: data.reports, kind }) : null), [data, kind]);
  const committee = useMemo(
    () => (data && me?.point_of_contact ? committeeSummary({ entries: data.entries, reports: data.reports, works: data.works, targets: data.targets, days }) : null),
    [data, days, me],
  );

  if (loading || !me) {
    return <main className="min-h-screen flex items-center justify-center"><p className="text-harbor">Loading…</p></main>;
  }
  if (!me.site_manager && !me.point_of_contact) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-xl mx-auto px-4 py-10"><p className="text-ink/70">Site reporting is not enabled for your account.</p></div>
      </main>
    );
  }

  const canWrite = !!me.site_manager;
  const isContact = !!me.point_of_contact;
  const isProc = entry.type === 'procurement';

  async function saveEntry() {
    setMsg(null);
    if (!entry.type || !entry.location || !entry.description.trim()) {
      setMsg({ ok: false, text: 'Type, location and description are required.' });
      return;
    }
    setBusy('entry');
    try {
      const path = photo ? await uploadTo('entries', photo) : null;
      const { data: ref, error } = await supabase.rpc('sm_add_entry', {
        p_type: entry.type, p_location: entry.location, p_block: entry.block, p_description: entry.description,
        p_urgency: entry.urgency || 'low', p_photo_path: path,
      });
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: `Saved — ${ref}` });
      setEntry(EMPTY_ENTRY);
      setPhoto(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: `Could not save: ${e.message}` });
    }
    setBusy('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveWork(requestApproval) {
    setMsg(null);
    if (!work.description.trim() || work.estimate === '') {
      setMsg({ ok: false, text: 'Description and estimated value are required.' });
      return;
    }
    setBusy(requestApproval ? 'approval' : 'work');
    try {
      const quotations = [];
      for (const q of quotes) {
        if (!q.supplier) continue;
        const docPath = q.file ? await uploadTo('quotes', q.file) : null;
        quotations.push({ supplier: q.supplier, amount: q.amount === '' ? 0 : Number(q.amount), doc_path: docPath });
      }
      const { data: ref, error } = await supabase.rpc('sm_add_work', {
        p_location: entry.location, p_description: work.description, p_estimate: Number(work.estimate),
        p_recommended: work.recommended, p_reason: work.reason, p_approver_label: work.approver,
        p_quotations: quotations, p_request_approval: requestApproval,
      });
      if (error) throw new Error(error.message);
      let text = `Saved — ${ref}`;
      if (requestApproval) {
        try {
          const r = await authedPost('/api/site/approval', { reference: ref });
          text = `Saved and sent for approval to ${r.to} — ${ref}`;
        } catch (e) {
          text = `Saved (${ref}), but the request could not be sent: ${e.message}`;
        }
      }
      setMsg({ ok: !text.includes('could not'), text });
      setWork(EMPTY_WORK);
      setQuotes([{}, {}, {}]);
      setEntry(EMPTY_ENTRY);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: `Could not save: ${e.message}` });
    }
    setBusy('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function addEvent(ref, kindName) {
    let reason = null;
    if (kindName === 'hold') {
      reason = window.prompt('Waiting on what? (Committee, supplier, part, insurer, owner access)');
      if (!reason) return;
    }
    setBusy(ref);
    const { error } = await supabase.rpc('sm_add_event', { p_reference: ref, p_kind: kindName, p_reason: reason });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${kindName === 'hold' ? 'On hold' : kindName === 'resume' ? 'Resumed' : 'Closed'} — ${ref}` });
    setBusy('');
    await load();
  }

  async function sendReport() {
    setBusy('report');
    setMsg(null);
    try {
      const r = await authedPost('/api/site/report', { kind, note, monthly: kind === 'monthly' ? monthly : null });
      setDone(`${kind.charAt(0).toUpperCase() + kind.slice(1)} report with ${r.count} ${r.count === 1 ? 'entry' : 'entries'} sent to ${r.sentTo}.`);
      setNote('');
      setMonthly({ maintenance_due: '', maintenance_done: '', inspections: '' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: `Could not send: ${e.message}` });
    }
    setBusy('');
  }

  async function sendCommittee() {
    setBusy('committee');
    setMsg(null);
    try {
      const r = await authedPost('/api/site/committee', { days, comment });
      setDone(`Sent to ${r.sentTo} recipients: the Committee and the Site Manager.`);
      setComment('');
      await load();
    } catch (e) {
      setMsg({ ok: false, text: `Could not send: ${e.message}` });
    }
    setBusy('');
  }

  async function toMemoria(w) {
    setBusy(w.id);
    setMsg(null);
    try {
      const r = await authedPost('/api/site/to-memoria', { workId: w.id });
      setMsg({
        ok: !r.failed?.length,
        text: `${r.reference} is now a tender in Memoria with its quotations${r.documents ? ` and ${r.documents} documents` : ''}.${r.failed?.length ? ` Documents not copied: ${r.failed.join(', ')}.` : ''}`,
      });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setBusy('');
  }

  async function recordDecision(w) {
    const decision = window.prompt('Decision: type "approved" or "declined"');
    if (!decision || !['approved', 'declined'].includes(decision.trim().toLowerCase())) return;
    const by = window.prompt('Decided by (Committee member):') || '';
    const { error } = await supabase.rpc('sm_record_decision', { p_reference: w.reference, p_decision: decision.trim().toLowerCase(), p_decided_by: by });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Decision recorded — ${w.reference}` });
    await load();
  }

  function workStatus(w) {
    const decision = [...(w.events || [])].reverse().find((e) => e.kind === 'decision');
    if (decision) return `${decision.data.decision === 'approved' ? 'Approved' : 'Declined'}${decision.data.decided_by ? ` by ${decision.data.decided_by}` : ''} · ${fmtShort(decision.created_at)}`;
    if (w.memoria?.status === 'decided') return `Decided in Memoria${w.memoria.selected_supplier ? ` · ${w.memoria.selected_supplier}` : ''}${w.memoria.selection_reason ? ` — ${w.memoria.selection_reason}` : ''}`;
    if (w.memoria?.status === 'cancelled') return 'Cancelled in Memoria';
    if (w.memoria) return 'In Memoria · awaiting the board’s decision';
    if ((w.events || []).some((e) => e.kind === 'approval_requested')) return `Requested ${fmtShort(w.events.find((e) => e.kind === 'approval_requested').created_at)} · awaiting a decision`;
    return 'Recorded';
  }

  const works = [...(data?.works || [])].reverse();
  const tabs = [['log', 'Log'], ...(canWrite ? [['report', 'Report']] : []), ...(isContact ? [['committee', 'Committee']] : [])];

  return (
    <main className="min-h-screen bg-sand/30">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="bg-harbor text-white">
        <div className="max-w-xl mx-auto px-4 pt-3 flex justify-between items-center text-sm">
          <span className="font-semibold">{canWrite ? me.site_manager_name : me.contact_name} · Site reporting</span>
          <span className="opacity-80">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date())}</span>
        </div>
        <div className="max-w-xl mx-auto flex">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setDone(''); setMsg(null); }}
              className={`flex-1 py-3 text-sm font-semibold border-b-4 ${tab === k ? 'border-white text-white' : 'border-transparent text-white/60'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5">
        <Msg msg={msg} />

        {tab === 'log' && (
          <>
            {!canWrite && (
              <div className="rounded-md border-l-4 border-harbor bg-white px-3 py-2 text-sm mb-4">
                You are viewing the record. Entries are made by the Site Manager; this keeps the reporting one-directional and leaves no question about who recorded what.
              </div>
            )}

            {canWrite && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-ink/70 mb-1">Type</label>
                  <Chips values={TYPES} value={entry.type} labels={TYPE_LABEL} onChange={(v) => setEntry({ ...entry, type: v })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink/70 mb-1">Location</label>
                  <select className="input-field" value={entry.location} onChange={(e) => setEntry({ ...entry, location: e.target.value })}>
                    <option value="">— choose —</option>
                    {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                {!isProc && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Block <span className="font-normal">(only where it applies)</span></label>
                      <input className="input-field" inputMode="numeric" placeholder="e.g. 14" value={entry.block} onChange={(e) => setEntry({ ...entry, block: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">What happened</label>
                      <textarea className="input-field" rows={3} maxLength={2000} placeholder="One or two lines. The photo says the rest." value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Urgency</label>
                      <Chips values={URGENCIES} value={entry.urgency} labels={URGENCY_LABEL} danger onChange={(v) => setEntry({ ...entry, urgency: v })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Photo</label>
                      <label className="block w-full rounded-md border-2 border-dashed border-sand bg-white p-4 text-center text-sm text-ink/60 cursor-pointer">
                        {photo ? `Photo attached — ${photo.name}` : 'Take or choose a photo'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <button type="button" className="btn-primary w-full" disabled={busy === 'entry'} onClick={saveEntry}>
                      {busy === 'entry' ? 'Saving…' : 'Save entry'}
                    </button>
                  </>
                )}

                {isProc && (
                  <>
                    <div className="rounded-md border-l-4 border-harbor bg-white px-3 py-2 text-sm">
                      Recording the quotations here is what lets the system count them. Nothing is taken on trust and nothing has to be written up again later.
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">What is being procured</label>
                      <textarea className="input-field" rows={2} placeholder="e.g. Replacement of the Pool 2 pump" value={work.description} onChange={(e) => setWork({ ...work, description: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Estimated value (EUR)</label>
                      <input type="number" min="0" inputMode="decimal" className="input-field" value={work.estimate} onChange={(e) => setWork({ ...work, estimate: e.target.value })} />
                      <p className="text-xs text-ink/60 mt-1">Works above EUR {t.quotation_threshold} need {t.quotations_required} quotations.</p>
                    </div>
                    {quotes.map((q, i) => (
                      <div key={i} className="rounded-md border border-sand bg-white p-3 space-y-2">
                        <p className="text-xs font-bold text-harbor tracking-wide">QUOTATION {i + 1}</p>
                        <input className="input-field" placeholder="Supplier name" value={q.supplier || ''} onChange={(e) => setQuotes(quotes.map((x, k) => (k === i ? { ...x, supplier: e.target.value } : x)))} />
                        <input type="number" min="0" inputMode="decimal" className="input-field" placeholder="Amount in EUR" value={q.amount ?? ''} onChange={(e) => setQuotes(quotes.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                        <label className={`block rounded-md border-2 p-2 text-center text-xs cursor-pointer ${q.file ? 'border-green-700 text-green-800 font-semibold' : 'border-dashed border-sand text-ink/60'}`}>
                          {q.file ? 'Quotation attached' : 'Attach the quotation (photo or PDF)'}
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setQuotes(quotes.map((x, k) => (k === i ? { ...x, file: e.target.files?.[0] || null } : x)))} />
                        </label>
                      </div>
                    ))}
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Recommended supplier</label>
                      <input className="input-field" placeholder="Which one, and it need not be the cheapest" value={work.recommended} onChange={(e) => setWork({ ...work, recommended: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink/70 mb-1">Reason for the recommendation</label>
                      <textarea className="input-field" rows={2} placeholder="Price, scope, availability, previous work" value={work.reason} onChange={(e) => setWork({ ...work, reason: e.target.value })} />
                    </div>
                    <ConflictNote conflicts={conflicts} />
                    <button type="button" className="btn-primary w-full" disabled={!!busy} onClick={() => saveWork(true)}>
                      {busy === 'approval' ? 'Sending…' : 'Save and request approval'}
                    </button>
                    <p className="text-xs text-ink/60 text-center">Sends the quotations to {me.contact_name || 'the point of contact'} straight away, without waiting for the next report.</p>
                    <button type="button" className="btn-secondary w-full" disabled={!!busy} onClick={() => saveWork(false)}>
                      {busy === 'work' ? 'Saving…' : 'Save procurement record'}
                    </button>
                  </>
                )}
              </div>
            )}

            {works.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-ink/70 mb-2">Procurement</h2>
                {isContact && <ConflictNote conflicts={conflicts} />}
                {works.map((w) => {
                  const requested = (w.events || []).some((e) => e.kind === 'approval_requested');
                  return (
                    <div key={w.id} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                      <div className="flex justify-between gap-2 text-xs text-ink/60">
                        <span>EUR {Number(w.estimated_value)}{w.recommended ? ` · ${w.recommended}` : ''}</span>
                        <span className="font-semibold text-harbor bg-harbor/10 px-2 rounded">{w.reference}</span>
                      </div>
                      <p className="mt-1">{w.description}</p>
                      <p className="text-xs text-ink/60 mt-1">{(w.quotations || []).length} quotations · {workStatus(w)}</p>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {(w.quotations || []).filter((q) => q.doc_path).map((q) => (
                          <button key={q.position} type="button" className="text-xs text-harbor underline" onClick={() => openFile(q.doc_path)}>{q.supplier}</button>
                        ))}
                      </div>
                      {isContact && requested && !w.memoria && !(w.events || []).some((e) => e.kind === 'decision') && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button type="button" className="btn-primary !w-auto text-sm" disabled={busy === w.id} onClick={() => toMemoria(w)}>
                            {busy === w.id ? 'Sending…' : 'Send to Memoria'}
                          </button>
                          <button type="button" className="btn-secondary !w-auto text-sm" onClick={() => recordDecision(w)}>Record a decision made by email</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-8">
              <h2 className="text-sm font-semibold text-ink/70 mb-2">Recent entries</h2>
              {derived.length === 0 && <p className="text-sm text-ink/50">Nothing yet.</p>}
              {derived.slice(0, 15).map((d) => (
                <div key={d.reference} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                  <div className="flex justify-between gap-2 text-xs text-ink/60">
                    <span>{fmtDateTime(d.createdAt)} · {d.location}{d.block ? ` ${d.block}` : ''} · {URGENCY_LABEL[d.urgency]}</span>
                    <span className="font-semibold text-harbor bg-harbor/10 px-2 rounded">{d.reference}</span>
                  </div>
                  <p className="mt-1">{d.description}</p>
                  <p className="text-xs text-ink/60 mt-1">
                    {TYPE_LABEL[d.type]} · {STATUS_LABEL[d.status]}
                    {d.status === 'closed' ? ` · worked ${durationText(workingMs(d, d.closedAt))}` : ''}
                    {d.holdMs || d.holdSince ? ` · on hold ${durationText((d.holdMs || 0) + (d.holdSince ? Date.now() - d.holdSince : 0))}${d.holdReason ? ` (${d.holdReason})` : ''}` : ''}
                  </p>
                  <div className="flex justify-between items-center mt-2">
                    {d.photo_path ? <button type="button" className="text-xs text-harbor underline" onClick={() => openFile(d.photo_path)}>Photo</button> : <span />}
                    {canWrite && d.status !== 'closed' && (
                      <span className="flex gap-2">
                        {d.status === 'on_hold' ? (
                          <button type="button" className="btn-secondary !w-auto text-xs !py-1" disabled={busy === d.reference} onClick={() => addEvent(d.reference, 'resume')}>Resume</button>
                        ) : (
                          <button type="button" className="btn-secondary !w-auto text-xs !py-1 !border-amber-700 !text-amber-800" disabled={busy === d.reference} onClick={() => addEvent(d.reference, 'hold')}>Hold</button>
                        )}
                        <button type="button" className="btn-secondary !w-auto text-xs !py-1" disabled={busy === d.reference} onClick={() => addEvent(d.reference, 'close')}>Close</button>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'report' && canWrite && summary && (
          done ? (
            <div className="rounded-md border border-sand bg-white p-6 text-center">
              <h3 className="font-semibold text-lg mb-2">Report sent</h3>
              <p className="text-sm text-ink/70 mb-4">{done}</p>
              <button type="button" className="btn-primary !w-auto" onClick={() => { setDone(''); setTab('log'); }}>Back to log</button>
            </div>
          ) : (
            <div>
              <div className="flex rounded-md border-2 border-ink overflow-hidden mb-4">
                {['weekly', 'fortnightly', 'monthly'].map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 py-2 text-sm font-semibold ${kind === k ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-ink/60 mb-3">{summary.fromText} – {summary.toText}</p>
              <div className="grid grid-cols-4 gap-2 mb-5">
                {[[summary.count, 'logged'], [summary.closed, 'closed'], [summary.openNow, 'open'], [summary.highNow, 'open & high']].map(([v, l]) => (
                  <div key={l} className="rounded-md border border-sand bg-white p-2 text-center"><b className="block text-2xl">{v}</b><span className="text-xs text-ink/60">{l}</span></div>
                ))}
              </div>
              <h2 className="text-sm font-semibold text-ink/70 mb-2">Activity in this period</h2>
              {summary.entries.length === 0 && <p className="text-sm text-ink/50 mb-3">Nothing logged or closed since the last report.</p>}
              {summary.entries.map((e) => (
                <div key={e.ref} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                  <div className="flex justify-between text-xs text-ink/60"><span>{e.location} · {URGENCY_LABEL[e.urgency]}</span><span>{e.ref}</span></div>
                  <p>{e.text}</p>
                  <p className="text-xs text-ink/60">Logged {e.when}{e.closedWhen ? ` · Closed ${e.closedWhen} · worked ${e.took}` : ' · still open'}{e.held ? ` · on hold ${e.held}` : ''}</p>
                </div>
              ))}
              <h2 className="text-sm font-semibold text-ink/70 mt-5 mb-2">Still open</h2>
              {summary.openItems.length === 0 && <p className="text-sm text-ink/50">Nothing open.</p>}
              {summary.openItems.map((e) => (
                <div key={e.ref} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                  <div className="flex justify-between text-xs text-ink/60"><span>{e.location} · {URGENCY_LABEL[e.urgency]}</span><span>open {e.age}</span></div>
                  <p>{e.text}</p>
                </div>
              ))}
              {kind === 'monthly' && (
                <div className="mt-5">
                  <h2 className="text-sm font-semibold text-ink/70 mb-2">Monthly figures</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[['maintenance_due', 'Maintenance tasks due'], ['maintenance_done', 'Completed on time'], ['inspections', 'Inspection rounds done']].map(([k, l]) => (
                      <label key={k} className="text-xs text-ink/70">{l}
                        <input type="number" min="0" inputMode="numeric" className="input-field mt-1" value={monthly[k]} onChange={(e) => setMonthly({ ...monthly, [k]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-ink/60 mt-1">Quotations are not asked for here — the system counts them from the procurement records.</p>
                </div>
              )}
              <div className="mt-5">
                <label className="block text-sm font-semibold text-ink/70 mb-1">Anything for the Committee to decide? (optional)</label>
                <textarea className="input-field" rows={3} maxLength={2000} placeholder="Only what needs a decision. Leave empty if nothing." value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button type="button" className="btn-primary w-full mt-4" disabled={busy === 'report'} onClick={sendReport}>
                {busy === 'report' ? 'Sending…' : `Send ${kind} report to ${(me.contact_name || 'the point of contact').split(' ')[0]}`}
              </button>
            </div>
          )
        )}

        {tab === 'committee' && isContact && committee && (
          done ? (
            <div className="rounded-md border border-sand bg-white p-6 text-center">
              <h3 className="font-semibold text-lg mb-2">Sent to the Committee</h3>
              <p className="text-sm text-ink/70 mb-4">{done}</p>
              <button type="button" className="btn-primary !w-auto" onClick={() => setDone('')}>Back</button>
            </div>
          ) : (
            <div>
              <div className="flex rounded-md border-2 border-ink overflow-hidden mb-4">
                {[[30, '30 days'], [90, '90 days'], [180, '6 months']].map(([d, l]) => (
                  <button key={d} type="button" onClick={() => setDays(d)} className={`flex-1 py-2 text-sm font-semibold ${days === d ? 'bg-ink text-white' : 'bg-white text-ink'}`}>{l}</button>
                ))}
              </div>
              <p className="text-sm text-ink/60 mb-3">{committee.fromText} – {committee.toText}</p>
              <h2 className="text-sm font-semibold text-ink/70 mb-2">Reports received</h2>
              {committee.reports.length === 0 && <p className="text-sm text-ink/50 mb-3">No reports in this period.</p>}
              {committee.reports.map((r, i) => (
                <div key={i} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                  <div className="flex justify-between text-xs text-ink/60"><span>{r.kind} · {r.from} – {r.till}</span><span>sent {r.sent}</span></div>
                  <p>{r.logged} logged, {r.closed} closed</p>
                </div>
              ))}
              <div className="rounded-md border-l-4 border-harbor bg-white px-3 py-2 text-sm my-4">
                This report is built from dated records. Sections 1 and 2 do not depend on anyone’s opinion. Your comment is context only and changes none of the figures.
              </div>
              {[['measured', '1 — Measured by the system'], ['reported', '2 — Reported by the Site Manager']].map(([src, title]) => (
                <div key={src} className="mb-4">
                  <h2 className="text-sm font-semibold text-ink/70 mb-2">{title}</h2>
                  {committee.kpis.filter((k) => k.source === src).map((k) => (
                    <div key={k.name} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm">
                      <div className="flex justify-between gap-2"><span className="font-semibold">{k.name}</span><span className={`font-bold text-xs ${STATE_TONE[k.state]}`}>{STATE_LABEL[k.state]}</span></div>
                      <div className="flex justify-between text-xs text-ink/60"><span>target: {k.target}</span><span className="font-bold text-ink">{k.result}</span></div>
                    </div>
                  ))}
                </div>
              ))}
              {committee.notes.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-ink/70 mb-2">Raised for the Committee</h2>
                  {committee.notes.map((n, i) => <div key={i} className="rounded-md border border-sand bg-white p-3 mb-2 text-sm"><span className="text-xs text-ink/60">{n.when}</span><p>{n.text}</p></div>)}
                </div>
              )}
              <ConflictNote conflicts={conflicts} />
              <label className="block text-sm font-semibold text-ink/70 mb-1">3 — Your comment (optional)</label>
              <textarea className="input-field" rows={3} maxLength={4000} placeholder="Why something slipped, or whether a cause was outside her control. Not a score." value={comment} onChange={(e) => setComment(e.target.value)} />
              <p className="text-xs text-ink/60 mt-1">The report goes to every Committee member, and the Site Manager receives the same figures.</p>
              <button type="button" className="btn-primary w-full mt-4" disabled={busy === 'committee'} onClick={sendCommittee}>
                {busy === 'committee' ? 'Sending…' : 'Send report to the Committee'}
              </button>
              {access.length > 0 && (
                <details className="mt-6 text-xs text-ink/60">
                  <summary className="cursor-pointer">Who opened the record (last {access.length})</summary>
                  <ul className="mt-2 space-y-1">{access.map((a, i) => <li key={i}>{fmtDateTime(a.at)} · {a.who || 'system'} · {a.action}</li>)}</ul>
                </details>
              )}
            </div>
          )
        )}

        <Integrity integrity={data?.integrity} />
      </div>
    </main>
  );
}
