'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabaseClient';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function PendingPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.status === 'approved') {
      router.replace('/dashboard');
    }
  }, [loading, session, profile, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const isRejected = profile && profile.status === 'rejected';
  const isSuspended = profile && profile.status === 'suspended';

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
        {isSuspended ? (
          <>
            <h1 className="font-display text-2xl text-harbor mb-3">{t(lang, 'suspendUser')}</h1>
            <p className="text-ink">{t(lang, 'suspendedMessage')}</p>
          </>
        ) : isRejected ? (
          <>
            <h1 className="font-display text-2xl text-harbor mb-3">{t(lang, 'rejectedTitle')}</h1>
            <p className="text-ink">{t(lang, 'rejectedText')}</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl text-harbor mb-3">{t(lang, 'pendingTitle')}</h1>
            <p className="text-ink">{t(lang, 'pendingText')}</p>
          </>
        )}
        <button onClick={handleSignOut} className="btn-secondary mt-6">
          {t(lang, 'signOut')}
        </button>
      </div>
    </main>
  );
}
