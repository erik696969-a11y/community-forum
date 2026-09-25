import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildXlsx, columnName, safeSheetName } from '../xlsxWriter';

describe('xlsxWriter', () => {
  it('names columns like Excel', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(701)).toBe('ZZ');
  });

  it('makes sheet names valid and unique', () => {
    const used = new Set();
    expect(safeSheetName('a/b', used)).toBe('a b');
    expect(safeSheetName('a/b', used)).toBe('a b 2');
    expect(safeSheetName('x'.repeat(40), used)).toHaveLength(31);
  });

  it('writes a workbook with typed and escaped cells', async () => {
    const zip = buildXlsx(JSZip, [
      { name: 'suppliers', rows: [{ name: 'A & <B>', amount: 12.5, active: true, tags: ['x'], empty: null }] },
      { name: 'empty', rows: [] },
    ]);
    const files = Object.keys(zip.files);
    expect(files).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']));
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    expect(sheet).toContain('A &amp; &lt;B&gt;');
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain('[&quot;x&quot;]');
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain('name="suppliers"');
  });
});
