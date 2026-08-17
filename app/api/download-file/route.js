import { getAuthedProfile } from '../../../lib/serverAuth';

// Proxies a file download and forces the browser to download it
// (Content-Disposition: attachment) instead of trying to render it
// inline, which is what caused the app to hang on .docx files —
// browsers/mobile Safari can try to preview unknown binary formats
// as text and freeze on large Word/Office files.
//
// NOTE: as of this fix, nothing in the active app actually calls this
// endpoint anymore — app/dashboard/documents/view/[id]/page.js uses
// Supabase's own signed URLs (lib/storageClient.js) instead, which
// already enforce storage RLS. This is hardened anyway as a safety net
// in case it's wired up again later.
export async function GET(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (auth.profile.status !== 'approved') {
      return new Response('Forbidden', { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');
    const filename = searchParams.get('filename') || 'download';

    if (!fileUrl) {
      return new Response('Missing url', { status: 400 });
    }

    // Only allow proxying our own Supabase storage files, not arbitrary URLs
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
    const parsedFileUrl = new URL(fileUrl);
    if (parsedFileUrl.host !== allowedHost) {
      return new Response('Invalid host', { status: 400 });
    }
    // Only allow proxying actual Supabase Storage object paths, not any
    // other route on the same project (e.g. its REST/auth/functions APIs).
    if (!parsedFileUrl.pathname.startsWith('/storage/v1/object/')) {
      return new Response('Invalid path', { status: 400 });
    }

    const upstream = await fetch(fileUrl);
    if (!upstream.ok || !upstream.body) {
      return new Response('File not found', { status: 404 });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');

    // Stream the response through instead of buffering the whole file in
    // memory (upstream.arrayBuffer() previously loaded it fully server-side
    // before this function even ran).
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    });
  } catch (error) {
    return new Response('Download failed', { status: 500 });
  }
}
