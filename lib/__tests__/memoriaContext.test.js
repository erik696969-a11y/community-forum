import { describe, it, expect } from 'vitest';
import { buildMemoriaContext } from '../memoriaContext';

describe('buildMemoriaContext', () => {
  const data = {
    suppliers: [{ id: 's1', name: 'Verde Costa', category: 'gardening', status: 'active', conflict_of_interest_checked: false, is_demo: true }],
    ratings: [{ supplier_id: 's1', rating: 4, rated_on: '2026-03-31', comment: 'ok' }],
    contracts: [{ id: 'c1', subject: 'Gardening', supplier_id: 's1', status: 'active', starts_on: '2025-11-01', ends_on: '2026-12-31', auto_renew: true, notice_period_days: 60, amount: 4350, currency: 'EUR', payment_frequency: 'monthly', tender_id: null }],
    tenders: [], quotes: [],
    invoices: [
      { supplier_id: 's1', invoice_date: '2026-01-28', total_amount: 100, category: 'gardening', payment_status: 'paid' },
      { supplier_id: 's1', invoice_date: '2026-02-28', total_amount: 50.5, category: 'gardening', payment_status: 'overdue', invoice_number: 'X1' },
    ],
    decisions: [{ id: 'd1', title: 'Award', decided_on: '2025-09-24', body: 'board', decision: 'Verde Costa', status: 'active' }],
    tasks: [{ title: 'Review', status: 'not_started', due_date: '2026-01-01', executor_role: 'administrator', decision_id: 'd1' }],
    obligations: [], meetings: [], meetingItems: [],
  };
  const ctx = buildMemoriaContext(data, '2026-09-25');

  it('marks demo records and missing checks', () => {
    expect(ctx).toContain('Verde Costa [DEMO]');
    expect(ctx).toContain('conflict-of-interest checked: NO');
    expect(ctx).toContain('tender: NONE');
  });
  it('summarises invoices by supplier and year', () => {
    expect(ctx).toContain('Verde Costa 2026: 2 invoices, 150.50 EUR');
  });
  it('flags overdue tasks and invoices needing attention', () => {
    expect(ctx).toMatch(/Review.*OVERDUE/);
    expect(ctx).toContain('X1');
  });
});
