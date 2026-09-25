// Spoločná časová os lehôt (Kalendár, Prehľad, Odovzdávací balík).
// Iba počíta dátumy zo záznamov; nič nerozhoduje.

import { mt, todayIso, addDaysIso, addMonthsIso, RECURRENCE_MONTHS, INVITATION_LEAD_DAYS } from '../../../lib/memoriaI18n';
import { noticeDeadline } from './ContractsPanel';

// Lehoty zo stanov a zákona odvodené zo zasadnutí.
export function statutoryDeadlines(meetings, lang) {
  const out = [];
  for (const m of meetings) {
    if (m.status === 'cancelled') continue;
    const isGeneral = m.body !== 'board';
    if (m.status === 'planned') {
      const lead = INVITATION_LEAD_DAYS[m.body] || 8;
      const invitationBy = addDaysIso(m.meeting_on, -lead);
      if (!m.invitation_sent_on) {
        out.push({
          date: invitationBy,
          kind: 'statutory',
          meetingId: m.id,
          type: 'invitation',
          text: mt(lang, isGeneral ? 'dl_invitation_general' : 'dl_invitation_board', { name: m.title }),
          isDemo: m.is_demo,
        });
        if (isGeneral) {
          out.push({
            date: addDaysIso(invitationBy, -7),
            kind: 'statutory',
            meetingId: m.id,
            type: 'agenda',
            text: mt(lang, 'dl_agenda', { name: m.title }),
            isDemo: m.is_demo,
          });
        }
      }
      if (m.body === 'general_ordinary') {
        out.push({
          date: addDaysIso(m.meeting_on, -56),
          kind: 'statutory',
          meetingId: m.id,
          type: 'budget',
          text: mt(lang, 'dl_budget', { name: m.title }),
          isDemo: m.is_demo,
        });
      }
    }
    if (m.status === 'held' && isGeneral && !m.minutes_closed_on) {
      out.push({
        date: addDaysIso(m.meeting_on, 10),
        kind: 'statutory',
        meetingId: m.id,
        type: 'minutes',
        text: mt(lang, 'dl_minutes', { name: m.title }),
        isDemo: m.is_demo,
      });
    }
  }
  return out;
}


// Zoznam položiek {date, kind, text, sub, tab, isDemo, projected} zoradený podľa dátumu.
// Obsahuje aj položky po termíne (date < dnes). Horizont = počet mesiacov dopredu.
export function buildTimeline({ obligations = [], meetings = [], tasks = [], contracts = [] }, lang, months = 12) {
  const today = todayIso();
  const horizon = addMonthsIso(today, months);
  const items = [];

  for (const o of obligations) {
    if (!o.active) continue;
    const step = RECURRENCE_MONTHS[o.recurrence];
    let date = o.next_due_on;
    let first = true;
    // Opakované povinnosti premietneme dopredu (mesačné iba najbližší termín, aby os nezahltili).
    while (date <= horizon) {
      items.push({
        date,
        kind: 'obligation',
        text: o.title,
        sub: [mt(lang, `obligationCategory_${o.category}`), o.responsible_name].filter(Boolean).join(' · '),
        tab: 'calendar',
        isDemo: o.is_demo,
        projected: !first,
      });
      first = false;
      if (!step || step < 3) break;
      date = addMonthsIso(date, step);
    }
  }
  for (const d of statutoryDeadlines(meetings, lang)) {
    if (d.date <= horizon) items.push({ ...d, tab: 'meetings' });
  }
  for (const t of tasks) {
    if (t.due_date && t.due_date <= horizon) items.push({ date: t.due_date, kind: 'task', text: t.title, tab: 'tasks', isDemo: t.is_demo });
  }
  for (const c of contracts) {
    const notice = noticeDeadline(c);
    if (notice && notice >= addDaysIso(today, -30) && notice <= horizon) {
      items.push({ date: notice, kind: 'contract', text: mt(lang, 'dl_contract_notice', { name: c.subject }), tab: 'contracts', isDemo: c.is_demo });
    }
    if (c.ends_on && c.ends_on >= addDaysIso(today, -30) && c.ends_on <= horizon) {
      items.push({ date: c.ends_on, kind: 'contract', text: mt(lang, 'dl_contract_end', { name: c.subject }), tab: 'contracts', isDemo: c.is_demo });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}
