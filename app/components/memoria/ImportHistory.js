'use client';

// História importov faktúr: kedy, z akého súboru, za aké obdobie, koľko riadkov.
// Každý import sa dá vrátiť späť (zmažú sa faktúry, ktoré vytvoril).

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { getSignedUrl } from '../../../lib/storageClient';
import { formatDate } from '../../../lib/formatDate';
import { mt } from '../../../lib/memoriaI18n';
import { DemoPill, ErrorBox } from './MemoriaUi';

export default function ImportHistory({ lang, refreshKey, onChanged }) {
  const [imports, setImports] = useState([]);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await supabase.from('memoria_imports').select('*').order('created_at', { ascending: false }).limit(24);
    setImports(data || []);
    const ids = [...new Set((data || []).map((i) => i.created_by).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((profs || []).map((p) => [p.id, p.full_name])));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function openFile(path) {
    const win = window.open('', '_blank');
    const url = await getSignedUrl('memoria', path, 300);
    if (url && win) win.location.href = url;
    else win?.close();
  }

  async function undo(imp) {
    const { count } = await supabase.from('memoria_invoices').select('id', { count: 'exact', head: true }).eq('import_id', imp.id);
    if (!window.confirm(mt(lang, 'importUndoConfirm', { n: count ?? imp.rows_imported }))) return;
    setBusy(imp.id);
    setError('');
    const { error: e1 } = await supabase.from('memoria_invoices').delete().eq('import_id', imp.id);
    if (e1) {
      setError(mt(lang, 'saveError', { error: e1.message }));
      setBusy(null);
      return;
    }
    if (imp.storage_path) await supabase.storage.from('memoria').remove([imp.storage_path]);
    await supabase.from('memoria_imports').delete().eq('id', imp.id);
    setBusy(null);
    await load();
    onChanged?.();
  }

  if (imports.length === 0) return null;

  return (
    <div className="card p-4 mb-6">
      <p className="text-sm font-semibold text-harbor mb-2">🗂 {mt(lang, 'importHistory')}</p>
      <ul className="space-y-2">
        {imports.map((imp) => (
          <li key={imp.id} className="flex items-start justify-between gap-3 flex-wrap text-sm border-t border-ink/5 pt-2 first:border-0 first:pt-0">
            <div className="min-w-0">
              <p className="text-ink">
                {formatDate(imp.created_at.slice(0, 10), lang)} · <span className="font-semibold">{imp.file_name || '—'}</span>{' '}
                <span className="text-xs text-ink/50 uppercase">{imp.source_format}</span> <DemoPill show={imp.is_demo} />
              </p>
              <p className="text-xs text-ink/60">
                {imp.period_from ? `${formatDate(imp.period_from, lang)} – ${formatDate(imp.period_to, lang)} · ` : ''}
                {mt(lang, 'importRowsInfo', { n: imp.rows_imported, skipped: imp.rows_skipped })}
                {imp.created_by && names[imp.created_by] ? ` · ${names[imp.created_by]}` : ''}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              {imp.storage_path && (
                <button className="text-harbor hover:underline" onClick={() => openFile(imp.storage_path)}>📄 {mt(lang, 'importSourceFile')}</button>
              )}
              <button className="text-red-700 hover:underline" disabled={busy === imp.id} onClick={() => undo(imp)}>{mt(lang, 'importUndo')}</button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorBox message={error} />
    </div>
  );
}
