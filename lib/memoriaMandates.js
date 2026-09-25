// Mandáty boardu: spoločná logika pre obrazovku, upozornenia a e-maily.
// Iba fakty zo záznamov — o prístupe rozhoduje board.

export const MANDATE_POSITIONS = ['president', 'vice_president', 'board_member', 'administrator', 'other'];
// Funkcie, ktoré majú prístup do Memorie (administrátor je externý).
export const BOARD_POSITIONS = ['president', 'vice_president', 'board_member'];
export const MANDATE_ENDING_WINDOW_DAYS = 60;

export function mandateEnd(m) {
  return m.ended_on || m.ends_on || null;
}

// Stav mandátu k dátumu 'YYYY-MM-DD': 'future' | 'current' | 'past'.
export function mandateState(m, today) {
  if (m.starts_on && m.starts_on > today) return 'future';
  const end = mandateEnd(m);
  if (end && end < today) return 'past';
  return 'current';
}

function addDays(iso, days) {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

// Kontroly mandátov. profiles = účty s rolou (id, full_name, role, status).
// Výsledok: [{ kind: 'ending' | 'leftover_access' | 'no_mandate', name, position, date, profileId, mandateId, isDemo }]
export function mandateChecks(mandates, profiles, today) {
  const out = [];
  const list = mandates || [];
  const boardProfiles = (profiles || []).filter((p) => p.role === 'board' && p.status === 'approved');
  const currentByProfile = new Set(
    list.filter((m) => m.profile_id && mandateState(m, today) === 'current' && BOARD_POSITIONS.includes(m.position)).map((m) => m.profile_id)
  );

  for (const m of list) {
    const state = mandateState(m, today);
    const end = mandateEnd(m);
    if (state === 'current' && end && end <= addDays(today, MANDATE_ENDING_WINDOW_DAYS)) {
      out.push({ kind: 'ending', name: m.person_name, position: m.position, date: end, profileId: m.profile_id, mandateId: m.id, isDemo: Boolean(m.is_demo) });
    }
    if (state === 'past' && m.profile_id && !currentByProfile.has(m.profile_id)) {
      const p = boardProfiles.find((bp) => bp.id === m.profile_id);
      if (p) out.push({ kind: 'leftover_access', name: m.person_name, position: m.position, date: end, profileId: m.profile_id, mandateId: m.id, isDemo: Boolean(m.is_demo) });
    }
  }

  for (const p of boardProfiles) {
    if (currentByProfile.has(p.id)) continue;
    if (out.some((o) => o.kind === 'leftover_access' && o.profileId === p.id)) continue;
    out.push({ kind: 'no_mandate', name: p.full_name || '—', position: null, date: null, profileId: p.id, mandateId: null, isDemo: false });
  }
  return out;
}
