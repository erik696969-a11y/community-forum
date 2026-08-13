'use client';

import { supabase } from './supabaseClient';

export async function markSeen(scope) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return;
  await supabase.from('last_seen').upsert(
    { user_id: userId, scope, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_id,scope' }
  );
}

export async function getLastSeenMap(scopes) {
  if (!scopes || scopes.length === 0) return {};
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return {};
  const { data } = await supabase
    .from('last_seen')
    .select('scope, last_seen_at')
    .eq('user_id', userId)
    .in('scope', scopes);
  const map = {};
  (data || []).forEach((row) => {
    map[row.scope] = row.last_seen_at;
  });
  return map;
}
