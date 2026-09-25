'use client';

// Rozpočet po kategóriách (plán vs. faktúry) a rezervný fond.
// Iba fakty zo záznamov a jednoduché tempo; rozhoduje board a Junta General.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, formatMoney, formatMoneyRound, cleanFormValues, INVOICE_CATEGORIES } from '../../../lib/memoriaI18n';
import { budgetStatus, reserveStatus } from '../../../lib/memoriaBudget';
import { supplierPriceChanges, categoryYearOnYear } from '../../../lib/memoriaTrends';
import { Field, Pill, ErrorBox, DemoPill } from './MemoriaUi';

const STATUS_TONE = { ok: 'green', at_risk: 'ochre', over: 'red', unplanned: 'neutral' };
const BAR = { ok: 'bg-sea', at_risk: 'bg-ochre', over: 'bg-red-500', unplanned: 'bg-ink/30' };
const KINDS = ['opening_balance', 'contribution', 'interest', 'withdrawal'];

function pct(x, lang) {
  if (x === null || x === undefined) return '—';
  return new Intl.NumberFormat({ en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB', { style: 'percent', maximumFractionDigits: 0 }).format(x);
}

export default function BudgetPanel({ lang, onChanged }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [budgets, setBudgets] = useState([]);
  const [lines, setLines] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [reserveInvoices, setReserveInvoices] = useState([]);
  const [movements, setMovements] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [trendInvoices, setTrendInvoices] = useState([]);
  const [supplierNames, setSupplierNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [budgetForm, setBudgetForm] = useState(null);
  const [lineEdit, setLineEdit] = useState({}); // category -> amount string
  const [newLine, setNewLine] = useState({ category: '', amount: '' });
  const [mvForm, setMvForm] = useState(null);

  async function load() {
    const [bRes, lRes, iRes, rRes, mRes, dRes, tRes, sRes] = await Promise.all([
      supabase.from('memoria_budgets').select('*').order('year', { ascending: false }),
      supabase.from('memoria_budget_lines').select('*'),
      supabase.from('memoria_invoices').select('invoice_date, total_amount, category, funding_source').gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`).range(0, 9999),
      supabase.from('memoria_invoices').select('id, invoice_number, description, invoice_date, total_amount, is_demo').eq('funding_source', 'reserve_fund'),
      supabase.from('memoria_reserve_movements').select('*').order('moved_on', { ascending: false }),
      supabase.from('memoria_decisions').select('id, title, decided_on').order('decided_on', { ascending: false }),
      supabase.from('memoria_invoices').select('supplier_id, invoice_date, total_amount, category, funding_source').gte('invoice_date', `${year - 2}-01-01`).lte('invoice_date', `${year}-12-31`).range(0, 9999),
      supabase.from('memoria_suppliers').select('id, name'),
    ]);
    const firstError = [bRes, lRes, iRes, rRes, mRes, dRes].find((r) => r.error)?.error;
    setError(firstError ? firstError.message : '');
    setBudgets(bRes.data || []);
    setLines(lRes.data || []);
    setInvoices(iRes.data || []);
    setReserveInvoices(rRes.data || []);
    setMovements(mRes.data || []);
    setDecisions(dRes.data || []);
    setTrendInvoices(tRes.data || []);
    setSupplierNames(Object.fromEntries((sRes.data || []).map((x) => [x.id, x.name])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const budget = budgets.find((b) => Number(b.year) === Number(year)) || null;
  const budgetLines = useMemo(() => (budget ? lines.filter((l) => l.budget_id === budget.id) : []), [lines, budget]);
  const status = useMemo(() => (budget ? budgetStatus({ budget, lines: budgetLines, invoices }) : null), [budget, budgetLines, invoices]);
  const latestBudget = budgets[0] || null;
  const reserve = useMemo(() => reserveStatus({ movements, reserveInvoices, budget: budget || latestBudget }), [movements, reserveInvoices, budget, latestBudget]);
  const decisionById = useMemo(() => Object.fromEntries(decisions.map((d) => [d.id, d])), [decisions]);
  const prices = useMemo(() => supplierPriceChanges(trendInvoices, supplierNames), [trendInvoices, supplierNames]);
  const catTrend = useMemo(() => categoryYearOnYear(trendInvoices), [trendInvoices]);
  const years = [...new Set([thisYear + 1, thisYear, thisYear - 1, ...budgets.map((b) => Number(b.year))])].sort((a, b) => b - a);
  const money = (x) => formatMoneyRound(x, 'EUR', lang);

  async function saveBudget(e) {
    e.preventDefault();
    const v = cleanFormValues(budgetForm, ['total_amount', 'reserve_min_percent']);
    if (!v.title || v.total_amount === null || v.total_amount === undefined) {
      setError(`${mt(lang, 'budgetTitleField')}, ${mt(lang, 'budgetTotal')}: ${mt(lang, 'required')}`);
      return;
    }
    const payload = { year, title: v.title, total_amount: v.total_amount, approved_on: v.approved_on, decision_id: v.decision_id, reserve_min_percent: v.reserve_min_percent ?? 10, notes: v.notes };
    const res = budget ? await supabase.from('memoria_budgets').update(payload).eq('id', budget.id) : await supabase.from('memoria_budgets').insert(payload);
    if (res.error) return setError(mt(lang, 'saveError', { error: res.error.message }));
    setBudgetForm(null);
    await load();
    onChanged?.();
  }

  async function saveLine(category) {
    const raw = lineEdit[category];
    const amount = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) return;
    const existing = budgetLines.find((l) => l.category === category);
    const res = existing
      ? await supabase.from('memoria_budget_lines').update({ amount }).eq('id', existing.id)
      : await supabase.from('memoria_budget_lines').insert({ budget_id: budget.id, category, amount });
    if (res.error) return setError(mt(lang, 'saveError', { error: res.error.message }));
    setLineEdit((x) => {
      const n = { ...x };
      delete n[category];
      return n;
    });
    await load();
    onChanged?.();
  }

  async function addLine() {
    const amount = Number(String(newLine.amount).replace(',', '.'));
    if (!newLine.category || !Number.isFinite(amount)) return;
    const { error: e1 } = await supabase.from('memoria_budget_lines').insert({ budget_id: budget.id, category: newLine.category, amount });
    if (e1) return setError(mt(lang, 'saveError', { error: e1.message }));
    setNewLine({ category: '', amount: '' });
    await load();
    onChanged?.();
  }

  async function deleteLine(category) {
    const existing = budgetLines.find((l) => l.category === category);
    if (!existing || !window.confirm(mt(lang, 'confirmDelete'))) return;
    await supabase.from('memoria_budget_lines').delete().eq('id', existing.id);
    await load();
    onChanged?.();
  }

  async function saveMovement(e) {
    e.preventDefault();
    const v = cleanFormValues(mvForm, ['amount']);
    if (!v.moved_on || !v.kind || v.amount === null || v.amount === undefined) {
      setError(`${mt(lang, 'movedOn')}, ${mt(lang, 'movementKind')}, ${mt(lang, 'amount')}: ${mt(lang, 'required')}`);
      return;
    }
    const { error: e1 } = await supabase.from('memoria_reserve_movements').insert({ moved_on: v.moved_on, kind: v.kind, amount: Math.abs(v.amount), description: v.description, decision_id: v.decision_id });
    if (e1) return setError(mt(lang, 'saveError', { error: e1.message }));
    setMvForm(null);
    await load();
    onChanged?.();
  }

  async function deleteMovement(id) {
    if (!window.confirm(mt(lang, 'confirmDelete'))) return;
    await supabase.from('memoria_reserve_movements').delete().eq('id', id);
    await load();
    onChanged?.();
  }

  const usedCats = new Set((status?.rows || []).filter((r) => r.status !== 'unplanned').map((r) => r.category));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink/70 max-w-2xl">{mt(lang, 'budgetIntro')}</p>
        <Field label={mt(lang, 'budgetYear')}>
          <select className="input-field !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox message={error} />

      {loading ? (
        <p className="text-sm text-ink/60">{mt(lang, 'loading')}</p>
      ) : (
        <>
          {/* ---------- Rozpočet ---------- */}
          {budgetForm ? (
            <form onSubmit={saveBudget} className="card p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={mt(lang, 'budgetTitleField')} required>
                  <input className="input-field" value={budgetForm.title} onChange={(e) => setBudgetForm((f) => ({ ...f, title: e.target.value }))} />
                </Field>
                <Field label={`${mt(lang, 'budgetTotal')} (EUR)`} required>
                  <input className="input-field" inputMode="decimal" value={budgetForm.total_amount} onChange={(e) => setBudgetForm((f) => ({ ...f, total_amount: e.target.value }))} />
                </Field>
                <Field label={mt(lang, 'budgetApprovedOn')}>
                  <input type="date" className="input-field" value={budgetForm.approved_on} onChange={(e) => setBudgetForm((f) => ({ ...f, approved_on: e.target.value }))} />
                </Field>
                <Field label={mt(lang, 'approvedByDecision')}>
                  <select className="input-field" value={budgetForm.decision_id} onChange={(e) => setBudgetForm((f) => ({ ...f, decision_id: e.target.value }))}>
                    <option value="">{mt(lang, 'none')}</option>
                    {decisions.map((d) => (
                      <option key={d.id} value={d.id}>{`${formatDate(d.decided_on, lang)} · ${d.title}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label={mt(lang, 'reserveMinPercent')} hint={mt(lang, 'reserveMinHint')}>
                  <input className="input-field" inputMode="decimal" value={budgetForm.reserve_min_percent} onChange={(e) => setBudgetForm((f) => ({ ...f, reserve_min_percent: e.target.value }))} />
                </Field>
              </div>
              <Field label={mt(lang, 'notes')}>
                <textarea className="input-field" rows={2} value={budgetForm.notes} onChange={(e) => setBudgetForm((f) => ({ ...f, notes: e.target.value }))} />
              </Field>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{mt(lang, 'save')}</button>
                <button type="button" className="btn-secondary" onClick={() => setBudgetForm(null)}>{mt(lang, 'cancel')}</button>
              </div>
            </form>
          ) : !budget ? (
            <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-ink/70">{mt(lang, 'budgetNone', { year })}</p>
              <button
                className="btn-primary text-sm"
                onClick={() => setBudgetForm({ title: `Budget ${year}`, total_amount: '', approved_on: '', decision_id: '', reserve_min_percent: '10', notes: '' })}
              >
                + {mt(lang, 'budgetNew')}
              </button>
            </div>
          ) : (
            <div className="card p-4 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-harbor">
                    {budget.title} <DemoPill show={budget.is_demo} />
                  </p>
                  <p className="text-sm text-ink/70">
                    {mt(lang, 'budgetTotal')}: <span className="font-semibold text-ink">{formatMoney(budget.total_amount, 'EUR', lang)}</span>
                    {budget.approved_on ? ` · ${mt(lang, 'budgetApprovedOn')} ${formatDate(budget.approved_on, lang)}` : ''}
                  </p>
                  {budget.decision_id && decisionById[budget.decision_id] && (
                    <p className="text-xs text-ink/50">⚖️ {decisionById[budget.decision_id].title}</p>
                  )}
                </div>
                <button
                  className="text-sm text-harbor hover:underline"
                  onClick={() =>
                    setBudgetForm({
                      title: budget.title,
                      total_amount: String(budget.total_amount),
                      approved_on: budget.approved_on || '',
                      decision_id: budget.decision_id || '',
                      reserve_min_percent: String(budget.reserve_min_percent ?? 10),
                      notes: budget.notes || '',
                    })
                  }
                >
                  {mt(lang, 'editBudget')}
                </button>
              </div>

              <div>
                <p className="text-sm text-ink">
                  {mt(lang, 'budgetSpent', { actual: money(status.actualTotal), total: money(budget.total_amount), pct: pct(status.totalPct, lang) })}
                </p>
                <div className="h-2 bg-sand-dark rounded-full mt-1 overflow-hidden">
                  <div className="h-2 bg-harbor" style={{ width: `${Math.min(100, (status.totalPct || 0) * 100)}%` }} />
                </div>
                {status.coverageDate && (
                  <p className="text-xs text-ink/50 mt-1">ℹ️ {mt(lang, 'invoiceDataUntil', { date: formatDate(status.coverageDate, lang) })}</p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-harbor mb-2">{mt(lang, 'budgetLines')}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink/50">
                        <th className="py-1 pr-3">{mt(lang, 'category')}</th>
                        <th className="py-1 pr-3 text-right">{mt(lang, 'planned')}</th>
                        <th className="py-1 pr-3 text-right">{mt(lang, 'spent')}</th>
                        <th className="py-1 pr-3 w-32"></th>
                        <th className="py-1 pr-3 text-right">{mt(lang, 'projection')}</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.rows.map((r) => (
                        <tr key={r.category} className="border-t border-ink/10 align-middle">
                          <td className="py-1.5 pr-3">
                            {mt(lang, `invcat_${r.category}`)} <DemoPill show={r.isDemo} />
                          </td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                            {r.category in lineEdit ? (
                              <span className="inline-flex gap-1">
                                <input
                                  className="input-field !w-28 !py-0.5 text-right"
                                  value={lineEdit[r.category]}
                                  onChange={(e) => setLineEdit((x) => ({ ...x, [r.category]: e.target.value }))}
                                  onKeyDown={(e) => e.key === 'Enter' && saveLine(r.category)}
                                />
                                <button className="text-xs text-harbor" onClick={() => saveLine(r.category)}>✓</button>
                              </span>
                            ) : (
                              <button className="hover:underline" onClick={() => setLineEdit((x) => ({ ...x, [r.category]: String(r.planned) }))}>
                                {r.status === 'unplanned' ? '—' : money(r.planned)}
                              </button>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">{money(r.actual)}</td>
                          <td className="py-1.5 pr-3">
                            <div className="h-2 bg-sand-dark rounded-full overflow-hidden" title={pct(r.pct, lang)}>
                              <div className={`h-2 ${BAR[r.status]}`} style={{ width: `${Math.min(100, (r.pct ?? (r.actual > 0 ? 1 : 0)) * 100)}%` }} />
                            </div>
                            <span className="text-[11px] text-ink/50">{pct(r.pct, lang)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">{r.projection !== null ? money(r.projection) : '—'}</td>
                          <td className="py-1.5 whitespace-nowrap">
                            <Pill tone={STATUS_TONE[r.status]}>{mt(lang, `bs_${r.status}`)}</Pill>
                            {r.status !== 'unplanned' && (
                              <button className="ml-2 text-xs text-red-700 hover:underline" onClick={() => deleteLine(r.category)}>✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {status.unallocated !== 0 && (
                  <p className="text-xs text-ink/60 mt-2">{mt(lang, 'unallocated', { amount: money(status.unallocated) })}</p>
                )}
                <div className="flex flex-wrap gap-2 items-end mt-3">
                  <select className="input-field !w-auto text-sm" value={newLine.category} onChange={(e) => setNewLine((n) => ({ ...n, category: e.target.value }))}>
                    <option value="">{mt(lang, 'addLine')}…</option>
                    {INVOICE_CATEGORIES.filter((c) => !usedCats.has(c)).map((c) => (
                      <option key={c} value={c}>{mt(lang, `invcat_${c}`)}</option>
                    ))}
                  </select>
                  <input className="input-field !w-32 text-sm" inputMode="decimal" placeholder="EUR" value={newLine.amount} onChange={(e) => setNewLine((n) => ({ ...n, amount: e.target.value }))} />
                  <button className="btn-secondary text-sm py-1" disabled={!newLine.category || !newLine.amount} onClick={addLine}>+ {mt(lang, 'add')}</button>
                </div>
                <p className="text-xs text-ink/40 italic mt-3">{mt(lang, 'projectionNote')}</p>
              </div>
            </div>
          )}

          {/* ---------- Trendy ---------- */}
          {(prices.length > 0 || catTrend.rows.length > 0) && (
            <div className="card p-4 space-y-4">
              <p className="font-semibold text-harbor">📈 {mt(lang, 'trendsTitle')}</p>
              {prices.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-ink/70 mb-1">{mt(lang, 'trendsPrices')}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {prices.map((p) => (
                        <tr key={p.supplierId} className="border-t border-ink/10">
                          <td className="py-1.5 pr-3">{p.name}</td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap text-ink/60">{p.fromYear}: {money(p.from)}</td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">{p.toYear}: {money(p.to)}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">
                            <Pill tone={p.flagged ? 'ochre' : 'neutral'}>{`${p.change >= 0 ? '+' : ''}${Math.round(p.change * 1000) / 10} %`}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {catTrend.rows.length > 0 && catTrend.windowEnd && (
                <div>
                  <p className="text-sm font-semibold text-ink/70 mb-1">
                    {mt(lang, 'trendsCategories', { from: `01/01`, to: catTrend.windowEnd ? formatDate(catTrend.windowEnd, lang).slice(0, 5) : '', y1: catTrend.year, y0: catTrend.year - 1 })}
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {catTrend.rows.map((c) => (
                        <tr key={c.category} className="border-t border-ink/10">
                          <td className="py-1.5 pr-3">{mt(lang, `invcat_${c.category}`)}</td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap text-ink/60">{catTrend.year - 1}: {money(c.before)}</td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">{catTrend.year}: {money(c.now)}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">
                            {c.change !== null ? <Pill tone={c.flagged ? 'ochre' : 'neutral'}>{`${c.change >= 0 ? '+' : ''}${Math.round(c.change * 100)} %`}</Pill> : <Pill>{mt(lang, 'trendsNew')}</Pill>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-ink/40 italic">{mt(lang, 'trendsNote')}</p>
            </div>
          )}

          {/* ---------- Rezervný fond ---------- */}
          <div className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="font-semibold text-harbor">🏦 {mt(lang, 'reserveTitle')}</p>
              {!mvForm && (
                <button className="btn-secondary text-sm py-1" onClick={() => setMvForm({ moved_on: '', kind: 'contribution', amount: '', description: '', decision_id: '' })}>
                  + {mt(lang, 'addMovement')}
                </button>
              )}
            </div>
            {reserve.hasData ? (
              <div className="flex flex-wrap gap-6 items-end">
                <div>
                  <p className="text-xs text-ink/50">{mt(lang, 'reserveBalance')}</p>
                  <p className="text-2xl font-display text-harbor">{formatMoney(reserve.balance, 'EUR', lang)}</p>
                </div>
                {reserve.minimum !== null && (
                  <div>
                    <p className="text-xs text-ink/50">{mt(lang, 'reserveMinimum')}</p>
                    <p className="text-lg text-ink">{formatMoney(reserve.minimum, 'EUR', lang)}</p>
                  </div>
                )}
                {reserve.minimum !== null && <Pill tone={reserve.belowMinimum ? 'red' : 'green'}>{reserve.belowMinimum ? mt(lang, 'reserveBelow') : mt(lang, 'reserveOk')}</Pill>}
              </div>
            ) : (
              <p className="text-sm text-ink/60">{mt(lang, 'reserveNoData')}</p>
            )}
            <p className="text-xs text-ink/50">{mt(lang, 'reserveInvoicesNote', { amount: formatMoney(reserve.invoiceSpend, 'EUR', lang) })}</p>

            {mvForm && (
              <form onSubmit={saveMovement} className="grid sm:grid-cols-2 gap-3 border-t border-ink/10 pt-3">
                <Field label={mt(lang, 'movedOn')} required>
                  <input type="date" className="input-field" value={mvForm.moved_on} onChange={(e) => setMvForm((f) => ({ ...f, moved_on: e.target.value }))} />
                </Field>
                <Field label={mt(lang, 'movementKind')} required>
                  <select className="input-field" value={mvForm.kind} onChange={(e) => setMvForm((f) => ({ ...f, kind: e.target.value }))}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{mt(lang, `mv_${k}`)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`${mt(lang, 'amount')} (EUR)`} required>
                  <input className="input-field" inputMode="decimal" value={mvForm.amount} onChange={(e) => setMvForm((f) => ({ ...f, amount: e.target.value }))} />
                </Field>
                <Field label={mt(lang, 'approvedByDecision')}>
                  <select className="input-field" value={mvForm.decision_id} onChange={(e) => setMvForm((f) => ({ ...f, decision_id: e.target.value }))}>
                    <option value="">{mt(lang, 'none')}</option>
                    {decisions.map((d) => (
                      <option key={d.id} value={d.id}>{`${formatDate(d.decided_on, lang)} · ${d.title}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label={mt(lang, 'description')} className="sm:col-span-2">
                  <input className="input-field" value={mvForm.description} onChange={(e) => setMvForm((f) => ({ ...f, description: e.target.value }))} />
                </Field>
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" className="btn-primary">{mt(lang, 'save')}</button>
                  <button type="button" className="btn-secondary" onClick={() => setMvForm(null)}>{mt(lang, 'cancel')}</button>
                </div>
              </form>
            )}

            {movements.length > 0 && (
              <ul className="text-sm divide-y divide-ink/5">
                {movements.map((m) => (
                  <li key={m.id} className="py-1.5 flex items-start justify-between gap-3">
                    <span>
                      {formatDate(m.moved_on, lang)} · {mt(lang, `mv_${m.kind}`)} {m.description ? `· ${m.description}` : ''} <DemoPill show={m.is_demo} />
                      {m.decision_id && decisionById[m.decision_id] && <span className="block text-xs text-ink/50">⚖️ {decisionById[m.decision_id].title}</span>}
                    </span>
                    <span className="whitespace-nowrap flex items-center gap-2">
                      <span className={m.kind === 'withdrawal' ? 'text-red-700' : 'text-ink'}>
                        {m.kind === 'withdrawal' ? '−' : '+'}
                        {formatMoney(m.amount, 'EUR', lang)}
                      </span>
                      <button className="text-xs text-red-700 hover:underline" onClick={() => deleteMovement(m.id)}>✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {reserveInvoices.length > 0 && (
              <ul className="text-sm divide-y divide-ink/5">
                {reserveInvoices.map((i) => (
                  <li key={i.id} className="py-1.5 flex justify-between gap-3">
                    <span>
                      {i.invoice_date ? formatDate(i.invoice_date, lang) : '—'} · 💶 {i.invoice_number || i.description || '—'} <DemoPill show={i.is_demo} />
                    </span>
                    <span className="text-red-700 whitespace-nowrap">−{formatMoney(i.total_amount, 'EUR', lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
