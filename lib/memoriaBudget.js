// Memoria — rozpočet po kategóriách a rezervný fond (čisté výpočty).
// Iba fakty a jednoduchý prepočet tempa; nič neodporúča.

const MIN_INVOICES_FOR_PROJECTION = 3;
export const PROJECTION_WARN = 1.05; // odhad na celý rok nad 105 % rozpočtu

function dayOfYear(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

function daysInYear(year) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
}

const round2 = (x) => Math.round(x * 100) / 100;

// budget: { year, total_amount }, lines: [{ category, amount }], invoices: [{ invoice_date, total_amount, category, funding_source }]
// Počítajú sa faktúry roka hradené z bežného rozpočtu.
export function budgetStatus({ budget, lines, invoices }) {
  const year = Number(budget.year);
  const inYear = (invoices || []).filter(
    (i) => i.invoice_date && Number(i.invoice_date.slice(0, 4)) === year && (i.funding_source || 'ordinary_budget') === 'ordinary_budget'
  );
  const coverageDate = inYear.reduce((mx, i) => (i.invoice_date > mx ? i.invoice_date : mx), '') || null;
  const share = coverageDate ? dayOfYear(coverageDate) / daysInYear(year) : 0;

  const byCat = {};
  for (const i of inYear) {
    const c = i.category || 'other';
    const b = (byCat[c] ||= { actual: 0, count: 0 });
    b.actual += Number(i.total_amount || 0);
    b.count += 1;
  }

  const lineCats = new Set((lines || []).map((l) => l.category));
  const rows = (lines || []).map((l) => {
    const a = byCat[l.category] || { actual: 0, count: 0 };
    const planned = Number(l.amount || 0);
    const projection = share > 0 && a.count >= MIN_INVOICES_FOR_PROJECTION ? round2(a.actual / share) : null;
    let status = 'ok';
    if (planned === 0 && a.actual > 0) status = 'over';
    else if (a.actual > planned) status = 'over';
    else if (projection !== null && projection > planned * PROJECTION_WARN) status = 'at_risk';
    return {
      category: l.category,
      planned,
      actual: round2(a.actual),
      count: a.count,
      pct: planned > 0 ? a.actual / planned : null,
      projection,
      status,
      isDemo: Boolean(l.is_demo),
    };
  });
  // Výdavky v kategóriách bez riadku rozpočtu.
  const unplanned = Object.entries(byCat)
    .filter(([c]) => !lineCats.has(c))
    .map(([c, a]) => ({ category: c, planned: 0, actual: round2(a.actual), count: a.count, pct: null, projection: null, status: 'unplanned', isDemo: false }));

  const plannedTotal = round2(rows.reduce((s, r) => s + r.planned, 0));
  const actualTotal = round2(inYear.reduce((s, i) => s + Number(i.total_amount || 0), 0));
  return {
    year,
    coverageDate,
    share,
    rows: [...rows, ...unplanned],
    plannedTotal,
    unallocated: round2(Number(budget.total_amount || 0) - plannedTotal),
    actualTotal,
    totalPct: Number(budget.total_amount) > 0 ? actualTotal / Number(budget.total_amount) : null,
  };
}

// Rezervný fond: pohyby + faktúry hradené z rezervy. Minimum = % z riadneho rozpočtu (LPH čl. 9.1.f: 10 %).
export function reserveStatus({ movements, reserveInvoices, budget }) {
  let balance = 0;
  const sorted = [...(movements || [])].sort((a, b) => (a.moved_on < b.moved_on ? -1 : 1));
  for (const m of sorted) {
    const amt = Number(m.amount || 0);
    balance += m.kind === 'withdrawal' ? -amt : amt;
  }
  const invoiceSpend = (reserveInvoices || []).reduce((s, i) => s + Number(i.total_amount || 0), 0);
  balance -= invoiceSpend;
  const minimum = budget ? round2((Number(budget.total_amount || 0) * Number(budget.reserve_min_percent ?? 10)) / 100) : null;
  return {
    hasData: sorted.length > 0 || invoiceSpend > 0,
    balance: round2(balance),
    invoiceSpend: round2(invoiceSpend),
    minimum,
    belowMinimum: minimum !== null && sorted.length > 0 && balance < minimum,
    lastMovement: sorted.length ? sorted[sorted.length - 1].moved_on : null,
  };
}
