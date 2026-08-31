'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import { formatDate, formatTime } from '../../../lib/formatDate';
import { fetchAuthorProfiles } from '../../../lib/authorProfiles';
import Header from '../../components/Header';

export default function MessagesPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState('inbox'); // inbox | sent

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

  const isBoard = profile?.role === 'board';

  async function loadMessages() {
    setLoadingData(true);

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (tab === 'sent') {
      query = query.eq('sender_id', session.user.id);
    } else if (isBoard) {
      // Board members also see broadcasts addressed to "the whole board"
      query = query.or(`recipient_id.eq.${session.user.id},recipient_id.is.null`);
    } else {
      query = query.eq('recipient_id', session.user.id);
    }

    const { data } = await query;
    const rows = data || [];

    // Display names no longer come from an embedded "profiles" join
    // (that required broad direct SELECT permission on profiles, which
    // Phase 2 removes for normal owners). Instead, fetch the small set of
    // sender/recipient profiles through the existing, already-safe
    // get_author_profiles(uuid[]) RPC and attach them client-side - same
    // approach already used for Forum/Groups author display.
    const ids = [...new Set(rows.flatMap((m) => [m.sender_id, m.recipient_id]).filter(Boolean))];
    const profileMap = await fetchAuthorProfiles(ids);
    const withProfiles = rows.map((m) => ({
      ...m,
      sender: profileMap.get(m.sender_id) || null,
      recipient: m.recipient_id ? profileMap.get(m.recipient_id) || null : null,
    }));

    setMessages(withProfiles);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, tab]);

  async function markRead(id) {
    await supabase.rpc('mark_message_read', { p_message_id: id });
    loadMessages();
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'confirmDeleteMessage'))) return;
    await supabase.from('messages').delete().eq('id', id);
    loadMessages();
  }

  if (loading || !profile || profile.status !== 'approved') {
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
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'messages')}</h1>
          <Link href="/dashboard/messages/new" className="btn-primary">
            {t(lang, 'newMessage')}
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('inbox')}
            className={tab === 'inbox' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            {t(lang, 'inbox')}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={tab === 'sent' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          >
            {t(lang, 'sentMessages')}
          </button>
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noMessages')}</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`card p-4 ${!m.is_read && tab === 'inbox' ? 'border-ochre' : ''}`}
                onClick={() => {
                  if (tab === 'inbox' && !m.is_read) markRead(m.id);
                }}
              >
                {m.subject && <p className="font-semibold text-harbor">{m.subject}</p>}
                <p className="text-sm text-ink whitespace-pre-wrap mt-1">{m.content}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-ink/50">
                    {tab === 'sent' ? (
                      <>
                        {t(lang, 'to')}: {m.recipient_id ? m.recipient?.full_name : t(lang, 'allBoardMembers')}
                      </>
                    ) : (
                      <>
                        {t(lang, 'from')}: {m.sender?.full_name} · {m.sender?.apartment_number}
                      </>
                    )}
                    {' · '}
                    {formatDate(m.created_at, lang)}
                  </p>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    {tab === 'inbox' && m.sender_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const replySubject = m.subject && !m.subject.startsWith('Re:') ? `Re: ${m.subject}` : m.subject || '';
                          const params = new URLSearchParams({
                            to: m.sender_id,
                            name: m.sender?.full_name || '',
                          });
                          if (replySubject) params.set('subject', replySubject);
                          router.push(`/dashboard/messages/new?${params.toString()}`);
                        }}
                        className="text-xs text-harbor hover:text-ochre"
                      >
                        {t(lang, 'replyPrivately')}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(m.id);
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      {t(lang, 'delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
