'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        setError('Odkaz je neplatný alebo vypršal. Skúste sa prihlásiť znova.');
        return;
      }
      router.replace('/');
    }
    run();
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <p className="text-ink mb-4">{error}</p>
          <a href="/login" className="btn-primary inline-block">Späť na prihlásenie</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-harbor">Prihlasujem…</p>
    </main>
  );
}
