'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../lib/useProfile';
import { supabase } from '../../lib/supabaseClient';
import Header from '../components/Header';

const TYPE_LABELS = {
  announcement: 'Oznamy výboru',
  issue: 'Nahlasovanie problémov',
  idea: 'Nápady komunity',
  interest: 'Záujmová skupina',
  general: 'Diskusia',
};

export default function DashboardPage() {
  const { loading, session, profile } = useProfile();
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!profile || profile.status !== 'approved') {
      router.replace('/pending');
    }
  }, [loading, session, profile, router]);

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });
      setCategories(data || []);
      setLoadingCats(false);
    }
    if (profile?.status === 'approved') {
      loadCategories();
    }
  }, [profile]);

  if (loading || !profile || profile.status !== 'approved') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">Načítava sa…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl text-harbor">Kategórie fóra</h1>
          <Link href="/dashboard/new-post" className="btn-primary">
            + Nový príspevok
          </Link>
        </div>

        {loadingCats ? (
          <p className="text-ink/60">Načítavam kategórie…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/dashboard/${cat.slug}`}
                className="card p-5 hover:border-ochre transition-colors block"
              >
                <p className="text-xs font-semibold text-ochre uppercase tracking-wide mb-1">
                  {TYPE_LABELS[cat.type] || 'Kategória'}
                </p>
                <h2 className="font-display text-lg text-harbor mb-1">{cat.name}</h2>
                <p className="text-sm text-ink/70">{cat.description}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
