import { supabase } from './supabaseClient';

// Bezpečnostný backlog #1: nahrádza priame "author:profiles(...)" joiny,
// ktoré cez anon-key klienta umožňovali natiahnuť VŠETKY stĺpce profilu.
// Namiesto toho voláme SECURITY DEFINER RPC, ktorá vracia len
// { id, full_name, apartment_number, badges } pre schválených členov.
//
// Použitie:
//   const rows = await fetchRows(); // posts/comments/... BEZ embedded joinu
//   const authorMap = await fetchAuthorProfiles(rows.map(r => r.author_id));
//   const withAuthors = rows.map(r => ({ ...r, author: authorMap.get(r.author_id) || null }));

export async function fetchAuthorProfiles(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  const map = new Map();
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase.rpc('get_author_profiles', { p_ids: uniqueIds });
  if (error) {
    console.error('fetchAuthorProfiles error:', error);
    return map;
  }
  (data || []).forEach((row) => map.set(row.id, row));
  return map;
}

// Pripojí .author (alebo custom kľúč) ku každému riadku na základe idField.
export function attachAuthors(rows, authorMap, { idField = 'author_id', asField = 'author' } = {}) {
  return (rows || []).map((row) => ({
    ...row,
    [asField]: authorMap.get(row[idField]) || null,
  }));
}
