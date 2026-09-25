// Memoria — AI analýza ponúk k jednej zákazke.
// Podklad pre board: porovnateľné ceny, kto je najlepší v ktorom kritériu, riziká,
// chýbajúce údaje, otázky na dodávateľov a história z Memorie.
// ZÁMERNE bez celkového víťaza a bez odporúčania — rozhoduje board (princíp MIA).
// Výsledok ukladá k zákazke klient (v mene prihláseného člena boardu), aby ho všetci videli rovnaký.

import { getAuthedProfile } from '../../../../lib/serverAuth';
import { GOVERNANCE_RULES } from '../../../../lib/memoriaContext';
import { quotesFingerprint } from '../../../../lib/quoteFingerprint';

export const maxDuration = 60;

const MODELS = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const DAILY_LIMIT = 60;
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' };

const TOOL = {
  name: 'record_analysis',
  description: 'Record a neutral analysis of the quotes for the board. Never name an overall winner and never recommend a supplier.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two or three neutral sentences: what differs between the offers and what the board should weigh. No winner, no recommendation.' },
      normalized: {
        type: 'array',
        description: 'One row per quote, prices made comparable.',
        items: {
          type: 'object',
          properties: {
            supplier: { type: 'string' },
            annual_net: { type: ['number', 'null'], description: 'Price per year without VAT (convert monthly x12, quarterly x4; one-off stays as is and say so in note).' },
            annual_gross: { type: ['number', 'null'], description: 'Price per year with 21% VAT unless another rate is stated.' },
            contract_term: { type: ['string', 'null'], description: 'e.g. "2 years, no automatic renewal".' },
            not_included: { type: ['string', 'null'], description: 'Costs that are excluded and would come on top.' },
            note: { type: ['string', 'null'] },
          },
          required: ['supplier', 'annual_net', 'annual_gross'],
        },
      },
      best_by_criterion: {
        type: 'array',
        description: 'For each relevant criterion, which offer is strongest and why, based only on the documents and records. Criteria such as: lowest price, what is included, emergency response time, contract flexibility, payment terms, past experience.',
        items: {
          type: 'object',
          properties: { criterion: { type: 'string' }, supplier: { type: 'string' }, why: { type: 'string' } },
          required: ['criterion', 'supplier', 'why'],
        },
      },
      risks: {
        type: 'array',
        items: { type: 'object', properties: { supplier: { type: 'string' }, risk: { type: 'string' } }, required: ['supplier', 'risk'] },
      },
      missing_info: {
        type: 'array',
        description: 'Information needed to compare fairly that is missing from a quote.',
        items: { type: 'object', properties: { supplier: { type: 'string' }, item: { type: 'string' } }, required: ['supplier', 'item'] },
      },
      questions: {
        type: 'array',
        description: 'Concrete questions the board could send to each supplier before deciding.',
        items: { type: 'object', properties: { supplier: { type: 'string' }, question: { type: 'string' } }, required: ['supplier', 'question'] },
      },
      history: {
        type: 'array',
        description: 'Facts from Memoria about each supplier: past contracts, ratings, invoices, notes. Empty if none.',
        items: { type: 'object', properties: { supplier: { type: 'string' }, fact: { type: 'string' } }, required: ['supplier', 'fact'] },
      },
      procedure: { type: 'string', description: 'What the Statutes and resolutions require for this decision (who decides, budget limit, conflict-of-interest check, recording the reason). Facts only.' },
    },
    required: ['summary', 'normalized', 'best_by_criterion', 'risks', 'missing_info', 'questions', 'history', 'procedure'],
  },
};

