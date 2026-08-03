// Proxies a file download and forces the browser to download it
// (Content-Disposition: attachment) instead of trying to render it
// inline, which is what caused the app to hang on .docx files —
// browsers/mobile Safari can try to preview unknown binary formats
// as text and freeze on large Word/Office files.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');
    const filename = searchParams.get('filename') || 'download';

    if (!fileUrl) {
      return new Response('Missing url', { status: 400 });
    }

    // Only allow proxying our own Supabase storage files, not arbitrary URLs
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
    const targetHost = new URL(fileUrl).host;
    if (targetHost !== allowedHost) {
      return new Response('Invalid host', { status: 400 });
    }

    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return new Response('File not found', { status: 404 });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    return new Response('Download failed', { status: 500 });
  }
}
