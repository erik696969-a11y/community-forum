'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

export default function NewEventPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'board') {
      router.replace('/dashboard/events');
    }
  }, [loading, session, profile, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    let originalLang = lang;
    let titleTranslations = {};
    let descriptionTranslations = {};

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [title, description] }),
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

    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert({
        title,
        description,
        event_date: eventDate || null,
        location,
        created_by: session.user.id,
        original_lang: originalLang,
        title_translations: titleTranslations,
        description_translations: descriptionTranslations,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(`/dashboard/events/${newEvent.id}`);
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
        <Link href="/dashboard/events" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToEvents')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6 mt-3">{t(lang, 'addEvent')}</h1>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'eventTitleLabel')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Halloween Garden Party"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'eventDateLabel')}</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'eventLocationLabel')}</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'eventLocationPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'eventDescriptionLabel')}</label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
            />
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
