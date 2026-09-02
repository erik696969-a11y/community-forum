import { getAuthedProfile } from '../../../lib/serverAuth';
import { escapeHtml } from '../../../lib/htmlEscape';
import { brandConfig } from '../../../lib/brandConfig';

const MAX_DESCRIPTION_LENGTH = 3000;
const MAX_PAGE_URL_LENGTH = 500;

// Lets any approved resident report a technical problem with the app
// itself (bug, confusing screen, broken feature) - distinct from
// community incident reports (leaks, noise, etc), which go through the
// AI Assistant / forum instead. This exists specifically so problems
// with the app have somewhere to go other than getting lost - see the
// discussion that led to this route.
//
// Sent via Resend (same pattern as notify-announcement/route.js) to a
// single fixed recipient - the developer/technical contact, configured
// via APP_SUPPORT_EMAIL - not the community Administrator, since app
// bugs are a different kind of problem than building/community issues.
export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.status !== 'approved') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    // Client-supplied context (current page, browser) - purely diagnostic,
    // never trusted for anything security-relevant, just shown as-is
    // (escaped) to help reproduce the problem.
    const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, MAX_PAGE_URL_LENGTH) : '';
    const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, MAX_PAGE_URL_LENGTH) : '';

    if (!description) return Response.json({ error: 'Description is required' }, { status: 400 });
    if (description.length > MAX_DESCRIPTION_LENGTH) return Response.json({ error: 'Description is too long' }, { status: 400 });

    if (!process.env.RESEND_API_KEY || !process.env.APP_SUPPORT_EMAIL) {
      console.error('report-issue: missing RESEND_API_KEY or APP_SUPPORT_EMAIL - cannot send report', {
        hasResendKey: !!process.env.RESEND_API_KEY,
        hasSupportEmail: !!process.env.APP_SUPPORT_EMAIL,
      });
      return Response.json({ error: 'Reporting is not configured yet. Please contact the Administrator directly.' }, { status: 500 });
    }

    const reporterName = auth.profile.full_name || 'Unknown resident';
    const reporterApartment = auth.profile.apartment_number || 'unknown apartment';
    const reporterEmail = auth.user.email || 'unknown email';
    const submittedAt = new Date().toISOString();

    const emailPayload = {
      from: `${brandConfig.name} <${brandConfig.senderEmail}>`,
      to: [process.env.APP_SUPPORT_EMAIL],
      reply_to: auth.user.email || undefined,
      subject: `🛠️ App issue report from ${reporterName}`,
      html: `
        <h2>🛠️ App Issue Report</h2>
        <p><strong>${escapeHtml(reporterName)}</strong> (apartment ${escapeHtml(reporterApartment)}, ${escapeHtml(reporterEmail)})</p>
        <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        ${pageUrl ? `<p><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>` : ''}
        ${userAgent ? `<p><strong>Browser:</strong> ${escapeHtml(userAgent)}</p>` : ''}
        <hr />
        <p><strong>Description:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(description)}</p>
      `,
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('report-issue: Resend send failed:', resendRes.status, errText);
      return Response.json({ error: 'Failed to send report. Please try again or contact the Administrator directly.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('report-issue unexpected error:', error);
    return Response.json({ error: 'Failed to send report. Please try again or contact the Administrator directly.' }, { status: 500 });
  }
}
