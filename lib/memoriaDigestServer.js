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
  const [tasks, obligations, contracts, meetings, invoices, mandates, profiles, cases] = await Promise.all([
    db.from('memoria_tasks').select('title, due_date, status, is_demo'),
    db.from('memoria_obligations').select('title, next_due_on, remind_days, active, is_demo'),
    db.from('memoria_contracts').select('subject, ends_on, auto_renew, notice_period_days, status, is_demo'),
    db.from('memoria_meetings').select('title, body, meeting_on, status, invitation_sent_on, minutes_closed_on, is_demo'),
    db.from('memoria_invoices').select('invoice_number, description, is_urgent_unbudgeted, ratified_by_decision_id, is_demo').eq('is_urgent_unbudgeted', true),
    db.from('memoria_mandates').select('*'),
    db.from('profiles').select('id, full_name, role, status, language, memoria_email').eq('role', 'board'),
    db.from('memoria_cases').select('title, status, next_step, next_step_due, is_demo'),
  ]);
  const err = [tasks, obligations, contracts, meetings, invoices, mandates, profiles, cases].find((r) => r.error);
  if (err) throw new Error(err.error.message);
  return {
    tasks: tasks.data,
    obligations: obligations.data,
    contracts: contracts.data,
    meetings: meetings.data,
    invoices: invoices.data,
    mandates: mandates.data,
    profiles: profiles.data,
    cases: cases.data,
  };
}

async function fetchAll(db, table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function loadMonthlyData(db) {
  const [decisions, tasks, invoices, meetings, cases, imports, budgets, budgetLines, reserveMovements, suppliers] = await Promise.all([
    fetchAll(db, 'memoria_decisions', 'title, decided_on, is_demo'),
    fetchAll(db, 'memoria_tasks', 'title, status, due_date, completed_on, is_demo'),
    fetchAll(db, 'memoria_invoices', 'supplier_id, invoice_date, total_amount, category, funding_source, is_demo'),
    fetchAll(db, 'memoria_meetings', 'title, status, meeting_on, is_demo'),
    fetchAll(db, 'memoria_cases', 'status, amount_claimed, opened_on, closed_on, is_demo'),
    fetchAll(db, 'memoria_imports', 'file_name, rows_imported, created_at, is_demo'),
    fetchAll(db, 'memoria_budgets', '*'),
    fetchAll(db, 'memoria_budget_lines', '*'),
    fetchAll(db, 'memoria_reserve_movements', '*'),
    fetchAll(db, 'memoria_suppliers', 'id, name'),
  ]);
  return { decisions, tasks, invoices, meetings, cases, imports, budgets, budgetLines, reserveMovements, suppliers };
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
