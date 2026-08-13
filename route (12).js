import { createClient } from '@supabase/supabase-js';

// Official Board announcements are important enough that they bypass the
// per-user notification on/off toggle (unlike interest-group broadcasts).
export async function POST(request) {
  try {
    const { title, authorId, postId } = await request.json();

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: approvedProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .eq('status', 'approved');

    const recipientIds = (approvedProfiles || [])
      .map((p) => p.id)
      .filter((id) => id !== authorId);

    if (recipientIds.length === 0 || !process.env.RESEND_API_KEY) {
      return Response.json({ skipped: true });
    }

    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const emails = users
      .filter((u) => recipientIds.includes(u.id))
      .map((u) => u.email)
      .filter(Boolean);

    if (emails.length === 0) {
      return Response.json({ skipped: true });
    }

    const replyTo = postId ? `post-${postId}@kareipixai.resend.app` : undefined;

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
        subject: `📢 ${title} — Mi Hacienda`,
        html: `
          <h2>📢 Official Announcement</h2>
          <p><strong>${title}</strong></p>
          <p>Open the app to read the full announcement.</p>
          ${replyTo ? '<p>You can also just reply directly to this email — your reply will be posted as a comment on the forum.</p>' : ''}
        `,
      }),
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
