// Memoria — AI pomocník pri importe faktúr od administrátora.
// Nič neukladá; iba navrhuje, board na obrazovke kontroluje a potvrdzuje.
//   action 'map'      — ktorý stĺpec tabuľky je ktoré pole (z hlavičky a pár riadkov)
//   action 'classify' — kategória faktúry a párovanie s existujúcim dodávateľom
//   action 'extract'  — riadky faktúr z PDF / fotky (súbor v buckete) alebo z voľného textu

import { getAuthedProfile } from '../../../../lib/serverAuth';

export const maxDuration = 60;

const FAST = 'claude-haiku-4-5-20251001';
const PRECISE = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const DAILY_LIMIT = 150;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 60000;
const FIELDS = ['invoice_number', 'invoice_date', 'supplier_name', 'supplier_tax_id', 'description', 'net_amount', 'vat_amount', 'total_amount', 'due_date', 'paid_on', 'admin_category', 'payment_status'];
const INVOICE_CATEGORIES = ['maintenance', 'repair', 'insurance', 'utilities', 'staff_cleaning', 'gardening', 'pools', 'security', 'administration', 'legal', 'improvement', 'other'];
const SUPPLIER_CATEGORIES = ['gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning', 'security', 'lifts', 'it_telecom', 'insurance', 'legal', 'administration', 'utilities', 'pest_control', 'other'];

const CONTEXT =
  'The data comes from the administrator (administrador de fincas) of a residential community of owners in Benahavís, Spain. ' +
  'It lists invoices received from suppliers. Texts are usually Spanish. Spanish numbers use "." for thousands and "," for decimals. Dates are usually day/month/year.';

const MAP_TOOL = {
  name: 'record_mapping',
  description: 'Record which column index holds each field. Use null when no column holds it. Each column at most once.',
  input_schema: {
    type: 'object',
    properties: {
      ...Object.fromEntries(FIELDS.map((f) => [f, { type: ['integer', 'null'] }])),
      decimal: { type: 'string', enum: [',', '.'] },
      date_order: { type: 'string', enum: ['DMY', 'MDY', 'YMD'] },
      notes: { type: ['string', 'null'], description: 'One short sentence if something is unusual (e.g. amounts are negative, several date columns).' },
    },
    required: [...FIELDS, 'decimal', 'date_order'],
  },
};

const CLASSIFY_TOOL = {
  name: 'record_classification',
  description: 'For each invoice row, suggest the invoice category and, only if clearly the same company, the matching known supplier.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: { type: 'integer' },
            category: { type: 'string', enum: INVOICE_CATEGORIES },
            supplier_ref: { type: ['string', 'null'], description: 'Code of the known supplier (e.g. "S3") only when it is clearly the same company; otherwise null.' },
            new_supplier_category: { type: 'string', enum: SUPPLIER_CATEGORIES, description: 'Type of company, used if a new supplier must be created.' },
            is_supplier_invoice: { type: 'boolean', description: 'False for rows that are not a supplier invoice (owner fee receipts, internal transfers, bank balance lines).' },
          },
          required: ['i', 'category', 'supplier_ref', 'new_supplier_category', 'is_supplier_invoice'],
        },
      },
    },
    required: ['items'],
  },
};

const EXTRACT_TOOL = {
  name: 'record_invoices',
  description: 'Record every supplier invoice listed in the document, one row per invoice, exactly as written. Use null for missing values. Never invent rows or values.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            invoice_number: { type: ['string', 'null'] },
            invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            supplier_name: { type: ['string', 'null'] },
            supplier_tax_id: { type: ['string', 'null'], description: 'NIF/CIF exactly as printed.' },
            description: { type: ['string', 'null'] },
            net_amount: { type: ['number', 'null'] },
            vat_amount: { type: ['number', 'null'] },
            total_amount: { type: ['number', 'null'] },
            due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            paid_on: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            admin_category: { type: ['string', 'null'], description: 'Account or expense group as written by the administrator.' },
            payment_status: { type: ['string', 'null'], description: 'Payment status as written (e.g. "Pagada", "Pendiente").' },
          },
          required: ['supplier_name', 'total_amount'],
        },
      },
      period: { type: ['string', 'null'], description: 'Period the list covers, as written (e.g. "Agosto 2026").' },
      skipped_lines: { type: ['string', 'null'], description: 'Short note on lines left out on purpose (totals, owner fees, balances).' },
    },
    required: ['rows'],
  },
};

async function callClaude(models, payload) {
  let last = null;
  for (const model of models) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, ...payload }),
    });
    if (res.ok) return res.json();
    last = res.status;
    console.error('import-assist API error', model, res.status, await res.text().catch(() => ''));
    if (![400, 403, 404].includes(res.status)) break;
  }
  throw new Error(`ai_failed_${last}`);
}

function toolInput(json) {
  const t = (json.content || []).find((c) => c.type === 'tool_use');
  if (!t) throw new Error('ai_failed');
  return t.input;
}

