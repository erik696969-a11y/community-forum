// i18n oprava: appka doteraz volala new Date(...).toLocaleDateString() bez
// parametra, čo formátuje dátum podľa JAZYKA PREHLIADAČA (browser locale),
// nie podľa jazyka zvoleného v appke. Anglicky hovoriaci člen s francúzskym
// prehliadačom tak videl dátumy vo francúzskom formáte aj keď appku
// prepol na angličtinu. Táto funkcia mapuje jazyk appky na správny locale.

export const LOCALE_MAP = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

export function formatDate(date, lang) {
  return new Date(date).toLocaleDateString(LOCALE_MAP[lang] || 'en-GB');
}

export function formatTime(date, lang, options = { hour: '2-digit', minute: '2-digit' }) {
  return new Date(date).toLocaleTimeString(LOCALE_MAP[lang] || 'en-GB', options);
}

// Facility bookings are always in the community's own local time
// (Benahavís, Spain) regardless of which timezone the booking member's own
// browser happens to be in — a member visiting from London booking "10:00"
// means 10:00 in Spain, not 10:00 UK time. Use these two together for any
// facility-booking-style date+time input/display.

export const FACILITY_TIMEZONE = 'Europe/Madrid';

// Standard dependency-free way to convert a "wall clock" time in a
// specific IANA zone to the correct UTC instant, correctly accounting for
// DST (Intl uses real timezone data for the given date).
//
// IMPORTANT: this must never round-trip through an unlabeled locale
// string (e.g. `new Date(someLocaleString)`) - parsing an unlabeled
// string re-introduces the CALLING ENVIRONMENT's own local timezone,
// silently reintroducing exactly the system-timezone dependency this
// function exists to avoid. A resident's browser set to America/New_York
// booking "10:00" was previously stored as a different UTC instant than
// the same booking made from a browser set to Europe/Madrid - this
// implementation only ever uses Date.UTC() (always UTC, unambiguous) and
// Intl.DateTimeFormat.formatToParts() (explicit timeZone, unambiguous),
// so the result is identical regardless of the caller's own timezone.
//
// DST TRANSITION EDGE CASES (documented, deterministic, verified
// identical across simulated browser timezones - see
// lib/__tests__/formatDate.test.js):
//
// - FALL-BACK "ambiguous" hour (e.g. 25 October 2026 02:00-03:00
//   Europe/Madrid occurs twice): a wall-clock time in that hour (e.g.
//   "02:30") resolves to its SECOND, later occurrence (the
//   post-transition/standard-time, CET instance), not the first
//   (CEST) one. This choice is accepted product behaviour and is
//   deterministic (identical across all caller timezones) - see
//   lib/__tests__/formatDate.test.js.
//
// - SPRING-FORWARD "gap" (e.g. 29 March 2026 02:00-03:00 Europe/Madrid
//   does not exist on the clock): a wall-clock time inside the gap
//   (e.g. "02:30") is REJECTED outright, not silently normalized to a
//   different wall-clock time. Silently storing "01:30" for a resident
//   who typed "02:30" is not acceptable product behaviour even though
//   it would be deterministic - a booking must never be created at a
//   local wall-clock time other than the one the resident actually
//   entered. Detection: after resolving a candidate UTC instant, that
//   instant is re-formatted in the target timezone and compared against
//   the original input; if they don't match exactly, the requested
//   local time never existed and InvalidLocalTimeError is thrown before
//   anything is written to the database.
export class InvalidLocalTimeError extends Error {
  constructor(dateStr, timeStr, timeZone) {
    super(`${dateStr} ${timeStr} does not exist in ${timeZone} (falls in a DST spring-forward gap).`);
    this.name = 'InvalidLocalTimeError';
    this.dateStr = dateStr;
    this.timeStr = timeStr;
    this.timeZone = timeZone;
  }
}

export function zonedTimeToUtc(dateStr, timeStr, timeZone = FACILITY_TIMEZONE) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const asUTC = Date.UTC(year, month - 1, day, hour, minute);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(asUTC));
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  // Some engines format midnight as "24" rather than "00" with hour12:false.
  const hourPart = get('hour') === 24 ? 0 : get('hour');
  const zonedAsIfUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hourPart, get('minute'));
  const offset = zonedAsIfUTC - asUTC;
  const result = new Date(asUTC - offset);

  // Round-trip validation: the resolved UTC instant must read back as
  // EXACTLY the requested local wall-clock time. A mismatch means the
  // input fell inside a DST spring-forward gap and never existed.
  const verifyParts = dtf.formatToParts(result);
  const vGet = (type) => parseInt(verifyParts.find((p) => p.type === type).value, 10);
  const vHour = vGet('hour') === 24 ? 0 : vGet('hour');
  if (vGet('year') !== year || vGet('month') !== month || vGet('day') !== day || vHour !== hour || vGet('minute') !== minute) {
    throw new InvalidLocalTimeError(dateStr, timeStr, timeZone);
  }

  return result;
}

// The reverse of zonedTimeToUtc: given a stored UTC timestamp, get back the
// {date, time} strings as they'd appear on a clock in Europe/Madrid - used
// to pre-fill the edit form with the booking's original local date/time
// rather than showing it in the editing member's own browser timezone.
export function utcToZonedDateTimeParts(isoString, timeZone = FACILITY_TIMEZONE) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function formatFacilityTime(date, lang) {
  return formatTime(date, lang, { hour: '2-digit', minute: '2-digit', timeZone: FACILITY_TIMEZONE });
}

export function formatFacilityDate(date, lang) {
  return new Date(date).toLocaleDateString(LOCALE_MAP[lang] || 'en-GB', { timeZone: FACILITY_TIMEZONE });
}
