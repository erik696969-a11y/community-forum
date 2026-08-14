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

// Supabase's listUsers() is paginated (default 50/page). Relying on just the
// first page silently drops users/notifications once the community grows
// past that limit - this fetches every page until exhausted.
export async function listAllUsers(adminClient) {
  const allUsers = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  return allUsers;
}
