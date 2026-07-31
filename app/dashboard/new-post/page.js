'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '../../../lib/useProfile';
import { supabase } from '../../../lib/supabaseClient';
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedType, setSelectedType] = useState('');
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
        setError('Obrázok sa nepodarilo nahrať, skúste príspevok bez neho.');
        setSubmitting(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }

    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert({
        category_id: categoryId,
        author_id: session.user.id,
        title,
        content,
        image_url: imageUrl,
        issue_status: selectedType === 'issue' ? issueStatus : null,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError) {
      setError('Príspevok sa nepodarilo uložiť. Skúste to znova.');
      return;
    }

    router.push(`/dashboard/post/${newPost.id}`);
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">Načítava sa…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl text-harbor mb-6">Nový príspevok</h1>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">Kategória</label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="input-field"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">Názov</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Stručný a výstižný názov"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">Popis</label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field"
              placeholder="Podrobný popis…"
            />
          </div>

          {selectedType === 'issue' && (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">Stav</label>
              <select
                value={issueStatus}
                onChange={(e) => setIssueStatus(e.target.value)}
                className="input-field"
              >
                <option value="new">Nové</option>
                <option value="in_progress">Rieši sa</option>
                <option value="resolved">Vyriešené</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">
              Fotka (nepovinné)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="input-field"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Ukladám…' : 'Zverejniť príspevok'}
          </button>
        </form>
      </div>
    </main>
  );
}
