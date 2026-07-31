'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import { supabase } from '../../lib/supabaseClient';
import { t } from '../../lib/i18n';
import Header from '../components/Header';

export default function DashboardPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
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
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'forumCategories')}</h1>
          <Link href="/dashboard/new-post" className="btn-primary">
            {t(lang, 'newPost')}
          </Link>
        </div>

        {loadingCats ? (
          <p className="text-ink/60">{t(lang, 'loadingCategories')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/dashboard/${cat.slug}`}
                className="card p-5 hover:border-ochre transition-colors block"
              >
                <h2 className="font-display text-lg text-harbor mb-1">
                  {cat[`name_${lang}`] || cat.name}
                </h2>
                <p className="text-sm text-ink/70">
                  {cat[`description_${lang}`] || cat.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
