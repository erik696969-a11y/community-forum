'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

export default function EventsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [events, setEvents] = useState([]);
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
    async function loadEvents() {
      const { data } = await supabase
        .from('events')
        .select('*, event_photos(id)')
        .order('event_date', { ascending: false });
      setEvents(data || []);
      setLoadingData(false);
    }
    if (profile?.status === 'approved') loadEvents();
  }, [profile]);

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.event_date && e.event_date >= today).reverse();
  const past = events.filter((e) => !e.event_date || e.event_date < today);
  const isBoard = profile.role === 'board';

  function EventCard({ ev }) {
    return (
      <Link href={`/dashboard/events/${ev.id}`} className="card p-5 block hover:border-ochre transition-colors">
        <h3 className="font-display text-lg text-harbor flex items-center gap-2">
          {(ev.event_type === 'agm' || ev.event_type === 'egm') && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-harbor text-white">
              {t(lang, ev.event_type === 'agm' ? 'eventTypeBadgeAGM' : 'eventTypeBadgeEGM')}
            </span>
          )}
          {localizedField(ev, 'title', lang)}
        </h3>
        {ev.event_date && (
          <p className="text-sm text-ochre font-semibold mt-1">
            {new Date(ev.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
        {ev.location && <p className="text-sm text-ink/60">{ev.location}</p>}
        <p className="text-sm text-ink/70 mt-1 line-clamp-2">{localizedField(ev, 'description', lang)}</p>
        <p className="text-xs text-ink/50 mt-2">
          {ev.event_photos.length} {t(lang, 'photosLabel').toLowerCase()}
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
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'eventsTitle')}</h1>
          {isBoard && (
            <Link href="/dashboard/events/new" className="btn-primary">
              {t(lang, 'addEvent')}
            </Link>
          )}
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-ochre uppercase tracking-wide mb-3">
                  {t(lang, 'upcomingEvent')}
                </h2>
                <div className="space-y-3">
                  {upcoming.map((ev) => (
                    <EventCard key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold text-harbor/60 uppercase tracking-wide mb-3">
              {t(lang, 'pastEvents')}
            </h2>
            {past.length === 0 ? (
              <p className="text-ink/60">{t(lang, 'noEventsYet')}</p>
            ) : (
              <div className="space-y-3">
                {past.map((ev) => (
                  <EventCard key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
