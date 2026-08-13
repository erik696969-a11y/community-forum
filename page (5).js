'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../lib/useProfile';
import { useLanguage } from '../lib/useLanguage';
import { t } from '../lib/i18n';

export default function Home() {
  const { loading, session, profile } = useProfile();
  const [lang] = useLanguage(profile);
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      router.replace('/login');
      return;
    }

    if (!profile || profile.status === 'pending') {
      router.replace('/pending');
      return;
    }

    if (profile.status === 'rejected') {
      router.replace('/pending');
      return;
    }

    router.replace('/dashboard');
  }, [loading, session, profile, router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-harbor font-body">{t(lang, 'loading')}</p>
    </main>
  );
}
