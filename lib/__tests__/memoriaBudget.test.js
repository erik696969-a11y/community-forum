import { describe, it, expect } from 'vitest';
import { budgetStatus, reserveStatus } from '../memoriaBudget';

const budget = { year: 2026, total_amount: 100000, reserve_min_percent: 10 };
const inv = (date, amount, category, funding_source = 'ordinary_budget') => ({ invoice_date: date, total_amount: amount, category, funding_source });

describe('budgetStatus', () => {
  const invoices = [
    // gardening: 3 invoices by 2026-06-30 (half a year) → projection ≈ 2 × 6000 = 12 000
    inv('2026-02-28', 2000, 'gardening'),
    inv('2026-04-30', 2000, 'gardening'),
    inv('2026-06-30', 2000, 'gardening'),
    inv('2026-05-10', 3000, 'pools'),
    inv('2026-03-01', 500, 'legal'),
    inv('2026-03-01', 9999, 'repair', 'reserve_fund'),
    inv('2025-12-31', 7777, 'gardening'),
  ];
  const s = budgetStatus({ budget, lines: [{ category: 'gardening', amount: 10000 }, { category: 'pools', amount: 2500 }], invoices });

  it('counts only ordinary-budget invoices of the year and knows the data coverage', () => {
    expect(s.coverageDate).toBe('2026-06-30');
    expect(s.actualTotal).toBe(9500);
    expect(s.plannedTotal).toBe(12500);
    expect(s.unallocated).toBe(87500);
  });

  it('flags lines at risk and over budget, and spending without a line', () => {
    const g = s.rows.find((r) => r.category === 'gardening');
    expect(g.status).toBe('at_risk');
    expect(g.projection).toBeGreaterThan(11900);
    expect(s.rows.find((r) => r.category === 'pools')).toMatchObject({ status: 'over', projection: null });
    expect(s.rows.find((r) => r.category === 'legal')).toMatchObject({ status: 'unplanned', actual: 500 });
  });
});

describe('reserveStatus', () => {
  it('adds movements, subtracts withdrawals and reserve-funded invoices, and compares with the minimum', () => {
    const r = reserveStatus({
      movements: [
        { moved_on: '2026-01-01', kind: 'opening_balance', amount: 12000 },
        { moved_on: '2026-02-01', kind: 'contribution', amount: 1000 },
        { moved_on: '2026-03-01', kind: 'withdrawal', amount: 5000 },
      ],
      reserveInvoices: [{ total_amount: 1000 }],
      budget,
    });
    expect(r.balance).toBe(7000);
    expect(r.minimum).toBe(10000);
    expect(r.belowMinimum).toBe(true);
  });
});
