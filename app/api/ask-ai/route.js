'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const URGENCY_COLORS = {
  yellow: 'border-yellow-400',
  orange: 'border-orange-400',
  red: 'border-red-500',
};

function StageB({ h, lang, expanded, onToggle }) {
  const a = h.answer;
  const hasContent = a.documentation?.length > 0 || a.followUp?.length > 0 || a.modulesUsed?.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 pt-3 border-t border-ink/10">
      <button
        onClick={onToggle}
        className="text-xs font-semibold text-harbor uppercase tracking-wide flex items-center gap-1"
      >
        {expanded ? '▾' : '▸'} {t(lang, 'askAiAfterSituation')}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {a.followUp?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink/60">{t(lang, 'askAiFollowUp')}</p>
              <ul className="list-disc list-inside text-sm text-ink/80 mt-1 space-y-0.5">
                {a.followUp.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {a.modulesUsed?.map((mod) => (
            <div key={mod.code}>
              <p className="text-xs font-semibold text-ink/60">{mod.title}</p>
              {mod.actions?.length > 0 && (
                <ul className="list-disc list-inside text-sm text-ink/80 mt-1 space-y-0.5">
                  {mod.actions.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              {mod.doNot?.length > 0 && (
                <ul className="list-disc list-inside text-sm text-red-600/80 mt-1 space-y-0.5">
                  {mod.doNot.map((item, i) => <li key={i}>⚠ {item}</li>)}
                </ul>
              )}
            </div>
          ))}

          {a.documentation?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink/60">{t(lang, 'askAiDocumentation')}</p>
              <ul className="list-disc list-inside text-sm text-ink/80 mt-1 space-y-0.5">
                {a.documentation.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerCard({ h, lang, onFeedback, expanded, onToggleStageB }) {
  const a = h.answer;
  const borderClass = URGENCY_COLORS[a.urgency] || URGENCY_COLORS.yellow;
  return (
    <div className={`card p-4 mr-8 border-l-4 ${borderClass}`}>
      {a.call112 && (
        <div className="bg-red-50 text-red-700 text-sm font-semibold rounded-md px-3 py-2 mb-3">
          📞 {t(lang, 'askAiCall112')}
        </div>
      )}
      <p className="text-sm text-ink whitespace-pre-wrap">{a.answer}</p>

      {a.immediateActions?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-harbor uppercase tracking-wide">{t(lang, 'askAiDoNow')}</p>
          <ul className="list-disc list-inside text-sm text-ink mt-1 space-y-0.5">
            {a.immediateActions.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {a.doNot?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">{t(lang, 'askAiDoNot')}</p>
          <ul className="list-disc list-inside text-sm text-ink/80 mt-1 space-y-0.5">
            {a.doNot.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {a.contactRoute?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-harbor uppercase tracking-wide">{t(lang, 'askAiContacts')}</p>
          <ul className="list-disc list-inside text-sm text-ink mt-1 space-y-0.5">
            {a.contactRoute.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {a.clarifyingQuestion && (
        <p className="text-sm text-harbor italic mt-3">❓ {a.clarifyingQuestion}</p>
      )}

      <StageB h={h} lang={lang} expanded={expanded} onToggle={onToggleStageB} />

      <div className="flex items-center justify-between mt-3 pt-2">
        <p className="text-xs text-ink/40 italic">{t(lang, 'askAiDisclaimer')}</p>
        {a.logId && (
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {a.feedback ? (
              <span className="text-xs text-ink/40">{t(lang, 'askAiFeedbackThanks')}</span>
            ) : (
              <>
                <span className="text-xs text-ink/40">{t(lang, 'askAiFeedbackPrompt')}</span>
                <button onClick={() => onFeedback('up')} aria-label="thumbs up" className="text-sm hover:opacity-70">👍</button>
                <button onClick={() => onFeedback('down')} aria-label="thumbs down" className="text-sm hover:opacity-70">👎</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AskAiPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [expandedStageB, setExpandedStageB] = useState({});
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

    // Only send back what our own server previously returned - never
    // free-form assistant text. `state` lets the server carry the scenario
    // (primary/related intents, confirmed source_status) forward across
    // follow-up questions without trusting anything else from the client.
    const recentHistory = history.slice(-2).map((h) => ({ question: h.question }));
    const lastAnswer = history[history.length - 1]?.answer;
    const state = lastAnswer
      ? { primaryIntent: lastAnswer.primaryIntent, relatedIntents: lastAnswer.relatedIntents, sourceStatus: lastAnswer.sourceStatus }
      : {};

    try {
      const res = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question: asked, history: recentHistory, state, lang }),
      });
      const data = await res.json();

      if (data.noKnowledge) {
        setNoKnowledge(true);
      } else if (data.error) {
        setError(data.error);
      } else {
        setHistory((prev) => [...prev, { question: asked, answer: data }]);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }

    setAsking(false);
  }

  async function handleFeedback(index, feedback) {
    const entry = history[index];
    if (!entry?.answer?.logId) return;

    setHistory((prev) => prev.map((h, i) => (i === index ? { ...h, answer: { ...h.answer, feedback } } : h)));

    try {
      await fetch('/api/ask-ai/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ logId: entry.answer.logId, feedback }),
      });
    } catch {
      // Non-critical.
    }
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
        <p className="text-sm text-ink/60 mb-1">{t(lang, 'askAiNote')}</p>
        <p className="text-xs text-ink/40 mb-6">{t(lang, 'askAiSensitiveNote')}</p>

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
                  <AnswerCard
                    h={h}
                    lang={lang}
                    onFeedback={(fb) => handleFeedback(i, fb)}
                    expanded={!!expandedStageB[i]}
                    onToggleStageB={() => setExpandedStageB((prev) => ({ ...prev, [i]: !prev[i] }))}
                  />
                </div>
              ))}
              {asking && <p className="text-sm text-ink/50 italic">{t(lang, 'askAiThinking')}</p>}
              {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                  <p>{error}</p>
                  <p className="mt-1">{t(lang, 'askAiCall112')}</p>
                </div>
              )}
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
