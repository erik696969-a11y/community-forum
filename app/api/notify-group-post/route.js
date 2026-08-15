import { getAuthedProfile, listAllUsers } from '../../../lib/serverAuth';
import { buildReplyToAddress } from '../../../lib/emailReplyToken';

// Resend batch endpoint accepts at most 100 emails per call.
const BATCH_SIZE = 100;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

    console.log(`[notify-group-post] post=${post.id} group=${groupId} totalMembers=${(members || []).length} eligibleMemberIds=${memberIds.length}`);

    if (memberIds.length === 0 || !process.env.RESEND_API_KEY) {
      console.log(`[notify-group-post] skipping: memberIds=${memberIds.length} hasApiKey=${!!process.env.RESEND_API_KEY}`);
      return Response.json({ skipped: true, memberIds: memberIds.length, hasApiKey: !!process.env.RESEND_API_KEY });
    }

    const users = await listAllUsers(adminClient);
    const recipients = users
      .filter((u) => memberIds.includes(u.id) && u.email)
      .map((u) => ({ id: u.id, email: u.email }));

    console.log(`[notify-group-post] totalAuthUsers=${users.length} recipients=${recipients.length}`);

    if (recipients.length === 0) {
      console.log('[notify-group-post] skipping: no matching auth users with email for memberIds', memberIds);
      return Response.json({ skipped: true, memberIds: memberIds.length, recipients: 0 });
    }

    // Bezpečnostný backlog #2: každý príjemca dostane VLASTNÝ e-mail (nie
    // spoločný "to" zoznam - to by odhalilo e-mailové adresy všetkých
    // ostatných) a VLASTNÚ, kryptograficky podpísanú reply-to adresu, takže
    // odpoveď na e-mail sa dá spoľahlivo priradiť presne tomuto členovi.
    const emailPayloads = recipients.map((r) => ({
      from: 'Mi Hacienda <noreply@myhumandesign.sk>',
      to: [r.email],
      reply_to: buildReplyToAddress(post.id, r.id),
      subject: `New post in ${group?.name_en || 'your group'} — Mi Hacienda`,
      html: `
        <h2>${post.title}</h2>
        <p>A new post was shared in the "${group?.name_en || 'group'}" group you've joined.</p>
        <p>Open the app to read it and reply.</p>
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
        console.error(`[notify-group-post] Resend batch send FAILED: status=${resendRes.status} body=${resendBody}`);
      } else {
        console.log(`[notify-group-post] Resend batch send OK: status=${resendRes.status} count=${batch.length} body=${resendBody}`);
        sentCount += batch.length;
      }
    }

    return Response.json({ success: true, sent: sentCount, attempted: emailPayloads.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
