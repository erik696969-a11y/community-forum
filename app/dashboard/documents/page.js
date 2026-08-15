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

  async function handleDelete(doc) {
    const confirmed = window.confirm(t(lang, 'confirmDeleteDocument').replace('{title}', doc.title));
    if (!confirmed) return;

    // Bezpečnostný/technický backlog: pri mazaní dokumentu vyčistíme aj
    // samotný súbor v Storage (nie len riadok v databáze), aby po zmazanom
    // dokumente nezostal osamotený súbor navždy zaberajúci miesto.
    if (doc.doc_type === 'file' && doc.file_url) {
      await supabase.storage.from('documents').remove([doc.file_url]);
    }

    await supabase.from('documents').delete().eq('id', doc.id);
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
  const insurance = documents.filter((d) => d.category === 'insurance');
  const maintenance = documents.filter((d) => d.category === 'maintenance');

  function DocRow({ doc }) {
    const isLink = doc.doc_type === 'link';
    const openHref = isLink ? doc.external_url : `/dashboard/documents/view/${doc.id}`;
    const linkProps = isLink ? { target: '_blank', rel: 'noopener noreferrer' } : {};

    return (
      <div className="card p-4 flex items-center justify-between gap-3">
        <Link href={openHref} {...linkProps} className="flex-1 hover:opacity-80 transition-opacity">
          <p className="font-semibold text-harbor">
            {isLink && '🔗 '}
            {doc.title}
          </p>
          <p className="text-xs text-ink/50">{new Date(doc.created_at).toLocaleDateString()}</p>
        </Link>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href={openHref} {...linkProps} className="text-xs text-harbor/60 hover:text-harbor whitespace-nowrap">
            {isLink ? t(lang, 'openLink') : t(lang, 'openDocument')}
          </Link>
          {isBoard && (
            <button
              onClick={() => handleDelete(doc)}
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
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'documentsTitle')}</h1>
          {isBoard && (
            <Link href="/dashboard/documents/new" className="btn-primary">
              {t(lang, 'addDocument')}
            </Link>
          )}
        </div>

        <a
          href="https://www.tucomunidad.com/propietarios"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-ochre/10 border border-ochre/30 rounded-lg px-4 py-3 mb-6 hover:bg-ochre/20 transition-colors"
        >
          <p className="text-sm text-harbor font-semibold">🏢 {t(lang, 'documentsAmmexNote')}</p>
          <p className="text-xs text-ink/70 mt-0.5">{t(lang, 'tucomunidadBannerNote')} →</p>
        </a>

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

            <h2 className="text-xs font-semibold text-ochre uppercase tracking-wide mb-3 mt-8">
              {t(lang, 'insuranceSection')}
            </h2>
            <div className="space-y-2 mb-8">
              {insurance.length === 0 ? (
                <p className="text-ink/60 text-sm">{t(lang, 'noDocumentsYet')}</p>
              ) : (
                insurance.map((doc) => <DocRow key={doc.id} doc={doc} />)
              )}
            </div>

            <h2 className="text-xs font-semibold text-harbor/60 uppercase tracking-wide mb-3">
              {t(lang, 'maintenanceSection')}
            </h2>
            <div className="space-y-2">
              {maintenance.length === 0 ? (
                <p className="text-ink/60 text-sm">{t(lang, 'noDocumentsYet')}</p>
              ) : (
                maintenance.map((doc) => <DocRow key={doc.id} doc={doc} />)
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
