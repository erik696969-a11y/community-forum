import { getAuthedProfile } from '../../../../lib/serverAuth';

// Lets a resident mark an AI answer as helpful/unhelpful. Only the user who
// asked the original question can set feedback on their own log row - this
// is enforced by matching user_id, not just relying on RLS, since writes
// here go through the service-role client.
export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { logId, feedback } = await request.json();
    if (!logId || (feedback !== 'up' && feedback !== 'down')) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: row } = await auth.adminClient
      .from('ai_query_log')
      .select('id, user_id')
      .eq('id', logId)
      .single();

    if (!row || row.user_id !== auth.user.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    await auth.adminClient.from('ai_query_log').update({ feedback }).eq('id', logId);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
