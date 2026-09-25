'use client';

// „Opýtaj sa Memorie“ — otázky boardu vlastnými slovami; odpoveď zo záznamov
// Memorie a zo stanov. Fakty a postup áno, rozhodnutie ostáva na boarde.

import { useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt } from '../../../lib/memoriaI18n';
import { ErrorBox } from './MemoriaUi';

// Jednoduché zobrazenie odpovede: odseky, odrážky a **tučné**.
function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}

export function AnswerText({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (m) {
      if (!list) {
        list = [];
        blocks.push({ type: 'ul', items: list });
      }
      list.push(m[1]);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? { type: 'h', text: h[1] } : { type: 'p', text: line });
  }
  return (
    <div className="space-y-2 text-sm text-ink">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="list-disc pl-5 space-y-1">
            {b.items.map((it, j) => (
              <li key={j}><Inline text={it} /></li>
            ))}
          </ul>
        ) : b.type === 'h' ? (
          <p key={i} className="font-semibold text-harbor"><Inline text={b.text} /></p>
        ) : (
          <p key={i}><Inline text={b.text} /></p>
        )
      )}
    </div>
  );
}

export default function AskPanel({ lang }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  async function ask(text) {
    const q = (text ?? question).trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setQuestion('');
    const history = messages.slice(-4);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/memoria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ question: q, lang, history }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setMessages((prev) => [...prev, { role: 'assistant', content: json.answer || '—' }]);
    } catch (e) {
      setError(mt(lang, 'askError', { error: e.message }));
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(q);
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  }

  const examples = ['askQ1', 'askQ2', 'askQ3', 'askQ4', 'askQ5'];

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">{mt(lang, 'askIntro')}</p>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {examples.map((k) => (
            <button
              key={k}
              className="text-left text-sm rounded-full border border-harbor/30 bg-white px-3 py-1.5 text-harbor hover:bg-harbor/5"
              onClick={() => ask(mt(lang, k))}
              disabled={busy}
            >
              💬 {mt(lang, k)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-harbor text-white text-sm px-4 py-2 whitespace-pre-wrap">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="card p-4 max-w-[95%]">
              <p className="text-xs font-semibold text-harbor mb-2">🧠 Memoria</p>
              <AnswerText text={m.content} />
            </div>
          )
        )}
        {busy && <p className="text-sm text-ink/60 animate-pulse">🧠 {mt(lang, 'askThinking')}</p>}
        <div ref={bottomRef} />
      </div>

      <ErrorBox message={error} />

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <textarea
          rows={2}
          className="input-field flex-1"
          placeholder={mt(lang, 'askPlaceholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          maxLength={1000}
        />
        <button type="submit" className="btn-primary" disabled={busy || !question.trim()}>{mt(lang, 'askSend')}</button>
      </form>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-ink/40 italic">{mt(lang, 'askFooter')}</p>
        {messages.length > 0 && (
          <button className="text-xs text-harbor hover:underline" onClick={() => setMessages([])}>{mt(lang, 'askNew')}</button>
        )}
      </div>
    </div>
  );
}
