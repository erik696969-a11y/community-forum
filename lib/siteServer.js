// Site Manager reporting — serverová časť (len pre API routes).
//
// Dáta modulu sa čítajú VŽDY s tokenom prihláseného používateľa (userClient), takže o prístupe
// rozhoduje databáza (sm_read overí rolu a zapíše prístup). Servisný kľúč sa používa iba na
// uloženie odoslaného reportu, e-mailové adresy príjemcov a dočasné odkazy na fotky v e-mailoch.

import { createClient } from '@supabase/supabase-js';
import { brandConfig } from './brandConfig';

export function bearer(request) {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
}

export function userClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Overí token a vráti používateľa, jeho rolu v module a klientov.
export async function siteAuth(request) {
  const token = bearer(request);
  if (!token) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = userClient(token);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: me, error: meErr } = await db.rpc('sm_me');
  if (meErr) return { error: Response.json({ error: meErr.message }, { status: 500 }) };
  return { user: userData.user, me, db, admin: adminClient() };
}

export async function rateLimit(admin, userId, endpoint, limit) {
  const { data, error } = await admin.rpc('check_and_increment_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_limit: limit,
  });
  if (error) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
  if (!data) return Response.json({ error: 'Daily limit reached' }, { status: 429 });
  return null;
}

async function emailOf(admin, userId) {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

// Aktívni držitelia roly v module (podľa dnešného dátumu v Španielsku).
export async function roleHolders(admin, role) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const { data, error } = await admin
    .from('sm_roles')
    .select('user_id, active_from, active_to')
    .eq('role', role)
    .lte('active_from', today);
  if (error) throw new Error(error.message);
  const ids = (data || []).filter((r) => !r.active_to || r.active_to >= today).map((r) => r.user_id);
  const emails = await Promise.all(ids.map((id) => emailOf(admin, id)));
  return emails.filter(Boolean);
}

export async function boardEmails(admin) {
  const { data, error } = await admin.from('profiles').select('id').eq('role', 'board').eq('status', 'approved');
  if (error) throw new Error(error.message);
  const emails = await Promise.all((data || []).map((p) => emailOf(admin, p.id)));
  return [...new Set(emails.filter(Boolean))];
}

// Dočasné odkazy na fotky a ponuky do e-mailov (príjemcovia do úložiska nemajú prístup).
export async function signedUrls(admin, paths, seconds = 60 * 24 * 3600) {
  const unique = [...new Set(paths.filter(Boolean))];
  const map = {};
  if (!unique.length) return map;
  const { data } = await admin.storage.from('site').createSignedUrls(unique, seconds);
  for (const d of data || []) if (d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

export async function sendSiteEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured');
  const recipients = [...new Set(to.filter(Boolean))];
  if (!recipients.length) throw new Error('No recipients');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${brandConfig.name} · Site reporting <${brandConfig.senderEmail}>`, to: recipients, subject, html }),
  });
  if (!res.ok) throw new Error(`Email could not be sent (${res.status})`);
  return recipients;
}

export function namesFrom(me) {
  return {
    siteManager: me?.site_manager_name || 'the Site Manager',
    contact: me?.contact_name || 'the point of contact',
  };
}

export function targetsDecided(targets) {
  const vals = Object.values(targets || {});
  return vals.length > 0 && vals.every((v) => v && v.minute_ref);
}
