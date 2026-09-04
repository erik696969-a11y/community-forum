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
  const [docType, setDocType] = useState('file'); // 'file' | 'link'
  const [file, setFile] = useState(null);
  const [externalUrl, setExternalUrl] = useState('');
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
    setError('');

    if (docType === 'file' && !file) {
      setError(t(lang, 'chooseFileError'));
      return;
    }
    if (docType === 'file' && file) {
      const isPdfExtension = file.name.toLowerCase().endsWith('.pdf');
      const isPdfMimeType = !file.type || file.type === 'application/pdf';
      if (!isPdfExtension || !isPdfMimeType) {
        setError(t(lang, 'pdfOnlyError'));
        return;
      }
    }
    if (docType === 'link' && !externalUrl.trim()) {
      setError(t(lang, 'enterLinkError'));
      return;
    }

    setSubmitting(true);

    if (docType === 'link') {
      const { error: insertError } = await supabase.from('documents').insert({
        category,
        title,
        doc_type: 'link',
        external_url: externalUrl.trim(),
        uploaded_by: session.user.id,
      });
      setSubmitting(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
      router.push('/dashboard/documents');
      return;
    }

    const fileExt = file.name.split('.').pop();
    const filePath = `${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);

    if (uploadError) {
      setSubmitting(false);
      setError(uploadError.message);
      return;
    }

    // Store the bare storage path (bucket is private) - a signed URL is
    // generated on demand whenever the document is opened/downloaded.
    const { error: insertError } = await supabase.from('documents').insert({
      category,
      title,
      doc_type: 'file',
      file_url: filePath,
      uploaded_by: session.user.id,
    });

    setSubmitting(false);

    if (insertError) {
      // Súbor sa už nahral do Storage, ale záznam v databáze sa nepodarilo
      // vytvoriť - vyčistíme nahratý súbor, aby po ňom nezostal navždy
      // osamotený "duch" bez akéhokoľvek odkazu.
      await supabase.storage.from('documents').remove([filePath]);
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
            <label className="block text-sm font-semibold text-harbor mb-2">{t(lang, 'documentTypeLabel')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDocType('file')}
                className={docType === 'file' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              >
                {t(lang, 'uploadFileOption')}
              </button>
              <button
                type="button"
                onClick={() => setDocType('link')}
                className={docType === 'link' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              >
                {t(lang, 'externalLinkOption')}
              </button>
            </div>
          </div>

          {docType === 'file' ? (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'documentFileLabel')}</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="input-field"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'externalLinkLabel')}</label>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="input-field"
                placeholder="https://..."
              />
              <p className="text-xs text-ink/50 mt-1">{t(lang, 'externalLinkHint')}</p>
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'uploadingDocument') : t(lang, 'save')}
          </button>
        </form>
      </div>
    </main>
  );
}
