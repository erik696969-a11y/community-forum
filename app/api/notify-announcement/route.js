import { getAuthedProfile, listAllUsers } from '../../../lib/serverAuth';
import { buildReplyToAddress } from '../../../lib/emailReplyToken';

// Resend batch endpoint accepts at most 100 emails per call.
const BATCH_SIZE = 100;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Official Board announcements are important enough that they bypass the
// per-user notification on/off toggle (unlike interest-group broadcasts).
export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { profile, adminClient } = auth;

    if (profile.role !== 'board' || profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { postId } = await request.json();
    if (!postId) {
      return Response.json({ error: 'Missing postId' }, { status: 400 });
    }

    // Never trust title/authorId from the client - look the post up ourselves,
    // and confirm it actually belongs to a board-only (Announcements) category.
    const { data: post } = await adminClient
      .from('posts')
      .select('id, title, author_id, category_id, categories(board_only)')
      .eq('id', postId)
      .single();

    if (!post || !post.categories?.board_only) {
      return Response.json({ error: 'Not an announcement post' }, { status: 400 });
    }

    const { data: approvedProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .eq('status', 'approved');

    const recipientIds = (approvedProfiles || [])
      .map((p) => p.id)
      .filter((id) => id !== post.author_id);

    if (recipientIds.length === 0 || !process.env.RESEND_API_KEY) {
      return Response.json({ skipped: true });
    }

    const users = await listAllUsers(adminClient);
    const recipients = users
      .filter((u) => recipientIds.includes(u.id) && u.email)
      .map((u) => ({ id: u.id, email: u.email }));

    if (recipients.length === 0) {
      return Response.json({ skipped: true });
    }

    const emailPayloads = recipients.map((r) => ({
      from: 'Mi Hacienda <noreply@myhumandesign.sk>',
      to: [r.email],
      reply_to: buildReplyToAddress(post.id, r.id),
      subject: `📢 ${post.title} — Mi Hacienda`,
      html: `
        <h2>📢 Official Announcement</h2>
        <p><strong>${post.title}</strong></p>
        <p>Open the app to read the full announcement.</p>
        <p>You can also just reply directly to this email — your reply will be posted as a comment on the forum.</p>
      `,
    }));

    for (const batch of chunk(emailPayloads, BATCH_SIZE)) {
      await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
