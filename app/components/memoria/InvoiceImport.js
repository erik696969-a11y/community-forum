'use client';

// Import faktúr od administrátora v akejkoľvek forme: Excel, CSV, skopírovaná tabuľka,
// PDF alebo fotka. Postup: súbor → (stĺpce) → kontrola riadkov → import.
// AI iba navrhuje (stĺpce, kategórie, párovanie dodávateľov); board všetko potvrdzuje.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatDate';
import { mt, formatMoney, INVOICE_CATEGORIES, SUPPLIER_CATEGORIES } from '../../../lib/memoriaI18n';
import {
  IMPORT_FIELDS, decodeText, parseDelimited, readXlsx, findHeaderRow, guessMapping, buildRecords,
  matchSupplier, findDuplicate, normName, normTaxId, guessDecimal, guessDateOrder, SUPPLIER_TO_INVOICE_CATEGORY,
} from '../../../lib/importParse';
import { Field, Pill, ErrorBox } from './MemoriaUi';

const BUCKET = 'memoria';
const MAX_FILE = 10 * 1024 * 1024;
const CLASSIFY_CHUNK = 100;

async function assist(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch('/api/memoria/import-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function safeName(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 100);
}

function fileKind(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return 'xlsx';
  if (n.endsWith('.xls')) return 'xls';
  if (n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.tsv')) return 'csv';
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp)$/.test(n)) return 'image';
  return null;
}

const IDENTITY = Object.fromEntries(IMPORT_FIELDS.map((f, i) => [f, i]));

