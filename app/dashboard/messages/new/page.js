'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

export default function NewMessagePage() {
  return (
    <Suspense fallback={null}>
      <NewMessageForm />
    </Suspense>
  );
}

function NewMessageForm() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const searchParams = useSearchParams();

  const directToId = searchParams.get('to');
  const directToName = searchParams.get('name');

  const [boardMembers, setBoardMembers] = useState([]);
  const [recipientId, setRecipientId] = useState('all');
  const [subject, setSubject] = useState(searchParams.get('subject') || '');
  const [content, setContent] = useState(searchParams.get('body') || '');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (directToId) {
      setRecipientId(directToId);
      return;
    }
    async function loadBoard() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'board')
        .eq('status', 'approved');
      setBoardMembers(data || []);
    }
    if (profile?.status === 'approved') loadBoard();
  }, [profile, directToId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    await supabase.from('messages').insert({
      sender_id: session.user.id,
      recipient_id: recipientId === 'all' ? null : recipientId,
      subject,
      content,
    });

    setSubmitting(false);
    setSent(true);
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="card p-8 text-center">
            <p className="font-display text-xl text-harbor mb-4">{t(lang, 'messageSent')}</p>
            <a href="/dashboard/messages" className="btn-primary inline-block">{t(lang, 'inbox')}</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard/messages" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">
          {directToId ? t(lang, 'replyPrivately') : t(lang, 'contactBoard')}
        </h1>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {directToId ? (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'recipient')}</label>
              <p className="input-field bg-sand/50">{directToName || '—'}</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'recipient')}</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="input-field"
              >
                <option value="all">{t(lang, 'allBoardMembers')}</option>
                {boardMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'subjectLabel')}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'subjectPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'messageContent')}</label>
            <textarea
              required
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'messagePlaceholder')}
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'sending') : t(lang, 'sendMessage')}
          </button>
        </form>
      </div>
    </main>
  );
}