export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.role !== 'board' || auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI is not configured' }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const tenderId = typeof body.tenderId === 'string' ? body.tenderId : '';
    const lang = LANG_NAMES[body.lang] ? body.lang : 'en';
    if (!/^[0-9a-f-]{36}$/i.test(tenderId)) return Response.json({ error: 'Invalid tender' }, { status: 400 });

    const db = auth.adminClient;
    const { data: allowed, error: rlError } = await db.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-analyze-tender',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    const { data: tender } = await db.from('memoria_tenders').select('*').eq('id', tenderId).single();
    if (!tender) return Response.json({ error: 'Tender not found' }, { status: 404 });
    const { data: quotes } = await db.from('memoria_quotes').select('*').eq('tender_id', tenderId);
    if (!quotes || quotes.length < 2) return Response.json({ error: 'At least two quotes are needed' }, { status: 400 });

    const supplierIds = [...new Set(quotes.map((q) => q.supplier_id))];
    const [sRes, rRes, cRes, iRes, dRes] = await Promise.all([
      db.from('memoria_suppliers').select('*').in('id', supplierIds),
      db.from('memoria_supplier_ratings').select('*').in('supplier_id', supplierIds),
      db.from('memoria_contracts').select('supplier_id, subject, starts_on, ends_on, status, amount, currency, payment_frequency, notes').in('supplier_id', supplierIds),
      db.from('memoria_invoices').select('supplier_id, invoice_date, total_amount, category, is_urgent_unbudgeted').in('supplier_id', supplierIds),
      tender.approved_by_decision_id
        ? db.from('memoria_decisions').select('title, decided_on, decision, rationale, authority_basis').eq('id', tender.approved_by_decision_id)
        : Promise.resolve({ data: [] }),
    ]);
    const suppliers = Object.fromEntries((sRes.data || []).map((s) => [s.id, s]));

    const lines = [];
    lines.push(`TENDER: ${tender.title}`);
    if (tender.description) lines.push(`Specification: ${tender.description}`);
    lines.push(`Approved budget limit: ${tender.approved_budget ?? 'not set'} ${tender.currency} (read the budget as per year unless the description says otherwise)`);
    for (const d of dRes.data || []) lines.push(`Approved by decision ${d.decided_on} "${d.title}": ${d.decision}${d.authority_basis ? ` (basis: ${d.authority_basis})` : ''}`);
    lines.push('\nQUOTES:');
    for (const q of quotes) {
      const s = suppliers[q.supplier_id] || {};
      lines.push(`- ${s.name || 'Unknown supplier'}: ${q.amount} ${q.currency} ${q.vat_included ? 'incl. VAT' : 'excl. VAT'} | submitted ${q.submitted_on || '-'} | valid until ${q.valid_until || '-'}\n  ${(q.notes || '').replace(/\n/g, '\n  ')}`);
    }
    lines.push('\nWHAT MEMORIA KNOWS ABOUT THESE SUPPLIERS:');
    for (const id of supplierIds) {
      const s = suppliers[id];
      if (!s) continue;
      const ratings = (rRes.data || []).filter((r) => r.supplier_id === id).map((r) => `${r.rated_on}: ${r.rating}/5${r.comment ? ` "${r.comment}"` : ''}`);
      const contracts = (cRes.data || []).filter((c) => c.supplier_id === id).map((c) => `${c.subject} (${c.status}, ${c.starts_on || '?'}–${c.ends_on || 'open'}, ${c.amount ?? '?'} ${c.currency} ${c.payment_frequency || ''})`);
      const inv = (iRes.data || []).filter((i) => i.supplier_id === id);
      const invTotal = inv.reduce((a, i) => a + Number(i.total_amount || 0), 0);
      lines.push(
        `- ${s.name}: status ${s.status}; tax id ${s.tax_id || '-'}; conflict-of-interest check done: ${s.conflict_of_interest_checked ? 'yes' : 'NO'}; in Memoria since ${String(s.created_at || '').slice(0, 10)}${s.first_engaged_on ? `; works for the community since ${s.first_engaged_on}` : ''}${s.notes ? `; notes: ${s.notes}` : ''}` +
          `\n  contracts: ${contracts.length ? contracts.join('; ') : 'none'}` +
          `\n  invoices: ${inv.length ? `${inv.length} invoices, ${invTotal.toFixed(2)} EUR in total${inv.some((i) => i.is_urgent_unbudgeted) ? ', includes urgent unbudgeted work' : ''}` : 'none'}` +
          `\n  ratings: ${ratings.length ? ratings.join('; ') : 'none'}`
      );
    }

    const system = `You prepare a neutral comparison of supplier quotes for the board (Junta Directiva) of a residential community of owners in Benahavís, Spain.
Write every text field in ${LANG_NAMES[lang]}.
Rules:
- Use only the quotes and records below. Never invent prices, conditions, references or facts. If something is not stated, list it under missing_info.
- Make prices comparable (per year, with and without VAT). Show your conversion in the note when you converted.
- For each criterion, say which offer is strongest and why. Different criteria may favour different suppliers.
- NEVER name an overall best offer, never rank the suppliers overall, never write "we recommend", "the board should choose" or similar. The decision belongs to the board.
- A supplier that is new to the community is not worse; say only that there is no history in Memoria.
- Keep each item short (one sentence).
- Always answer by calling the record_analysis tool once.

COMMUNITY RULES (summary):
${GOVERNANCE_RULES}`;

    let res = null;
    for (const model of MODELS) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 3000,
          system,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: 'record_analysis' },
          messages: [{ role: 'user', content: lines.join('\n') }],
        }),
      });
      if (res.ok) break;
      console.error('analyze-tender API error', model, res.status, await res.text().catch(() => ''));
      if (![400, 403, 404].includes(res.status)) break;
    }
    if (!res || !res.ok) return Response.json({ error: 'AI request failed' }, { status: 502 });

    const json = await res.json();
    const tool = (json.content || []).find((c) => c.type === 'tool_use');
    if (!tool) return Response.json({ error: 'AI request failed' }, { status: 502 });
    const analysis = { ...tool.input, lang };

    const at = new Date().toISOString();
    const fp = quotesFingerprint(quotes);
    return Response.json({ analysis, at, fingerprint: fp });
  } catch (e) {
    console.error('analyze-tender error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
