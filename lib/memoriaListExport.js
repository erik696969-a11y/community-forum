// Memoria — export práve zobrazeného (vyfiltrovaného) zoznamu do Excelu.
// Riadky sa skladajú tu (čisté funkcie, testované), stiahnutie rieši downloadXlsx.
// Hlavičky stĺpcov sú v jazyku používateľa; sumy ostávajú číslami, dátumy RRRR-MM-DD (dajú sa triediť).

import { mt } from './memoriaI18n';
import { buildXlsx } from './xlsxWriter';

const yn = (lang, v) => (v ? mt(lang, 'xYes') : mt(lang, 'xNo'));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const decisionLabel = (d) => (d ? `${d.decided_on || ''} · ${d.title}`.trim() : null);

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function noticeBy(contract) {
  if (!contract.auto_renew || !contract.ends_on || contract.notice_period_days === null || contract.notice_period_days === undefined) return null;
  return addDays(contract.ends_on, -Number(contract.notice_period_days || 0));
}

function sheet(lang, nameKey, columns, rows) {
  // columns: [[labelKey, (row) => value]]
  const labels = columns.map(([k]) => mt(lang, k));
  return {
    name: mt(lang, nameKey),
    columns: labels,
    rows: rows.map((r) => Object.fromEntries(columns.map(([, f], i) => [labels[i], f(r)]))),
  };
}

