// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

let profile;
const blob = { size: 10, type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(10) };

vi.mock('../../../../../lib/serverAuth', () => ({
  getAuthedProfile: vi.fn(async () =>
    profile
      ? {
          user: { id: 'u' },
          profile,
          adminClient: { rpc: async () => ({ data: true }), storage: { from: () => ({ download: async () => ({ data: blob, error: null }) }) } },
        }
      : null
  ),
}));

import { POST } from '../route';
const req = (b) => new Request('http://x', { method: 'POST', body: JSON.stringify(b) });
const PATH = 'inbox/0f1bc1be-d115-449f-b2ad-1f7ad27aded2/contract.pdf';

describe('extract-document route', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    profile = { role: 'board', status: 'approved' };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { is_contract: true, supplier_name: 'A', notice_period_days: 60 } }] }) }));
  });

  it('is board only, needs a known kind and a file in the inbox folder', async () => {
    profile = { role: 'owner', status: 'approved' };
    expect((await POST(req({ kind: 'contract', path: PATH }))).status).toBe(403);
    profile = { role: 'board', status: 'approved' };
    expect((await POST(req({ kind: 'x', path: PATH }))).status).toBe(400);
    expect((await POST(req({ kind: 'contract', path: 'tenders/x/y.pdf' }))).status).toBe(400);
  });

  it('reads a contract with the contract tool and the requested language', async () => {
    const json = await (await POST(req({ kind: 'contract', path: PATH, lang: 'es' }))).json();
    expect(json.data).toMatchObject({ supplier_name: 'A', notice_period_days: 60 });
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.tool_choice.name).toBe('record_contract');
    expect(sent.system).toContain('Spanish');
    expect(sent.messages[0].content[0].type).toBe('document');
  });

  it('uses the invoice tool for invoices', async () => {
    await POST(req({ kind: 'invoice', path: PATH }));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).tool_choice.name).toBe('record_invoice');
  });
});
