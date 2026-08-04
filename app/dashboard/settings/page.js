'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function SettingsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (profile) setNotificationsEnabled(profile.notifications_enabled !== false);
  }, [profile]);

  async function handleToggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    await supabase.from('profiles').update({ notifications_enabled: next }).eq('id', session.user.id);
  }

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function handleSignOut() {
    const confirmed = window.confirm(t(lang, 'confirmSignOut'));
    if (!confirmed) return;
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function handleDelete() {
    setDeleting(true);
    setError('');

    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t(lang, 'deleteAccountError'));
        setDeleting(false);
        return;
      }

      await supabase.auth.signOut();
      router.replace('/login');
    } catch (e) {
      setError(t(lang, 'deleteAccountError'));
      setDeleting(false);
    }
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'settingsTitle')}</h1>

        <div className="card p-6 mb-6">
          <p className="text-sm text-ink/70">
            {t(lang, 'privacyPolicyNote')}{' '}
            <Link href="/privacy" target="_blank" className="underline text-harbor hover:text-ochre">
              {t(lang, 'privacyPolicyLink')}
            </Link>
          </p>
        </div>

        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-harbor">{t(lang, 'emailNotificationsLabel')}</h2>
              <p className="text-sm text-ink/70 mt-1">{t(lang, 'emailNotificationsNote')}</p>
            </div>
            <button
              onClick={handleToggleNotifications}
              className={`flex-shrink-0 w-12 h-7 rounded-full transition-colors relative ${
                notificationsEnabled ? 'bg-ochre' : 'bg-ink/20'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg text-harbor mb-2">{t(lang, 'signOut')}</h2>
          <p className="text-sm text-ink/70 mb-4">{t(lang, 'signOutNote')}</p>
          <button onClick={handleSignOut} className="btn-secondary">
            {t(lang, 'signOut')}
          </button>
        </div>

        <div className="card p-6 border-red-200">
          <h2 className="font-display text-lg text-harbor mb-2">{t(lang, 'deleteAccountTitle')}</h2>
          <p className="text-sm text-ink/70 mb-4">{t(lang, 'deleteAccountWarning')}</p>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="btn-secondary text-red-600 border-red-300">
              {t(lang, 'deleteAccountButton')}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-600">{t(lang, 'deleteAccountConfirm')}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-primary bg-red-600 hover:bg-red-700"
                >
                  {deleting ? t(lang, 'deleting') : t(lang, 'deleteAccountConfirmButton')}
                </button>
                <button onClick={() => setConfirming(false)} className="btn-secondary">
                  {t(lang, 'cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
