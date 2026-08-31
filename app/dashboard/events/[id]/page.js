'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import { LOCALE_MAP } from '../../../../lib/formatDate';
import Header from '../../../components/Header';
import StorageImage from '../../../components/StorageImage';
import { getSignedDownloadUrl } from '../../../../lib/storageClient';

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
  // RSVP data is split into privacy-safe sources instead of one broad
  // query that returned every participant's identity for every status:
  //  - myRsvp: self-scoped raw read (RLS allows reading your own row)
  //  - rsvpCounts: aggregate RPC, no identities at all
  //  - goingList: RPC that only ever returns "going" participants -
  //    maybe/cant_come identities never reach a normal owner's browser
  const [myRsvp, setMyRsvp] = useState(null);
  const [rsvpCounts, setRsvpCounts] = useState({ going_count: 0, maybe_count: 0, cant_come_count: 0 });
  const [goingList, setGoingList] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function load() {
    const { data: eventData } = await supabase.from('events').select('*').eq('id', params.id).single();
    setEvent(eventData);

    const { data: photoData } = await supabase
      .from('event_photos')
      .select('*')
      .eq('event_id', params.id)
      .order('created_at', { ascending: false });
    setPhotos(photoData || []);

    const { data: myRsvpData } = await supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', params.id)
      .eq('user_id', session.user.id)
      .maybeSingle();
    setMyRsvp(myRsvpData);

    const { data: countsData } = await supabase.rpc('get_event_rsvp_counts', { p_event_id: params.id });
    setRsvpCounts(countsData?.[0] || { going_count: 0, maybe_count: 0, cant_come_count: 0 });

    const { data: goingData } = await supabase.rpc('get_event_rsvp_going', { p_event_id: params.id });
    setGoingList(goingData || []);

    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, profile]);

 async function handleDeleteEvent() {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;

    // Clean up the actual photo files from storage first, so deleting an
    // event doesn't leave orphaned files behind in the bucket.
    if (photos.length > 0) {
      const paths = photos.map((p) => p.image_url);
      await supabase.storage.from('event-photos').remove(paths);
    }

    await supabase.from('events').delete().eq('id', params.id);
    router.push('/dashboard/events');
  }

  async function handleDownloadZip() {
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/download-event-photos?eventId=${params.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'event-photos.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // silently ignore - button just won't trigger a download
    }
    setDownloadingZip(false);
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const filePath = `${params.id}/${session.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('event-photos').upload(filePath, file);
      if (!uploadError) {
        // Store the bare storage path (bucket is private) - a signed URL
        // is generated on demand whenever the photo is displayed.
        await supabase.from('event_photos').insert({
          event_id: params.id,
          uploaded_by: session.user.id,
          image_url: filePath,
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

  async function exportRsvpCsv() {
    // Fetched on-demand from the Board-only admin RPC - never from the
    // normal-owner state, which no longer contains hidden identities.
    const { data } = await supabase.rpc('get_event_rsvps_admin', { p_event_id: params.id });
    const rows = [['Name', 'Apartment', 'Status']];
    (data || []).forEach((r) => {
      rows.push([r.full_name || '', r.apartment_number || '', r.status]);
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
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl text-harbor mb-1 flex items-center gap-2">
              {(event.event_type === 'agm' || event.event_type === 'egm') && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-harbor text-white">
                  {t(lang, event.event_type === 'agm' ? 'eventTypeBadgeAGM' : 'eventTypeBadgeEGM')}
                </span>
              )}
              {localizedField(event, 'title', lang)}
            </h1>
            {profile.role === 'board' && (
              <button
                onClick={handleDeleteEvent}
                className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap flex-shrink-0"
              >
                {t(lang, 'delete')}
              </button>
            )}
          </div>
          {event.event_date && (
            <p className="text-sm text-ochre font-semibold">
              {new Date(event.event_date).toLocaleDateString(LOCALE_MAP[lang] || 'en-GB', {
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
            <strong>{rsvpCounts.going_count}</strong> {t(lang, 'rsvpGoingLabel').toLowerCase()}
            {goingList.length > 0 && `: ${goingList.map((r) => r.full_name).filter(Boolean).join(', ')}`}
          </p>
          <p className="text-sm text-ink/50 mt-1">
            {rsvpCounts.maybe_count} {t(lang, 'rsvpMaybeLabel').toLowerCase()} · {rsvpCounts.cant_come_count}{' '}
            {t(lang, 'rsvpCantComeLabel').toLowerCase()}
          </p>
          {profile.role === 'board' && (
            <button onClick={exportRsvpCsv} className="text-xs text-harbor/60 hover:text-harbor underline mt-3">
              {t(lang, 'exportRsvpList')}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-display text-lg text-harbor">{t(lang, 'photosLabel')}</h2>
          <div className="flex items-center gap-3">
            {photos.length > 0 && (
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="text-xs text-harbor/60 hover:text-harbor underline whitespace-nowrap"
              >
                {downloadingZip ? t(lang, 'saving') : t(lang, 'downloadAllPhotos')}
              </button>
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
              <GalleryPhoto key={photo.id} photo={photo} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function GalleryPhoto({ photo, lang }) {
  async function handleDownload() {
    const url = await getSignedDownloadUrl('event-photos', photo.image_url, `photo-${photo.id}.jpg`);
    if (url) window.open(url, '_blank');
  }

  return (
    <div className="relative group">
      <StorageImage bucket="event-photos" path={photo.image_url} alt="" className="w-full h-32 object-cover rounded-lg" />
      <button
        onClick={handleDownload}
        className="absolute bottom-1 right-1 bg-harbor/80 text-sand text-xs px-2 py-1 rounded"
      >
        {t(lang, 'download')}
      </button>
    </div>
  );
}
