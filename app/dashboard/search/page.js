'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [postResults, setPostResults] = useState([]);
  const [docResults, setDocResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  if (!loading && !session) {
    router.replace('/login');
  }

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);

    const { data: matchingPosts } = await supabase
      .from('posts')
      .select('*, author:profiles(full_name, apartment_number)')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: matchingComments } = await supabase
      .from('comments')
      .select('*, post:posts(id, title), author:profiles(full_name)')
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: matchingDocs } = await supabase
      .from('documents')
      .select('*')
      .ilike('title', `%${q}%`)
      .limit(20);

    setPostResults([
      ...(matchingPosts || []).map((p) => ({ type: 'post', item: p })),
      ...(matchingComments || []).map((c) => ({ type: 'comment', item: c })),
    ]);
    setDocResults(matchingDocs || []);
    setSearching(false);
  }

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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'searchTitle')}</h1>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field"
            placeholder={t(lang, 'searchPlaceholder')}
          />
          <button type="submit" disabled={searching} className="btn-primary whitespace-nowrap">
            {t(lang, 'searchButton')}
          </button>
        </form>

        {searched && !searching && postResults.length === 0 && docResults.length === 0 && (
          <p className="text-ink/60">{t(lang, 'noSearchResults')}</p>
        )}

        {postResults.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-ochre uppercase tracking-wide mb-3">
              {t(lang, 'searchResultsPosts')}
            </h2>
            <div className="space-y-3 mb-8">
              {postResults.map((r, i) => {
                if (r.type === 'post') {
                  return (
                    <Link
                      key={`post-${r.item.id}`}
                      href={`/dashboard/post/${r.item.id}`}
                      className="card p-4 block hover:border-ochre transition-colors"
                    >
                      <p className="font-semibold text-harbor">{localizedField(r.item, 'title', lang)}</p>
                      <p className="text-sm text-ink/70 mt-1 line-clamp-2">
                        {localizedField(r.item, 'content', lang)}
                      </p>
                      <p className="text-xs text-ink/50 mt-1">
                        {r.item.author?.full_name} · {new Date(r.item.created_at).toLocaleDateString()}
                      </p>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={`comment-${r.item.id}`}
                    href={`/dashboard/post/${r.item.post?.id}`}
                    className="card p-4 block hover:border-ochre transition-colors"
                  >
                    <p className="text-xs text-ochre font-semibold mb-1">
                      {t(lang, 'comments')}: {r.item.post?.title}
                    </p>
                    <p className="text-sm text-ink/70 line-clamp-2">{localizedField(r.item, 'content', lang)}</p>
                    <p className="text-xs text-ink/50 mt-1">{r.item.author?.full_name}</p>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {docResults.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-harbor/60 uppercase tracking-wide mb-3">
              {t(lang, 'searchResultsDocuments')}
            </h2>
            <div className="space-y-3">
              {docResults.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/dashboard/documents/view/${doc.id}`}
                  className="card p-4 block hover:border-ochre transition-colors"
                >
                  <p className="font-semibold text-harbor">{doc.title}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
