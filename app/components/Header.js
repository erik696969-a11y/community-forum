'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function Header({ profile }) {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <header className="bg-harbor text-sand">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-xl">
          Fórum komunity
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {profile?.role === 'board' && (
            <Link href="/admin" className="hover:text-ochre">
              Správa
            </Link>
          )}
          <span className="text-sand/70 hidden sm:inline">
            {profile?.full_name} · {profile?.apartment_number}
          </span>
          <button onClick={handleSignOut} className="hover:text-ochre">
            Odhlásiť sa
          </button>
        </nav>
      </div>
    </header>
  );
}
