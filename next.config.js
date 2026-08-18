/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // Residents who "Add to Home Screen" get a standalone PWA. Mobile browsers
  // (Safari on iOS especially) can hold onto their own local HTTP cache of
  // the page shell more aggressively than a normal browser tab, so a fix
  // like the missing viewport meta tag can silently not reach devices that
  // already have the app pinned to their home screen - with no way for us
  // to notify 300 residents to manually clear their cache or reinstall.
  //
  // This forces every HTML document response to always revalidate with the
  // server on each app open, so every deploy reaches every pinned PWA
  // automatically. It does NOT affect /_next/static assets (JS/CSS bundles),
  // which keep their normal long-lived immutable caching - those are safe
  // to cache forever because their filenames change on every build.
  async headers() {
    return [
      {
        // Everything EXCEPT /_next/* (hashed, safe-to-cache-forever JS/CSS
        // bundles) and /api/* (not cached anyway, this is just to keep the
        // rule's intent obvious) gets forced to always revalidate.
        source: '/((?!_next/|api/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
