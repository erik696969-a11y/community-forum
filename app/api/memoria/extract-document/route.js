// Memoria — AI prečíta jednu zmluvu alebo jednu faktúru (PDF / foto) a vráti návrh údajov.
// Nič neukladá: údaje sa predvyplnia do formulára, člen boardu ich skontroluje a uloží.
//
// Vstup:  { kind: 'contract' | 'invoice', path: 'inbox/<uuid>/<file>', lang }
// Výstup: { data }

import { getAuthedProfile } from '../../../../lib/serverAuth';

export const maxDuration = 60;

const MODELS = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const MAX_BYTES = 10 * 1024 * 1024;
const DAILY_LIMIT = 100;
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' };
const SUPPLIER_CATEGORIES = ['gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning', 'security', 'lifts', 'it_telecom', 'insurance', 'legal', 'administration', 'utilities', 'pest_control', 'other'];
const INVOICE_CATEGORIES = ['maintenance', 'repair', 'insurance', 'utilities', 'staff_cleaning', 'gardening', 'pools', 'security', 'administration', 'legal', 'improvement', 'other'];

const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD' };
const COMMON = {
  supplier_name: { type: ['string', 'null'], description: 'Company that provides the service / issued the invoice (not the community of owners).' },
  tax_id: { type: ['string', 'null'], description: 'Supplier NIF/CIF exactly as printed.' },
  uncertain_fields: { type: 'array', items: { type: 'string' }, description: 'Fields whose value was unclear, handwritten, contradictory or computed by you.' },
};

const TOOLS = {
  contract: {
    name: 'record_contract',
    description: 'Record the facts of one service contract. Use null for anything not stated. Never guess.',
    input_schema: {
      type: 'object',
      properties: {
        ...COMMON,
        is_contract: { type: 'boolean', description: 'False if the document is not a contract.' },
        subject: { type: ['string', 'null'], description: 'Short title of what is contracted, in the output language (e.g. "Maintenance of 4 pools").' },
        category: { type: 'string', enum: SUPPLIER_CATEGORIES },
        signed_on: DATE,
        starts_on: DATE,
        ends_on: { ...DATE, description: 'End date YYYY-MM-DD. If only a duration is stated, compute it from the start date and list ends_on in uncertain_fields.' },
        auto_renew: { type: ['boolean', 'null'], description: 'True if the contract renews automatically (prórroga tácita/automática).' },
        renewal_text: { type: ['string', 'null'], description: 'The renewal rule in one short sentence, output language.' },
        notice_period_days: { type: ['integer', 'null'], description: 'Notice needed to terminate / avoid renewal, in days (1 month = 30 days). List it in uncertain_fields if converted from months.' },
        notice_text: { type: ['string', 'null'], description: 'The notice clause as written, short.' },
        amount: { type: ['number', 'null'], description: 'Price per period as written in the contract.' },
        amount_period: { type: 'string', enum: ['one_off', 'monthly', 'quarterly', 'yearly', 'unknown'] },
        vat_included: { type: ['boolean', 'null'] },
        currency: { type: ['string', 'null'] },
        signed_by: { type: ['string', 'null'], description: 'Who signed for the community (role or name as written).' },
        key_clauses: { type: 'array', items: { type: 'string' }, description: 'Short facts that matter later, output language: price revision (IPC), penalties, response times, what is excluded, insurance, termination for breach.' },
      },
      required: ['is_contract', 'supplier_name', 'subject', 'category', 'amount_period', 'key_clauses', 'uncertain_fields'],
    },
  },
  invoice: {
    name: 'record_invoice',
    description: 'Record the facts of one supplier invoice. Use null for anything not stated. Never guess.',
    input_schema: {
      type: 'object',
      properties: {
        ...COMMON,
        is_invoice: { type: 'boolean', description: 'False if the document is not an invoice.' },
        invoice_number: { type: ['string', 'null'] },
        invoice_date: DATE,
        due_date: DATE,
        net_amount: { type: ['number', 'null'], description: 'Base imponible.' },
        vat_amount: { type: ['number', 'null'] },
        total_amount: { type: ['number', 'null'], description: 'Total with VAT.' },
        currency: { type: ['string', 'null'] },
        description: { type: ['string', 'null'], description: 'What was invoiced, one short line, output language.' },
        category: { type: 'string', enum: INVOICE_CATEGORIES },
        paid_on: { ...DATE, description: 'Only if the invoice shows it was paid (e.g. "PAGADO" stamp with date).' },
      },
      required: ['is_invoice', 'supplier_name', 'total_amount', 'category', 'uncertain_fields'],
    },
  },
};

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
    const kind = body.kind;
    const tool = TOOLS[kind];
    if (!tool) return Response.json({ error: 'Unknown kind' }, { status: 400 });
    const path = typeof body.path === 'string' ? body.path : '';
    if (!/^inbox\/[0-9a-f-]{36}\/[^/]+$/i.test(path)) return Response.json({ error: 'Invalid file path' }, { status: 400 });
    const outLang = LANG_NAMES[body.lang] || 'English';

    const { data: allowed, error: rlError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-extract-document',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    const { data: blob, error: dlError } = await auth.adminClient.storage.from('memoria').download(path);
    if (dlError || !blob) return Response.json({ error: 'download_failed' }, { status: 400 });
    if (blob.size > MAX_BYTES) return Response.json({ error: 'too_large' }, { status: 400 });
    const mediaType = mediaTypeFor(path, blob.type);
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) return Response.json({ error: 'unsupported_type' }, { status: 400 });
    const source = { type: 'base64', media_type: mediaType, data: Buffer.from(await blob.arrayBuffer()).toString('base64') };

    const system = [
      'You read documents for the board of a residential community of owners in Benahavís, Spain. Documents are usually in Spanish.',
      'Spanish numbers use "." for thousands and "," for decimals. Dates are day/month/year.',
      'The community of owners is the client; the supplier is the other party.',
      'Report only what is written. If you computed or converted a value, list the field in uncertain_fields.',
      `Write free-text fields (subject, description, renewal_text, key_clauses) in ${outLang}.`,
      'Do not judge or recommend anything. Always answer by calling the tool exactly once.',
    ].join(' ');

    let json = null;
    for (const model of MODELS) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
          system,
          tools: [tool],
          tool_choice: { type: 'tool', name: tool.name },
          messages: [
            {
              role: 'user',
              content: [mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source }, { type: 'text', text: `Read this ${kind}.` }],
            },
          ],
        }),
      });
      if (res.ok) {
        json = await res.json();
        break;
      }
      console.error('extract-document API error', model, res.status, await res.text().catch(() => ''));
      if (![400, 403, 404].includes(res.status)) break;
    }
    if (!json) return Response.json({ error: 'AI request failed' }, { status: 502 });
    const toolUse = (json.content || []).find((c) => c.type === 'tool_use');
    if (!toolUse) return Response.json({ error: 'AI request failed' }, { status: 502 });
    return Response.json({ data: toolUse.input });
  } catch (e) {
    console.error('extract-document error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
