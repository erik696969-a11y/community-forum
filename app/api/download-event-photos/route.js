import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { getAuthedProfile } from '../../../lib/serverAuth';

export async function GET(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth || auth.profile.status !== 'approved') {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return new Response('Missing eventId', { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: photos } = await adminClient
      .from('event_photos')
      .select('image_url')
      .eq('event_id', eventId);

    if (!photos || photos.length === 0) {
      return new Response('No photos found', { status: 404 });
    }

    const zip = new JSZip();

    await Promise.all(
      photos.map(async (photo, i) => {
        try {
          // image_url now stores the bare storage path (private bucket) -
          // fetch the bytes directly with the service role, no signed URL needed.
          const { data, error } = await adminClient.storage.from('event-photos').download(photo.image_url);
          if (error || !data) return;
          const buffer = await data.arrayBuffer();
          const ext = photo.image_url.split('.').pop().split('?')[0] || 'jpg';
          zip.file(`photo-${i + 1}.${ext}`, buffer);
        } catch (e) {
          // skip any photo that fails to download
        }
      })
    );

    const content = await zip.generateAsync({ type: 'nodebuffer' });

    return new Response(content, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="event-photos.zip"',
      },
    });
  } catch (error) {
    return new Response('Failed to create ZIP', { status: 500 });
  }
}
