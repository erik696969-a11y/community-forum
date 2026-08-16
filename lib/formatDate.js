// i18n oprava: appka doteraz volala new Date(...).toLocaleDateString() bez
// parametra, čo formátuje dátum podľa JAZYKA PREHLIADAČA (browser locale),
// nie podľa jazyka zvoleného v appke. Anglicky hovoriaci člen s francúzskym
// prehliadačom tak videl dátumy vo francúzskom formáte aj keď appku
// prepol na angličtinu. Táto funkcia mapuje jazyk appky na správny locale.

const LOCALE_MAP = {
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
