'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function DocumentsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

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
    async function loadDocs() {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      setDocuments(data || []);
      setLoadingData(false);
    }
    if (profile?.status === 'approved') loadDocs();
  }, [profile]);

  async function handleDelete(id, title) {
    const confirmed = window.confirm(t(lang, 'confirmDeleteDocument').replace('{title}', title));
    if (!confirmed) return;
    await supabase.from('documents').delete().eq('id', id);
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
    setDocuments(data || []);
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const isBoard = profile.role === 'board';
  const statutes = documents.filter((d) => d.category === 'statutes');
  const minutes = documents.filter((d) => d.category === 'minutes');

  function DocRow({ doc }) {
    const ext = doc.file_url.split('.').pop().split('?')[0];
    const downloadUrl = `/api/download-file?url=${encodeURIComponent(doc.file_url)}&filename=${encodeURIComponent(doc.title + '.' + ext)}`;

    return (
      <div className="card p-4 flex items-center justify-between gap-3">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 hover:opacity-80 transition-opacity"
        >
          <p className="font-semibold text-harbor">{doc.title}</p>
          <p className="text-xs text-ink/50">{new Date(doc.created_at).toLocaleDateString()}</p>
        </a>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-harbor/60 hover:text-harbor whitespace-nowrap"
          >
            {t(lang, 'download')}
          </a>
          {isBoard && (
            <button
              onClick={() => handleDelete(doc.id, doc.title)}
              className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap"
            >
              {t(lang, 'delete')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'documentsTitle')}</h1>
          {isBoard && (
            <Link href="/dashboard/documents/new" className="btn-primary">
              {t(lang, 'addDocument')}
            </Link>
          )}
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <>
            <h2 className="text-xs font-semibold text-ochre uppercase tracking-wide mb-3">
              {t(lang, 'statutesSection')}
            </h2>
            <div className="space-y-2 mb-8">
              {statutes.length === 0 ? (
                <p className="text-ink/60 text-sm">{t(lang, 'noDocumentsYet')}</p>
              ) : (
                statutes.map((doc) => <DocRow key={doc.id} doc={doc} />)
              )}
            </div>

            <h2 className="text-xs font-semibold text-harbor/60 uppercase tracking-wide mb-3">
              {t(lang, 'minutesSection')}
            </h2>
            <div className="space-y-2">
              {minutes.length === 0 ? (
                <p className="text-ink/60 text-sm">{t(lang, 'noDocumentsYet')}</p>
              ) : (
                minutes.map((doc) => <DocRow key={doc.id} doc={doc} />)
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
