import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return Response.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    // Verify the requester using their own access token (anon key client)
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Delete the account using the service role key (server-side only, never exposed to the browser)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);

    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
