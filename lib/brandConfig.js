// Central branding configuration for white-label deployments.
//
// Architecture decision (see white-label planning discussion): each
// community gets its own Vercel project + Supabase project (not one
// shared multi-tenant database). Branding therefore lives in environment
// variables set per-deployment, not in a database table - onboarding a
// new community means setting these env vars once during provisioning,
// never editing application code.
//
// NEXT_PUBLIC_* vars are inlined at build time and safe to read from
// client components. Non-prefixed vars (e.g. EMAIL_FROM_ADDRESS) are only
// ever read from server-only files (API routes) - do not read those from
// a 'use client' component, they will be undefined there.
export const brandConfig = {
  // Short display name, used in the browser tab title, PWA name, and
  // anywhere the app refers to itself conversationally.
  name: process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Mi Hacienda',

  // Full legal/registered name of the owners' community, used in the
  // Privacy Notice and footer.
  fullLegalName: process.env.NEXT_PUBLIC_COMMUNITY_FULL_NAME || 'Hacienda del Señorío de Cifuentes',

  // Full postal address, used in the Privacy Notice and footer.
  address: process.env.NEXT_PUBLIC_COMMUNITY_ADDRESS || 'Calle Torre Campanillas 7, Benahavís 29679, España',

  // "From" address for all outgoing email (server-side only).
  senderEmail: process.env.EMAIL_FROM_ADDRESS || 'noreply@myhumandesign.sk',

  // Footer/login hero image.
  heroImage: process.env.NEXT_PUBLIC_HERO_IMAGE_PATH || '/images/hero-entrance-sign.jpg',
  heroImageAlt: process.env.NEXT_PUBLIC_HERO_IMAGE_ALT || 'Hacienda del Señorío de Cifuentes entrance',
};

// Substitutes {{COMMUNITY_FULL_NAME}} / {{COMMUNITY_ADDRESS}} tokens in
// static prose (e.g. the Privacy Notice) with this deployment's actual
// brand values.
export function resolveBrandPlaceholders(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\{\{COMMUNITY_FULL_NAME\}\}/g, brandConfig.fullLegalName)
    .replace(/\{\{COMMUNITY_ADDRESS\}\}/g, brandConfig.address);
}
