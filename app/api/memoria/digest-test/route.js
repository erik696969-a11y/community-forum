// Memoria — skúšobný súhrn e-mailom pre prihláseného člena boardu
// (vrátane DEMO záznamov, zreteľne označených) a stav automatického odosielania.

import { getAuthedProfile } from '../../../../lib/serverAuth';
import { collectDigestItems, renderDigest } from '../../../../lib/memoriaDigest';
import { todayMadrid, appBaseUrl, loadDigestData, sendEmails } from '../../../../lib/memoriaDigestServer';

export const maxDuration = 30;
const DAILY_LIMIT = 10;

async function boardAuth(request) {
  const auth = await getAuthedProfile(request);
  if (!auth) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (auth.profile.role !== 'board' || auth.profile.status !== 'approved') {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(request) {
  const { auth, error } = await boardAuth(request);
  if (error) return error;
  return Response.json({
    autoEnabled: process.env.MEMORIA_DIGEST_ENABLED === 'true',
    emailOn: auth.profile.memoria_email !== false,
  });
}

export async function POST(request) {
  const { auth, error } = await boardAuth(request);
  if (error) return error;
  if (!process.env.RESEND_API_KEY) return Response.json({ error: 'Email is not configured' }, { status: 500 });
  if (!auth.user.email) return Response.json({ error: 'No email address' }, { status: 400 });

  const db = auth.adminClient;
  const { data: allowed, error: rlError } = await db.rpc('check_and_increment_rate_limit', {
    p_user_id: auth.user.id,
    p_endpoint: 'memoria-digest-test',
    p_limit: DAILY_LIMIT,
  });
  if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
  if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({}));
    const lang = ['en', 'es', 'fr', 'de'].includes(body.lang) ? body.lang : auth.profile.language || 'en';
    const today = todayMadrid();
    const data = await loadDigestData(db);
    const items = collectDigestItems(data, today, { includeDemo: true });
    const sample = items.some((i) => i.isDemo);
    const email = renderDigest({ items, lang, weekly: true, appUrl: appBaseUrl(request), today, sample });
    const sent = await sendEmails([{ to: auth.user.email, ...email }]);
    if (!sent) return Response.json({ error: 'Email could not be sent' }, { status: 502 });
    return Response.json({ sent: true, email: auth.user.email, items: items.length });
  } catch (e) {
    console.error('memoria digest-test error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
