import { getAuthedProfile, listAllUsers } from '../../../lib/serverAuth';

export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { profile, user, adminClient } = auth;

    if (profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { postId } = await request.json();
    if (!postId) {
      return Response.json({ error: 'Missing postId' }, { status: 400 });
    }

    // Look the post up ourselves - never trust title/authorId/groupId from the client.
    const { data: post } = await adminClient
      .from('posts')
      .select('id, title, author_id, interest_group_id')
      .eq('id', postId)
      .single();

    if (!post || !post.interest_group_id || post.author_id !== user.id) {
      return Response.json({ error: 'Invalid post' }, { status: 400 });
    }

    const groupId = post.interest_group_id;

    const { data: members } = await adminClient
      .from('interest_group_members')
      .select('user_id, notify_email, profiles(notifications_enabled)')
      .eq('group_id', groupId);

    const { data: group } = await adminClient
      .from('interest_groups')
      .select('name_en, slug')
      .eq('id', groupId)
      .single();

    const memberIds = (members || [])
      .filter((m) => m.notify_email !== false && m.profiles?.notifications_enabled !== false)
      .map((m) => m.user_id)
      .filter((id) => id !== post.author_id);

    if (memberIds.length === 0 || !process.env.RESEND_API_KEY) {
      return Response.json({ skipped: true });
    }

    const users = await listAllUsers(adminClient);
    const emails = users
      .filter((u) => memberIds.includes(u.id))
      .map((u) => u.email)
      .filter(Boolean);

    if (emails.length === 0) {
      return Response.json({ skipped: true });
    }

    const replyTo = `post-${post.id}@kareipixai.resend.app`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mi Hacienda <noreply@myhumandesign.sk>',
        to: emails,
        reply_to: replyTo,
        subject: `New post in ${group?.name_en || 'your group'} — Mi Hacienda`,
        html: `
          <h2>${post.title}</h2>
          <p>A new post was shared in the "${group?.name_en || 'group'}" group you've joined.</p>
          <p>Open the app to read it and reply.</p>
          <p>You can also just reply directly to this email — your reply will be posted as a comment on the forum.</p>
        `,
      }),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
