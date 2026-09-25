// Memoria — AI prečíta nahranú cenovú ponuku (PDF / foto) a vráti štruktúrované údaje.
// Nič neukladá: výsledok je návrh, ktorý člen boardu na obrazovke skontroluje
// a až potom uloží (princíp MIA: AI navrhuje, board potvrdzuje).
//
// Vstup:  { paths: ['tenders/<id>/<file>', ...] }  — súbory už nahrané v súkromnom buckete „memoria“
// Výstup: { results: [{ path, ok, data?, error? }] }

import { getAuthedProfile } from '../../../../lib/serverAuth';

export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // na jeden súbor
const DAILY_LIMIT = 150;
const CATEGORIES = [
  'gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning', 'security', 'lifts',
  'it_telecom', 'insurance', 'legal', 'administration', 'utilities', 'pest_control', 'other',
];

const EXTRACT_TOOL = {
  name: 'record_quote',
  description: 'Record the facts found in one supplier quote / offer document. Use null for anything not stated in the document. Never guess.',
  input_schema: {
    type: 'object',
    properties: {
      supplier_name: { type: ['string', 'null'], description: 'Legal or trade name of the company that issued the quote.' },
      tax_id: { type: ['string', 'null'], description: 'Spanish NIF/CIF (e.g. B12345678) or other tax ID, exactly as printed.' },
      contact_person: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'] },
      email: { type: ['string', 'null'] },
      website: { type: ['string', 'null'] },
      quote_number: { type: ['string', 'null'] },
      quote_date: { type: ['string', 'null'], description: 'Date of the quote, YYYY-MM-DD.' },
      valid_until: { type: ['string', 'null'], description: 'Validity end date YYYY-MM-DD, computed only if the document states a validity period.' },
      currency: { type: ['string', 'null'], description: 'ISO code, e.g. EUR.' },
      amount_net: { type: ['number', 'null'], description: 'Total price WITHOUT VAT (base imponible).' },
      vat_rate: { type: ['number', 'null'], description: 'VAT percentage, e.g. 21.' },
      vat_amount: { type: ['number', 'null'] },
      amount_total: { type: ['number', 'null'], description: 'Total price WITH VAT.' },
      price_period: { type: 'string', enum: ['one_off', 'monthly', 'quarterly', 'yearly', 'unknown'], description: 'Whether the price is a one-off amount or a recurring fee.' },
      category: { type: 'string', enum: CATEGORIES, description: 'Type of work or service.' },
      scope_summary: { type: ['string', 'null'], description: 'One or two sentences: what is offered, in the requested output language.' },
      key_conditions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short bullet facts (in the requested output language) that matter for comparing offers: duration, start date, payment terms, warranty, what is excluded, response times, penalties.',
      },
      uncertain_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of fields above whose value was unclear, handwritten, contradictory or inferred.',
      },
      is_quote: { type: 'boolean', description: 'False if the document is not a price quote/offer at all.' },
    },
    required: ['supplier_name', 'amount_net', 'amount_total', 'price_period', 'category', 'is_quote', 'key_conditions', 'uncertain_fields'],
  },
};

const SYSTEM = [
  'You extract facts from supplier quotes sent to a residential community of owners in Spain (Benahavís, Málaga).',
  'Documents are usually in Spanish, sometimes English. Read amounts carefully: Spanish format uses "." for thousands and "," for decimals (1.234,56 = 1234.56).',
  'Report only what is written in the document. If a value is missing, use null. If you had to infer or the text is unclear, list the field in uncertain_fields.',
  'If there are several options or lots, use the main/recommended total and describe the other options in key_conditions.',
  'Do not judge, rank or recommend the supplier. The board decides.',
  'Always answer by calling the record_quote tool exactly once.',
].join(' ');

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
    const outLang = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' }[body.lang] || 'English';
    const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string') : [];
    if (paths.length === 0) return Response.json({ error: 'No files' }, { status: 400 });
    if (paths.length > MAX_FILES) return Response.json({ error: `Max ${MAX_FILES} files at once` }, { status: 400 });
    // Iba súbory v priečinku zákaziek v buckete Memorie.
    if (paths.some((p) => !/^tenders\/[0-9a-f-]{36}\/[^/]+$/i.test(p))) {
      return Response.json({ error: 'Invalid file path' }, { status: 400 });
    }

    const { data: allowed, error: rlError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-extract-quote',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          const { data: blob, error: dlError } = await auth.adminClient.storage.from('memoria').download(path);
          if (dlError || !blob) return { path, ok: false, error: 'download_failed' };
          if (blob.size > MAX_BYTES) return { path, ok: false, error: 'too_large' };
          const mediaType = mediaTypeFor(path, blob.type);
          if (!mediaType || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) {
            return { path, ok: false, error: 'unsupported_type' };
          }
          const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
          const source = { type: 'base64', media_type: mediaType, data: b64 };
          const content = [
            mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source },
            { type: 'text', text: `Extract the quote facts from this document. Write scope_summary and key_conditions in ${outLang}.` },
          ];
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 1500,
              system: SYSTEM,
              tools: [EXTRACT_TOOL],
              tool_choice: { type: 'tool', name: 'record_quote' },
              messages: [{ role: 'user', content }],
            }),
          });
          if (!res.ok) {
            console.error('extract-quote API error', res.status, await res.text().catch(() => ''));
            return { path, ok: false, error: 'ai_failed' };
          }
          const json = await res.json();
          const toolUse = (json.content || []).find((c) => c.type === 'tool_use');
          if (!toolUse) return { path, ok: false, error: 'ai_failed' };
          return { path, ok: true, data: toolUse.input };
        } catch (e) {
          console.error('extract-quote file error', e);
          return { path, ok: false, error: 'ai_failed' };
        }
      })
    );

    return Response.json({ results });
  } catch (e) {
    console.error('extract-quote error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
