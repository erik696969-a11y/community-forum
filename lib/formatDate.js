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

// Standard trick for converting a "wall clock" time in a specific IANA zone
// to the correct UTC instant, without pulling in a timezone library: parse
// the input as if it were UTC, see how that instant reads back in the
// target zone, and shift by the difference. This correctly accounts for
// DST because Intl uses real timezone data for the given date.
export function zonedTimeToUtc(dateStr, timeStr, timeZone = FACILITY_TIMEZONE) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const asZonedString = naiveUtc.toLocaleString('en-US', { timeZone });
  const asZonedDate = new Date(asZonedString);
  const offset = naiveUtc.getTime() - asZonedDate.getTime();
  return new Date(naiveUtc.getTime() + offset);
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
