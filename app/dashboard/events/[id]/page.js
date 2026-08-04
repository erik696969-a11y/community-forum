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

export default function EventDetailPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function load() {
    const { data: eventData } = await supabase.from('events').select('*').eq('id', params.id).single();
    setEvent(eventData);

    const { data: photoData } = await supabase
      .from('event_photos')
      .select('*, uploader:profiles(full_name)')
      .eq('event_id', params.id)
      .order('created_at', { ascending: false });
    setPhotos(photoData || []);

    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('*, profile:profiles(full_name, apartment_number)')
      .eq('event_id', params.id);
    setRsvps(rsvpData || []);

    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, profile]);

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const filePath = `${params.id}/${session.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('event-photos').upload(filePath, file);
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('event-photos').getPublicUrl(filePath);
        await supabase.from('event_photos').insert({
          event_id: params.id,
          uploaded_by: session.user.id,
          image_url: publicUrlData.publicUrl,
        });
      }
    }

    setUploading(false);
    load();
  }

  async function handleRsvp(status) {
    await supabase
      .from('event_rsvps')
      .upsert({ event_id: params.id, user_id: session.user.id, status }, { onConflict: 'event_id,user_id' });
    load();
  }

  function exportRsvpCsv() {
    const rows = [['Name', 'Apartment', 'Status']];
    rsvps.forEach((r) => {
      rows.push([r.profile?.full_name || '', r.profile?.apartment_number || '', r.status]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rsvp-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!event) {
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
        <Link href="/dashboard/events" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToEvents')}
        </Link>

        <div className="card p-6 mt-3 mb-8">
          <h1 className="font-display text-2xl text-harbor mb-1">{localizedField(event, 'title', lang)}</h1>
          {event.event_date && (
            <p className="text-sm text-ochre font-semibold">
              {new Date(event.event_date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          {event.location && <p className="text-sm text-ink/60 mb-3">{event.location}</p>}
          {event.description && (
            <p className="text-ink whitespace-pre-wrap mt-2">{localizedField(event, 'description', lang)}</p>
          )}
        </div>

        {(() => {
          const myRsvp = rsvps.find((r) => r.user_id === session.user.id);
          const going = rsvps.filter((r) => r.status === 'going');
          const maybe = rsvps.filter((r) => r.status === 'maybe');
          const cantCome = rsvps.filter((r) => r.status === 'cant_come');
          return (
            <div className="card p-5 mb-8">
              <div className="flex gap-2 flex-wrap mb-4">
                <button
                  onClick={() => handleRsvp('going')}
                  className={myRsvp?.status === 'going' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                >
                  {t(lang, 'rsvpGoing')}
                </button>
                <button
                  onClick={() => handleRsvp('maybe')}
                  className={myRsvp?.status === 'maybe' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                >
                  {t(lang, 'rsvpMaybe')}
                </button>
                <button
                  onClick={() => handleRsvp('cant_come')}
                  className={myRsvp?.status === 'cant_come' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                >
                  {t(lang, 'rsvpCantCome')}
                </button>
              </div>
              <p className="text-sm text-ink/70">
                <strong>{going.length}</strong> {t(lang, 'rsvpGoingLabel').toLowerCase()}
                {going.length > 0 && `: ${going.map((r) => r.profile?.full_name).filter(Boolean).join(', ')}`}
              </p>
              <p className="text-sm text-ink/50 mt-1">
                {maybe.length} {t(lang, 'rsvpMaybeLabel').toLowerCase()} · {cantCome.length}{' '}
                {t(lang, 'rsvpCantComeLabel').toLowerCase()}
              </p>
              {profile.role === 'board' && rsvps.length > 0 && (
                <button onClick={exportRsvpCsv} className="text-xs text-harbor/60 hover:text-harbor underline mt-3">
                  {t(lang, 'exportRsvpList')}
                </button>
              )}
            </div>
          );
        })()}

        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-display text-lg text-harbor">{t(lang, 'photosLabel')}</h2>
          <div className="flex items-center gap-3">
            {photos.length > 0 && (
              <a
                href={`/api/download-event-photos?eventId=${params.id}`}
                className="text-xs text-harbor/60 hover:text-harbor underline whitespace-nowrap"
              >
                {t(lang, 'downloadAllPhotos')}
              </a>
            )}
            <label className="btn-primary text-sm cursor-pointer">
              {uploading ? t(lang, 'saving') : t(lang, 'uploadPhoto')}
              <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>

        {photos.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noPhotosYet')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.image_url}
                  alt=""
                  className="w-full h-32 object-cover rounded-lg"
                />
                <a
                  href={photo.image_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-1 right-1 bg-harbor/80 text-sand text-xs px-2 py-1 rounded"
                >
                  {t(lang, 'download')}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
