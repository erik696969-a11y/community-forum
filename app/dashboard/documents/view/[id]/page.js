'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../../lib/useProfile';
import { useLanguage } from '../../../../../lib/useLanguage';
import { supabase } from '../../../../../lib/supabaseClient';
import { t } from '../../../../../lib/i18n';
import Header from '../../../../components/Header';

export default function ViewDocumentPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [doc, setDoc] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('documents').select('*').eq('id', params.id).single();
      setDoc(data);
      setLoadingData(false);
    }
    if (profile?.status === 'approved') load();
  }, [params.id, profile]);

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">{t(lang, 'postNotFound')}</p>
        </div>
      </main>
    );
  }

  const ext = doc.file_url.split('.').pop().split('?')[0].toLowerCase();
  const isPdf = ext === 'pdf';
  const downloadUrl = `/api/download-file?url=${encodeURIComponent(doc.file_url)}&filename=${encodeURIComponent(doc.title + '.' + ext)}`;

  return (
    <main className="min-h-screen flex flex-col">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-4xl w-full mx-auto px-4 py-4 flex-1 flex flex-col">
        <Link href="/dashboard/documents" className="text-sm text-harbor/70 hover:text-harbor mb-3">
          {t(lang, 'backToDocuments')}
        </Link>
        <h1 className="font-display text-xl text-harbor mb-3">{doc.title}</h1>

        {isPdf ? (
          <iframe
            src={doc.file_url}
            title={doc.title}
            className="w-full flex-1 rounded-lg border border-harbor/10"
            style={{ minHeight: '70vh' }}
          />
        ) : (
          <div className="card p-8 text-center">
            <p className="text-ink mb-4">{t(lang, 'cannotPreview')}</p>
            <a href={downloadUrl} className="btn-primary inline-block">
              {t(lang, 'download')}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
