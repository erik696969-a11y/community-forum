// Memoria — import faktúr od administrátora v rôznych formách.
// Čisté funkcie (bez siete): čítanie CSV / textu / .xlsx, nájdenie riadku s hlavičkou,
// návrh priradenia stĺpcov, prevod súm a dátumov, párovanie dodávateľov a hľadanie duplicít.
// AI (/api/memoria/import-assist) návrh iba spresňuje; board všetko potvrdzuje.

export const IMPORT_FIELDS = [
  'invoice_number',
  'invoice_date',
  'supplier_name',
  'supplier_tax_id',
  'description',
  'net_amount',
  'vat_amount',
  'total_amount',
  'due_date',
  'paid_on',
  'admin_category',
  'payment_status',
];

const SYNONYMS = {
  invoice_number: ['n factura', 'no factura', 'num factura', 'numero factura', 'numero de factura', 'n de factura', 'factura', 'n documento', 'documento', 'doc', 'invoice', 'invoice number', 'invoice no', 'referencia', 'ref', 'numero', 'num'],
  invoice_date: ['fecha', 'fecha factura', 'fecha de factura', 'fecha emision', 'fecha doc', 'fecha documento', 'f factura', 'date', 'invoice date', 'fecha contable'],
  due_date: ['vencimiento', 'fecha vencimiento', 'fecha de vencimiento', 'vto', 'f vto', 'due', 'due date'],
  paid_on: ['fecha pago', 'fecha de pago', 'pagado el', 'fecha cobro', 'f pago', 'paid', 'paid on', 'payment date'],
  supplier_name: ['proveedor', 'acreedor', 'empresa', 'razon social', 'nombre proveedor', 'nombre', 'tercero', 'supplier', 'vendor', 'emisor'],
  supplier_tax_id: ['nif', 'cif', 'nif cif', 'cif nif', 'nif proveedor', 'cif proveedor', 'dni', 'tax id', 'vat number', 'vat id'],
  description: ['concepto', 'descripcion', 'detalle', 'texto', 'observaciones', 'description', 'details'],
  net_amount: ['base', 'base imponible', 'base imp', 'importe neto', 'neto', 'net', 'net amount', 'subtotal'],
  vat_amount: ['iva', 'cuota iva', 'importe iva', 'impuesto', 'impuestos', 'vat', 'tax', 'vat amount'],
  total_amount: ['total', 'importe total', 'total factura', 'importe', 'liquido', 'amount', 'total amount', 'importe eur', 'total eur'],
  admin_category: ['cuenta', 'cuenta contable', 'partida', 'capitulo', 'categoria', 'tipo gasto', 'tipo de gasto', 'grupo', 'category', 'account'],
  payment_status: ['estado', 'situacion', 'estado pago', 'pagada', 'status', 'payment status'],
};

export function normText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª#.:/\\()_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Text / CSV ----------

// Dekóduje bajty: UTF-8, inak Windows-1252 (časté v španielskych exportoch).
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Rozdelí text na riadky rešpektujúc úvodzovky (nový riadok vnútri bunky).
function logicalLines(text) {
  const lines = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export function detectDelimiter(text) {
  const sample = logicalLines(text).filter((l) => l.trim()).slice(0, 15);
  let best = ',';
  let bestScore = -1;
  for (const d of ['\t', ';', ',', '|']) {
    const counts = sample.map((l) => splitLine(l, d).length);
    const multi = counts.filter((c) => c > 1);
    if (multi.length === 0) continue;
    // najčastejší počet stĺpcov × koľko riadkov ho má
    const freq = {};
    for (const c of multi) freq[c] = (freq[c] || 0) + 1;
    const [cols, n] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = n * 10 + Number(cols);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseDelimited(text, delim) {
  const d = delim || detectDelimiter(text);
  return logicalLines(text)
    .map((l) => splitLine(l, d))
    .filter((r) => r.some((c) => c !== ''));
}

// ---------- XLSX ----------

function xmlUnescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function textOf(xml) {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1]));
  return parts.join('');
}

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Prečíta .xlsx (JSZip odovzdaný zvonka). Vráti [{ name, rows: [[...]] }].
export async function readXlsx(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb) throw new Error('not_xlsx');
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const ssXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlUnescape((m[0].match(/name="([^"]*)"/) || [])[1] || 'Sheet');
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const path = `xl/${rels[rid] || ''}`;
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const rows = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const inner = cm[2] || '';
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/t="([^"]+)"/) || [])[1];
        const idx = ref ? colIndex(ref) : row.length;
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(inner);
        else if (type === 'str') value = v !== undefined ? xmlUnescape(v) : '';
        else if (type === 'b') value = v === '1';
        else if (v !== undefined) value = Number(v);
        row[idx] = value;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      if (row.some((c) => c !== '' && c !== null)) rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

