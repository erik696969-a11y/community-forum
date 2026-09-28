import { describe, it, expect } from 'vitest';
import { buildBoardReport, reportPresets, reportSections, reportText } from '../memoriaBoardReport';

const data = {
  decisions: [{ title: 'Ratify pump', decided_on: '2026-09-10', body: 'board', decision: 'Ratified' }, { title: 'Old', decided_on: '2026-07-01' }],
  tasks: [
    { title: 'Pay invoice', status: 'done', completed_on: '2026-09-12', executor_role: 'administrator', created_at: '2026-09-05T10:00:00Z' },
    { title: 'Get 3rd quote', status: 'in_progress', due_date: '2026-09-20', executor_role: 'president' },
    { title: 'Ramp licence', status: 'blocked', blocked_reason: 'Town hall', due_date: '2026-12-01' },
  ],
  invoices: [
    { supplier_id: 's1', invoice_date: '2026-09-03', total_amount: 1210, category: 'pools', payment_status: 'paid', paid_on: '2026-09-20' },
    { supplier_id: 's1', invoice_date: '2026-08-03', total_amount: 500, category: 'pools', payment_status: 'pending', due_date: '2026-09-01' },
    { supplier_id: 's2', invoice_date: '2026-09-15', total_amount: 300, category: 'repair', payment_status: 'pending', is_urgent_unbudgeted: true, urgency_reason: 'Leak' },
  ],
  suppliers: [{ id: 's1', name: 'Piscinas', category: 'pools', created_at: '2026-09-02T00:00:00Z', conflict_of_interest_checked: false }, { id: 's2', name: 'Fonta', category: 'plumbing', created_at: '2025-01-01T00:00:00Z' }],
  tenders: [{ id: 't1', title: 'Pool 2027', status: 'collecting', opened_on: '2026-09-05' }],
  quotes: [{ tender_id: 't1', supplier_id: 's1', amount: 1, submitted_on: '2026-09-06' }],
  contracts: [{ subject: 'Gardening', supplier_id: 's2', status: 'active', auto_renew: true, ends_on: '2026-11-15', notice_period_days: 30 }],
  cases: [{ title: 'Leak', status: 'open', amount_claimed: 800, opened_on: '2026-09-09', next_step: 'Call adjuster', next_step_due: '2026-09-25' }],
  meetings: [{ title: 'Board July', body: 'board', status: 'held', meeting_on: '2026-08-31' }, { title: 'Board Sept', body: 'board', status: 'planned', meeting_on: '2026-09-30' }],
  obligations: [{ title: 'Lift inspection', active: true, next_due_on: '2026-10-10' }],
  budgets: [{ id: 'b1', year: 2026, title: 'Budget 2026', total_amount: 10000 }],
  budgetLines: [{ budget_id: 'b1', category: 'pools', amount: 1000 }],
  reserveMovements: [{ kind: 'opening_balance', amount: 5000, moved_on: '2026-01-01' }],
};

describe('board report', () => {
  const presets = reportPresets('2026-09-28', data.meetings);
  it('starts the period the day after the last board meeting', () => {
    expect(presets.sinceMeeting).toMatchObject({ from: '2026-09-01', to: '2026-09-28' });
    expect(presets.lastMonth).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });
  const r = buildBoardReport(data, { from: '2026-09-01', to: '2026-09-28', today: '2026-09-28' });
  it('collects what happened in the period', () => {
    expect(r.decisions.map((d) => d.title)).toEqual(['Ratify pump']);
    expect(r.tasks.done).toHaveLength(1);
    expect(r.tasks.overdue.map((t) => t.title)).toEqual(['Get 3rd quote']);
    expect(r.tasks.blocked).toHaveLength(1);
    expect(r.invoices).toMatchObject({ count: 2, sum: 1510, paidCount: 1, paidSum: 1210, unpaidCount: 2, overdueCount: 1 });
    expect(r.invoices.urgent[0].supplier).toBe('Fonta');
    expect(r.suppliers.map((s) => s.name)).toEqual(['Piscinas']);
    expect(r.tenders.quotesIn).toBe(1);
    expect(r.contracts.deadlines[0]).toMatchObject({ kind: 'notice', date: '2026-10-16' });
    expect(r.cases.opened).toHaveLength(1);
    expect(r.meetings.next.title).toBe('Board Sept');
    expect(r.upcoming.map((u) => u.title)).toEqual(['Lift inspection']);
    expect(r.budget.status.rows[0].status).toBe('over');
  });
  it('renders sections and plain text in the chosen language', () => {
    const v = reportSections(r, 'es');
    expect(v.sections).toHaveLength(9);
    expect(v.sections[0].title).toBe('1. Acuerdos adoptados');
    const txt = reportText(v);
    expect(txt).toContain('Ratify pump');
    expect(txt).toContain('conflicto de intereses NO comprobado');
  });
  it('leaves out DEMO records unless asked', () => {
    const demo = { ...data, decisions: [{ title: 'Demo dec', decided_on: '2026-09-10', is_demo: true }] };
    expect(buildBoardReport(demo, { from: '2026-09-01', to: '2026-09-28', today: '2026-09-28' }).decisions).toHaveLength(0);
    expect(buildBoardReport(demo, { from: '2026-09-01', to: '2026-09-28', today: '2026-09-28', includeDemo: true }).decisions[0].isDemo).toBe(true);
  });
});
