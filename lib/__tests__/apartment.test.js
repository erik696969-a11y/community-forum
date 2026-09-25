import { describe, it, expect } from 'vitest';
import { formatApartment, isValidApartment, parseApartment, BLOCKS, FLOORS, DOORS } from '../apartment';

describe('apartment format', () => {
  it('writes ground floor as 1G1 and upper floors as 1.2.1', () => {
    expect(formatApartment({ block: '1', floor: 'G', door: '1' })).toBe('1G1');
    expect(formatApartment({ block: '1', floor: '2', door: '1' })).toBe('1.2.1');
    expect(formatApartment({ block: '14', floor: 'G', door: '2' })).toBe('14G2');
    expect(formatApartment({ block: '1', floor: '', door: '1' })).toBe('');
  });

  it('accepts only the community format', () => {
    for (const ok of ['1G1', '1.1.1', '1.2.1', '14G2', '6.2.2', '30.6.20']) expect(isValidApartment(ok)).toBe(true);
    for (const bad of ['14g2', '6.13', 'Blq 14 03', '24B', '1.G.1', '0.1.1', '1.0.1', '', null]) expect(isValidApartment(bad)).toBe(false);
  });

  it('parses back into parts, tolerating case and spaces', () => {
    expect(parseApartment('14g2')).toEqual({ block: '14', floor: 'G', door: '2' });
    expect(parseApartment(' 6.2.2 ')).toEqual({ block: '6', floor: '2', door: '2' });
    expect(parseApartment('Blq 14 03')).toBeNull();
  });

  it('every choice in the pickers produces a valid number', () => {
    for (const block of BLOCKS) for (const floor of FLOORS) for (const door of DOORS) {
      expect(isValidApartment(formatApartment({ block, floor, door }))).toBe(true);
    }
  });
});
