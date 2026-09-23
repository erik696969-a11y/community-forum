'use client';

// Prehľad podľa kategórie dodávateľov a obdobia: kto pre nás pracoval,
// zmluvy (výška, dĺžka), či boli porovnané ponuky, prečo bol vybraný,
// koľko sa fakturovalo. Iba fakty zo záznamov; chýbajúce údaje sa ukážu
// otvorene, nič sa nedopĺňa ani neodhaduje.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, formatMoney, todayIso, SUPPLIER_CATEGORIES } from '../../../lib/memoriaI18n';
import { Field, Pill, ErrorBox } from './MemoriaUi';

function twoYearsAgo() {
  const t = todayIso();
  return `${Number(t.slice(0, 4)) - 2}${t.slice(4)}`;
}

function monthsBetween(from, to) {
  if (!from || !to) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td - fd >= 15) months += 1;
  else if (td - fd <= -15) months -= 1;
  return Math.max(months, 0);
}

function overlaps(start, end, from, to) {
  // Zmluva bez dátumov sa zobrazí (radšej ukázať a označiť, než skryť).
  if (!start && !end) return true;
  if (start && start > to) return false;
  if (end && end < from) return false;
  return true;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportPanel({ lang }) {
  const [category, setCategory] = useState('gardening');
  const [from, setFrom] = useState(twoYearsAgo());
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const [sRes, cRes, tRes, qRes, iRes, dRes] = await Promise.all([
      supabase.from('memoria_suppliers').select('id, name, category, status'),
      supabase.from('memoria_contracts').select('*'),
      supabase.from('memoria_tenders').select('id, title, selection_reason, selected_supplier_id, approved_by_decision_id, status'),
      supabase.from('memoria_quotes').select('tender_id, supplier_id, amount, currency'),
      supabase.from('memoria_invoices').select('supplier_id, contract_id, invoice_date, total_amount, currency, payment_status'),
      supabase.from('memoria_decisions').select('id, title, decided_on'),
    ]);
    const firstError = sRes.error || cRes.error || tRes.error || qRes.error || iRes.error || dRes.error;
    setError(firstError ? firstError.message : '');
    setData({
      suppliers: sRes.data || [],
      contracts: cRes.data || [],
      tenders: tRes.data || [],
      quotes: qRes.data || [],
      invoices: iRes.data || [],
      decisions: dRes.data || [],
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const report = useMemo(() => {
    if (!data) return null;
    const supplierById = Object.fromEntries(data.suppliers.map((s) => [s.id, s]));
    const tenderById = Object.fromEntries(data.tenders.map((t) => [t.id, t]));
    const decisionById = Object.fromEntries(data.decisions.map((d) => [d.id, d]));
    const quoteCount = {};
    for (const q of data.quotes) quoteCount[q.tender_id] = (quoteCount[q.tender_id] || 0) + 1;

    const inCategory = new Set(data.suppliers.filter((s) => s.category === category).map((s) => s.id));
    const invoicesInPeriod = data.invoices.filter(
      (i) => inCategory.has(i.supplier_id) && i.invoice_date && i.invoice_date >= from && i.invoice_date <= to
    );

    const periodContracts = data.contracts
      .filter((c) => inCategory.has(c.supplier_id) && overlaps(c.starts_on, c.ends_on, from, to))
      .sort((a, b) => ((a.starts_on || '') < (b.starts_on || '') ? -1 : 1));

    // Každú faktúru priradíme najviac jednej zmluve: priamo podľa väzby,
    // inak zmluve toho istého dodávateľa, ktorej obdobie obsahuje dátum faktúry.
    const invoiceContract = new Map();
    for (const i of invoicesInPeriod) {
      if (i.contract_id) {
        invoiceContract.set(i, i.contract_id);
        continue;
      }
      const match = periodContracts.find(
        (c) => c.supplier_id === i.supplier_id && overlaps(c.starts_on, c.ends_on, i.invoice_date, i.invoice_date)
      );
      if (match) invoiceContract.set(i, match.id);
    }

    const contracts = periodContracts.map((c) => {
        const tender = c.tender_id ? tenderById[c.tender_id] : null;
        const decisionId = c.approved_by_decision_id || tender?.approved_by_decision_id || null;
        const invoiced = {};
        for (const i of invoicesInPeriod) {
          if (invoiceContract.get(i) === c.id) {
            invoiced[i.currency || 'EUR'] = (invoiced[i.currency || 'EUR'] || 0) + Number(i.total_amount || 0);
          }
        }
        return {
          ...c,
          supplierName: supplierById[c.supplier_id]?.name || '—',
          tender,
          quotes: tender ? quoteCount[tender.id] || 0 : null,
          reason: tender?.selection_reason || null,
          decision: decisionId ? decisionById[decisionId] : null,
          months: monthsBetween(c.starts_on, c.ends_on || (c.status === 'active' ? todayIso() : null)),
          invoiced,
        };
      });

    const shownContractIds = new Set(contracts.map((c) => c.id));
    const looseInvoices = {};
    for (const i of invoicesInPeriod) {
      if (shownContractIds.has(invoiceContract.get(i))) continue;
      const key = i.supplier_id;
      looseInvoices[key] ||= { name: supplierById[key]?.name || '—', totals: {} };
      looseInvoices[key].totals[i.currency || 'EUR'] = (looseInvoices[key].totals[i.currency || 'EUR'] || 0) + Number(i.total_amount || 0);
    }

    const totalInvoiced = {};
    for (const i of invoicesInPeriod) totalInvoiced[i.currency || 'EUR'] = (totalInvoiced[i.currency || 'EUR'] || 0) + Number(i.total_amount || 0);

    const gaps = [];
    for (const c of contracts) {
      if (!c.tender) gaps.push(mt(lang, 'gapNoTender', { name: `${c.supplierName} – ${c.subject}` }));
      else if (!c.reason) gaps.push(mt(lang, 'gapNoReason', { name: c.tender.title }));
      if (!c.starts_on || (!c.ends_on && c.status !== 'active')) gaps.push(mt(lang, 'gapNoDates', { name: `${c.supplierName} – ${c.subject}` }));
      if (c.amount === null) gaps.push(mt(lang, 'gapNoAmount', { name: `${c.supplierName} – ${c.subject}` }));
    }

    const companies = new Set([...contracts.map((c) => c.supplier_id), ...invoicesInPeriod.map((i) => i.supplier_id)]);
    return {
      contracts,
      looseInvoices: Object.values(looseInvoices),
      totalInvoiced: Object.entries(totalInvoiced),
      companies: companies.size,
      withQuotes: contracts.filter((c) => c.quotes !== null && c.quotes >= 2).length,
      gaps,
    };
  }, [data, category, from, to, lang]);

  function moneyList(totals) {
    const entries = Array.isArray(totals) ? totals : Object.entries(totals);
    if (entries.length === 0) return '—';
    return entries.map(([cur, sum]) => formatMoney(sum, cur, lang)).join(' + ');
  }

  function contractAmount(c) {
    if (c.amount === null) return mt(lang, 'notRecorded');
    return `${formatMoney(c.amount, c.currency, lang)}${c.payment_frequency ? ` / ${mt(lang, `freq_${c.payment_frequency}`)}` : ''}`;
  }

  function exportCsv() {
    if (!report) return;
    const header = [
      mt(lang, 'supplier'), mt(lang, 'subject'), mt(lang, 'startsOn'), mt(lang, 'endsOn'), mt(lang, 'duration'),
      mt(lang, 'amount'), mt(lang, 'paymentFrequency'), mt(lang, 'quotesCompared'), mt(lang, 'whyChosen'),
      mt(lang, 'approvedByDecision'), mt(lang, 'invoicedInPeriod'),
    ];
    const rows = report.contracts.map((c) => [
      c.supplierName, c.subject, c.starts_on || '', c.ends_on || '', c.months ?? '',
      c.amount ?? '', c.payment_frequency ? mt(lang, `freq_${c.payment_frequency}`) : '',
      c.quotes === null ? mt(lang, 'noTenderLinked') : c.quotes, c.reason || '',
      c.decision ? `${c.decision.decided_on} ${c.decision.title}` : '',
      Object.entries(c.invoiced).map(([cur, s]) => `${s.toFixed(2)} ${cur}`).join(' + '),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memoria-${category}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="text-sm text-ink/60 mb-4 print:hidden">{mt(lang, 'reportIntro')}</p>
      <div className="grid sm:grid-cols-4 gap-3 items-end mb-6 print:hidden">
        <Field label={mt(lang, 'category')}>
          <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>{mt(lang, `cat_${c}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={mt(lang, 'periodFrom')}>
          <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={mt(lang, 'periodTo')}>
          <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => window.print()}>{mt(lang, 'print')}</button>
          <button type="button" className="btn-secondary text-sm" onClick={exportCsv}>{mt(lang, 'exportCsv')}</button>
        </div>
      </div>

      <ErrorBox message={error} />
      {loading || !report ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-xl text-harbor">
              {mt(lang, `cat_${category}`)} · {formatDate(from, lang)} – {formatDate(to, lang)}
            </h2>
            <p className="text-xs text-ink/50">{mt(lang, 'generatedOn', { date: formatDate(todayIso(), lang) })}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [mt(lang, 'statCompanies'), report.companies],
              [mt(lang, 'statContracts'), report.contracts.length],
              [mt(lang, 'statWithQuotes'), `${report.withQuotes} / ${report.contracts.length}`],
              [mt(lang, 'statInvoiced'), moneyList(report.totalInvoiced)],
            ].map(([label, value]) => (
              <div key={label} className="card p-3">
                <p className="text-xs text-ink/50">{label}</p>
                <p className="text-lg font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>

          {report.contracts.length === 0 && report.looseInvoices.length === 0 ? (
            <p className="text-ink/60">{mt(lang, 'reportEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {report.contracts.map((c) => (
                <div key={c.id} className="card p-4 break-inside-avoid">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-ink">{c.supplierName}</p>
                      <p className="text-sm text-ink/70">{c.subject}</p>
                    </div>
                    <Pill tone={c.status === 'active' ? 'green' : 'neutral'}>{mt(lang, `contractStatus_${c.status}`)}</Pill>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
                    <p>
                      <span className="text-ink/50">{mt(lang, 'duration')}: </span>
                      {c.starts_on ? formatDate(c.starts_on, lang) : '?'} – {c.ends_on ? formatDate(c.ends_on, lang) : mt(lang, 'ongoing')}
                      {c.months !== null && ` (${c.months} ${mt(lang, 'months')})`}
                    </p>
                    <p><span className="text-ink/50">{mt(lang, 'amount')}: </span>{contractAmount(c)}</p>
                    <p>
                      <span className="text-ink/50">{mt(lang, 'quotesCompared')}: </span>
                      {c.quotes === null ? (
                        <span className="text-ochre">{mt(lang, 'noTenderLinked')}</span>
                      ) : (
                        <span className={c.quotes < 2 ? 'text-red-600 font-semibold' : ''}>{c.quotes}{c.quotes < 2 ? ' ⚠' : ''}</span>
                      )}
                    </p>
                    <p><span className="text-ink/50">{mt(lang, 'invoicedInPeriod')}: </span>{moneyList(c.invoiced)}</p>
                    <p className="sm:col-span-2">
                      <span className="text-ink/50">{mt(lang, 'whyChosen')}: </span>
                      {c.reason || <span className="text-ochre">{mt(lang, 'notRecorded')}</span>}
                    </p>
                    {c.decision && (
                      <p className="sm:col-span-2">
                        <span className="text-ink/50">{mt(lang, 'approvedByDecision')}: </span>
                        {formatDate(c.decision.decided_on, lang)} · {c.decision.title}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {report.looseInvoices.length > 0 && (
                <div className="card p-4">
                  <p className="text-sm font-semibold text-ink mb-2">{mt(lang, 'invoicesWithoutContract')}</p>
                  <ul className="text-sm space-y-1">
                    {report.looseInvoices.map((l) => (
                      <li key={l.name}>{l.name}: {moneyList(l.totals)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="card p-4 border-l-4 border-l-ochre">
            <p className="text-sm font-semibold text-ink mb-2">{mt(lang, 'gapsTitle')}</p>
            {report.gaps.length === 0 ? (
              <p className="text-sm text-ink/60">{mt(lang, 'noGaps')}</p>
            ) : (
              <ul className="text-sm text-ink/80 list-disc list-inside space-y-1">
                {report.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            )}
          </div>
          <p className="text-xs text-ink/40 italic">{mt(lang, 'alertsFactsOnly')}</p>
        </div>
      )}
    </div>
  );
}
