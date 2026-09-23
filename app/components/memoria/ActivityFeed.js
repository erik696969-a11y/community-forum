'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatDate, formatTime } from '../../../lib/formatDate';
import { mt } from '../../../lib/memoriaI18n';
import { ErrorBox, Pill } from './MemoriaUi';

const PAGE_SIZE = 50;
const ACTION_TONE = { insert: 'green', update: 'harbor', delete: 'red' };

function humanizeField(field) {
  return field.replace(/_id$/, '').replace(/_/g, ' ');
}

export default function ActivityFeed({ lang, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  async function fetchPage(before) {
    let q = supabase.from('memoria_activity').select('*').order('id', { ascending: false }).limit(PAGE_SIZE);
    if (before) q = q.lt('id', before);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      return [];
    }
    const list = data || [];
    setHasMore(list.length === PAGE_SIZE);

    const missing = [...new Set(list.map((r) => r.actor_id).filter(Boolean))].filter((id) => !(id in names));
    if (missing.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
      setNames((prev) => ({ ...prev, ...Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])) }));
    }
    return list;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingData(true);
      const list = await fetchPage(null);
      if (active) {
        setRows(list);
        setLoadingData(false);
      }
    })();
    return () => {
      active = false;
    };
    // refreshKey: znovu načítať po zmene v iných kartách
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    const list = await fetchPage(last.id);
    setRows((prev) => [...prev, ...list]);
  }

  // Zoskupenie podľa dňa.
  const groups = [];
  for (const r of rows) {
    const day = formatDate(r.occurred_at, lang);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.day === day) lastGroup.items.push(r);
    else groups.push({ day, items: [r] });
  }

  return (
    <div>
      <p className="text-sm text-ink/60 mb-4">{mt(lang, 'activityIntro')}</p>
      <ErrorBox message={error} />
      {loadingData ? (
        <p className="text-ink/60">{mt(lang, 'loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-ink/60">{mt(lang, 'empty')}</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">{g.day}</p>
              <div className="card divide-y divide-ink/10">
                {g.items.map((r) => (
                  <div key={r.id} className="p-3 flex items-start gap-3">
                    <span className="text-xs text-ink/50 w-12 flex-shrink-0 pt-0.5">{formatTime(r.occurred_at, lang)}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{names[r.actor_id] || mt(lang, 'someone')}</span>{' '}
                        {mt(lang, `action_${r.action}`)}{' '}
                        <Pill tone={ACTION_TONE[r.action]}>{mt(lang, `entity_${r.table_name}`)}</Pill>
                        {r.label && <span className="text-ink/80"> {r.label}</span>}
                      </p>
                      {r.action === 'update' && r.changed_fields?.length > 0 && (
                        <p className="text-xs text-ink/50 mt-0.5">
                          {mt(lang, 'changedFields')}: {r.changed_fields.map(humanizeField).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hasMore && (
            <button className="btn-secondary text-sm" onClick={loadMore}>{mt(lang, 'loadMore')}</button>
          )}
        </div>
      )}
    </div>
  );
}
