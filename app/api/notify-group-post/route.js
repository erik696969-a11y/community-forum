import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { groupId, title, authorId } = await request.json();

    if (!groupId) {
      return Response.json({ error: 'Missing groupId' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: members } = await adminClient
      .from('interest_group_members')
      .select('user_id, profiles(notifications_enabled)')
      .eq('group_id', groupId);

    const { data: group } = await adminClient
      .from('interest_groups')
      .select('name_en, slug')
      .eq('id', groupId)
      .single();

    const memberIds = (members || [])
      .filter((m) => m.profiles?.notifications_enabled !== false)
      .map((m) => m.user_id)
      .filter((id) => id !== authorId);

    if (memberIds.length === 0) {
      return Response.json({ skipped: true });
    }

    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const emails = users
      .filter((u) => memberIds.includes(u.id))
      .map((u) => u.email)
      .filter(Boolean);

    if (emails.length === 0 || !process.env.RESEND_API_KEY) {
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
        to: emails,
        subject: `New post in ${group?.name_en || 'your group'} — Mi Hacienda`,
        html: `
          <h2>${title}</h2>
          <p>A new post was shared in the "${group?.name_en || 'group'}" group you've joined.</p>
          <p>Open the app to read it and reply.</p>
        `,
      }),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
