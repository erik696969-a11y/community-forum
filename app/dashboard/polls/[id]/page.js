'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

function localizedOption(option, lang) {
  return option.label_translations?.[lang] || option.label;
}

export default function PollDetailPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [poll, setPoll] = useState(null);
  const [options, setOptions] = useState([]);
  const [results, setResults] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function load() {
    const { data: pollData } = await supabase.from('polls').select('*').eq('id', params.id).single();
    setPoll(pollData);

    const { data: optionsData } = await supabase
      .from('poll_options')
      .select('*')
      .eq('poll_id', params.id)
      .order('sort_order');
    setOptions(optionsData || []);

    // Anonymous aggregate counts (never reveals who voted for what)
    const { data: resultsData } = await supabase.rpc('get_poll_results', { target_poll_id: params.id });
    setResults(resultsData || []);

    // Only your own vote is visible to you
    const { data: myVoteData } = await supabase
      .from('poll_votes')
      .select('*')
      .eq('poll_id', params.id)
      .eq('user_id', session.user.id)
      .maybeSingle();
    setMyVote(myVoteData || null);

    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, profile]);

  async function handleVote(optionId) {
    if (voting || poll.status === 'closed') return;
    setVoting(true);

    if (myVote) {
      await supabase
        .from('poll_votes')
        .update({ option_id: optionId })
        .eq('poll_id', params.id)
        .eq('user_id', session.user.id);
    } else {
      await supabase.from('poll_votes').insert({
        poll_id: params.id,
        option_id: optionId,
        user_id: session.user.id,
      });
    }

    setVoting(false);
    load();
  }

  async function handleClosePoll() {
    await supabase.from('polls').update({ status: 'closed' }).eq('id', params.id);
    load();
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!poll) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">{t(lang, 'postNotFound')}</p>
        </div>
      </main>
    );
  }

  const isBoard = profile.role === 'board';
  const totalVotes = results.reduce((sum, r) => sum + Number(r.vote_count), 0);

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard/polls" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToPolls')}
        </Link>

        <div className="card p-6 mt-3 mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h1 className="font-display text-2xl text-harbor">{localizedField(poll, 'question', lang)}</h1>
            {poll.status === 'closed' && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-harbor/10 text-harbor whitespace-nowrap">
                {t(lang, 'pollClosedLabel')}
              </span>
            )}
          </div>
          {poll.description && (
            <p className="text-sm text-ink/70 mb-3">{localizedField(poll, 'description', lang)}</p>
          )}
          <div className="bg-sand-dark/60 border border-ochre/30 rounded-lg px-4 py-3 mt-3">
            <p className="text-sm text-harbor font-medium">📋 {t(lang, 'strawPollNote')}</p>
            <p className="text-xs text-ink/60 mt-1">{t(lang, 'anonymousVoteNote')}</p>
          </div>
        </div>

        {poll.status === 'closed' ? (
          <div className="space-y-3">
            {(() => {
              const maxVotes = Math.max(...options.map((opt) => {
                const r = results.find((r) => r.option_id === opt.id);
                return r ? Number(r.vote_count) : 0;
              }), 0);
              return options.map((opt) => {
                const resultRow = results.find((r) => r.option_id === opt.id);
                const optionVotes = resultRow ? Number(resultRow.vote_count) : 0;
                const pct = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                const isWinner = optionVotes === maxVotes && optionVotes > 0;

                return (
                  <div key={opt.id} className={`card p-5 ${isWinner ? 'border-ochre' : ''}`}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-display text-lg text-harbor flex items-center gap-2">
                        {isWinner && '🏆'} {localizedOption(opt, lang)}
                      </span>
                      <span className="text-sm font-semibold text-ink/70 whitespace-nowrap">
                        {pct}% ({optionVotes})
                      </span>
                    </div>
                    <div className="h-3 bg-sand-dark/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isWinner ? 'bg-ochre' : 'bg-harbor/40'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
            <p className="text-xs text-ink/50 text-center pt-2">
              {totalVotes} {t(lang, 'votesLabel')} {t(lang, 'totalLabel')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {options.map((opt) => {
              const resultRow = results.find((r) => r.option_id === opt.id);
              const optionVotes = resultRow ? Number(resultRow.vote_count) : 0;
              const pct = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
              const isMine = myVote?.option_id === opt.id;

              return (
                <button
                  key={opt.id}
                  onClick={() => handleVote(opt.id)}
                  disabled={voting}
                  className={`card p-4 w-full text-left relative overflow-hidden ${
                    isMine ? 'border-ochre' : ''
                  } hover:border-ochre`}
                >
                  <div className="absolute inset-y-0 left-0 bg-ochre/10" style={{ width: `${pct}%` }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="font-semibold text-harbor">{localizedOption(opt, lang)}</span>
                    <span className="text-sm text-ink/60 whitespace-nowrap">
                      {optionVotes} {t(lang, 'votesLabel')} ({pct}%)
                    </span>
                  </div>
                  {isMine && <p className="relative text-xs text-ochre mt-1">{t(lang, 'youVoted')}</p>}
                </button>
              );
            })}
          </div>
        )}

        {isBoard && poll.status === 'open' && (
          <button onClick={handleClosePoll} className="btn-secondary text-sm mt-6">
            {t(lang, 'closePoll')}
          </button>
        )}
      </div>
    </main>
  );
}
