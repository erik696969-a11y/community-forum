import { describe, it, expect } from 'vitest';
import { collectDigestItems, dailyItems, renderDigest, isWeeklyDay } from '../memoriaDigest';

const TODAY = '2026-09-25';

const data = {
  tasks: [
    { title: 'Fix gate', due_date: '2026-09-24', status: 'in_progress' },
    { title: 'Paint fence', due_date: '2026-10-02', status: 'not_started' },
    { title: 'Done task', due_date: '2026-09-20', status: 'done' },
    { title: 'Demo task', due_date: '2026-09-26', status: 'not_started', is_demo: true },
  ],
  obligations: [{ title: 'Fire extinguishers', next_due_on: '2026-09-25', remind_days: 30, active: true }],
  contracts: [
    { subject: 'Gardening', status: 'active', ends_on: '2026-11-30', auto_renew: true, notice_period_days: 30 },
    { subject: 'Cameras', status: 'active', ends_on: '2027-06-30', auto_renew: false },
  ],
  meetings: [{ title: 'Board meeting', body: 'board', meeting_on: '2026-10-03', status: 'planned', invitation_sent_on: null }],
  invoices: [{ invoice_number: 'F-1', is_urgent_unbudgeted: true, ratified_by_decision_id: null }],
  mandates: [],
  profiles: [],
};

describe('collectDigestItems', () => {
  const items = collectDigestItems(data, TODAY);

  it('collects open items with dates and leaves out done tasks and demo records', () => {
    const names = items.map((i) => i.name);
    expect(names).toContain('Fix gate');
    expect(names).toContain('Paint fence');
    expect(names).not.toContain('Done task');
    expect(names).not.toContain('Demo task');
    expect(names).not.toContain('Cameras');
  });

  it('computes the notice deadline and the invitation deadline', () => {
    expect(items.find((i) => i.kind === 'contract_notice')).toMatchObject({ name: 'Gardening', date: '2026-10-31', days: 36 });
    expect(items.find((i) => i.kind === 'meeting_invitation')).toMatchObject({ date: '2026-09-25', days: 0 });
  });

  it('includes demo records only when asked', () => {
    const withDemo = collectDigestItems(data, TODAY, { includeDemo: true });
    expect(withDemo.find((i) => i.name === 'Demo task')).toMatchObject({ isDemo: true, days: 1 });
  });
});

describe('dailyItems', () => {
  it('keeps only milestone days', () => {
    const daily = dailyItems(collectDigestItems(data, TODAY)).map((i) => i.name);
    expect(daily).toEqual(expect.arrayContaining(['Fix gate', 'Paint fence', 'Fire extinguishers', 'Board meeting']));
    expect(daily).not.toContain('Gardening');
    expect(daily).not.toContain('F-1');
  });
});

describe('renderDigest', () => {
  it('renders the email in the recipient language, escapes names and links to Memoria', () => {
    const items = collectDigestItems({ ...data, tasks: [{ title: '<b>x</b>', due_date: '2026-09-24', status: 'in_progress' }] }, TODAY);
    const { subject, html, text } = renderDigest({ items, lang: 'es', weekly: true, appUrl: 'https://app.example/', today: TODAY });
    expect(subject).toContain('resumen semanal');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('https://app.example/admin/memoria');
    expect(text).toContain('Vencido (1)');
  });

  it('marks a sample', () => {
    const { subject, html } = renderDigest({ items: [], lang: 'en', weekly: true, appUrl: '', today: TODAY, sample: true });
    expect(subject).toContain('DEMO');
    expect(html).toContain('Nothing overdue');
  });
});

describe('isWeeklyDay', () => {
  it('is Monday', () => {
    expect(isWeeklyDay('2026-09-28')).toBe(true);
    expect(isWeeklyDay('2026-09-25')).toBe(false);
  });
});
