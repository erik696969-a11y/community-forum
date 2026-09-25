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
          adminClient: {
            rpc: async () => ({ data: true }),
            storage: { from: () => ({ download: async () => ({ data: blob, error: null }) }) },
          },
        }
      : null
  ),
}));

import { POST } from '../route';
const req = (b) => new Request('http://x', { method: 'POST', body: JSON.stringify(b) });
const toolReply = (input, stop = 'tool_use') => ({ ok: true, json: async () => ({ stop_reason: stop, content: [{ type: 'tool_use', input }] }) });

describe('import-assist route', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    profile = { role: 'board', status: 'approved' };
  });

  it('is board only and needs a known action', async () => {
    profile = { role: 'owner', status: 'approved' };
    expect((await POST(req({ action: 'map' }))).status).toBe(403);
    profile = { role: 'board', status: 'approved' };
    expect((await POST(req({ action: 'x' }))).status).toBe(400);
  });

  it('map: keeps only valid column indexes', async () => {
    global.fetch = vi.fn(async () => toolReply({ invoice_number: 0, invoice_date: 1, total_amount: 7, supplier_name: 99, decimal: ',', date_order: 'DMY' }));
    const json = await (await POST(req({ action: 'map', headers: ['Nº', 'Fecha', 'c', 'd', 'e', 'f', 'g', 'Total'], sample: [['1', '2']] }))).json();
    expect(json.mapping).toMatchObject({ invoice_number: 0, invoice_date: 1, total_amount: 7, supplier_name: null, vat_amount: null });
    expect(json.dateOrder).toBe('DMY');
  });

  it('classify: turns supplier codes into ids and cleans categories', async () => {
    global.fetch = vi.fn(async () =>
      toolReply({ items: [{ i: 0, category: 'utilities', supplier_ref: 'S2', new_supplier_category: 'utilities', is_supplier_invoice: true }, { i: 1, category: 'bogus', supplier_ref: null, new_supplier_category: 'x', is_supplier_invoice: false }] })
    );
    const json = await (await POST(req({ action: 'classify', rows: [{ i: 0 }, { i: 1 }], suppliers: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }))).json();
    expect(json.items[0]).toMatchObject({ supplier_id: 'b', category: 'utilities' });
    expect(json.items[1]).toMatchObject({ supplier_id: null, category: 'other', new_supplier_category: 'other', is_supplier_invoice: false });
  });

  it('extract: only reads files in the imports folder and reports truncation', async () => {
    expect((await POST(req({ action: 'extract', path: 'tenders/x/y.pdf' }))).status).toBe(400);
    global.fetch = vi.fn(async () => toolReply({ rows: [{ supplier_name: 'A', total_amount: 10 }], period: 'Agosto 2026' }, 'max_tokens'));
    const json = await (await POST(req({ action: 'extract', path: 'imports/0f1bc1be-d115-449f-b2ad-1f7ad27aded2/list.pdf' }))).json();
    expect(json.rows).toHaveLength(1);
    expect(json.truncated).toBe(true);
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.messages[0].content[0].type).toBe('document');
  });
});
