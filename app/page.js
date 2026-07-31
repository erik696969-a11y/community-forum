'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../lib/useProfile';

export default function Home() {
  const { loading, session, profile } = useProfile();
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
      <p className="text-harbor font-body">Načítava sa…</p>
    </main>
  );
}
