// Memoria — denné spustenie (Vercel Cron, 1× denne ráno).
// Pondelok: týždenný súhrn pre celý board. Ostatné dni: e-mail iba vtedy,
// keď niektorý termín dosiahol míľnik (7 dní, 1 deň, dnes, prvý deň po termíne).
// Ukážkové (DEMO) záznamy sa nikdy neposielajú.
// Automatické odosielanie je vypnuté, kým MEMORIA_DIGEST_ENABLED nie je 'true'.

import { createClient } from '@supabase/supabase-js';
import { listAllUsers } from '../../../../lib/serverAuth';
import { collectDigestItems, dailyItems, renderDigest, isWeeklyDay } from '../../../../lib/memoriaDigest';
import { todayMadrid, appBaseUrl, loadDigestData, loadMonthlyData, sendEmails } from '../../../../lib/memoriaDigestServer';
import { buildMonthly, renderMonthly, previousMonth, isFirstWorkingDay } from '../../../../lib/memoriaMonthly';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.MEMORIA_DIGEST_ENABLED !== 'true') {
    return Response.json({ skipped: 'disabled' });
  }
  if (!process.env.RESEND_API_KEY) return Response.json({ skipped: 'no email key' });

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const today = todayMadrid();
    const weekly = isWeeklyDay(today);
    const data = await loadDigestData(db);
    const all = collectDigestItems(data, today, { includeDemo: false });
    const items = weekly ? all : dailyItems(all);
    const monthly = isFirstWorkingDay(today);
    if (!weekly && !monthly && items.length === 0) return Response.json({ skipped: 'nothing due', today });

    const recipientsProfiles = (data.profiles || []).filter((p) => p.status === 'approved' && p.memoria_email !== false);
    if (recipientsProfiles.length === 0) return Response.json({ skipped: 'no recipients' });
    const users = await listAllUsers(db);
    const emailById = Object.fromEntries(users.filter((u) => u.email).map((u) => [u.id, u.email]));
    const appUrl = appBaseUrl(request);

    const withEmail = recipientsProfiles.filter((p) => emailById[p.id]);
    const payloads = weekly || items.length > 0 ? withEmail.map((p) => ({ to: emailById[p.id], ...renderDigest({ items, lang: p.language || 'en', weekly, appUrl, today }) })) : [];
    if (monthly) {
      const report = buildMonthly(await loadMonthlyData(db), previousMonth(today), today, { includeDemo: false });
      for (const p of withEmail) payloads.push({ to: emailById[p.id], ...renderMonthly(report, { lang: p.language || 'en', appUrl }) });
    }
    const sent = await sendEmails(payloads);
    console.log(`[memoria digest] today=${today} weekly=${weekly} monthly=${monthly} items=${items.length} sent=${sent}/${payloads.length}`);
    return Response.json({ today, weekly, monthly, items: items.length, sent });
  } catch (e) {
    console.error('memoria digest error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
