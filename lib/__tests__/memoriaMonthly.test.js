import { describe, it, expect } from 'vitest';
import { buildMonthly, renderMonthly, previousMonth, isFirstWorkingDay } from '../memoriaMonthly';

describe('monthly report helpers', () => {
  it('knows the previous month and the first working day', () => {
    expect(previousMonth('2026-10-01')).toBe('2026-09');
    expect(previousMonth('2027-01-04')).toBe('2026-12');
    expect(isFirstWorkingDay('2026-10-01')).toBe(true); // Thursday
    expect(isFirstWorkingDay('2026-11-02')).toBe(true); // Monday after a weekend
    expect(isFirstWorkingDay('2026-11-03')).toBe(false);
  });
});

describe('buildMonthly / renderMonthly', () => {
  const data = {
    decisions: [{ title: 'Pool tender opened', decided_on: '2026-09-15' }, { title: 'Old', decided_on: '2026-08-01' }, { title: 'Demo', decided_on: '2026-09-02', is_demo: true }],
    tasks: [
      { title: 'Fix gate', status: 'done', completed_on: '2026-09-10' },
      { title: 'Paint', status: 'in_progress', due_date: '2026-09-01' },
    ],
    invoices: [
      { supplier_id: 's', invoice_date: '2026-09-05', total_amount: 1000, category: 'pools', funding_source: 'ordinary_budget' },
      { supplier_id: 's', invoice_date: '2026-09-18', total_amount: 500, category: 'repair', funding_source: 'ordinary_budget' },
    ],
    cases: [{ status: 'in_progress', amount_claimed: 6850, opened_on: '2026-06-12' }, { status: 'settled', closed_on: '2026-09-02', opened_on: '2026-07-20' }],
    meetings: [{ title: 'Board meeting', status: 'held', meeting_on: '2026-09-30' }],
    budgets: [],
    suppliers: [{ id: 's', name: 'Supplier' }],
  };
  const r = buildMonthly(data, '2026-09', '2026-10-01');

  it('collects the month and leaves out demo records unless asked', () => {
    expect(r.decisions.map((d) => d.title)).toEqual(['Pool tender opened']);
    expect(r.tasksDone).toHaveLength(1);
    expect(r.tasksOverdue).toBe(1);
    expect(r.invoiceCount).toBe(2);
    expect(r.invoiceSum).toBe(1500);
    expect(r.cases).toMatchObject({ open: 1, closed: 1, claimed: 6850 });
    expect(buildMonthly(data, '2026-09', '2026-10-01', { includeDemo: true }).decisions).toHaveLength(2);
  });

  it('renders in the recipient language', () => {
    const { subject, html, text } = renderMonthly(r, { lang: 'es', appUrl: 'https://x.example' });
    expect(subject).toContain('informe mensual');
    expect(subject).toContain('septiembre');
    expect(html).toContain('https://x.example/admin/memoria');
    expect(text).toContain('Pool tender opened');
  });
});
