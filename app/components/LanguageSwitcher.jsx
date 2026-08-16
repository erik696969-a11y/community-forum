'use client';

import { LANGUAGES } from '../../lib/i18n';

export default function LanguageSwitcher({ lang, onChange, dark }) {
  return (
    <div className="flex gap-1">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          className={`text-xs px-2 py-1 rounded font-semibold transition-colors ${
            lang === l.code
              ? 'bg-ochre text-harbor'
              : dark
              ? 'text-sand/60 hover:text-sand'
              : 'text-harbor/50 hover:text-harbor'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