// ---------- Hlavička a priradenie stĺpcov ----------

function fieldScore(header, field) {
  const h = normText(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of SYNONYMS[field]) {
    if (h === syn) best = Math.max(best, 10 + syn.length);
    else if (h.startsWith(`${syn} `) || h.endsWith(` ${syn}`) || h.includes(` ${syn} `)) best = Math.max(best, 4 + syn.length / 10);
  }
  return best;
}

// Riadok s hlavičkou = prvý z prvých 20 riadkov, ktorý najviac pripomína názvy stĺpcov.
export function findHeaderRow(rows) {
  let bestIdx = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, i) => {
    const texts = row.filter((c) => typeof c === 'string' && c.trim() && Number.isNaN(Number(c.replace(',', '.'))));
    if (texts.length < 2) return;
    const known = row.reduce((s, c) => s + (IMPORT_FIELDS.some((f) => fieldScore(c, f) > 0) ? 1 : 0), 0);
    const score = known * 10 + texts.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// Návrh: pole → index stĺpca (alebo null). Každý stĺpec najviac raz.
export function guessMapping(headers) {
  const pairs = [];
  headers.forEach((h, col) => {
    for (const f of IMPORT_FIELDS) {
      const s = fieldScore(h, f);
      if (s > 0) pairs.push({ f, col, s });
    }
  });
  pairs.sort((a, b) => b.s - a.s);
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null]));
  const usedCols = new Set();
  for (const p of pairs) {
    if (mapping[p.f] !== null || usedCols.has(p.col)) continue;
    mapping[p.f] = p.col;
    usedCols.add(p.col);
  }
  return mapping;
}

// ---------- Sumy a dátumy ----------

// '1.234,56' / '1,234.56' / '1234,5' / '(12,00)' / '-12' / 12.5 → číslo
export function parseAmount(value, decimalHint) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let s = String(value).trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€$£\s ]|EUR/gi, '');
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^[0-9.,']+$/.test(s)) return null;
  s = s.replace(/'/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) s = parts.join('.');
    else if (parts.length === 2 && decimalHint === ',') s = parts.join('.');
    else s = parts.join('');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && decimalHint === ',')) s = parts.join('');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

function validIso(y, m, d) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

// Dátum z Excelu (poradové číslo), ISO, alebo D/M/Y (podľa hintu 'DMY' | 'MDY' | 'YMD').
export function parseDate(value, orderHint = 'DMY') {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      return dt.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (orderHint === 'MDY') return validIso(y, a, b) || validIso(y, b, a);
    return validIso(y, b, a) || validIso(y, a, b);
  }
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  return null;
}

// ---------- Dodávatelia ----------

