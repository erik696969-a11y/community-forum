'use client';

// Úplný export Memorie: všetky tabuľky (Excel + JSON) a všetky priložené dokumenty v jednom ZIP.
// Komunita si kópiu môže uložiť kdekoľvek — nezávisle od tejto aplikácie.

import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { mt, todayIso } from '../../../lib/memoriaI18n';
import { buildXlsx } from '../../../lib/xlsxWriter';
import { ErrorBox } from './MemoriaUi';

const BUCKET = 'memoria';
const PAGE = 1000;

export const EXPORT_TABLES = [
  'memoria_decisions',
  'memoria_decision_links',
  'memoria_tasks',
  'memoria_task_updates',
  'memoria_obligations',
  'memoria_obligation_logs',
  'memoria_meetings',
  'memoria_meeting_items',
  'memoria_mandates',
  'memoria_suppliers',
  'memoria_supplier_ratings',
  'memoria_tenders',
  'memoria_quotes',
  'memoria_contracts',
  'memoria_invoices',
  'memoria_documents',
  'memoria_activity',
];

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function safeFileName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

export default function ExportPanel({ lang, profile }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [result, setResult] = useState('');
  const [failedNote, setFailedNote] = useState('');
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    setResult('');
    setFailedNote('');
    try {
      const { default: JSZip } = await import('jszip');
      const tables = {};
      let rowCount = 0;
      for (const t of EXPORT_TABLES) {
        setStep(t.replace('memoria_', ''));
        tables[t] = await fetchAll(t);
        rowCount += tables[t].length;
      }

      const zip = new JSZip();
      const exportedAt = new Date().toISOString();
      const xlsx = buildXlsx(
        JSZip,
        EXPORT_TABLES.map((t) => ({ name: t.replace('memoria_', ''), rows: tables[t] }))
      );
      zip.file('memoria.xlsx', await xlsx.generateAsync({ type: 'uint8array' }));
      zip.file(
        'memoria.json',
        JSON.stringify({ exported_at: exportedAt, exported_by: profile?.full_name || null, tables }, null, 2)
      );

      const docs = tables.memoria_documents.filter((d) => d.storage_path);
      const failed = [];
      let docCount = 0;
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        setStep(`${i + 1}/${docs.length}`);
        const { data, error: dlErr } = await supabase.storage.from(BUCKET).download(d.storage_path);
        if (dlErr || !data) {
          failed.push(`${d.id} · ${d.title} · ${d.storage_path}`);
          continue;
        }
        const folder = d.entity_type || 'general';
        const base = d.storage_path.split('/').pop();
        zip.file(`documents/${folder}/${d.id.slice(0, 8)}-${safeFileName(base)}`, data);
        docCount += 1;
      }
      const links = tables.memoria_documents.filter((d) => !d.storage_path && d.external_url);

      const counts = EXPORT_TABLES.map((t) => `  ${t.replace('memoria_', '').padEnd(20)} ${tables[t].length}`).join('\n');
      zip.file(
        'LEEME-README.txt',
        [
          'MEMORIA — full export / exportación completa',
          `Exported / exportado: ${exportedAt}`,
          `By / por: ${profile?.full_name || '-'}`,
          '',
          'memoria.xlsx   one sheet per table / una hoja por tabla',
          'memoria.json   the same data, machine-readable / los mismos datos, legibles por máquina',
          'documents/     attached files by record type / archivos adjuntos por tipo de registro',
          '',
          'Records per table / registros por tabla:',
          counts,
          '',
          `Documents downloaded / documentos descargados: ${docCount}`,
          `Documents stored as external links (not downloaded) / documentos con enlace externo: ${links.length}`,
          ...links.map((d) => `  ${d.title}: ${d.external_url}`),
          failed.length ? `Documents that could not be downloaded / no descargados: ${failed.length}` : '',
          ...failed.map((f) => `  ${f}`),
          '',
          'Column is_demo = true marks fictional sample data. / La columna is_demo = true marca datos ficticios de ejemplo.',
        ].join('\n')
      );

      setStep('ZIP');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoria-export-${todayIso()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setResult(mt(lang, 'exportDone', { tables: EXPORT_TABLES.length, rows: rowCount, docs: docCount }));
      if (failed.length) setFailedNote(mt(lang, 'exportDocsFailed', { n: failed.length }));
    } catch (e) {
      setError(mt(lang, 'saveError', { error: e.message }));
    } finally {
      setBusy(false);
      setStep('');
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm text-ink/70">{mt(lang, 'exportIntro')}</p>
      <p className="text-xs text-ink/50">{mt(lang, 'exportContents')}</p>
      <button className="btn-primary" disabled={busy} onClick={run}>
        💾 {busy ? mt(lang, 'exportRunning', { step }) : mt(lang, 'exportButton')}
      </button>
      {result && <p className="text-sm text-sea">{result}</p>}
      {failedNote && <p className="text-sm text-ochre">{failedNote}</p>}
      <ErrorBox message={error} />
    </div>
  );
}
