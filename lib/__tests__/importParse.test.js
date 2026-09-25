import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  decodeText, detectDelimiter, parseDelimited, readXlsx, findHeaderRow, guessMapping, parseAmount, parseDate,
  normTaxId, matchSupplier, buildRecords, findDuplicate, guessDecimal, guessDateOrder,
} from '../importParse';
import { buildXlsx } from '../xlsxWriter';

describe('text and CSV', () => {
  it('decodes UTF-8 and falls back to Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('﻿Fontanería'))).toBe('Fontanería');
    expect(decodeText(new Uint8Array([0x46, 0x6f, 0x6e, 0x74, 0x61, 0x6e, 0x65, 0x72, 0xed, 0x61]))).toBe('Fontanería');
  });

  it('detects the delimiter and keeps quoted separators', () => {
    const text = 'FECHA;PROVEEDOR;IMPORTE\n05/08/2026;"Electro; Costa";"1.234,56"\n06/08/2026;Aguas;12,00\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseDelimited(text)[1]).toEqual(['05/08/2026', 'Electro; Costa', '1.234,56']);
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
});

describe('amounts and dates', () => {
  it('reads Spanish and English number formats', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('3932,5')).toBe(3932.5);
    expect(parseAmount('1.234', ',')).toBe(1234);
    expect(parseAmount('12.50 €')).toBe(12.5);
    expect(parseAmount('(45,00)')).toBe(-45);
    expect(parseAmount('45,00-')).toBe(-45);
    expect(parseAmount(774.4)).toBe(774.4);
    expect(parseAmount('n/a')).toBeNull();
  });

  it('reads Excel serials, ISO and day-first dates', () => {
    expect(parseDate(46239)).toBe('2026-08-05');
    expect(parseDate('2026-08-05T00:00:00')).toBe('2026-08-05');
    expect(parseDate('05/08/2026')).toBe('2026-08-05');
    expect(parseDate('5.8.26')).toBe('2026-08-05');
    expect(parseDate('08/05/2026', 'MDY')).toBe('2026-08-05');
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('guesses decimal separator and date order', () => {
    expect(guessDecimal(['1.234,56', '12,00'])).toBe(',');
    expect(guessDecimal(['1,234.56', '12.00'])).toBe('.');
    expect(guessDateOrder(['25/08/2026', '05/08/2026'])).toBe('DMY');
    expect(guessDateOrder(['08/25/2026'])).toBe('MDY');
  });
});

describe('header and mapping', () => {
  const rows = [
    ['COMUNIDAD DE PROPIETARIOS EJEMPLO'],
    ['Listado de facturas recibidas', '', 'Agosto 2026'],
    ['Nº Factura', 'Fecha', 'Proveedor', 'NIF', 'Concepto', 'Base imponible', 'IVA', 'Total', 'Fecha pago', 'Cuenta'],
    ['EIC-2026-058', '05/08/2026', 'Electro Instalaciones Costa', 'B00000009', 'Garaje', '640,00', '134,40', '774,40', '', '622 Reparaciones'],
  ];

  it('finds the header row below title lines', () => {
    expect(findHeaderRow(rows)).toBe(2);
  });

  it('maps Spanish headers to fields', () => {
    const m = guessMapping(rows[2]);
    expect(m).toMatchObject({
      invoice_number: 0, invoice_date: 1, supplier_name: 2, supplier_tax_id: 3, description: 4,
      net_amount: 5, vat_amount: 6, total_amount: 7, paid_on: 8, admin_category: 9,
    });
  });

  it('maps English and short headers', () => {
    const m = guessMapping(['Date', 'Supplier', 'VAT number', 'Invoice no', 'Amount', 'Status']);
    expect(m).toMatchObject({ invoice_date: 0, supplier_name: 1, supplier_tax_id: 2, invoice_number: 3, total_amount: 4, payment_status: 5 });
  });
});

describe('records, suppliers and duplicates', () => {
  const mapping = { invoice_number: 0, invoice_date: 1, supplier_name: 2, supplier_tax_id: 3, description: 4, net_amount: 5, vat_amount: 6, total_amount: 7, paid_on: 8, admin_category: 9, due_date: null, payment_status: null };
  const data = [
    ['EIC-2026-058', '05/08/2026', 'Electro Instalaciones Costa', 'ES-B00000009', 'Garaje', '640,00', '134,40', '774,40', '', '622'],
    ['AC-88', '10/08/2026', 'Aguas Costa Ejemplo SA', '', 'Agua', '100,00', '10,00', '', '20/08/2026', '628'],
    ['', '', '', '', 'TOTAL AGOSTO', '', '', '874,40', '', ''],
    ['X-1', '', 'Sin fecha SL', '', '', '', '', '', '', ''],
  ];
  const recs = buildRecords(data, mapping, { decimal: ',', dateOrder: 'DMY' });

  it('builds records, fills the total from net + VAT and skips summary rows', () => {
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ invoice_date: '2026-08-05', total_amount: 774.4, net_amount: 640 });
    expect(recs[1]).toMatchObject({ total_amount: 110, paid_on: '2026-08-20', payment_status: 'paid' });
  });

  it('matches suppliers by tax id and by name without legal suffix', () => {
    const suppliers = [
      { id: 's9', name: 'Electro Instalaciones Costa', tax_id: 'B00000009' },
      { id: 'sa', name: 'Aguas Costa Ejemplo, S.A.', tax_id: null },
    ];
    expect(normTaxId('ES-B00000009')).toBe('B00000009');
    expect(matchSupplier(recs[0], suppliers)).toMatchObject({ supplier: { id: 's9' }, how: 'tax_id' });
    expect(matchSupplier(recs[1], suppliers)).toMatchObject({ supplier: { id: 'sa' }, how: 'name' });
    expect(matchSupplier({ supplier_name: 'Unknown' }, suppliers)).toBeNull();
  });

  it('finds duplicates by number, then by date and amount', () => {
    const existing = [
      { supplier_id: 's9', invoice_number: 'eic-2026-058', invoice_date: '2026-08-05', total_amount: '774.40' },
      { supplier_id: 'sa', invoice_number: null, invoice_date: '2026-08-10', total_amount: '110.00' },
    ];
    expect(findDuplicate(recs[0], 's9', existing)).toMatchObject({ kind: 'same_number' });
    expect(findDuplicate(recs[1], 'sa', existing)).toMatchObject({ kind: 'same_date_amount' });
    expect(findDuplicate(recs[1], null, existing)).toBeNull();
  });
});

describe('xlsx reader', () => {
  it('reads back a workbook with strings, numbers and dates', async () => {
    const zip = buildXlsx(JSZip, [{ name: 'Facturas', columns: ['Fecha', 'Proveedor', 'Total'], rows: [{ Fecha: 46239, Proveedor: 'A & B', Total: 774.4 }] }]);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const sheets = await readXlsx(JSZip, bytes);
    expect(sheets[0].name).toBe('Facturas');
    expect(sheets[0].rows).toEqual([['Fecha', 'Proveedor', 'Total'], [46239, 'A & B', 774.4]]);
  });

  it('reads shared strings', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<sst><si><t>Proveedor</t></si><si><r><t>Fontaner</t></r><r><t>ía</t></r></si></sst>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>');
    const sheets = await readXlsx(JSZip, await zip.generateAsync({ type: 'uint8array' }));
    expect(sheets[0].rows[0]).toEqual(['Proveedor', '', 'Fontanería']);
  });
});
