'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function AiKnowledgePage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [entries, setEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'board') {
      router.replace('/dashboard');
    }
  }, [loading, session, profile, router]);

  async function load() {
    const { data } = await supabase.from('ai_knowledge_base').select('*').order('updated_at', { ascending: false });
    setEntries(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.role === 'board') load();
  }, [profile]);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from('ai_knowledge_base').insert({
      title,
      content,
      updated_by: session.user.id,
    });
    setSubmitting(false);
    setTitle('');
    setContent('');
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    await supabase.from('ai_knowledge_base').delete().eq('id', id);
    load();
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
        <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-2">{t(lang, 'knowledgeBaseTitle')}</h1>
        <p className="text-sm text-ink/60 mb-6">{t(lang, 'knowledgeBaseNote')}</p>

        <button onClick={() => setShowForm(!showForm)} className="btn-primary mb-6">
          {t(lang, 'addKnowledgeEntry')}
        </button>

        {showForm && (
          <form onSubmit={handleAdd} className="card p-5 space-y-3 mb-8">
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeEntryTitleLabel')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder="e.g. Alterations to apartments"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeEntryContentLabel')}</label>
              <textarea
                rows={10}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="input-field"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t(lang, 'saving') : t(lang, 'save')}
            </button>
          </form>
        )}

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-harbor">{entry.title}</p>
                  <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-500 hover:text-red-700">
                    {t(lang, 'delete')}
                  </button>
                </div>
                <p className="text-sm text-ink/60 mt-1 line-clamp-3 whitespace-pre-wrap">{entry.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
