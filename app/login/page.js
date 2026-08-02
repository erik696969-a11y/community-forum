'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = window.localStorage.getItem('lastEmail');
      if (savedEmail) setEmail(savedEmail);
    }
  }, []);

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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lastEmail', email);
    }

    // Notify the board of a potential new registration (fails silently if not applicable)
    fetch('/api/notify-new-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    setVerifying(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });

    setVerifying(false);

    if (error) {
      setError(t(lang, 'codeInvalid'));
      return;
    }

    router.replace('/');
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="font-display text-2xl text-harbor mb-3">{t(lang, 'checkEmailTitle')}</h1>
          <p className="text-ink mb-6">
            {t(lang, 'checkEmailText')} <strong>{email}</strong>. {t(lang, 'enterCodeText')}
          </p>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input-field text-center text-2xl tracking-widest"
              placeholder="12345678"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={verifying} className="btn-primary w-full">
              {verifying ? t(lang, 'signingIn') : t(lang, 'verifyCode')}
            </button>
          </form>

          <p className="text-xs text-ink/50 mt-6">{t(lang, 'orClickLink')}</p>
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

          <div className="bg-sand-dark/60 border border-harbor/10 rounded-lg p-3 text-xs text-ink/80 space-y-1.5">
            <p className="font-semibold text-harbor">{t(lang, 'consentInfoTitle')}</p>
            <ul className="list-disc list-outside pl-4 space-y-1">
              <li>{t(lang, 'consentBullet1')}</li>
              <li>{t(lang, 'consentBullet2')}</li>
              <li>{t(lang, 'consentBullet3')}</li>
            </ul>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              {t(lang, 'consentAgree')}{' '}
              <a href="/privacy" target="_blank" className="underline hover:text-ochre">
                {t(lang, 'privacyPolicyLink')}
              </a>
              .
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
