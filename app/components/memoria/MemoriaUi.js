'use client';

// Drobné spoločné prvky pre obrazovky Memorie.

export function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-semibold text-ink/80 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-ink/50 mt-1">{hint}</span>}
    </label>
  );
}

const PILL_TONES = {
  neutral: 'bg-sand-dark text-ink/70',
  harbor: 'bg-harbor/10 text-harbor',
  ochre: 'bg-ochre/20 text-ink',
  green: 'bg-sea/20 text-ink',
  red: 'bg-red-100 text-red-700',
};

export function Pill({ tone = 'neutral', children }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PILL_TONES[tone] || PILL_TONES.neutral}`}>
      {children}
    </span>
  );
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{message}</p>;
}

export function DetailRow({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div>
      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-ink whitespace-pre-wrap">{children}</p>
    </div>
  );
}

export function Stars({ value }) {
  const rounded = Math.round(value || 0);
  return (
    <span className="text-ochre" aria-label={`${value} / 5`}>
      {'★'.repeat(rounded)}
      <span className="text-ink/20">{'★'.repeat(5 - rounded)}</span>
    </span>
  );
}
