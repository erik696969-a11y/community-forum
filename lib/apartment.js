// Číslo apartmánu v jednotnom formáte komunity:
//   prízemie:      <blok>G<dvere>          napr. 1G1, 14G2
//   ostatné poschodia: <blok>.<poschodie>.<dvere>  napr. 1.1.1, 1.2.1
// Rovnaký vzor stráži aj databáza (trigger na profiles), takže sa iný zápis nedá uložiť.
// Jednotný formát je podmienkou pravidla „1 apartmán = 1 hlas“.

export const TOTAL_APARTMENTS = Number(process.env.NEXT_PUBLIC_TOTAL_APARTMENTS) || 322;

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

export const BLOCKS = range(1, 30);
export const FLOORS = ['G', ...range(1, 6)];
export const DOORS = range(1, 20);

export const APARTMENT_PATTERN = /^([1-9][0-9]?)(?:G([1-9][0-9]?)|\.([1-9])\.([1-9][0-9]?))$/;

export function formatApartment({ block, floor, door } = {}) {
  if (!block || !floor || !door) return '';
  return floor === 'G' ? `${block}G${door}` : `${block}.${floor}.${door}`;
}

export function isValidApartment(value) {
  return APARTMENT_PATTERN.test(String(value || ''));
}

// Rozloží platné číslo na časti (pre predvyplnenie výberu). Malé „g“ a medzery toleruje.
export function parseApartment(value) {
  const clean = String(value || '').replace(/\s+/g, '').toUpperCase();
  const m = clean.match(APARTMENT_PATTERN);
  if (!m) return null;
  return m[2] ? { block: m[1], floor: 'G', door: m[2] } : { block: m[1], floor: m[3], door: m[4] };
}
