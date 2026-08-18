'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import { formatFacilityDate, formatFacilityTime, zonedTimeToUtc } from '../../../../lib/formatDate';
import Header from '../../../components/Header';
import { fetchAuthorProfiles, attachAuthors } from '../../../../lib/authorProfiles';

export default function FacilityDetailPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [facility, setFacility] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  const load = useCallback(async () => {
    const { data: facilityData } = await supabase.from('facilities').select('*').eq('id', params.id).single();
    setFacility(facilityData);

    const { data: bookingsDataRaw } = await supabase
      .from('facility_bookings')
      .select('*')
      .eq('facility_id', params.id)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at');
    const authorMap = await fetchAuthorProfiles((bookingsDataRaw || []).map((b) => b.user_id));
    setBookings(attachAuthors(bookingsDataRaw, authorMap, { idField: 'user_id', asField: 'booker' }) || []);

    setLoadingData(false);
  }, [params.id]);

  useEffect(() => {
    if (profile?.status === 'approved') load();
  }, [profile, load]);

  async function handleBook(e) {
    e.preventDefault();
    setError('');

    if (!date || !startTime || !endTime) return;

    // Bookings are always interpreted as Europe/Madrid local time, not the
    // booking member's own browser timezone (see lib/formatDate.js).
    const startsAt = zonedTimeToUtc(date, startTime);
    const endsAt = zonedTimeToUtc(date, endTime);

    if (endsAt <= startsAt) {
      setError(t(lang, 'bookingOverlapError'));
      return;
    }

    setSubmitting(true);

    // Client-side overlap check against currently loaded upcoming bookings
    const overlaps = bookings.some((b) => {
      const bStart = new Date(b.starts_at);
      const bEnd = new Date(b.ends_at);
      return startsAt < bEnd && endsAt > bStart;
    });

    if (overlaps) {
      setSubmitting(false);
      setError(t(lang, 'bookingOverlapError'));
      return;
    }

    const { error: insertError } = await supabase.from('facility_bookings').insert({
      facility_id: params.id,
      user_id: session.user.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes,
    });

    setSubmitting(false);

    if (insertError) {
      // 23P01 = exclusion_violation, the DB-level overlap guard we added
      // in migration 20260820000000. The client-side check above already
      // catches most cases, but this is the authoritative guard against a
      // race condition (two people booking the same slot at once).
      if (insertError.code === '23P01') {
        setError(t(lang, 'bookingOverlapError'));
      } else {
        setError(insertError.message);
      }
      return;
    }

    setDate('');
    setStartTime('');
    setEndTime('');
    setNotes('');
    load();
  }

  async function handleCancel(id) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    await supabase.from('facility_bookings').delete().eq('id', id);
    load();
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!facility) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">{t(lang, 'postNotFound')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard/facilities" className="text-sm text-harbor/70 hover:text-harbor">
          ← {t(lang, 'facilitiesTitle')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mt-3 mb-1">{facility.name}</h1>
        {facility.description && <p className="text-sm text-ink/60 mb-6">{facility.description}</p>}

        <form onSubmit={handleBook} className="card p-5 space-y-3 mb-8 overflow-hidden">
          <h2 className="font-display text-lg text-harbor">{t(lang, 'bookThisFacility')}</h2>
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'bookingDateLabel')}</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="input-field"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'startTimeLabel')}</label>
              <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field w-full" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'endTimeLabel')}</label>
              <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'bookingNotesLabel')}</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'saving') : t(lang, 'bookThisFacility')}
          </button>
        </form>

        <h2 className="font-display text-lg text-harbor mb-3">{t(lang, 'upcomingBookingsLabel')}</h2>
        {bookings.length === 0 ? (
          <p className="text-ink/60 text-sm">{t(lang, 'noBookingsYet')}</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => {
              const canCancel = b.user_id === session.user.id || profile.role === 'board';
              return (
                <div key={b.id} className="card p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-harbor">
                      {formatFacilityDate(b.starts_at, lang)} ·{' '}
                      {formatFacilityTime(b.starts_at, lang)}–
                      {formatFacilityTime(b.ends_at, lang)}
                    </p>
                    <p className="text-xs text-ink/50">
                      {t(lang, 'bookedByLabel')}: {b.booker?.full_name}
                      {b.notes && ` · ${b.notes}`}
                    </p>
                  </div>
                  {canCancel && (
                    <button onClick={() => handleCancel(b.id)} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">
                      {t(lang, 'cancelBooking')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
