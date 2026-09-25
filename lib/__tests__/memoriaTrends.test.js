import { describe, it, expect } from 'vitest';
import { supplierPriceChanges, categoryYearOnYear } from '../memoriaTrends';

const inv = (s, d, a, c = 'pools', f = 'ordinary_budget') => ({ supplier_id: s, invoice_date: d, total_amount: a, category: c, funding_source: f });

describe('supplierPriceChanges', () => {
  it('compares the median invoice of the last two years and flags rises of 4% or more', () => {
    const list = supplierPriceChanges(
      [
        inv('p', '2025-01-28', 3751), inv('p', '2025-02-28', 3751), inv('p', '2026-01-28', 3932.5), inv('p', '2026-02-28', 3932.5),
        inv('i', '2024-11-14', 16016, 'insurance'), inv('i', '2025-11-15', 18900.2, 'insurance'),
        inv('s', '2025-01-28', 7502), inv('s', '2025-02-28', 7502), inv('s', '2026-01-28', 7502), inv('s', '2026-02-28', 7502),
        inv('r', '2025-03-01', 500), inv('r', '2026-03-01', 900), inv('r', '2026-04-01', 100),
      ],
      { p: 'Pools', i: 'Insurer', s: 'Security' }
    );
    expect(list[0]).toMatchObject({ name: 'Insurer', annual: true, flagged: true });
    expect(list[0].change).toBeCloseTo(0.18, 2);
    expect(list.find((x) => x.name === 'Pools')).toMatchObject({ flagged: true, from: 3751, to: 3932.5 });
    expect(list.find((x) => x.name === 'Security')).toMatchObject({ flagged: false, change: 0 });
    expect(list.find((x) => x.supplierId === 'r')).toBeUndefined();
  });
});

describe('categoryYearOnYear', () => {
  it('compares whole months of both years and ignores reserve-funded invoices', () => {
    const r = categoryYearOnYear([
      inv('a', '2025-03-01', 10000, 'gardening'),
      inv('a', '2025-11-01', 99999, 'gardening'),
      inv('b', '2026-03-01', 12500, 'gardening'),
      inv('b', '2026-05-01', 9000, 'improvement', 'reserve_fund'),
      inv('c', '2025-02-01', 1000, 'legal'),
      inv('c', '2026-02-01', 1050, 'legal'),
      // same monthly fee, invoiced on a different day of the month: must not count as a rise
      inv('s', '2025-04-28', 7502, 'security'),
      inv('s', '2026-04-18', 7502, 'security'),
      inv('s', '2026-05-01', 7502, 'security'),
    ]);
    expect(r.coverageDate).toBe('2026-05-01');
    expect(r.windowEnd).toBe('2026-04-30');
    expect(r.rows.find((x) => x.category === 'security')).toMatchObject({ now: 7502, before: 7502, flagged: false });
    expect(r.rows.find((x) => x.category === 'gardening')).toMatchObject({ now: 12500, before: 10000, flagged: true });
    expect(r.rows.find((x) => x.category === 'legal')).toMatchObject({ flagged: false });
    expect(r.rows.find((x) => x.category === 'improvement')).toBeUndefined();
  });
});
