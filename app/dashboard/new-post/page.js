'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function NewPostPage() {
  return (
    <Suspense fallback={null}>
      <NewPostForm />
    </Suspense>
  );
}

function NewPostForm() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [issueStatus, setIssueStatus] = useState('new');
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categories').select('*').order('sort_order');
      setCategories(data || []);

      const preselectSlug = searchParams.get('category');
      if (preselectSlug && data) {
        const match = data.find((c) => c.slug === preselectSlug);
        if (match) {
          setCategoryId(match.id);
          setSelectedType(match.type);
        }
      } else if (data && data.length > 0) {
        setCategoryId(data[0].id);
        setSelectedType(data[0].type);
      }
    }
    loadCategories();
  }, [searchParams]);

  useEffect(() => {
    async function loadGroups() {
      const { data } = await supabase.from('interest_groups').select('*').order('sort_order');
      setGroups(data || []);

      const preselectGroup = searchParams.get('group');
      if (preselectGroup && data) {
        const match = data.find((g) => g.slug === preselectGroup);
        if (match) setGroupId(match.id);
      } else if (data && data.length > 0) {
        setGroupId(data[0].id);
      }
    }
    loadGroups();
  }, [searchParams]);

  function handleCategoryChange(id) {
    setCategoryId(id);
    const match = categories.find((c) => c.id === id);
    setSelectedType(match?.type || '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    let imageUrl = null;

    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filePath, imageFile);

      if (uploadError) {
        setError(t(lang, 'imageUploadError'));
        setSubmitting(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }

    // Automatic translation via DeepL (server-side)
    let originalLang = lang;
    let titleTranslations = {};
    let contentTranslations = {};

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [title, content] }),
      });
      const data = await res.json();
      if (data.translations) {
        originalLang = data.originalLang;
        Object.entries(data.translations).forEach(([langCode, arr]) => {
          titleTranslations[langCode] = arr[0];
          contentTranslations[langCode] = arr[1];
        });
      }
    } catch (translationError) {
      // If translation fails, we still publish the post in its original language only
      originalLang = lang;
    }

    const selectedCategory = categories.find((c) => c.id === categoryId);

    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert({
        category_id: categoryId,
        interest_group_id: selectedType === 'interest' ? groupId : null,
        author_id: session.user.id,
        title,
        content,
        image_url: imageUrl,
        issue_status: selectedType === 'issue' ? issueStatus : null,
        original_lang: originalLang,
        title_translations: titleTranslations,
        content_translations: contentTranslations,
        pinned: !!selectedCategory?.board_only,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(t(lang, 'postSaveError'));
      return;
    }

    if (selectedCategory?.board_only) {
      fetch('/api/notify-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, authorId: session.user.id }),
      }).catch(() => {});
    }

    if (selectedType === 'interest' && groupId) {
      fetch('/api/notify-group-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, title, authorId: session.user.id }),
      }).catch(() => {});
    }

    router.push(`/dashboard/post/${newPost.id}`);
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
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToCategories')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6 mt-3">{t(lang, 'newPostTitle')}</h1>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'category')}</label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="input-field"
            >
              {categories
                .filter((c) => !c.board_only || profile.role === 'board')
                .map((c) => (
                <option key={c.id} value={c.id}>
                  {c[`name_${lang}`] || c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'titleLabel')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'titlePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'descriptionLabel')}</label>
            <textarea
              required
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'descriptionPlaceholder')}
            />
          </div>

          {selectedType === 'interest' && (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'chooseGroup')}</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="input-field"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g[`name_${lang}`] || g.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedType === 'issue' && (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'statusLabel')}</label>
              <select
                value={issueStatus}
                onChange={(e) => setIssueStatus(e.target.value)}
                className="input-field"
              >
                <option value="new">{t(lang, 'issueNew')}</option>
                <option value="in_progress">{t(lang, 'issueInProgress')}</option>
                <option value="resolved">{t(lang, 'issueResolved')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'photoLabel')}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="input-field"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'saving') : t(lang, 'publishPost')}
          </button>
        </form>
      </div>
    </main>
  );
}
