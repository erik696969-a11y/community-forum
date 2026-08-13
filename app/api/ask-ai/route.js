import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { question } = await request.json();

    if (!question || !question.trim()) {
      return Response.json({ error: 'No question provided' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: entries } = await adminClient
      .from('ai_knowledge_base')
      .select('title, content')
      .order('updated_at', { ascending: true });

    if (!entries || entries.length === 0) {
      return Response.json({ noKnowledge: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI assistant is not configured yet' }, { status: 500 });
    }

    const rulesText = entries.map((e) => `## ${e.title}\n${e.content}`).join('\n\n');

    const systemPrompt = `You are a helpful assistant answering questions from residents of a community, based STRICTLY on the official community rules text provided below. If the rules do not clearly cover the question, say so honestly rather than guessing. Keep answers concise and friendly. Always write in the same language the question was asked in.

COMMUNITY RULES:
${rulesText}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `AI request failed: ${errText}` }, { status: 500 });
    }

    const data = await res.json();
    const answer = data.content?.[0]?.text || '';

    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