function clip(v, n = 120) {
  return String(v ?? '').slice(0, n);
}

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
    const action = body.action;
    if (!['map', 'classify', 'extract'].includes(action)) return Response.json({ error: 'Unknown action' }, { status: 400 });

    const { data: allowed, error: rlError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-import-assist',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    if (action === 'map') {
      const headers = Array.isArray(body.headers) ? body.headers.slice(0, 60).map((h) => clip(h, 80)) : [];
      const sample = Array.isArray(body.sample) ? body.sample.slice(0, 10).map((r) => (Array.isArray(r) ? r.slice(0, 60).map((c) => clip(c, 80)) : [])) : [];
      if (headers.length === 0) return Response.json({ error: 'No headers' }, { status: 400 });
      const table = [headers.map((h, i) => `[${i}] ${h}`).join(' | '), ...sample.map((r) => r.map((c, i) => `[${i}] ${c}`).join(' | '))].join('\n');
      const json = await callClaude([FAST], {
        max_tokens: 800,
        system: `${CONTEXT} You identify which column holds which field. admin_category = the administrator's own account or expense group. payment_status = a column saying if it is paid. Always call record_mapping once.`,
        tools: [MAP_TOOL],
        tool_choice: { type: 'tool', name: 'record_mapping' },
        messages: [{ role: 'user', content: `Header row and sample rows (column index in brackets):\n${table}` }],
      });
      const input = toolInput(json);
      const mapping = {};
      for (const f of FIELDS) {
        const v = input[f];
        mapping[f] = Number.isInteger(v) && v >= 0 && v < headers.length ? v : null;
      }
      return Response.json({ mapping, decimal: input.decimal === '.' ? '.' : ',', dateOrder: ['DMY', 'MDY', 'YMD'].includes(input.date_order) ? input.date_order : 'DMY', notes: input.notes || null });
    }

    if (action === 'classify') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 120) : [];
      const suppliers = Array.isArray(body.suppliers) ? body.suppliers.slice(0, 400) : [];
      if (rows.length === 0) return Response.json({ items: [] });
      const supText = suppliers.map((s, k) => `S${k + 1}: ${clip(s.name, 80)}${s.tax_id ? ` (${clip(s.tax_id, 20)})` : ''}${s.category ? ` [${s.category}]` : ''}`).join('\n');
      const rowText = rows
        .map((r) => `#${r.i}: supplier "${clip(r.supplier_name)}"${r.supplier_tax_id ? ` (${clip(r.supplier_tax_id, 20)})` : ''}; description "${clip(r.description, 160)}"; admin group "${clip(r.admin_category, 60)}"; total ${clip(r.total_amount, 20)}`)
        .join('\n');
      const json = await callClaude([FAST], {
        max_tokens: 6000,
        system:
          `${CONTEXT} For each row suggest the invoice category. Categories: maintenance (regular upkeep), repair (fixing something broken), insurance, utilities (water, electricity, gas, telephone), staff_cleaning (cleaning, concierge, staff), gardening, pools, security (guards, cameras, access control), administration (administrator fees, bank fees, office), legal (lawyers, notary, court), improvement (new works, installations), other. ` +
          'Match to a known supplier only when it is clearly the same company (same tax ID, or the same name with small spelling or legal-form differences). Never match only because the type of work is similar. Always call record_classification once, with one item per row.',
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: 'tool', name: 'record_classification' },
        messages: [{ role: 'user', content: `KNOWN SUPPLIERS:\n${supText || '(none)'}\n\nROWS:\n${rowText}` }],
      });
      const input = toolInput(json);
      const items = (input.items || [])
        .filter((it) => Number.isInteger(it.i))
        .map((it) => {
          const k = /^S(\d+)$/.exec(it.supplier_ref || '');
          const sup = k ? suppliers[Number(k[1]) - 1] : null;
          return {
            i: it.i,
            category: INVOICE_CATEGORIES.includes(it.category) ? it.category : 'other',
            supplier_id: sup?.id || null,
            new_supplier_category: SUPPLIER_CATEGORIES.includes(it.new_supplier_category) ? it.new_supplier_category : 'other',
            is_supplier_invoice: it.is_supplier_invoice !== false,
          };
        });
      return Response.json({ items });
    }

    // extract
    let content;
    if (typeof body.text === 'string' && body.text.trim()) {
      content = [{ type: 'text', text: `Invoice list pasted by a board member:\n\n${body.text.slice(0, MAX_TEXT)}` }];
    } else {
      const path = typeof body.path === 'string' ? body.path : '';
      if (!/^imports\/[0-9a-f-]{36}\/[^/]+$/i.test(path)) return Response.json({ error: 'Invalid file path' }, { status: 400 });
      const { data: blob, error: dlError } = await auth.adminClient.storage.from('memoria').download(path);
      if (dlError || !blob) return Response.json({ error: 'download_failed' }, { status: 400 });
      if (blob.size > MAX_BYTES) return Response.json({ error: 'too_large' }, { status: 400 });
      const mediaType = mediaTypeFor(path, blob.type);
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) return Response.json({ error: 'unsupported_type' }, { status: 400 });
      const source = { type: 'base64', media_type: mediaType, data: Buffer.from(await blob.arrayBuffer()).toString('base64') };
      content = [mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source }, { type: 'text', text: 'List every supplier invoice in this document.' }];
    }
    const json = await callClaude(PRECISE, {
      max_tokens: 12000,
      system: `${CONTEXT} Copy each supplier invoice row exactly. Convert dates to YYYY-MM-DD and amounts to plain numbers. Leave out totals/subtotals, balances, and owner fee receipts, and say so in skipped_lines. Always call record_invoices once.`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'record_invoices' },
      messages: [{ role: 'user', content }],
    });
    const input = toolInput(json);
    return Response.json({
      rows: Array.isArray(input.rows) ? input.rows : [],
      period: input.period || null,
      skipped: input.skipped_lines || null,
      truncated: json.stop_reason === 'max_tokens',
    });
  } catch (e) {
    console.error('import-assist error', e);
    return Response.json({ error: 'AI request failed' }, { status: 502 });
  }
}
