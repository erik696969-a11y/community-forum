// Memoria — trendy z faktúr (čisté výpočty, iba fakty).
// 1) Zmena ceny u dodávateľa: medián faktúry v poslednom roku oproti predchádzajúcemu roku,
//    kde má dodávateľ pravidelné faktúry (aspoň 2 v oboch rokoch) alebo jednu ročnú (poistenie).
// 2) Výdavky kategórie od 1. 1. po dátum posledných údajov oproti rovnakému obdobiu minulého roka.

export const PRICE_CHANGE_THRESHOLD = 0.04; // +4 % a viac
export const CATEGORY_CHANGE_THRESHOLD = 0.1; // +10 % a viac
export const CATEGORY_MIN_DIFF = 1000; // a aspoň 1 000 EUR

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round2 = (x) => Math.round(x * 100) / 100;

// invoices: [{ supplier_id, invoice_date, total_amount, category }]
export function supplierPriceChanges(invoices, supplierNames = {}) {
  const by = {};
  for (const i of invoices || []) {
    if (!i.supplier_id || !i.invoice_date) continue;
    const y = Number(i.invoice_date.slice(0, 4));
    ((by[i.supplier_id] ||= {})[y] ||= []).push(i);
  }
  const out = [];
  for (const [sid, years] of Object.entries(by)) {
    const ys = Object.keys(years).map(Number).sort((a, b) => b - a);
    if (ys.length < 2) continue;
    const [y1, y0] = ys;
    if (y1 - y0 !== 1) continue;
    const a = years[y0];
    const b = years[y1];
    const annual = a.length === 1 && b.length === 1;
    if (!annual && (a.length < 2 || b.length < 2)) continue;
    const m0 = median(a.map((i) => Number(i.total_amount || 0)));
    const m1 = median(b.map((i) => Number(i.total_amount || 0)));
    if (!m0 || !m1) continue;
    const change = m1 / m0 - 1;
    out.push({
      supplierId: sid,
      name: supplierNames[sid] || sid,
      fromYear: y0,
      toYear: y1,
      from: round2(m0),
      to: round2(m1),
      change,
      annual,
      flagged: change >= PRICE_CHANGE_THRESHOLD,
    });
  }
  return out.sort((x, y) => y.change - x.change);
}

// Rovnaké obdobie po celých mesiacoch: 1. 1. až koniec posledného úplného mesiaca pred dátumom
// posledných údajov (napr. údaje do 18. 9. → január až august), v tomto a minulom roku, podľa kategórie.
// Celé mesiace, aby rozdielny deň vystavenia faktúry v mesiaci neskresľoval porovnanie.
export function categoryYearOnYear(invoices) {
  const dated = (invoices || []).filter((i) => i.invoice_date);
  if (!dated.length) return { coverageDate: null, windowEnd: null, rows: [] };
  const coverageDate = dated.reduce((mx, i) => (i.invoice_date > mx ? i.invoice_date : mx), '');
  const year = Number(coverageDate.slice(0, 4));
  const cm = Number(coverageDate.slice(5, 7));
  const lastDayOfCm = new Date(Date.UTC(year, cm, 0)).getUTCDate();
  const lastMonth = Number(coverageDate.slice(8, 10)) === lastDayOfCm ? cm : cm - 1;
  if (lastMonth < 1) return { coverageDate, windowEnd: null, year, rows: [] };
  const windowEnd = new Date(Date.UTC(year, lastMonth, 0)).toISOString().slice(0, 10);
  const cur = {};
  const prev = {};
  for (const i of dated) {
    if ((i.funding_source || 'ordinary_budget') !== 'ordinary_budget') continue;
    const y = Number(i.invoice_date.slice(0, 4));
    if (Number(i.invoice_date.slice(5, 7)) > lastMonth) continue;
    const c = i.category || 'other';
    if (y === year) cur[c] = (cur[c] || 0) + Number(i.total_amount || 0);
    if (y === year - 1) prev[c] = (prev[c] || 0) + Number(i.total_amount || 0);
  }
  const cats = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  const rows = [...cats]
    .map((c) => {
      const now = round2(cur[c] || 0);
      const before = round2(prev[c] || 0);
      const change = before > 0 ? now / before - 1 : null;
      return {
        category: c,
        now,
        before,
        change,
        flagged: before > 0 && change >= CATEGORY_CHANGE_THRESHOLD && now - before >= CATEGORY_MIN_DIFF,
      };
    })
    .sort((a, b) => (b.change ?? -1) - (a.change ?? -1));
  return { coverageDate, windowEnd, year, rows };
}
