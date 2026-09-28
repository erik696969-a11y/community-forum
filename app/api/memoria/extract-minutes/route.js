// Memoria — AI prečíta zápisnicu zasadnutia a navrhne body, rozhodnutia, úlohy s termínmi
// a zmeny stavu existujúcich úloh. Nič neukladá: návrh skontroluje a potvrdí board.
//
// Vstup:  { path: 'inbox/<uuid>/<file>' } (PDF, foto, Word .docx, .txt) alebo { text }, a { lang }
// Výstup: { proposal }  (pozri lib/memoriaMinutes.js)

import { getAuthedProfile } from '../../../../lib/serverAuth';
import { MINUTES_TOOL, MAX_TEXT_CHARS, buildContext, normalizeProposal } from '../../../../lib/memoriaMinutes';
import { docxToText } from '../../../../lib/docxText';

export const maxDuration = 120;

const MODELS = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const MAX_BYTES = 15 * 1024 * 1024;
const DAILY_LIMIT = 40;
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' };
const OPEN = ['not_started', 'in_progress', 'blocked'];

function mediaTypeFor(path, contentType) {
  const p = path.toLowerCase();
  if (contentType && contentType !== 'application/octet-stream') return contentType;
  if (p.endsWith('.pdf')) return 'application/pdf';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.role !== 'board' || auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI is not configured' }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const outLang = LANG_NAMES[body.lang] || 'English';
    const path = typeof body.path === 'string' ? body.path : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!path && !text) return Response.json({ error: 'Nothing to read' }, { status: 400 });
    if (path && !/^inbox\/[0-9a-f-]{36}\/[^/]+$/i.test(path)) return Response.json({ error: 'Invalid file path' }, { status: 400 });
    if (text.length > MAX_TEXT_CHARS) return Response.json({ error: 'too_large' }, { status: 400 });

    const { data: allowed, error: rlError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-extract-minutes',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    let docPart;
    if (path) {
      const { data: blob, error: dlError } = await auth.adminClient.storage.from('memoria').download(path);
      if (dlError || !blob) return Response.json({ error: 'download_failed' }, { status: 400 });
      if (blob.size > MAX_BYTES) return Response.json({ error: 'too_large' }, { status: 400 });
      const buffer = Buffer.from(await blob.arrayBuffer());
      if (/\.docx$/i.test(path)) {
        const docText = await docxToText(buffer).catch(() => '');
        if (!docText) return Response.json({ error: 'unsupported_type' }, { status: 400 });
        docPart = { type: 'text', text: `<minutes>\n${docText.slice(0, MAX_TEXT_CHARS)}\n</minutes>` };
      } else if (/\.(txt|md)$/i.test(path)) {
        docPart = { type: 'text', text: `<minutes>\n${buffer.toString('utf8').slice(0, MAX_TEXT_CHARS)}\n</minutes>` };
      } else {
        const mediaType = mediaTypeFor(path, blob.type);
        if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) return Response.json({ error: 'unsupported_type' }, { status: 400 });
        const source = { type: 'base64', media_type: mediaType, data: buffer.toString('base64') };
        docPart = mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
      }
    } else {
      docPart = { type: 'text', text: `<minutes>\n${text}\n</minutes>` };
    }

    // Čo už v Memorii je – aby AI vedela priradiť body k existujúcim úlohám, dodávateľom a zákazkám.
    const db = auth.adminClient;
    const [tRes, sRes, zRes, cRes] = await Promise.all([
      db.from('memoria_tasks').select('id, title, due_date, status').in('status', OPEN).order('due_date', { ascending: true, nullsFirst: false }).limit(150),
      db.from('memoria_suppliers').select('id, name').order('name').limit(300),
      db.from('memoria_tenders').select('id, title, status').eq('status', 'collecting').limit(100),
      db.from('memoria_contracts').select('id, subject, ends_on').eq('status', 'active').limit(150),
    ]);
    const context = buildContext({ tasks: tRes.data || [], suppliers: sRes.data || [], tenders: zRes.data || [], contracts: cRes.data || [] });

    const system = [
      'You read the minutes (acta) of meetings of the board (Junta Directiva) or the general meeting (Junta General) of a residential community of owners in Benahavís, Spain.',
      'Minutes may be in English or Spanish. Dates are day/month/year.',
      'Report only what the minutes say. Keep every agenda point. Record a decision only where the minutes record one.',
      'Record every action that someone must carry out, with who and by when. Resolutions are executed by the administrator unless the minutes name someone else.',
      'Link points and actions to the existing Memoria records below only when the minutes clearly refer to the same thing.',
      'If the minutes report progress on an existing task (T-reference), record it in task_updates.',
      'Do not name individual owners in summaries; roles (president, administrator, board member, site manager) are fine.',
      `Write all free text in ${outLang}.`,
      'Do not judge or recommend anything. Always answer by calling the tool exactly once.',
      '',
      'Existing Memoria records:',
      context.text || '(none)',
    ].join('\n');

    let json = null;
    for (const model of MODELS) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 12000,
          system,
          tools: [MINUTES_TOOL],
          tool_choice: { type: 'tool', name: MINUTES_TOOL.name },
          messages: [{ role: 'user', content: [docPart, { type: 'text', text: 'Read these minutes.' }] }],
        }),
      });
      if (res.ok) {
        json = await res.json();
        break;
      }
      console.error('extract-minutes API error', model, res.status, await res.text().catch(() => ''));
      if (![400, 403, 404, 529].includes(res.status)) break;
    }
    if (!json) return Response.json({ error: 'AI request failed' }, { status: 502 });
    const toolUse = (json.content || []).find((c) => c.type === 'tool_use');
    if (!toolUse) return Response.json({ error: 'AI request failed' }, { status: 502 });
    return Response.json({ proposal: normalizeProposal(toolUse.input, context.refs) });
  } catch (e) {
    console.error('extract-minutes error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
