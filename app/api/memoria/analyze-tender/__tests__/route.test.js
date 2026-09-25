// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = '70000000-0000-4000-8000-000000000005';
let profile;
let quotes;

function q(table) {
  const rows = {
    memoria_tenders: [{ id: T, title: 'Pools', currency: 'EUR', approved_budget: 42000 }],
    memoria_quotes: quotes,
    memoria_suppliers: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }],
  }[table] || [];
  const b = {
    select: () => b, eq: () => b, in: () => b,
    single: async () => ({ data: rows[0] || null }),
    then: (r) => r({ data: rows }),
  };
  return b;
}

vi.mock('../../../../../lib/serverAuth', () => ({
  getAuthedProfile: vi.fn(async () => (profile ? { user: { id: 'u' }, profile, adminClient: { rpc: async () => ({ data: true }), from: q } } : null)),
}));

import { POST } from '../route';
const req = (b) => new Request('http://x', { method: 'POST', body: JSON.stringify(b) });

describe('analyze-tender route', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    profile = { role: 'board', status: 'approved' };
    quotes = [
      { id: 'q1', supplier_id: 's1', amount: 37800, currency: 'EUR', vat_included: false, notes: 'x' },
      { id: 'q2', supplier_id: 's2', amount: 38600, currency: 'EUR', vat_included: false, notes: 'y' },
    ];
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'tool_use', input: { summary: 's', normalized: [], best_by_criterion: [], risks: [], missing_info: [], questions: [], history: [], procedure: 'p' } }] }),
    }));
  });

  it('is board only', async () => {
    profile = { role: 'member', status: 'approved' };
    expect((await POST(req({ tenderId: T }))).status).toBe(403);
  });

  it('needs two quotes', async () => {
    quotes = quotes.slice(0, 1);
    expect((await POST(req({ tenderId: T }))).status).toBe(400);
  });

  it('forbids an overall recommendation and returns the analysis with a fingerprint', async () => {
    const res = await POST(req({ tenderId: T, lang: 'es' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis.lang).toBe('es');
    expect(json.fingerprint).toContain('q1:37800');
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.system).toContain('NEVER name an overall best offer');
    expect(sent.system).toContain('Spanish');
  });

  it('fills an empty procedure from the records', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'tool_use', input: { summary: 's', normalized: [], best_by_criterion: [], risks: [], missing_info: [], questions: [], history: [], procedure: '' } }] }),
    }));
    const json = await (await POST(req({ tenderId: T, lang: 'es' }))).json();
    expect(json.analysis.procedure).toContain('42000 EUR');
    expect(json.analysis.procedure).toContain('conflicto de intereses para: A, B');
  });
});
