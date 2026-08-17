import { getAuthedProfile, listAllUsers } from '../../../lib/serverAuth';
import { buildReplyToAddresses } from '../../../lib/emailReplyToken';
import { escapeHtml } from '../../../lib/htmlEscape';

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

    console.log(`[notify-announcement] post=${post.id} totalApproved=${(approvedProfiles || []).length} recipientIds=${recipientIds.length}`);

    if (recipientIds.length === 0 || !process.env.RESEND_API_KEY) {
      console.log(`[notify-announcement] skipping: recipientIds=${recipientIds.length} hasApiKey=${!!process.env.RESEND_API_KEY}`);
      return Response.json({ skipped: true, recipientIds: recipientIds.length, hasApiKey: !!process.env.RESEND_API_KEY });
    }

    const users = await listAllUsers(adminClient);
    const recipients = users
      .filter((u) => recipientIds.includes(u.id) && u.email)
      .map((u) => ({ id: u.id, email: u.email }));

    console.log(`[notify-announcement] totalAuthUsers=${users.length} recipients=${recipients.length}`);

    if (recipients.length === 0) {
      console.log('[notify-announcement] skipping: no matching auth users with email for recipientIds', recipientIds);
      return Response.json({ skipped: true, recipientIds: recipientIds.length, recipients: 0 });
    }

    const replyToMap = await buildReplyToAddresses(adminClient, post.id, recipients.map((r) => r.id));

    const emailPayloads = recipients.map((r) => ({
      from: 'Mi Hacienda <noreply@myhumandesign.sk>',
      to: [r.email],
      reply_to: replyToMap.get(r.id),
      subject: `📢 ${post.title} — Mi Hacienda`,
      html: `
        <h2>📢 Official Announcement</h2>
        <p><strong>${escapeHtml(post.title)}</strong></p>
        <p>Open the app to read the full announcement.</p>
        <p>You can also just reply directly to this email — your reply will be posted as a comment on the forum.</p>
      `,
    }));

    let sentCount = 0;
    for (const batch of chunk(emailPayloads, BATCH_SIZE)) {
      const resendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const resendBody = await resendRes.text();

      if (!resendRes.ok) {
        console.error(`[notify-announcement] Resend batch send FAILED: status=${resendRes.status} body=${resendBody}`);
      } else {
        console.log(`[notify-announcement] Resend batch send OK: status=${resendRes.status} count=${batch.length} body=${resendBody}`);
        sentCount += batch.length;
      }
    }

    return Response.json({ success: true, sent: sentCount, attempted: emailPayloads.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
