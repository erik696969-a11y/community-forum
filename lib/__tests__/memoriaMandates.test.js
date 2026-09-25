import { describe, it, expect } from 'vitest';
import { mandateChecks, mandateState } from '../memoriaMandates';

const TODAY = '2026-09-25';
const profiles = [
  { id: 'p1', full_name: 'Ana', role: 'board', status: 'approved' },
  { id: 'p2', full_name: 'Ben', role: 'board', status: 'approved' },
  { id: 'p3', full_name: 'Cy', role: 'owner', status: 'approved' },
  { id: 'p4', full_name: 'Dee', role: 'board', status: 'approved' },
];

describe('mandateState', () => {
  it('uses the actual end before the planned end', () => {
    expect(mandateState({ starts_on: '2026-04-23', ends_on: '2027-04-23' }, TODAY)).toBe('current');
    expect(mandateState({ starts_on: '2026-04-23', ends_on: '2027-04-23', ended_on: '2026-09-01' }, TODAY)).toBe('past');
    expect(mandateState({ starts_on: '2026-10-01', ends_on: '2027-04-23' }, TODAY)).toBe('future');
  });
});

describe('mandateChecks', () => {
  const mandates = [
    { id: 'm1', person_name: 'Ana', profile_id: 'p1', position: 'president', starts_on: '2026-04-23', ends_on: '2026-11-10' },
    { id: 'm2', person_name: 'Ben', profile_id: 'p2', position: 'board_member', starts_on: '2025-04-24', ends_on: '2026-04-23' },
    { id: 'm3', person_name: 'Cy', profile_id: 'p3', position: 'board_member', starts_on: '2025-04-24', ends_on: '2026-04-23' },
    { id: 'm4', person_name: 'Admin SL', profile_id: null, position: 'administrator', starts_on: '2026-04-23', ends_on: '2027-04-23' },
  ];
  const checks = mandateChecks(mandates, profiles, TODAY);

  it('flags a mandate ending within 60 days', () => {
    expect(checks.find((c) => c.kind === 'ending')).toMatchObject({ name: 'Ana', date: '2026-11-10' });
  });

  it('flags board access left after the mandate ended, but not for accounts without board role', () => {
    const left = checks.filter((c) => c.kind === 'leftover_access');
    expect(left.map((c) => c.name)).toEqual(['Ben']);
  });

  it('flags board accounts without any current mandate, once', () => {
    const none = checks.filter((c) => c.kind === 'no_mandate');
    expect(none.map((c) => c.name)).toEqual(['Dee']);
  });
});
