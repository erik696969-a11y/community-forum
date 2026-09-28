import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { invoiceSheets, supplierSheets, tenderSheets, contractSheets, infoSheet, noticeBy, exportFileName } from '../memoriaListExport';
import { buildXlsx } from '../xlsxWriter';

const sup = { s1: { id: 's1', name: 'Piscinas Mediterráneo S.L.', tax_id: 'B1' }, s2: { id: 's2', name: 'AquaSur', tax_id: 'B2' } };
const supplierName = { s1: sup.s1.name, s2: sup.s2.name };

describe('list export', () => {
  it('builds invoice rows with readable labels, numbers and linked names', () => {
    const [sh] = invoiceSheets('es', [{ invoice_date: '2026-09-01', invoice_number: 'F-1', supplier_id: 's1', total_amount: '121.5', net_amount: 100, vat_amount: 21.5, category: 'pools', funding_source: 'reserve_fund', payment_status: 'paid', is_urgent_unbudgeted: true, ratified_by_decision_id: 'd1', is_demo: true }], {
      supplierById: sup, decisionById: { d1: { decided_on: '2026-09-10', title: 'Ratificar' } },
    });
    expect(sh.name).toBe('Facturas');
    const r = sh.rows[0];
    expect(r['Proveedor']).toBe('Piscinas Mediterráneo S.L.');
    expect(r['NIF/CIF']).toBe('B1');
    expect(r['Total']).toBe(121.5);
    expect(r['Pagado con']).toBe('Fondo de reserva');
    expect(r['Urgente no presupuestado']).toBe('sí');
    expect(r['Ratificado por acuerdo']).toBe('2026-09-10 · Ratificar');
    expect(r.DEMO).toBe('sí');
  });

  it('exports tenders and their quotes, optionally only one supplier', () => {
    const t = { id: 't1', title: 'Pool maintenance', status: 'collecting', approved_budget: 40000, selected_supplier_id: 's2' };
    const qs = { t1: [{ tender_id: 't1', supplier_id: 's1', amount: 38400, vat_included: false }, { tender_id: 't1', supplier_id: 's2', amount: 41200, vat_included: true }] };
    const [tenders, quotes] = tenderSheets('en', [t], { quotesByTender: qs, supplierName });
    expect(tenders.rows[0]['Quotes']).toBe(2);
    expect(tenders.rows[0]['Lowest quote']).toBe(38400);
    expect(tenders.rows[0]['Selected supplier']).toBe('AquaSur');
    expect(quotes.rows.map((q) => [q['Supplier'], q['Chosen'], q['Over budget']])).toEqual([['Piscinas Mediterráneo S.L.', 'no', 'no'], ['AquaSur', 'yes', 'yes']]);
    const [, only] = tenderSheets('en', [t], { quotesByTender: qs, supplierName, supplierFilter: 's1' });
    expect(only.rows).toHaveLength(1);
  });

  it('computes the notice date and exports contracts and suppliers', () => {
    expect(noticeBy({ auto_renew: true, ends_on: '2026-12-31', notice_period_days: 30 })).toBe('2026-12-01');
    expect(noticeBy({ auto_renew: false, ends_on: '2026-12-31', notice_period_days: 30 })).toBeNull();
    const [c] = contractSheets('en', [{ subject: 'Gardening', supplier_id: 's1', auto_renew: true, ends_on: '2026-12-31', notice_period_days: 30, payment_frequency: 'monthly', status: 'active' }], { supplierName });
    expect(c.rows[0]['Give notice by']).toBe('2026-12-01');
    expect(c.rows[0]['Payment']).toBe('Monthly');
    const [s] = supplierSheets('en', [{ id: 's1', name: 'X', category: 'pools', status: 'active' }], { ratingsBySupplier: { s1: [{ rating: 4 }, { rating: 5 }] } });
    expect(s.rows[0]['Average rating (1–5)']).toBe(4.5);
    expect(s.rows[0]['Category']).toBe('Pools');
  });

  it('writes a valid workbook with an info sheet', async () => {
    const info = infoSheet('en', { listKey: 'xSheetInvoices', filters: ['Year: 2026'], count: 3, total: 99.5, now: new Date('2026-09-28T10:00:00Z') });
    expect(info.rows.find((r) => r.Info === 'Filters')[' ']).toBe('Year: 2026');
    const zip = buildXlsx(JSZip, [info, ...invoiceSheets('en', [], {})]);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    expect(bytes.length).toBeGreaterThan(500);
    expect(exportFileName('Facturas', new Date('2026-09-28T10:00:00Z'))).toBe('memoria-facturas-2026-09-28.xlsx');
  });
});
