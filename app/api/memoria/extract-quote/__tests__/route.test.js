// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENDER = '70000000-0000-4000-8000-000000000003';
let profile;
let downloadResult;
let rateAllowed;

vi.mock('../../../../../lib/serverAuth', () => ({
  getAuthedProfile: vi.fn(async () =>
    profile
      ? {
          user: { id: 'u1' },
          profile,
          adminClient: {
            rpc: vi.fn(async () => ({ data: rateAllowed, error: null })),
            storage: { from: () => ({ download: vi.fn(async () => downloadResult) }) },
          },
        }
      : null
  ),
}));

import { POST } from '../route';

function req(body) {
  return new Request('http://x/api/memoria/extract-quote', { method: 'POST', body: JSON.stringify(body) });
}

describe('extract-quote route', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    profile = { role: 'board', status: 'approved' };
    rateAllowed = true;
    downloadResult = { data: new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), error: null };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'record_quote',
            input: { supplier_name: 'TecnoSeguridad', amount_net: 8100, amount_total: 9801, price_period: 'one_off', category: 'security', is_quote: true, key_conditions: [], uncertain_fields: [] },
          },
        ],
      }),
    }));
  });

  it('rejects non-board users', async () => {
    profile = { role: 'member', status: 'approved' };
    const res = await POST(req({ paths: [`tenders/${TENDER}/a.pdf`] }));
    expect(res.status).toBe(403);
  });

  it('rejects paths outside the tenders folder', async () => {
    const res = await POST(req({ paths: ['../secret.pdf'] }));
    expect(res.status).toBe(400);
  });

  it('rejects more than 5 files', async () => {
    const paths = Array.from({ length: 6 }, (_, i) => `tenders/${TENDER}/f${i}.pdf`);
    const res = await POST(req({ paths }));
    expect(res.status).toBe(400);
  });

  it('respects the daily limit', async () => {
    rateAllowed = false;
    const res = await POST(req({ paths: [`tenders/${TENDER}/a.pdf`] }));
    expect(res.status).toBe(429);
  });

  it('sends the PDF as a document and returns the tool input', async () => {
    const res = await POST(req({ paths: [`tenders/${TENDER}/a.pdf`] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].ok).toBe(true);
    expect(json.results[0].data.amount_net).toBe(8100);
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.tool_choice).toEqual({ type: 'tool', name: 'record_quote' });
    expect(sent.messages[0].content[0].type).toBe('document');
    expect(sent.messages[0].content[0].source.media_type).toBe('application/pdf');
  });

  it('reports unsupported file types without calling the AI', async () => {
    downloadResult = { data: new Blob(['x'], { type: 'text/plain' }), error: null };
    const res = await POST(req({ paths: [`tenders/${TENDER}/a.txt`] }));
    const json = await res.json();
    expect(json.results[0]).toMatchObject({ ok: false, error: 'unsupported_type' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
