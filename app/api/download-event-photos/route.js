import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return new Response('Missing eventId', { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: photos } = await supabase
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
          const res = await fetch(photo.image_url);
          if (!res.ok) return;
          const buffer = await res.arrayBuffer();
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
