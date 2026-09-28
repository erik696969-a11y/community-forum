// Memoria — „Opýtaj sa Memorie“: odpovede pre board zo záznamov Memorie a zo stanov.
// Hranica ako pri MIA: fakty, súvislosti a postup podľa stanov áno;
// rozhodnutie (strategické, finančné, právne) vždy ostáva na boarde.

import { getAuthedProfile } from '../../../../lib/serverAuth';
import { buildMemoriaContext, GOVERNANCE_RULES } from '../../../../lib/memoriaContext';
import { retrieveRelevantDocumentChunks, formatDocumentExcerptsForPrompt } from '../../../../lib/documentRetrieval';
import { helpForPrompt, extractHelpLinks, MEMORIA_TABS } from '../../../../lib/memoriaHelp';

export const maxDuration = 60;

// Presnejší model pre board (nízky počet otázok); ak nie je pre kľúč dostupný, použije sa Haiku ako pri MIA.
const MODELS = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const DAILY_LIMIT = 200;
const MAX_QUESTION = 1000;
const MAX_HISTORY = 4;
const LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German' };

function systemPrompt(context, rules, excerpts, lang, guide) {
  return `You are Memoria, the records assistant of the board (Junta Directiva) of the Comunidad de Propietarios "La Hacienda del Señorío de Cifuentes" in Benahavís, Spain.
You answer questions from board members using ONLY the Memoria records and the community rules below.

How to answer:
- Answer in ${LANG_NAMES[lang] || 'the language of the question'} unless the question is clearly in another language; then use that language.
- Start with the direct answer (numbers, dates, names), then the supporting facts. Keep it short and scannable: short paragraphs, bullet points, or a small table when comparing several items.
- Quote exact figures and dates from the records. Say which records you used (e.g. "contract 'Gardening maintenance…'", "decision of 24/09/2025").
- If the records do not contain the answer, say so plainly and say what data is missing (e.g. invoices from the administrator). Never invent suppliers, amounts, dates, votes or rules.
- You may point out facts and trends (price changes, missing quotes, deadlines, overdue tasks, missing conflict-of-interest checks) and describe the procedure the Statutes or the law set out (who decides, deadlines, majorities).
- When asked what to do, you may list the options and the steps the Statutes require, but you never make or recommend a strategic, financial or legal decision. End such answers with one line saying the decision belongs to the board.
- Records marked [DEMO] are fictional sample data for a presentation. If your answer relies on them, add a short final note: "(based on DEMO sample data)".
- Amounts are in EUR; invoice totals include VAT unless stated otherwise.
- When you answer about invoices or spending, add one short line with the date the invoice data covers (section INVOICE DATA COVERAGE), because the administrator's data arrives about one month late.
- NEVER calculate dates or day counts yourself. Use the values already given in the records: "(in N days)", "(N days ago)", "LAST DAY TO GIVE NOTICE …" and the section DATES ALREADY CALCULATED. A contract "renews within X months" when its end date falls within that window; its notice deadline is the listed LAST DAY TO GIVE NOTICE. Something is overdue only when the records say "days ago", "PAST" or "OVERDUE".
- Before answering, check that your first sentence does not contradict the details you list afterwards.

# QUESTIONS ABOUT USING MEMORIA ("where do I find…", "how do I…")
- Many board members are not used to apps. When the question is about where to find something or how to do something in Memoria, answer in two parts: first the relevant records (e.g. the actual quotes with supplier, amount and tender), then the steps as a short numbered list (1., 2., 3.) that follow the GUIDE ARTICLES below. Keep the button and tab names exactly as written in the guide, in quotes.
- Never invent buttons, tabs or features that are not in the guide articles or the records. If the guide does not cover it, say so and suggest the "❓ Help" tab.
- At the very end of such an answer, on its own lines, add machine markers (they become buttons): [[open:TAB]] for the screen to open and [[help:ID]] for the guide article, using only these values — TAB one of: ${MEMORIA_TABS.filter((t) => t !== 'help').join(', ')}; ID only from the guide articles below. At most 2 of each. Do not mention the markers in the text. Do not add markers to answers that are not about using Memoria.
${guide ? `
# GUIDE ARTICLES (how to use Memoria)
${guide}
` : ''}

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

    const [s, r, c, t, q, i, d, tk, o, m, mi, docs, md, bg, bl, rm, cs] = await Promise.all([
      db.from('memoria_suppliers').select('*'),
      db.from('memoria_supplier_ratings').select('*'),
      db.from('memoria_contracts').select('*'),
      db.from('memoria_tenders').select('*'),
      db.from('memoria_quotes').select('*'),
      db.from('memoria_invoices').select('supplier_id, invoice_number, invoice_date, due_date, paid_on, total_amount, category, funding_source, payment_status, description, is_urgent_unbudgeted, urgency_reason, ratified_by_decision_id, is_demo'),
      db.from('memoria_decisions').select('*'),
      db.from('memoria_tasks').select('*'),
      db.from('memoria_obligations').select('*'),
      db.from('memoria_meetings').select('*'),
      db.from('memoria_meeting_items').select('*'),
      db.from('community_documents').select('document_title, document_type, document_year, chunk_index, chunk_title, chunk_text, keywords, active').eq('active', true).in('document_type', ['statutes', 'community_rules']),
      db.from('memoria_mandates').select('person_name, position, starts_on, ends_on, ended_on, appointed_by, access_removed_on, is_demo'),
      db.from('memoria_budgets').select('*'),
      db.from('memoria_budget_lines').select('*'),
      db.from('memoria_reserve_movements').select('*'),
      db.from('memoria_cases').select('*'),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const context = buildMemoriaContext(
      {
        suppliers: s.data, ratings: r.data, contracts: c.data, tenders: t.data, quotes: q.data, invoices: i.data,
        decisions: d.data, tasks: tk.data, obligations: o.data, meetings: m.data, meetingItems: mi.data, mandates: md.data, budgets: bg.data, budgetLines: bl.data, reserveMovements: rm.data, cases: cs.data,
      },
      today
    );
    const matched = retrieveRelevantDocumentChunks(docs.data || [], question, 3);
    const excerpts = matched.length ? formatDocumentExcerptsForPrompt(matched) : '';
    const guide = helpForPrompt(lang, question, 3);

    let answer = '';
    let lastStatus = 0;
    for (const model of MODELS) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          system: systemPrompt(context, GOVERNANCE_RULES, excerpts, lang, guide),
          messages: [...history, { role: 'user', content: question }],
        }),
      });
      lastStatus = res.status;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('memoria ask API error', model, res.status, errText);
        // Neznámy / nedostupný model → skúsime ďalší; iné chyby hneď vrátime.
        if (![400, 403, 404].includes(res.status)) break;
        continue;
      }
      const json = await res.json();
      answer = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (answer) break;
      // Prázdna odpoveď (napr. model minul limit bez textu) → skúsime ďalší model.
      console.error('memoria ask empty answer', model, json.stop_reason, (json.content || []).map((b) => b.type).join(','));
    }
    if (!answer) {
      return Response.json({ error: lastStatus && lastStatus !== 200 ? 'AI request failed' : 'Memoria did not return an answer. Please ask again.' }, { status: 502 });
    }
    const { text, links } = extractHelpLinks(answer);
    return Response.json({ answer: text, links });
  } catch (e) {
    console.error('memoria ask error', e);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
