import { describe, it, expect } from 'vitest';
import {
  deriveEntry,
  workingMs,
  durationText,
  periodSummary,
  committeeSummary,
  procurementStats,
  targetValues,
  kpiState,
  spotCheck,
  reportPeriod,
} from '../siteKpi';

const H = 3600000;
const D = 24 * H;
const t0 = new Date('2026-09-01T08:00:00Z');
const at = (ms) => new Date(t0.getTime() + ms).toISOString();

function entry(ref, urgency, created, events = [], extra = {}) {
  return { reference: ref, urgency, created_at: at(created), type: 'incident', location: 'Pool 2', description: ref, events, ...extra };
}

describe('deriveEntry and the hold clock', () => {
  it('subtracts time on hold from working time', () => {
    const d = deriveEntry(entry('A', 'medium', 0, [
      { kind: 'hold', reason: 'waiting for a part', created_at: at(6 * H) },
      { kind: 'resume', created_at: at(6 * H + 5 * D) },
      { kind: 'close', created_at: at(12 * H + 5 * D) },
    ]));
    expect(d.status).toBe('closed');
    expect(d.holdMs).toBe(5 * D);
    expect(workingMs(d, d.closedAt)).toBe(12 * H);
  });

  it('counts a hold still running up to the end date', () => {
    const d = deriveEntry(entry('B', 'low', 0, [{ kind: 'hold', reason: 'x', created_at: at(2 * H) }]));
    expect(d.status).toBe('on_hold');
    expect(workingMs(d, at(10 * D))).toBe(2 * H);
  });

  it('closing while on hold ends the hold', () => {
    const d = deriveEntry(entry('C', 'low', 0, [
      { kind: 'hold', reason: 'x', created_at: at(1 * H) },
      { kind: 'close', created_at: at(3 * H) },
    ]));
    expect(workingMs(d, d.closedAt)).toBe(1 * H);
  });
});

describe('durationText', () => {
  it('reads naturally', () => {
    expect(durationText(20 * 60000)).toBe('20 min');
    expect(durationText(20 * H)).toBe('20 h');
    expect(durationText(3.5 * D)).toBe('3.5 days');
    expect(durationText(15 * D)).toBe('15 days');
  });
});

describe('targets', () => {
  it('uses stored values over defaults', () => {
    const t = targetValues({ urgent_within_hours: { value: 12, minute_ref: 'x' } });
    expect(t.urgent_within_hours).toBe(12);
    expect(t.quotations_required).toBe(3);
  });
});

describe('periodSummary', () => {
  it('starts where the last report ended', () => {
    const reports = [{ created_at: at(2 * D), period_to: at(2 * D) }];
    const p = reportPeriod(reports, 'weekly', new Date(at(9 * D)));
    expect(p.from.toISOString()).toBe(at(2 * D));
  });

  it('counts logged, closed, open and high', () => {
    const s = periodSummary({
      entries: [
        entry('A', 'high', 1 * D),
        entry('B', 'low', 1 * D, [{ kind: 'close', created_at: at(2 * D) }]),
        entry('C', 'medium', 1 * D, [{ kind: 'hold', reason: 'part', created_at: at(1 * D + H) }]),
      ],
      reports: [],
      kind: 'weekly',
      now: new Date(at(5 * D)),
    });
    expect(s.count).toBe(3);
    expect(s.closed).toBe(1);
    expect(s.openNow).toBe(2);
    expect(s.onHoldNow).toBe(1);
    expect(s.highNow).toBe(1);
    expect(s.avgDays).toBe(1);
  });
});

describe('procurement', () => {
  it('counts quotations from the records, not a stated figure', () => {
    const t = targetValues({});
    const works = [
      { reference: 'P1', created_at: at(D), estimated_value: 2150, description: 'Pump', quotations: [{ supplier: 'a' }, { supplier: 'b' }, { supplier: 'c' }], events: [] },
      { reference: 'P2', created_at: at(D), estimated_value: 1500, description: 'Gate', quotations: [{ supplier: 'a' }, { supplier: 'b' }], events: [] },
      { reference: 'P3', created_at: at(D), estimated_value: 400, description: 'Small', quotations: [], events: [] },
    ];
    const s = procurementStats(works, new Date(t0), new Date(at(10 * D)), t);
    expect(s.works).toBe(2);
    expect(s.quoted).toBe(1);
    expect(s.items.find((i) => i.ref === 'P2').count).toBe(2);
  });
});

describe('kpiState banding', () => {
  it('is forgiving at the edge', () => {
    expect(kpiState({ met: 0, total: 0 })).toBe('none');
    expect(kpiState({ met: 5, total: 5 })).toBe('met');
    expect(kpiState({ met: 4, total: 5 })).toBe('below');
    expect(kpiState({ met: 3, total: 5 })).toBe('missed');
  });
});

describe('committeeSummary', () => {
  const entries = [
    entry('U1', 'high', 1 * D, [{ kind: 'close', created_at: at(1 * D + 10 * H) }]),
    entry('U2', 'high', 2 * D, [
      { kind: 'hold', reason: 'insurer', created_at: at(2 * D + 2 * H) },
      { kind: 'resume', created_at: at(6 * D) },
      { kind: 'close', created_at: at(6 * D + 5 * H) },
    ]),
    entry('R1', 'low', 3 * D, [{ kind: 'close', created_at: at(20 * D) }]),
    entry('S1', 'low', -60 * D),
  ];
  const reports = [
    { created_at: at(7 * D), kind: 'weekly', period_from: at(0), period_to: at(7 * D), maintenance_due: 10, maintenance_done: 9, inspections: 4, note: 'Pump at end of life', metrics: { count: 3, closed: 2 } },
  ];
  const s = committeeSummary({ entries, reports, works: [], targets: {}, days: 90, now: new Date(at(30 * D)), random: () => 0 });

  it('measures urgent items in working time', () => {
    const k = s.kpis.find((x) => x.name.startsWith('Urgent'));
    expect(k.result).toBe('2 of 2');
    expect(k.state).toBe('met');
  });

  it('flags routine items over the limit and stale items', () => {
    expect(s.kpis.find((x) => x.name.startsWith('Other')).result).toBe('0 of 1');
    expect(s.kpis.find((x) => x.name.startsWith('Items open')).result).toBe('1');
  });

  it('keeps measured and reported apart', () => {
    const maint = s.kpis.find((x) => x.name.startsWith('Preventive'));
    expect(maint.source).toBe('reported');
    expect(maint.result).toBe('90%');
    expect(maint.state).toBe('met');
    expect(s.notes[0].text).toBe('Pump at end of life');
  });

  it('draws a spot-check sample from closed matters', () => {
    expect(s.spot).toHaveLength(3);
    expect(new Set(s.spot.map((x) => x.ref)).size).toBe(3);
  });
});

describe('spotCheck', () => {
  it('never returns more than exists', () => {
    expect(spotCheck([{ ref: 'a' }], 3)).toHaveLength(1);
  });
});