export function normTaxId(value) {
  const s = String(value ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  return s.startsWith('ES') && s.length > 9 ? s.slice(2) : s;
}

const LEGAL_SUFFIX = /\b(s\s?l\s?u?|s\s?a\s?u?|s\s?c|sociedad limitada|sociedad anonima|slu|sl|sa|ltd|limited|cb|s coop)\b/g;
export function normName(value) {
  return normText(value).replace(/[.,&]/g, ' ').replace(LEGAL_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

// Nájde existujúceho dodávateľa: IČ, potom zhodný názov, potom názov obsiahnutý v druhom.
export function matchSupplier(row, suppliers) {
  const tax = normTaxId(row.supplier_tax_id);
  if (tax.length >= 8) {
    const byTax = suppliers.find((s) => s.tax_id && normTaxId(s.tax_id) === tax);
    if (byTax) return { supplier: byTax, how: 'tax_id' };
  }
  const n = normName(row.supplier_name);
  if (!n) return null;
  const exact = suppliers.find((s) => normName(s.name) === n);
  if (exact) return { supplier: exact, how: 'name' };
  if (n.length >= 5) {
    const partial = suppliers.filter((s) => {
      const sn = normName(s.name);
      return sn.length >= 5 && (sn.includes(n) || n.includes(sn));
    });
    if (partial.length === 1) return { supplier: partial[0], how: 'similar_name' };
  }
  return null;
}

// Kategória dodávateľa → kategória faktúry.
export const SUPPLIER_TO_INVOICE_CATEGORY = {
  gardening: 'gardening',
  pools: 'pools',
  electrical: 'maintenance',
  plumbing: 'repair',
  construction: 'repair',
  cleaning: 'staff_cleaning',
  security: 'security',
  lifts: 'maintenance',
  it_telecom: 'administration',
  insurance: 'insurance',
  legal: 'legal',
  administration: 'administration',
  utilities: 'utilities',
  pest_control: 'maintenance',
  other: 'other',
};

// ---------- Riadky → faktúry ----------

function cell(row, idx) {
  if (idx === null || idx === undefined || idx < 0) return '';
  const v = row[idx];
  return v === undefined || v === null ? '' : v;
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v === '' ? '' : String(v);
}

function statusFrom(text, paidOn) {
  if (paidOn) return 'paid';
  const t = normText(text);
  if (!t) return null;
  if (/(pagad|paid|cobrad|abonad|liquidad|^si$|^yes$)/.test(t)) return 'paid';
  if (/(devuelt|disput|reclam|impugn)/.test(t)) return 'disputed';
  if (/(pendient|pending|^no$|sin pagar)/.test(t)) return 'pending';
  return null;
}

// options: { decimal: ',' | '.', dateOrder: 'DMY' | 'MDY' | 'YMD' }
export function buildRecords(dataRows, mapping, options = {}) {
  const out = [];
  dataRows.forEach((row, i) => {
    const get = (f) => cell(row, mapping[f]);
    const rec = {
      src: i,
      invoice_number: str(get('invoice_number')) || null,
      invoice_date: parseDate(get('invoice_date'), options.dateOrder),
      due_date: parseDate(get('due_date'), options.dateOrder),
      paid_on: parseDate(get('paid_on'), options.dateOrder),
      supplier_name: str(get('supplier_name')) || null,
      supplier_tax_id: str(get('supplier_tax_id')) || null,
      description: str(get('description')) || null,
      net_amount: parseAmount(get('net_amount'), options.decimal),
      vat_amount: parseAmount(get('vat_amount'), options.decimal),
      total_amount: parseAmount(get('total_amount'), options.decimal),
      admin_category: str(get('admin_category')) || null,
      payment_status: null,
      warnings: [],
    };
    rec.payment_status = statusFrom(get('payment_status'), rec.paid_on);

    // Súčtové a prázdne riadky (napr. „TOTAL AGOSTO“) preskočiť.
    const label = normText(`${rec.invoice_number || ''} ${rec.supplier_name || ''} ${rec.description || ''}`);
    const hasAmount = [rec.total_amount, rec.net_amount].some((x) => x !== null);
    if (!hasAmount && !rec.invoice_date) return;
    if (!rec.supplier_name && !rec.supplier_tax_id && !rec.invoice_number && /\b(total|suma|subtotal|totales)\b/.test(label)) return;
    if (!rec.supplier_name && !rec.supplier_tax_id && !rec.invoice_number && !rec.description) return;

    if (rec.total_amount === null && rec.net_amount !== null) {
      rec.total_amount = Math.round((rec.net_amount + (rec.vat_amount || 0)) * 100) / 100;
      if (rec.vat_amount === null) rec.warnings.push('total_from_net');
    }
    if (rec.total_amount === null) rec.warnings.push('no_amount');
    if (!rec.invoice_date) rec.warnings.push('no_date');
    if (!rec.supplier_name && !rec.supplier_tax_id) rec.warnings.push('no_supplier');
    if (
      rec.net_amount !== null &&
      rec.vat_amount !== null &&
      rec.total_amount !== null &&
      Math.abs(rec.net_amount + rec.vat_amount - rec.total_amount) > 0.05
    ) {
      rec.warnings.push('sum_mismatch');
    }
    out.push(rec);
  });
  return out;
}

// Duplicita: rovnaký dodávateľ + číslo faktúry (istá), alebo dodávateľ + dátum + suma (možná).
export function findDuplicate(rec, supplierId, existing) {
  if (!supplierId) return null;
  const num = normText(rec.invoice_number);
  for (const e of existing) {
    if (e.supplier_id !== supplierId) continue;
    if (num && e.invoice_number && normText(e.invoice_number) === num) return { kind: 'same_number', invoice: e };
  }
  for (const e of existing) {
    if (e.supplier_id !== supplierId) continue;
    if (rec.invoice_date && e.invoice_date === rec.invoice_date && Number(e.total_amount) === Number(rec.total_amount)) {
      return { kind: 'same_date_amount', invoice: e };
    }
  }
  return null;
}

// Pravdepodobný desatinný oddeľovač podľa textových súm v stĺpci.
export function guessDecimal(values) {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
  }
  return comma >= dot ? ',' : '.';
}

// Pravdepodobné poradie v dátume: ak má prvé číslo > 12, je to deň.
export function guessDateOrder(values) {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? 'MDY' : 'DMY';
}
