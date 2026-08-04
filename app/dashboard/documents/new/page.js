'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

export default function NewDocumentPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('statutes');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'board') {
      router.replace('/dashboard/documents');
    }
  }, [loading, session, profile, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file.');
      return;
    }
    setSubmitting(true);
    setError('');

    const fileExt = file.name.split('.').pop();
    const filePath = `${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);

    if (uploadError) {
      setSubmitting(false);
      setError(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(filePath);

    const { error: insertError } = await supabase.from('documents').insert({
      category,
      title,
      file_url: publicUrlData.publicUrl,
      uploaded_by: session.user.id,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push('/dashboard/documents');
  }

  if (loading || !profile || profile.role !== 'board') {
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
        <Link href="/dashboard/documents" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToDocuments')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6 mt-3">{t(lang, 'addDocument')}</h1>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'documentCategoryLabel')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              <option value="statutes">{t(lang, 'statutesSection')}</option>
              <option value="minutes">{t(lang, 'minutesSection')}</option>
              <option value="insurance">{t(lang, 'insuranceSection')}</option>
              <option value="maintenance">{t(lang, 'maintenanceSection')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'documentTitleLabel')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'documentTitlePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'documentFileLabel')}</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input-field"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'uploadingDocument') : t(lang, 'save')}
          </button>
        </form>
      </div>
    </main>
  );
}
