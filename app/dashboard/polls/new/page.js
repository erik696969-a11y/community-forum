'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

// Fixed AGM-style vote choices, in all 4 app languages
const VOTE_CHOICES = [
  { en: 'For', es: 'A favor', fr: 'Pour', de: 'Dafür' },
  { en: 'Against', es: 'En contra', fr: 'Contre', de: 'Dagegen' },
  { en: 'Abstain', es: 'Abstención', fr: 'Abstention', de: 'Enthaltung' },
];

export default function NewPollPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'board') {
      router.replace('/dashboard/polls');
    }
  }, [loading, session, profile, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    let originalLang = lang;
    let titleTranslations = {};
    let descriptionTranslations = {};

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [title, description || ''] }),
      });
      const data = await res.json();
      if (data.translations) {
        originalLang = data.originalLang;
        Object.entries(data.translations).forEach(([langCode, arr]) => {
          titleTranslations[langCode] = arr[0];
          descriptionTranslations[langCode] = arr[1];
        });
      }
    } catch (translationError) {
      originalLang = lang;
    }

    const { data: newPoll, error: insertError } = await supabase
      .from('polls')
      .insert({
        question: title,
        description,
        created_by: session.user.id,
        original_lang: originalLang,
        question_translations: titleTranslations,
        description_translations: descriptionTranslations,
      })
      .select()
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    const optionRows = VOTE_CHOICES.map((choice, i) => ({
      poll_id: newPoll.id,
      label: choice.en,
      label_translations: choice,
      sort_order: i,
    }));

    const { error: optionsError } = await supabase.from('poll_options').insert(optionRows);

    setSubmitting(false);

    if (optionsError) {
      setError(optionsError.message);
      return;
    }

    router.push(`/dashboard/polls/${newPoll.id}`);
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
        <Link href="/dashboard/polls" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToPolls')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-2 mt-3">{t(lang, 'newPoll')}</h1>
        <p className="text-xs text-ink/60 mb-6 italic">{t(lang, 'strawPollNote')}</p>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'pollQuestionLabel')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'pollQuestionPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'pollDescriptionLabel')}</label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'pollDescriptionPlaceholder')}
            />
          </div>

          <div className="bg-sand-dark/60 rounded-lg p-3">
            <p className="text-xs font-semibold text-harbor mb-1">{t(lang, 'pollOptionsLabel')}</p>
            <p className="text-sm text-ink/70">For · Against · Abstain</p>
            <p className="text-xs text-ink/50 mt-1">{t(lang, 'fixedOptionsNote')}</p>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'saving') : t(lang, 'save')}
          </button>
        </form>
      </div>
    </main>
  );
}
