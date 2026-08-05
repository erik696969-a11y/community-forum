'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { useRefreshOnFocus } from '../../../lib/useRefreshOnFocus';
import { markSeen } from '../../../lib/useLastSeen';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const ISSUE_KEYS = { new: 'issueNew', in_progress: 'issueInProgress', resolved: 'issueResolved' };
const ISSUE_COLORS = {
  new: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
};

function localizedField(post, field, lang) {
  if (post.original_lang === lang) return post[field];
  const translations = post[`${field}_translations`];
  return translations?.[lang] || post[field];
}

export default function CategoryPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  const load = useCallback(async () => {
    const { data: cat } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', params.slug)
      .single();

    setCategory(cat);

    if (cat) {
      const { data: postsData } = await supabase
        .from('posts')
        .select('*, author:profiles(full_name, apartment_number, badges)')
        .eq('category_id', cat.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      setPosts(postsData || []);
      markSeen(`category:${cat.id}`);
    }
    setLoadingPosts(false);
  }, [params.slug]);

  useEffect(() => {
    if (profile?.status === 'approved') {
      load();
    }
  }, [profile, load]);

  useRefreshOnFocus(load);

  if (loading || !profile) {
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
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToCategories')}
        </Link>

        <div className="flex items-center justify-between mt-3 mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">
            {category ? category[`name_${lang}`] || category.name : ''}
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={load} className="btn-secondary text-sm">
              {t(lang, 'refreshButton')}
            </button>
            <Link href={`/dashboard/new-post?category=${params.slug}`} className="btn-primary">
              {t(lang, 'newPost')}
            </Link>
          </div>
        </div>

        {loadingPosts ? (
          <p className="text-ink/60">{t(lang, 'loadingPosts')}</p>
        ) : posts.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noPostsYet')}</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const isTranslated = post.original_lang && post.original_lang !== lang;
              return (
                <Link
                  key={post.id}
                  href={`/dashboard/post/${post.id}`}
                  className="card p-5 block hover:border-ochre transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg text-harbor">
                      {post.pinned && <span className="mr-1">📌</span>}
                      {localizedField(post, 'title', lang)}
                    </h2>
                    {post.issue_status && (
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${ISSUE_COLORS[post.issue_status]}`}
                      >
                        {t(lang, ISSUE_KEYS[post.issue_status])}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mt-1 line-clamp-2">
                    {localizedField(post, 'content', lang)}
                  </p>
                  <p className="text-xs text-ink/50 mt-2">
                    {post.author?.full_name} · {post.author?.apartment_number} ·{' '}
                    {new Date(post.created_at).toLocaleDateString()}
                    {isTranslated && <span className="ml-2 italic">({t(lang, 'translatedNotice')})</span>}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
