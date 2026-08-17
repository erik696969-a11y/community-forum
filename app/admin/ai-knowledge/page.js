'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const URGENCY_OPTIONS = ['info', 'yellow', 'orange', 'red'];
const URGENCY_COLORS = {
  info: 'bg-sand-dark/60 text-ink',
  yellow: 'bg-yellow-100 text-yellow-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
};

const emptyForm = {
  id: null,
  intent_code: '',
  title: '',
  category: '',
  urgency: 'info',
  keywords: '',
  content: '',
  active: true,
  version: 1,
};

export default function AiKnowledgePage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [entries, setEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [testingId, setTestingId] = useState(null);
  const [testQuestion, setTestQuestion] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

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

  function startAdd() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(entry) {
    setForm({
      id: entry.id,
      intent_code: entry.intent_code || '',
      title: entry.title || '',
      category: entry.category || '',
      urgency: entry.urgency || 'info',
      keywords: (entry.keywords || []).join(', '),
      content: entry.content || '',
      active: entry.active ?? true,
      version: entry.version || 1,
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    const keywordsArray = form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const payload = {
      intent_code: form.intent_code || null,
      title: form.title,
      category: form.category || null,
      urgency: form.urgency,
      keywords: keywordsArray,
      content: form.content,
      active: form.active,
      updated_by: session.user.id,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    };

    if (form.id) {
      await supabase
        .from('ai_knowledge_base')
        .update({ ...payload, version: (form.version || 1) + 1 })
        .eq('id', form.id);
    } else {
      await supabase.from('ai_knowledge_base').insert(payload);
    }

    setSubmitting(false);
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    await supabase.from('ai_knowledge_base').delete().eq('id', id);
    load();
  }

  async function handleTest(entryId) {
    if (!testQuestion.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question: testQuestion.trim(), testIntentId: entryId }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ error: 'Test request failed.' });
    }
    setTesting(false);
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

        <button
          onClick={() => (showForm ? setShowForm(false) : startAdd())}
          className="btn-primary mb-6"
        >
          {t(lang, 'addKnowledgeEntry')}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-8">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeIntentCodeLabel')}</label>
                <input
                  type="text"
                  value={form.intent_code}
                  onChange={(e) => setForm({ ...form, intent_code: e.target.value })}
                  className="input-field"
                  placeholder="e.g. WAT-01"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeCategoryLabel')}</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input-field"
                  placeholder="water / electricity / general..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeEntryTitleLabel')}</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input-field"
                placeholder="e.g. Water leaking from apartment above"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeKeywordsLabel')}</label>
              <input
                type="text"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                className="input-field"
                placeholder="water, leak, ceiling, upstairs"
              />
              <p className="text-xs text-ink/50 mt-1">{t(lang, 'knowledgeKeywordsHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeUrgencyLabel')}</label>
                <select
                  value={form.urgency}
                  onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                  className="input-field"
                >
                  {URGENCY_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                {t(lang, 'knowledgeActiveLabel')}
              </label>
            </div>

            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'knowledgeEntryContentLabel')}</label>
              <textarea
                rows={10}
                required
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary flex-1">
                {submitting ? t(lang, 'saving') : t(lang, 'save')}
              </button>
              <button
                type="button"
                onClick={() => { setForm(emptyForm); setShowForm(false); }}
                className="px-4 py-2 text-sm text-ink/60 hover:text-ink"
              >
                {t(lang, 'cancel')}
              </button>
            </div>
          </form>
        )}

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.intent_code && (
                        <span className="text-xs font-mono text-ink/40">{entry.intent_code}</span>
                      )}
                      <p className="font-semibold text-harbor">{entry.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_COLORS[entry.urgency] || URGENCY_COLORS.info}`}>
                        {entry.urgency || 'info'}
                      </span>
                      {entry.active === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ink/10 text-ink/50">{t(lang, 'knowledgeInactiveBadge')}</span>
                      )}
                    </div>
                    {entry.category && <p className="text-xs text-ink/40 mt-0.5">{entry.category}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button onClick={() => startEdit(entry)} className="text-xs text-harbor hover:underline">
                      {t(lang, 'edit')}
                    </button>
                    <button
                      onClick={() => { setTestingId(testingId === entry.id ? null : entry.id); setTestResult(null); setTestQuestion(''); }}
                      className="text-xs text-harbor/70 hover:underline"
                    >
                      {t(lang, 'knowledgeTestEntry')}
                    </button>
                    <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-500 hover:text-red-700">
                      {t(lang, 'delete')}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-ink/60 mt-2 line-clamp-3 whitespace-pre-wrap">{entry.content}</p>

                {testingId === entry.id && (
                  <div className="mt-3 pt-3 border-t border-ink/10 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={testQuestion}
                        onChange={(e) => setTestQuestion(e.target.value)}
                        placeholder={t(lang, 'knowledgeTestPlaceholder')}
                        className="input-field flex-1 text-sm"
                      />
                      <button
                        onClick={() => handleTest(entry.id)}
                        disabled={testing}
                        className="btn-primary text-sm px-3"
                      >
                        {testing ? t(lang, 'saving') : t(lang, 'knowledgeTestEntry')}
                      </button>
                    </div>
                    {testResult && (
                      <div className="bg-sand-dark/40 rounded-lg p-3 text-sm">
                        {testResult.error ? (
                          <p className="text-red-600">{testResult.error}</p>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap">{testResult.answer}</p>
                            {testResult.immediateActions?.length > 0 && (
                              <ul className="list-disc list-inside mt-2 text-ink/70">
                                {testResult.immediateActions.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            )}
                            {testResult.call112 && (
                              <p className="text-red-600 font-semibold mt-2">📞 112</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
