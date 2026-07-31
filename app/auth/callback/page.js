'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';

export default function AuthCallback() {
  const router = useRouter();
  const [lang] = useLanguage(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        setError(t(lang, 'linkInvalid'));
        return;
      }
      router.replace('/');
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <p className="text-ink mb-4">{error}</p>
          <a href="/login" className="btn-primary inline-block">{t(lang, 'backToLogin')}</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-harbor">{t(lang, 'signingIn')}</p>
    </main>
  );
}
