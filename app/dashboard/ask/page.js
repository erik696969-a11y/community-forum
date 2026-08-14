'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function AskAiPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [asking, setAsking] = useState(false);
  const [noKnowledge, setNoKnowledge] = useState(false);
  const [error, setError] = useState('');

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

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim()) return;
    const asked = question.trim();
    setQuestion('');
    setAsking(true);
    setError('');

    try {
      const res = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question: asked }),
      });
      const data = await res.json();

      if (data.noKnowledge) {
        setNoKnowledge(true);
      } else if (data.error) {
        setError(data.error);
      } else {
        setHistory((prev) => [...prev, { question: asked, answer: data.answer }]);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }

    setAsking(false);
  }

  if (loading || !profile) {
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
        <h1 className="font-display text-2xl text-harbor mb-2">🤖 {t(lang, 'askAiTitle')}</h1>
        <p className="text-sm text-ink/60 mb-6">{t(lang, 'askAiNote')}</p>

        {noKnowledge ? (
          <p className="text-ink/60 bg-sand-dark/60 rounded-lg p-4">{t(lang, 'askAiNoKnowledge')}</p>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {history.map((h, i) => (
                <div key={i}>
                  <div className="card p-4 bg-harbor text-white mb-2 ml-8">
                    <p className="text-sm">{h.question}</p>
                  </div>
                  <div className="card p-4 mr-8">
                    <p className="text-sm text-ink whitespace-pre-wrap">{h.answer}</p>
                    <p className="text-xs text-ink/40 mt-3 italic">{t(lang, 'askAiDisclaimer')}</p>
                  </div>
                </div>
              ))}
              {asking && <p className="text-sm text-ink/50 italic">{t(lang, 'askAiThinking')}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <form onSubmit={handleAsk} className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="input-field"
                placeholder={t(lang, 'askAiPlaceholder')}
                disabled={asking}
              />
              <button type="submit" disabled={asking} className="btn-primary whitespace-nowrap">
                {t(lang, 'askAiButton')}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
