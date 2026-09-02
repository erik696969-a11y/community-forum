'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const MAX_DESCRIPTION_LENGTH = 3000;

export default function ReportIssuePage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // 'success' | 'error' | null

  if (!loading && !session) {
    router.replace('/login');
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          description: description.trim(),
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      });

      if (res.ok) {
        setResult('success');
        setDescription('');
      } else {
        setResult('error');
      }
    } catch {
      setResult('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-sand">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>

        <h1 className="font-display text-2xl text-harbor mt-2 mb-2">🛠️ {t(lang, 'reportIssueTitle')}</h1>
        <p className="text-sm text-ink/70 mb-6">{t(lang, 'reportIssueIntro')}</p>

        {result === 'success' ? (
          <div className="card p-5 bg-green-50 border-green-300">
            <p className="text-sm text-ink">{t(lang, 'reportIssueSuccess')}</p>
            <Link href="/dashboard" className="inline-block mt-4 text-sm font-semibold text-harbor hover:underline">
              {t(lang, 'backToDashboard')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-5 space-y-4">
            {result === 'error' && (
              <p className="text-sm text-red-600">{t(lang, 'reportIssueError')}</p>
            )}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-ink mb-1">
                {t(lang, 'reportIssueLabel')}
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder={t(lang, 'reportIssuePlaceholder')}
                rows={8}
                required
                className="w-full rounded-md border border-ink/20 p-3 text-sm focus:border-harbor focus:outline-none"
              />
              <p className="text-xs text-ink/50 mt-1 text-right">{description.length}/{MAX_DESCRIPTION_LENGTH}</p>
            </div>
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="bg-harbor text-white px-5 py-2 rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t(lang, 'reportIssueSubmitting') : t(lang, 'reportIssueSubmit')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
