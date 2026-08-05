'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus';
import { getLastSeenMap } from '../../lib/useLastSeen';
import { supabase } from '../../lib/supabaseClient';
import { t } from '../../lib/i18n';
import Header from '../components/Header';

export default function DashboardPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [newMap, setNewMap] = useState({});
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

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
    const cats = data || [];
    setCategories(cats);

    const { data: latestRows } = await supabase.from('category_latest_post').select('*');
    const latestMap = {};
    (latestRows || []).forEach((r) => {
      latestMap[r.category_id] = r.latest_at;
    });

    const scopes = cats.map((c) => `category:${c.id}`);
    const seenMap = await getLastSeenMap(scopes);

    const result = {};
    cats.forEach((c) => {
      const latest = latestMap[c.id];
      const seen = seenMap[`category:${c.id}`];
      result[c.id] = !!latest && (!seen || new Date(latest) > new Date(seen));
    });
    setNewMap(result);
    setLoadingCats(false);
  }, []);

  useEffect(() => {
    if (profile?.status === 'approved') loadCategories();
  }, [profile, loadCategories]);

  useRefreshOnFocus(loadCategories);

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
          <div className="flex items-center gap-2">
            <button onClick={loadCategories} className="btn-secondary text-sm">
              {t(lang, 'refreshButton')}
            </button>
            <Link href="/dashboard/new-post" className="btn-primary">
              {t(lang, 'newPost')}
            </Link>
          </div>
        </div>

        {loadingCats ? (
          <p className="text-ink/60">{t(lang, 'loadingCategories')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={cat.slug === 'aktivity' ? '/dashboard/groups' : `/dashboard/${cat.slug}`}
                className="card p-5 hover:border-ochre transition-colors block relative"
              >
                {newMap[cat.id] && (
                  <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-ochre" />
                )}
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
