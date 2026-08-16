'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import { formatDate, formatTime } from '../../../lib/formatDate';
import Header from '../../components/Header';

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

function closingText(poll, lang) {
  if (!poll.closes_at || poll.status === 'closed') return null;
  const closesDate = new Date(poll.closes_at);
  const today = new Date();
  const diffDays = Math.ceil((closesDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return t(lang, 'closesToday');
  return t(lang, 'closesInDays').replace('{n}', diffDays);
}

export default function PollsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [polls, setPolls] = useState([]);
  const [totals, setTotals] = useState({});
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
    async function loadPolls() {
      const { data } = await supabase.from('polls').select('*').order('created_at', { ascending: false });
      let pollsData = data || [];

      // Auto-close any open polls whose closing date has passed
      const expired = pollsData.filter(
        (p) => p.status === 'open' && p.closes_at && new Date(p.closes_at) < new Date()
      );
      if (expired.length > 0) {
        await Promise.all(
          expired.map((p) => supabase.from('polls').update({ status: 'closed' }).eq('id', p.id))
        );
        pollsData = pollsData.map((p) => (expired.some((e) => e.id === p.id) ? { ...p, status: 'closed' } : p));
      }

      setPolls(pollsData);

      const { data: totalsData } = await supabase.rpc('get_all_poll_totals');
      const map = {};
      (totalsData || []).forEach((row) => {
        map[row.poll_id] = Number(row.total_votes);
      });
      setTotals(map);

      setLoadingData(false);
    }
    if (profile?.status === 'approved') loadPolls();
  }, [profile]);

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const isBoard = profile.role === 'board';
  const open = polls.filter((p) => p.status === 'open');
  const closed = polls.filter((p) => p.status === 'closed');

  function PollCard({ poll }) {
    return (
      <Link href={`/dashboard/polls/${poll.id}`} className="card p-5 block hover:border-ochre transition-colors">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg text-harbor">{localizedField(poll, 'question', lang)}</h3>
          {poll.status === 'closed' ? (
            <span className="text-xs font-semibold px-2 py-1 rounded bg-harbor/10 text-harbor whitespace-nowrap">
              {t(lang, 'pollClosedLabel')}
            </span>
          ) : (
            closingText(poll, lang) && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-ochre/10 text-ochre whitespace-nowrap">
                {closingText(poll, lang)}
              </span>
            )
          )}
        </div>
        <p className="text-xs text-ink/50 mt-1">
          {totals[poll.id] || 0} {t(lang, 'votesLabel')} · {formatDate(poll.created_at, lang)}
        </p>
      </Link>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'pollsTitle')}</h1>
          {isBoard && (
            <Link href="/dashboard/polls/new" className="btn-primary">
              {t(lang, 'newPoll')}
            </Link>
          )}
        </div>
        <div className="bg-sand-dark/60 border border-ochre/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-harbor font-medium">📋 {t(lang, 'strawPollNote')}</p>
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : polls.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noPollsYet')}</p>
        ) : (
          <div className="space-y-3">
            {open.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
            {closed.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
