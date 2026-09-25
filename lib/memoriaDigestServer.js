// Memoria — serverová časť e-mailových pripomienok (len pre API routes).

import { brandConfig } from './brandConfig';

// Dnešný dátum v Španielsku ('YYYY-MM-DD'), nech sa „dnes“ nelíši podľa servera.
export function todayMadrid(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function appBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      return '';
    }
  }
  return '';
}

export async function loadDigestData(db) {
  const [tasks, obligations, contracts, meetings, invoices, mandates, profiles] = await Promise.all([
    db.from('memoria_tasks').select('title, due_date, status, is_demo'),
    db.from('memoria_obligations').select('title, next_due_on, remind_days, active, is_demo'),
    db.from('memoria_contracts').select('subject, ends_on, auto_renew, notice_period_days, status, is_demo'),
    db.from('memoria_meetings').select('title, body, meeting_on, status, invitation_sent_on, minutes_closed_on, is_demo'),
    db.from('memoria_invoices').select('invoice_number, description, is_urgent_unbudgeted, ratified_by_decision_id, is_demo').eq('is_urgent_unbudgeted', true),
    db.from('memoria_mandates').select('*'),
    db.from('profiles').select('id, full_name, role, status, language, memoria_email').eq('role', 'board'),
  ]);
  const err = [tasks, obligations, contracts, meetings, invoices, mandates, profiles].find((r) => r.error);
  if (err) throw new Error(err.error.message);
  return {
    tasks: tasks.data,
    obligations: obligations.data,
    contracts: contracts.data,
    meetings: meetings.data,
    invoices: invoices.data,
    mandates: mandates.data,
    profiles: profiles.data,
  };
}

// Odošle e-maily cez Resend (dávky po 100). Vráti počet úspešne odoslaných.
export async function sendEmails(payloads) {
  let sent = 0;
  for (let i = 0; i < payloads.length; i += 100) {
    const batch = payloads.slice(i, i + 100).map((p) => ({
      from: `${brandConfig.name} · Memoria <${brandConfig.senderEmail}>`,
      to: [p.to],
      subject: p.subject,
      html: p.html,
      text: p.text,
    }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
    else console.error('memoria digest send failed', res.status, await res.text().catch(() => ''));
  }
  return sent;
}
