import { createClient } from '@supabase/supabase-js';

// Verifies the caller's Supabase access token (sent from the client as
// "Authorization: Bearer <token>") and returns their profile row.
// Returns null if the token is missing/invalid or no profile exists.
export async function getAuthedProfile(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profile } = await adminClient.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return null;

  return { user, profile, adminClient };
}