export default function InvoiceImport({ lang, onClose, onImported }) {
  const [stage, setStage] = useState('pick'); // pick | mapping | working | review | saving | done
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [asDemo, setAsDemo] = useState(false);
  const [pasted, setPasted] = useState('');

  const [source, setSource] = useState(null); // { name, kind, file?, text?, storagePath? }
  const [sheets, setSheets] = useState([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({});
  const [decimal, setDecimal] = useState(',');
  const [dateOrder, setDateOrder] = useState('DMY');
  const [aiMapped, setAiMapped] = useState(false);

  const [suppliers, setSuppliers] = useState([]);
  const [existing, setExisting] = useState([]);
  const [rows, setRows] = useState([]);
  const [rowsInFile, setRowsInFile] = useState(0);
  const [result, setResult] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('memoria_suppliers').select('id').eq('is_demo', true).limit(1);
      setAsDemo((data || []).length > 0);
    })();
  }, []);

  const table = sheets[sheetIdx]?.rows || [];
  const headers = (table[headerIdx] || []).map((h) => String(h ?? ''));
  const width = Math.max(headers.length, ...table.slice(headerIdx + 1, headerIdx + 20).map((r) => r.length), 0);
  const headerLabels = Array.from({ length: width }, (_, i) => headers[i] || `#${i + 1}`);

  const preview = useMemo(() => {
    if (stage !== 'mapping') return [];
    return buildRecords(table.slice(headerIdx + 1), mapping, { decimal, dateOrder }).slice(0, 5);
  }, [stage, table, headerIdx, mapping, decimal, dateOrder]);

  // ---------- Krok 1: súbor alebo text ----------

  async function openTabular(sheetList, src) {
    setSheets(sheetList);
    const first = sheetList.findIndex((s) => s.rows.length > 1);
    const si = first >= 0 ? first : 0;
    setSheetIdx(si);
    await setupMapping(sheetList[si].rows);
    setSource(src);
    setStage('mapping');
  }

  async function setupMapping(tableRows) {
    const h = findHeaderRow(tableRows);
    setHeaderIdx(h);
    const hdr = (tableRows[h] || []).map((x) => String(x ?? ''));
    const guess = guessMapping(hdr);
    const body = tableRows.slice(h + 1, h + 40);
    const col = (f) => (guess[f] === null ? [] : body.map((r) => r[guess[f]]));
    setDecimal(guessDecimal([...col('total_amount'), ...col('net_amount')]));
    setDateOrder(guessDateOrder(col('invoice_date')));
    setMapping(guess);
    setAiMapped(false);
    try {
      const ai = await assist({ action: 'map', headers: hdr, sample: body.slice(0, 8).map((r) => r.map((c) => String(c ?? ''))), lang });
      if (ai.mapping && (ai.mapping.total_amount !== null || ai.mapping.net_amount !== null)) {
        // Heuristika má prednosť pri presnej zhode názvu; AI dopĺňa, čo chýba alebo je nejasné.
        const merged = { ...ai.mapping };
        const used = new Set(Object.values(merged).filter((v) => v !== null));
        for (const f of IMPORT_FIELDS) {
          if (merged[f] === null && guess[f] !== null && !used.has(guess[f])) {
            merged[f] = guess[f];
            used.add(guess[f]);
          }
        }
        setMapping(merged);
        const textAmounts = [...col('total_amount'), ...col('net_amount')].some((v) => typeof v === 'string');
        if (textAmounts) setDecimal(ai.decimal);
        if (col('invoice_date').some((v) => typeof v === 'string')) setDateOrder(ai.dateOrder);
        setAiMapped(true);
        if (ai.notes) setNote(ai.notes);
      }
    } catch {
      setNote(mt(lang, 'importAiUnavailable'));
    }
  }

  async function handleFile(file) {
    setError('');
    setNote('');
    if (!file) return;
    const kind = fileKind(file.name);
    if (kind === 'xls') return setError(mt(lang, 'importXls'));
    if (!kind) return setError(mt(lang, 'importUnsupported'));
    if (file.size > MAX_FILE) return setError(mt(lang, 'fileTooLarge'));
    setStage('working');
    setBusyText(mt(lang, 'importReading'));
    try {
      if (kind === 'xlsx') {
        const { default: JSZip } = await import('jszip');
        const list = await readXlsx(JSZip, await file.arrayBuffer());
        return await openTabular(list, { name: file.name, kind: 'xlsx', file });
      }
      if (kind === 'csv') {
        const text = decodeText(await file.arrayBuffer());
        return await openTabular([{ name: file.name, rows: parseDelimited(text) }], { name: file.name, kind: 'csv', file });
      }
      // PDF / foto: AI prečíta riadky
      const path = `imports/${crypto.randomUUID()}/${safeName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      setBusyText(mt(lang, 'importAiReading'));
      const out = await assist({ action: 'extract', path, lang });
      const src = { name: file.name, kind: kind === 'pdf' ? 'pdf' : 'image', storagePath: path };
      setSource(src);
      if (out.truncated) setNote(mt(lang, 'importTruncated'));
      else if (out.skipped) setNote(out.skipped);
      await prepareReview(recordsFromAi(out.rows), out.rows.length);
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
      setStage('pick');
    }
  }

  async function handlePaste() {
    setError('');
    setNote('');
    const text = pasted.trim();
    if (!text) return;
    const parsed = parseDelimited(text);
    const cols = Math.max(...parsed.map((r) => r.length));
    if (parsed.length >= 2 && cols >= 3) {
      setStage('working');
      setBusyText(mt(lang, 'importReading'));
      return openTabular([{ name: 'text', rows: parsed }], { name: 'pasted-text.txt', kind: 'text', text });
    }
    setStage('working');
    setBusyText(mt(lang, 'importAiReading'));
    try {
      const out = await assist({ action: 'extract', text, lang });
      setSource({ name: 'pasted-text.txt', kind: 'text', text });
      if (out.truncated) setNote(mt(lang, 'importTruncated'));
      await prepareReview(recordsFromAi(out.rows), out.rows.length);
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
      setStage('pick');
    }
  }

  function recordsFromAi(list) {
    const arrays = (list || []).map((r) => IMPORT_FIELDS.map((f) => (r[f] === null || r[f] === undefined ? '' : r[f])));
    return buildRecords(arrays, IDENTITY, { decimal: '.', dateOrder: 'YMD' });
  }

  // ---------- Krok 3: kontrola ----------

  async function prepareReview(records, inFile) {
    setRowsInFile(inFile);
    if (records.length === 0) {
      setError(mt(lang, 'importNothing'));
      setStage(source ? 'mapping' : 'pick');
      return;
    }
    setStage('working');
    setBusyText(mt(lang, 'importClassifying'));
    const [sRes, iRes] = await Promise.all([
      supabase.from('memoria_suppliers').select('id, name, tax_id, category').order('name', { ascending: true }),
      supabase.from('memoria_invoices').select('supplier_id, invoice_number, invoice_date, total_amount').range(0, 9999),
    ]);
    const sups = sRes.data || [];
    const inv = iRes.data || [];
    setSuppliers(sups);
    setExisting(inv);

    const ai = {};
    try {
      for (let k = 0; k < records.length; k += CLASSIFY_CHUNK) {
        const chunk = records.slice(k, k + CLASSIFY_CHUNK).map((r, j) => ({
          i: k + j,
          supplier_name: r.supplier_name,
          supplier_tax_id: r.supplier_tax_id,
          description: r.description,
          admin_category: r.admin_category,
          total_amount: r.total_amount,
        }));
        const out = await assist({ action: 'classify', rows: chunk, suppliers: sups.map((s) => ({ id: s.id, name: s.name, tax_id: s.tax_id, category: s.category })), lang });
        for (const it of out.items || []) ai[it.i] = it;
      }
    } catch {
      setNote(mt(lang, 'importAiUnavailable'));
    }

    const supById = Object.fromEntries(sups.map((s) => [s.id, s]));
    const seen = new Set();
    const prepared = records.map((rec, i) => {
      const m = matchSupplier(rec, sups);
      const a = ai[i];
      let supplierId = m?.supplier.id || null;
      let how = m?.how || null;
      if (!supplierId && a?.supplier_id && supById[a.supplier_id]) {
        supplierId = a.supplier_id;
        how = 'ai';
      }
      const supCat = supplierId ? supById[supplierId]?.category : null;
      const category = a?.category || (supCat ? SUPPLIER_TO_INVOICE_CATEGORY[supCat] : null) || 'other';
      const dup = findDuplicate(rec, supplierId, inv)?.kind || null;
      let dupKind = dup;
      if (!dupKind && supplierId && rec.invoice_number) {
        const key = `${supplierId}|${normName(rec.invoice_number)}`;
        if (seen.has(key)) dupKind = 'same_number';
        seen.add(key);
      }
      const notInvoice = a ? a.is_supplier_invoice === false : false;
      const hasBasics = rec.total_amount !== null && Boolean(rec.invoice_date) && Boolean(rec.supplier_name || supplierId);
      return {
        key: i,
        rec,
        supplierId,
        how,
        newName: rec.supplier_name || '',
        newTaxId: rec.supplier_tax_id || '',
        newCategory: a?.new_supplier_category || 'other',
        category,
        dup: dupKind,
        notInvoice,
        include: !dupKind && !notInvoice && hasBasics,
      };
    });
    setRows(prepared);
    setStage('review');
  }

  function updateRow(key, patch) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if ('supplierId' in patch) {
          next.how = null;
          next.dup = findDuplicate(next.rec, next.supplierId, existing)?.kind || null;
          if (next.dup === 'same_number') next.include = false;
        }
        return next;
      })
    );
  }

  const summary = useMemo(() => {
    const included = rows.filter((r) => r.include);
    const newKeys = new Set(included.filter((r) => !r.supplierId).map((r) => normTaxId(r.newTaxId) || normName(r.newName)));
    return {
      n: included.length,
      dup: rows.filter((r) => r.dup).length,
      newSup: newKeys.size,
      check: rows.filter((r) => !r.include && !r.dup).length,
    };
  }, [rows]);

  // ---------- Krok 4: uloženie ----------

  async function runImport() {
    setStage('saving');
    setError('');
    try {
      let storagePath = source?.storagePath || null;
      if (!storagePath && (source?.file || source?.text)) {
        storagePath = `imports/${crypto.randomUUID()}/${safeName(source.name)}`;
        const body = source.file || new Blob([source.text], { type: 'text/plain;charset=utf-8' });
        const up = await supabase.storage.from(BUCKET).upload(storagePath, body, { contentType: source.file?.type || 'text/plain' });
        if (up.error) storagePath = null;
      }

      const included = rows.filter((r) => r.include);
      // Noví dodávatelia (jeden na IČ alebo názov).
      const newSup = {};
      for (const r of included.filter((x) => !x.supplierId)) {
        const key = normTaxId(r.newTaxId) || normName(r.newName);
        if (!key || newSup[key]) continue;
        newSup[key] = {
          name: r.newName || r.newTaxId,
          tax_id: r.newTaxId || null,
          category: r.newCategory || 'other',
          status: 'active',
          is_demo: asDemo,
          notes: mt(lang, 'importCreatedBy', { file: source?.name || '' }),
        };
      }
      const supIdByKey = {};
      const newList = Object.entries(newSup);
      if (newList.length) {
        const { data, error: e1 } = await supabase.from('memoria_suppliers').insert(newList.map(([, v]) => v)).select('id, name, tax_id');
        if (e1) throw new Error(e1.message);
        (data || []).forEach((s, i) => {
          supIdByKey[newList[i][0]] = s.id;
        });
      }

      const dates = included.map((r) => r.rec.invoice_date).filter(Boolean).sort();
      const { data: imp, error: e2 } = await supabase
        .from('memoria_imports')
        .insert({
          file_name: source?.name || null,
          storage_path: storagePath,
          source_format: source?.kind || 'text',
          period_from: dates[0] || null,
          period_to: dates[dates.length - 1] || null,
          rows_in_file: rowsInFile,
          rows_imported: 0,
          rows_skipped: rows.length - included.length,
          suppliers_created: newList.length,
          is_demo: asDemo,
        })
        .select('id')
        .single();
      if (e2) throw new Error(e2.message);

      const invoices = included.map((r) => {
        const rec = r.rec;
        const supplierId = r.supplierId || supIdByKey[normTaxId(r.newTaxId) || normName(r.newName)] || null;
        const [y, m] = (rec.invoice_date || '').split('-').map(Number);
        return {
          supplier_id: supplierId,
          invoice_number: rec.invoice_number,
          invoice_date: rec.invoice_date,
          due_date: rec.due_date,
          paid_on: rec.paid_on,
          payment_status: rec.payment_status || (rec.paid_on ? 'paid' : 'pending'),
          net_amount: rec.net_amount,
          vat_amount: rec.vat_amount,
          total_amount: rec.total_amount,
          currency: 'EUR',
          description: rec.description || rec.admin_category || null,
          category: r.category,
          funding_source: 'ordinary_budget',
          period_year: y || null,
          period_month: m || null,
          external_ref: rec.admin_category ? `${rec.admin_category}` : null,
          import_source: 'admin_export',
          import_id: imp.id,
          is_demo: asDemo,
        };
      });
      let saved = 0;
      for (let k = 0; k < invoices.length; k += 200) {
        const { error: e3, data } = await supabase.from('memoria_invoices').insert(invoices.slice(k, k + 200)).select('id');
        if (e3) throw new Error(e3.message);
        saved += (data || []).length;
      }
      await supabase.from('memoria_imports').update({ rows_imported: saved }).eq('id', imp.id);
      setResult(mt(lang, 'importDone', { n: saved, skipped: rows.length - included.length, sup: newList.length }));
      setStage('done');
      onImported?.();
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
      setStage('review');
    }
  }

  // ---------- Vzhľad ----------

  const howLabel = { tax_id: 'importMatchedTax', name: 'importMatchedName', similar_name: 'importMatchedName', ai: 'importMatchedAi' };

  return (
    <div className="card p-4 mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-harbor">📥 {mt(lang, 'importTitle')}</p>
        <button className="text-sm text-ink/50 hover:text-harbor" onClick={onClose}>✕</button>
      </div>

      {stage === 'pick' && (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{mt(lang, 'importIntro')}</p>
          <Field label={mt(lang, 'importFile')} hint=".xlsx · .csv · .txt · .pdf · .jpg · .png">
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt,.tsv,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => handleFile(e.target.files?.[0])} className="text-sm" />
          </Field>
          <Field label={mt(lang, 'importPaste')}>
            <textarea className="input-field font-mono text-xs" rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </Field>
          <button className="btn-secondary text-sm" disabled={!pasted.trim()} onClick={handlePaste}>{mt(lang, 'importUsePaste')}</button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={asDemo} onChange={(e) => setAsDemo(e.target.checked)} />
            {mt(lang, 'importAsDemo')}
          </label>
        </div>
      )}

      {stage === 'working' && <p className="text-sm text-ink/60 animate-pulse">🤖 {busyText}</p>}

      {stage === 'mapping' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            {sheets.length > 1 && (
              <Field label={mt(lang, 'importSheet')}>
                <select
                  className="input-field !w-auto"
                  value={sheetIdx}
                  onChange={async (e) => {
                    const i = Number(e.target.value);
                    setSheetIdx(i);
                    await setupMapping(sheets[i].rows);
                  }}
                >
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>{s.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={mt(lang, 'importHeaderRow')}>
              <input type="number" min={1} max={table.length} className="input-field !w-24" value={headerIdx + 1} onChange={(e) => setHeaderIdx(Math.max(0, Number(e.target.value) - 1))} />
            </Field>
            <Field label={mt(lang, 'importDecimal')}>
              <select className="input-field !w-auto" value={decimal} onChange={(e) => setDecimal(e.target.value)}>
                <option value=",">1.234,56</option>
                <option value=".">1,234.56</option>
              </select>
            </Field>
            <Field label={mt(lang, 'importDateOrder')}>
              <select className="input-field !w-auto" value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}>
                <option value="DMY">31/12/2026</option>
                <option value="MDY">12/31/2026</option>
                <option value="YMD">2026-12-31</option>
              </select>
            </Field>
          </div>

          <div>
            <p className="text-sm font-semibold text-harbor">{mt(lang, 'importColumns')}</p>
            <p className="text-xs text-ink/50 mb-2">
              {mt(lang, 'importColumnsHint')} {aiMapped ? mt(lang, 'importAiMapped') : ''}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {IMPORT_FIELDS.map((f) => (
                <label key={f} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink/80">{mt(lang, `f_${f}`)}</span>
                  <select
                    className="input-field !w-56"
                    value={mapping[f] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === '' ? null : Number(e.target.value) }))}
                  >
                    <option value="">{mt(lang, 'importNotInFile')}</option>
                    {headerLabels.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-harbor mb-1">{mt(lang, 'importPreview')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.src} className="border-t border-ink/10">
                      <td className="py-1 pr-3 whitespace-nowrap">{r.invoice_date ? formatDate(r.invoice_date, lang) : '—'}</td>
                      <td className="py-1 pr-3">{r.supplier_name || r.supplier_tax_id || '—'}</td>
                      <td className="py-1 pr-3">{r.invoice_number || '—'}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-right">{r.total_amount !== null ? formatMoney(r.total_amount, 'EUR', lang) : '—'}</td>
                      <td className="py-1 text-xs text-ochre">{r.warnings.map((w) => mt(lang, `w_${w}`)).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                const body = table.slice(headerIdx + 1);
                prepareReview(buildRecords(body, mapping, { decimal, dateOrder }), body.length);
              }}
            >
              {mt(lang, 'importContinue')}
            </button>
            <button className="btn-secondary" onClick={() => setStage('pick')}>{mt(lang, 'importBack')}</button>
          </div>
        </div>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{mt(lang, 'importReviewIntro')}</p>
          <p className="text-sm font-semibold text-harbor">{mt(lang, 'importSummary', summary)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink/50">
                  <th className="py-1 pr-2">{mt(lang, 'importInclude')}</th>
                  <th className="py-1 pr-2">{mt(lang, 'f_invoice_date')}</th>
                  <th className="py-1 pr-2">{mt(lang, 'f_supplier_name')}</th>
                  <th className="py-1 pr-2">{mt(lang, 'f_invoice_number')}</th>
                  <th className="py-1 pr-2 text-right">{mt(lang, 'f_total_amount')}</th>
                  <th className="py-1 pr-2">{mt(lang, 'category')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={`border-t border-ink/10 align-top ${r.include ? '' : 'opacity-60'}`}>
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.key, { include: e.target.checked })} />
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{r.rec.invoice_date ? formatDate(r.rec.invoice_date, lang) : '—'}</td>
                    <td className="py-1.5 pr-2 min-w-[12rem]">
                      <select
                        className="input-field !py-1 text-sm"
                        value={r.supplierId || '__new'}
                        onChange={(e) => updateRow(r.key, { supplierId: e.target.value === '__new' ? null : e.target.value })}
                      >
                        <option value="__new">{mt(lang, 'importNewSupplier', { name: r.newName || r.newTaxId || '—' })}</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {r.how && <span className="block text-[11px] text-sea mt-0.5">✓ {mt(lang, howLabel[r.how])}</span>}
                      {!r.supplierId && (
                        <select className="input-field !py-0.5 text-xs mt-1" value={r.newCategory} onChange={(e) => updateRow(r.key, { newCategory: e.target.value })}>
                          {SUPPLIER_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{mt(lang, `cat_${c}`)}</option>
                          ))}
                        </select>
                      )}
                      {r.rec.description && <span className="block text-xs text-ink/50 mt-0.5">{r.rec.description}</span>}
                    </td>
                    <td className="py-1.5 pr-2">{r.rec.invoice_number || '—'}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-right">{r.rec.total_amount !== null ? formatMoney(r.rec.total_amount, 'EUR', lang) : '—'}</td>
                    <td className="py-1.5 pr-2">
                      <select className="input-field !py-1 text-sm" value={r.category} onChange={(e) => updateRow(r.key, { category: e.target.value })}>
                        {INVOICE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{mt(lang, `invcat_${c}`)}</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.dup === 'same_number' && <Pill>{mt(lang, 'importDuplicate')}</Pill>}
                        {r.dup === 'same_date_amount' && <Pill tone="ochre">{mt(lang, 'importPossibleDuplicate')}</Pill>}
                        {r.notInvoice && <Pill tone="ochre">{mt(lang, 'importNotInvoice')}</Pill>}
                        {r.rec.warnings.map((w) => (
                          <Pill key={w} tone="ochre">{mt(lang, `w_${w}`)}</Pill>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={stage === 'saving' || summary.n === 0} onClick={runImport}>
              {stage === 'saving' ? mt(lang, 'importSaving') : mt(lang, 'importRun', { n: summary.n })}
            </button>
            <button className="btn-secondary" disabled={stage === 'saving'} onClick={() => setStage(sheets.length ? 'mapping' : 'pick')}>{mt(lang, 'importBack')}</button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-3">
          <p className="text-sm text-sea font-semibold">✓ {result}</p>
          <button className="btn-secondary" onClick={onClose}>OK</button>
        </div>
      )}

      {note && stage !== 'done' && <p className="text-xs text-ink/60 italic">{note}</p>}
      <ErrorBox message={error} />
    </div>
  );
}
