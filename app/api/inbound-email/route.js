import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

import { listAllUsers } from '../../../lib/serverAuth';

const resend = new Resend(process.env.RESEND_API_KEY);

// Best-effort removal of quoted "reply chain" text, so only the person's
// new reply becomes the comment — not their entire email history.
// This is a heuristic and won't be 100% perfect for every email client.
function stripQuotedText(text) {
  if (!text) return '';
  let cut = text;

  const cutMarkers = [
    /\n[^\n]{0,40}\bwrote:\s*$/im,      // "On Mon, ... X wrote:"
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nFrom:\s.*(\n|$)/i,
    /\n>.*/s,                          // classic ">" quoted lines onward
  ];

  for (const marker of cutMarkers) {
    const match = cut.match(marker);
    if (match && typeof match.index === 'number') {
      cut = cut.slice(0, match.index);
    }
  }

  return cut.trim();
}

export async function POST(request) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function log(fields) {
    try {
      await adminClient.from('inbound_email_log').insert(fields);
    } catch (e) {
      // logging must never crash the webhook
    }
  }

  try {
    const payload = await request.text();

    let event;
    try {
      event = resend.webhooks.verify({
        payload,
        headers: {
          id: request.headers.get('svix-id'),
          timestamp: request.headers.get('svix-timestamp'),
          signature: request.headers.get('svix-signature'),
        },
        webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
      });
    } catch (verifyError) {
      await log({ status: `signature_invalid: ${String(verifyError?.message || verifyError).slice(0, 150)}` });
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (event.type !== 'email.received') {
      return Response.json({ skipped: true });
    }

    const { data: email } = await resend.emails.receiving.get(event.data.email_id);

    const toAddress =
      (email?.to && email.to[0]) ||
      (event.data.received_for && event.data.received_for[0]) ||
      '';
    const match = toAddress.match(/post-([a-f0-9-]+)@/i);

    if (!match) {
      await log({ resend_email_id: event.data.email_id, sender_email: email?.from, status: 'no_post_match' });
      return Response.json({ skipped: true });
    }

    const postId = match[1];
    const senderEmail = (email?.from || '').toLowerCase().match(/[^<\s]+@[^>\s]+/)?.[0] || '';

    const users = await listAllUsers(adminClient);
    const matchedUser = users.find((u) => u.email?.toLowerCase() === senderEmail);

    if (!matchedUser) {
      await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'unknown_sender' });
      return Response.json({ skipped: true });
    }

    const { data: senderProfile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', matchedUser.id)
      .single();

    if (!senderProfile || senderProfile.status !== 'approved') {
      await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'not_approved' });
      return Response.json({ skipped: true });
    }

    if (senderProfile.muted) {
      await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'muted' });
      return Response.json({ skipped: true });
    }

    const { data: postRow } = await adminClient.from('posts').select('locked').eq('id', postId).single();
    if (postRow?.locked) {
      await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'post_locked' });
      return Response.json({ skipped: true });
    }

    const rawText = email?.text || '';
    const replyText = stripQuotedText(rawText).slice(0, 5000);

    if (!replyText) {
      await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'empty_after_strip' });
      return Response.json({ skipped: true });
    }

    // Note: email-originated replies are stored in the sender's own language,
    // without automatic translation (unlike replies made inside the app).
    const { error: insertError } = await adminClient.from('comments').insert({
      post_id: postId,
      author_id: matchedUser.id,
      content: replyText,
      original_lang: senderProfile.language || 'en',
      content_translations: {},
    });

    if (insertError) {
      await log({
        resend_email_id: event.data.email_id,
        post_id: postId,
        sender_email: senderEmail,
        status: `insert_failed: ${insertError.message}`.slice(0, 200),
      });
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    await log({ resend_email_id: event.data.email_id, post_id: postId, sender_email: senderEmail, status: 'success' });

    return Response.json({ success: true });
  } catch (error) {
    await log({ status: 'error', sender_email: String(error?.message || error).slice(0, 200) });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
