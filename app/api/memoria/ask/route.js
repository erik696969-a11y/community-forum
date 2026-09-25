// Memoria — „Opýtaj sa Memorie“: odpovede pre board zo záznamov Memorie a zo stanov.
// Hranica ako pri MIA: fakty, súvislosti a postup podľa stanov áno;
// rozhodnutie (strategické, finančné, právne) vždy ostáva na boarde.

import { getAuthedProfile } from '../../../../lib/serverAuth';
import { buildMemoriaContext, GOVERNANCE_RULES } from '../../../../lib/memoriaContext';
import { retrieveRelevantDocumentChunks, formatDocumentExcerptsForPrompt } from '../../../../lib/documentRetrieval';

export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const DAILY_LIMIT = 200;
const MAX_QUESTION = 1000;
const MAX_HISTORY = 4;
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' };

function systemPrompt(context, rules, excerpts, lang) {
  return `You are Memoria, the records assistant of the board (Junta Directiva) of the Comunidad de Propietarios "La Hacienda del Señorío de Cifuentes" in Benahavís, Spain.
You answer questions from board members using ONLY the Memoria records and the community rules below.

How to answer:
- Answer in ${LANG_NAMES[lang] || 'the language of the question'} unless the question is clearly in another language; then use that language.
- Start with the direct answer (numbers, dates, names), then the supporting facts. Keep it short and scannable: short paragraphs or bullet points, no tables.
- Quote exact figures and dates from the records. Say which records you used (e.g. "contract 'Gardening maintenance…'", "decision of 24/09/2025").
- If the records do not contain the answer, say so plainly and say what data is missing (e.g. invoices from the administrator). Never invent suppliers, amounts, dates, votes or rules.
- You may point out facts and trends (price changes, missing quotes, deadlines, overdue tasks, missing conflict-of-interest checks) and describe the procedure the Statutes or the law set out (who decides, deadlines, majorities).
- When asked what to do, you may list the options and the steps the Statutes require, but you never make or recommend a strategic, financial or legal decision. End such answers with one line saying the decision belongs to the board.
- Records marked [DEMO] are fictional sample data for a presentation. If your answer relies on them, add a short final note: "(based on DEMO sample data)".
- Amounts are in EUR; invoice totals include VAT unless stated otherwise.

# COMMUNITY RULES (Statutes and law, summary)
${rules}

${excerpts ? `# RELEVANT EXCERPTS FROM THE COMMUNITY DOCUMENTS\n${excerpts}\n` : ''}
# MEMORIA RECORDS
${context}`;
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
    const question = (body.question || '').toString().trim();
    const lang = ['en', 'es', 'fr', 'de'].includes(body.lang) ? body.lang : 'en';
    const history = Array.isArray(body.history)
      ? body.history
          .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
          .slice(-MAX_HISTORY)
          .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }))
      : [];
    if (!question) return Response.json({ error: 'No question' }, { status: 400 });
    if (question.length > MAX_QUESTION) return Response.json({ error: 'Question is too long' }, { status: 400 });

    const db = auth.adminClient;
    const { data: allowed, error: rlError } = await db.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'memoria-ask',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    const [s, r, c, t, q, i, d, tk, o, m, mi, docs] = await Promise.all([
      db.from('memoria_suppliers').select('*'),
      db.from('memoria_supplier_ratings').select('*'),
      db.from('memoria_contracts').select('*'),
      db.from('memoria_tenders').select('*'),
      db.from('memoria_quotes').select('*'),
      db.from('memoria_invoices').select('supplier_id, invoice_number, invoice_date, due_date, total_amount, category, payment_status, description, is_urgent_unbudgeted, urgency_reason, ratified_by_decision_id, is_demo'),
      db.from('memoria_decisions').select('*'),
      db.from('memoria_tasks').select('*'),
      db.from('memoria_obligations').select('*'),
      db.from('memoria_meetings').select('*'),
      db.from('memoria_meeting_items').select('*'),
      db.from('community_documents').select('document_title, document_type, document_year, chunk_index, chunk_title, chunk_text, keywords, active').eq('active', true).in('document_type', ['statutes', 'community_rules']),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const context = buildMemoriaContext(
      {
        suppliers: s.data, ratings: r.data, contracts: c.data, tenders: t.data, quotes: q.data, invoices: i.data,
        decisions: d.data, tasks: tk.data, obligations: o.data, meetings: m.data, meetingItems: mi.data,
      },
      today
    );
    const matched = retrieveRelevantDocumentChunks(docs.data || [], question, 3);
    const excerpts = matched.length ? formatDocumentExcerptsForPrompt(matched) : '';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1400,
        system: systemPrompt(context, GOVERNANCE_RULES, excerpts, lang),
        messages: [...history, { role: 'user', content: question }],
      }),
    });
    if (!res.ok) {
      console.error('memoria ask API error', res.status, await res.text().catch(() => ''));
      return Response.json({ error: 'AI request failed' }, { status: 502 });
    }
    const json = await res.json();
    const answer = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return Response.json({ answer });
  } catch (e) {
    console.error('memoria ask error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