export function infoSheet(lang, { listKey, filters, count, total, exportedBy, now = new Date() }) {
  const k = (key) => mt(lang, key);
  const rows = [
    [k('xTitle'), 'Comunidad de Propietarios La Hacienda del Señorío de Cifuentes'],
    [k('xList'), k(listKey)],
    [k('xExportedOn'), now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
    [k('xFilters'), filters?.length ? filters.join(' · ') : k('xNoFilters')],
    [k('xRecords'), count],
  ];
  if (exportedBy) rows.splice(3, 0, [k('xExportedBy'), exportedBy]);
  if (total !== undefined && total !== null) rows.push([k('xTotal'), total]);
  rows.push(['DEMO', k('xDemoNote')]);
  const cols = [k('xInfo'), ' '];
  return { name: k('xInfo'), columns: cols, rows: rows.map(([a, b]) => ({ [cols[0]]: a, [cols[1]]: b })) };
}

export function invoiceSheets(lang, invoices, { supplierById = {}, contractById = {}, tenderTitle = {}, decisionById = {} }) {
  return [
    sheet(lang, 'xSheetInvoices', [
      ['xInvoiceDate', (r) => r.invoice_date],
      ['xInvoiceNo', (r) => r.invoice_number],
      ['xSupplier', (r) => supplierById[r.supplier_id]?.name || null],
      ['xTaxId', (r) => supplierById[r.supplier_id]?.tax_id || null],
      ['xDescription', (r) => r.description],
      ['xCategory', (r) => (r.category ? mt(lang, `invcat_${r.category}`) : null)],
      ['xNet', (r) => num(r.net_amount)],
      ['xVat', (r) => num(r.vat_amount)],
      ['xTotalAmount', (r) => num(r.total_amount)],
      ['xCurrency', (r) => r.currency],
      ['xPaidFrom', (r) => (r.funding_source ? mt(lang, `fund_${r.funding_source}`) : null)],
      ['xPaymentStatus', (r) => (r.payment_status ? mt(lang, `payment_${r.payment_status}`) : null)],
      ['xDueDate', (r) => r.due_date],
      ['xPaidOn', (r) => r.paid_on],
      ['xYear', (r) => num(r.period_year)],
      ['xMonth', (r) => num(r.period_month)],
      ['xContract', (r) => contractById[r.contract_id]?.subject || null],
      ['xTender', (r) => tenderTitle[r.tender_id] || null],
      ['xUrgent', (r) => yn(lang, r.is_urgent_unbudgeted)],
      ['xWhyUrgent', (r) => r.urgency_reason],
      ['xRatifiedBy', (r) => decisionLabel(decisionById[r.ratified_by_decision_id])],
      ['DEMO', (r) => yn(lang, r.is_demo)],
    ], invoices),
  ];
}

export function supplierSheets(lang, suppliers, { ratingsBySupplier = {} }) {
  const avg = (id) => {
    const rs = ratingsBySupplier[id] || [];
    return rs.length ? Math.round((rs.reduce((a, r) => a + Number(r.rating || 0), 0) / rs.length) * 10) / 10 : null;
  };
  return [
    sheet(lang, 'xSheetSuppliers', [
      ['xName', (r) => r.name],
      ['xCategory', (r) => (r.category ? mt(lang, `cat_${r.category}`) : null)],
      ['xStatus', (r) => (r.status ? mt(lang, `supplierStatus_${r.status}`) : null)],
      ['xTaxId', (r) => r.tax_id],
      ['xContact', (r) => r.contact_person],
      ['xPhone', (r) => r.phone],
      ['xEmail', (r) => r.email],
      ['xWebsite', (r) => r.website],
      ['xSince', (r) => r.first_engaged_on],
      ['xConflictChecked', (r) => yn(lang, r.conflict_of_interest_checked)],
      ['xConflictNote', (r) => r.conflict_of_interest_note],
      ['xRating', (r) => avg(r.id)],
      ['xRatings', (r) => (ratingsBySupplier[r.id] || []).length],
      ['xNotes', (r) => r.notes],
      ['DEMO', (r) => yn(lang, r.is_demo)],
    ], suppliers),
  ];
}

// Dva hárky: licitácie a všetky ich ponuky (voliteľne iba ponuky jedného dodávateľa).
export function tenderSheets(lang, tenders, { quotesByTender = {}, supplierName = {}, decisionById = {}, supplierFilter = '' }) {
  const quoteRows = [];
  for (const t of tenders) {
    for (const q of quotesByTender[t.id] || []) {
      if (supplierFilter && q.supplier_id !== supplierFilter) continue;
      quoteRows.push({ ...q, _tender: t });
    }
  }
  const lowest = (t) => {
    const qs = (quotesByTender[t.id] || []).map((q) => Number(q.amount)).filter((n) => Number.isFinite(n));
    return qs.length ? Math.min(...qs) : null;
  };
  return [
    sheet(lang, 'xSheetTenders', [
      ['xTitleCol', (r) => r.title],
      ['xStatus', (r) => (r.status ? mt(lang, `tenderStatus_${r.status}`) : null)],
      ['xCategory', (r) => r.category],
      ['xOpenedOn', (r) => r.opened_on],
      ['xBudget', (r) => num(r.approved_budget)],
      ['xCurrency', (r) => r.currency],
      ['xQuotes', (r) => (quotesByTender[r.id] || []).length],
      ['xLowest', (r) => lowest(r)],
      ['xChosenSupplier', (r) => supplierName[r.selected_supplier_id] || null],
      ['xWhyChosen', (r) => r.selection_reason],
      ['xApprovedBy', (r) => decisionLabel(decisionById[r.approved_by_decision_id])],
      ['xDescription', (r) => r.description],
      ['DEMO', (r) => yn(lang, r.is_demo)],
    ], tenders),
    sheet(lang, 'xSheetQuotes', [
      ['xTender', (r) => r._tender.title],
      ['xStatus', (r) => (r._tender.status ? mt(lang, `tenderStatus_${r._tender.status}`) : null)],
      ['xSupplier', (r) => supplierName[r.supplier_id] || null],
      ['xAmount', (r) => num(r.amount)],
      ['xVatIncluded', (r) => yn(lang, r.vat_included)],
      ['xCurrency', (r) => r.currency],
      ['xReceivedOn', (r) => r.submitted_on],
      ['xValidUntil', (r) => r.valid_until],
      ['xChosen', (r) => yn(lang, r._tender.selected_supplier_id && r._tender.selected_supplier_id === r.supplier_id)],
      ['xOverBudget', (r) => yn(lang, r._tender.approved_budget !== null && r._tender.approved_budget !== undefined && Number(r.amount) > Number(r._tender.approved_budget))],
      ['xNotes', (r) => r.notes],
      ['DEMO', (r) => yn(lang, r.is_demo)],
    ], quoteRows),
  ];
}

export function contractSheets(lang, contracts, { supplierName = {}, tenderTitle = {}, decisionById = {} }) {
  return [
    sheet(lang, 'xSheetContracts', [
      ['xSubject', (r) => r.subject],
      ['xSupplier', (r) => supplierName[r.supplier_id] || null],
      ['xStatus', (r) => (r.status ? mt(lang, `contractStatus_${r.status}`) : null)],
      ['xSignedOn', (r) => r.signed_on],
      ['xStarts', (r) => r.starts_on],
      ['xEnds', (r) => r.ends_on],
      ['xAutoRenew', (r) => yn(lang, r.auto_renew)],
      ['xNoticeDays', (r) => num(r.notice_period_days)],
      ['xNoticeBy', (r) => noticeBy(r)],
      ['xAmount', (r) => num(r.amount)],
      ['xCurrency', (r) => r.currency],
      ['xPayment', (r) => (r.payment_frequency ? mt(lang, `freq_${r.payment_frequency}`) : null)],
      ['xSignedBy', (r) => r.signed_by],
      ['xTender', (r) => tenderTitle[r.tender_id] || null],
      ['xApprovedBy', (r) => decisionLabel(decisionById[r.approved_by_decision_id])],
      ['xNotes', (r) => r.notes],
      ['DEMO', (r) => yn(lang, r.is_demo)],
    ], contracts),
  ];
}

export function exportFileName(base, now = new Date()) {
  const safe = String(base).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `memoria-${safe}-${now.toISOString().slice(0, 10)}.xlsx`;
}

export async function downloadXlsx(filename, sheets) {
  const { default: JSZip } = await import('jszip');
  const data = await buildXlsx(JSZip, sheets).generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
