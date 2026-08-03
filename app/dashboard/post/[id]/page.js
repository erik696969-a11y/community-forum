'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

const ISSUE_KEYS = { new: 'issueNew', in_progress: 'issueInProgress', resolved: 'issueResolved' };
const ISSUE_COLORS = {
  new: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
};

// Posts longer than this switch to a spacious, full-width "reading mode",
// similar to reading a long email, instead of the compact card layout.
const LONG_POST_THRESHOLD = 500;

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

export default function PostDetailPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [post, setPost] = useState(null);
  const [category, setCategory] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function loadAll() {
    const { data: postData } = await supabase
      .from('posts')
      .select('*, author:profiles(full_name, apartment_number)')
      .eq('id', params.id)
      .single();
    setPost(postData);

    if (postData) {
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('id', postData.category_id)
        .single();
      setCategory(catData);
    }

    const { data: commentsData } = await supabase
      .from('comments')
      .select('*, author:profiles(full_name, apartment_number)')
      .eq('post_id', params.id)
      .order('created_at', { ascending: true });
    setComments(commentsData || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, profile]);

  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);

    const text = newComment.trim();
    let originalLang = lang;
    let contentTranslations = {};

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text] }),
      });
      const data = await res.json();
      if (data.translations) {
        originalLang = data.originalLang;
        Object.entries(data.translations).forEach(([langCode, arr]) => {
          contentTranslations[langCode] = arr[0];
        });
      }
    } catch (translationError) {
      originalLang = lang;
    }

    const { error } = await supabase.from('comments').insert({
      post_id: params.id,
      author_id: session.user.id,
      content: text,
      original_lang: originalLang,
      content_translations: contentTranslations,
    });

    setSubmitting(false);

    if (!error) {
      setNewComment('');
      loadAll();
    }
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">{t(lang, 'postNotFound')}</p>
        </div>
      </main>
    );
  }

  const postTranslated = post.original_lang && post.original_lang !== lang;
  const postContent = localizedField(post, 'content', lang);
  const isLongPost = postContent && postContent.length > LONG_POST_THRESHOLD;

  const outerWidth = isLongPost ? 'max-w-3xl' : 'max-w-2xl';
  const cardPadding = isLongPost ? 'p-8 md:p-12' : 'p-6';
  const contentTextClass = isLongPost
    ? 'text-ink text-lg leading-relaxed whitespace-pre-wrap'
    : 'text-ink whitespace-pre-wrap';
  const titleClass = isLongPost ? 'font-display text-3xl text-harbor' : 'font-display text-2xl text-harbor';

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className={`${outerWidth} mx-auto px-4 py-8`}>
        {category && (
          <Link href={`/dashboard/${category.slug}`} className="text-sm text-harbor/70 hover:text-harbor">
            {t(lang, 'backToCategories')}
          </Link>
        )}

        <div className={`card ${cardPadding} mt-3`}>
          <div className="flex items-center justify-between gap-3">
            <h1 className={titleClass}>{localizedField(post, 'title', lang)}</h1>
            {post.issue_status && (
              <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${ISSUE_COLORS[post.issue_status]}`}>
                {t(lang, ISSUE_KEYS[post.issue_status])}
              </span>
            )}
          </div>
          <p className="text-xs text-ink/50 mt-1 mb-4 flex items-center gap-2 flex-wrap">
            <span>
              {post.author?.full_name} · {post.author?.apartment_number} ·{' '}
              {new Date(post.created_at).toLocaleDateString()}
              {postTranslated && <span className="ml-2 italic">({t(lang, 'translatedNotice')})</span>}
            </span>
            {post.author_id !== session.user.id && (
              <Link
                href={`/dashboard/messages/new?to=${post.author_id}&name=${encodeURIComponent(post.author?.full_name || '')}`}
                className="text-harbor/60 hover:text-harbor underline whitespace-nowrap"
              >
                {t(lang, 'replyPrivately')}
              </Link>
            )}
          </p>
          <p className={contentTextClass}>{postContent}</p>
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image_url} alt="" className="mt-4 rounded-lg max-w-full" />
          )}
        </div>

        <h2 className="font-display text-lg text-harbor mt-8 mb-3">
          {t(lang, 'comments')} ({comments.length})
        </h2>

        <div className="space-y-3 mb-6">
          {comments.map((c) => {
            const isTranslated = c.original_lang && c.original_lang !== lang;
            return (
              <div key={c.id} className="card p-4">
                <p className="text-ink text-sm">{localizedField(c, 'content', lang)}</p>
                <p className="text-xs text-ink/50 mt-1 flex items-center gap-2 flex-wrap">
                  <span>
                    {c.author?.full_name} · {c.author?.apartment_number} ·{' '}
                    {new Date(c.created_at).toLocaleDateString()}
                    {isTranslated && <span className="ml-2 italic">({t(lang, 'translatedNotice')})</span>}
                  </span>
                  {c.author_id !== session.user.id && (
                    <Link
                      href={`/dashboard/messages/new?to=${c.author_id}&name=${encodeURIComponent(c.author?.full_name || '')}`}
                      className="text-harbor/60 hover:text-harbor underline whitespace-nowrap"
                    >
                      {t(lang, 'replyPrivately')}
                    </Link>
                  )}
                </p>
              </div>
            );
          })}
          {comments.length === 0 && <p className="text-ink/60 text-sm">{t(lang, 'noCommentsYet')}</p>}
        </div>

        <form onSubmit={handleAddComment} className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="input-field"
            placeholder={t(lang, 'commentPlaceholder')}
          />
          <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
            {t(lang, 'send')}
          </button>
        </form>
      </div>
    </main>
  );
}
