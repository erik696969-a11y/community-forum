'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../../lib/useProfile';
import { supabase } from '../../lib/supabaseClient';

export default function PendingPage() {
  const { loading, session, profile } = useProfile();
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
        <p className="text-harbor">Načítava sa…</p>
      </main>
    );
  }

  const isRejected = profile && profile.status === 'rejected';

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        {isRejected ? (
          <>
            <h1 className="font-display text-2xl text-harbor mb-3">Žiadosť nebola schválená</h1>
            <p className="text-ink">
              Vaša registrácia nebola potvrdená. Ak si myslíte, že ide o omyl, kontaktujte
              prosím výbor komunity priamo.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl text-harbor mb-3">Žiadosť sa spracúva</h1>
            <p className="text-ink">
              Ďakujeme za registráciu! Výbor komunity teraz overuje, či ste majiteľom
              apartmánu. Keď bude vaša žiadosť schválená, budete môcť fórum používať.
            </p>
          </>
        )}
        <button onClick={handleSignOut} className="btn-secondary mt-6">
          Odhlásiť sa
        </button>
      </div>
    </main>
  );
}
