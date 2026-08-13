import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return Response.json({ error: 'Missing email' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Find the profile that was just created for this email
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const newUser = users.find((u) => u.email === email);

    if (!newUser) {
      return Response.json({ skipped: true });
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', newUser.id)
      .single();

    if (!profile || profile.status !== 'pending') {
      // Not a fresh pending registration — don't notify
      return Response.json({ skipped: true });
    }

    // Only notify if this profile was created very recently (a genuine new signup,
    // not a repeated login attempt by someone still waiting on approval)
    const createdAt = new Date(profile.created_at).getTime();
    const isRecent = Date.now() - createdAt < 3 * 60 * 1000; // 3 minutes

    if (!isRecent) {
      return Response.json({ skipped: true });
    }

    // Find approved board members' email addresses
    const { data: boardProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'board')
      .eq('status', 'approved')
      .neq('notifications_enabled', false);

    const boardIds = new Set((boardProfiles || []).map((p) => p.id));
    const boardEmails = users
      .filter((u) => boardIds.has(u.id))
      .map((u) => u.email)
      .filter(Boolean);

    if (boardEmails.length === 0 || !process.env.RESEND_API_KEY) {
      return Response.json({ skipped: true });
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mi Hacienda <noreply@myhumandesign.sk>',
        to: boardEmails,
        subject: 'New registration request — Mi Hacienda',
        html: `
          <h2>New registration request</h2>
          <p><strong>${profile.full_name}</strong> (apartment ${profile.apartment_number}) has requested access to the forum.</p>
          <p>Please review and approve or reject this request in the Admin section of the app.</p>
        `,
      }),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
