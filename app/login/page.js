'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useLanguage } from '../../lib/useLanguage';
import { t } from '../../lib/i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage() {
  const [lang, setLang] = useLanguage(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!consent) {
      setError(t(lang, 'consentRequired'));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          full_name: fullName,
          apartment_number: apartmentNumber,
          language: lang,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(t(lang, 'emailSendError'));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="font-display text-2xl text-harbor mb-3">{t(lang, 'checkEmailTitle')}</h1>
          <p className="text-ink">
            {t(lang, 'checkEmailText')} <strong>{email}</strong>. {t(lang, 'checkEmailText2')}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl text-harbor">{t(lang, 'appName')}</h1>
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
        <p className="text-ink/70 mb-6">{t(lang, 'loginSubtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'fullName')}</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'fullNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'apartmentNumber')}</label>
            <input
              type="text"
              required
              value={apartmentNumber}
              onChange={(e) => setApartmentNumber(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'apartmentPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'email')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@email.com"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              {t(lang, 'consentText')}{' '}
              <a href="/privacy" target="_blank" className="underline hover:text-ochre">
                {t(lang, 'privacyPolicyLink')}
              </a>
            </span>
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t(lang, 'sending') : t(lang, 'signInRegister')}
          </button>
        </form>

        <p className="text-xs text-ink/50 mt-6">{t(lang, 'loginFooter')}</p>
      </div>
    </main>
  );
}
