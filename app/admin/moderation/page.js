'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const STATUS_TABS = [
  ['pending', 'statusPending'],
  ['under_review', 'statusUnderReview'],
  ['resolved', 'statusResolved'],
  ['dismissed', 'statusDismissed'],
];

export default function ModerationPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [reports, setReports] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState('pending');
  const [notes, setNotes] = useState({});

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'board') {
      router.replace('/dashboard');
    }
  }, [loading, session, profile, router]);

  async function load() {
    const { data } = await supabase
      .from('reports')
      .select('*, post:posts(id, title), comment:comments(id, content, post_id), reporter:profiles(full_name)')
      .order('created_at', { ascending: false });
    setReports(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.role === 'board') load();
  }, [profile]);

  async function updateReportStatus(id, status) {
    await supabase.from('reports').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('admin_audit_log').insert({
      admin_id: profile.id,
      action: `report_${status}`,
      target_type: 'report',
      target_id: id,
    });
    load();
  }

  async function saveNote(id) {
    await supabase.from('reports').update({ admin_notes: notes[id] || '' }).eq('id', id);
    load();
  }

  if (loading || !profile || profile.role !== 'board') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const filtered = reports.filter((r) => r.status === tab);

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'moderationTitle')}</h1>

        <div className="flex gap-2 mb-6 flex-wrap">
          {STATUS_TABS.map(([key, labelKey]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={tab === key ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            >
              {t(lang, labelKey)} ({reports.filter((r) => r.status === key).length})
            </button>
          ))}
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noReports')}</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((r) => {
              const linkHref = r.target_type === 'post' ? `/dashboard/post/${r.post?.id}` : `/dashboard/post/${r.comment?.post_id}`;
              const preview = r.target_type === 'post' ? r.post?.title : r.comment?.content;
              return (
                <div key={r.id} className="card p-5">
                  <p className="text-xs text-ink/50 mb-1">
                    {t(lang, 'reportContent')}: {r.target_type} · {r.reporter?.full_name} ·{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-ink mb-2 line-clamp-2">"{preview}"</p>
                  {r.reason && <p className="text-sm text-ink/70 italic mb-2">{r.reason}</p>}
                  <Link href={linkHref} target="_blank" className="text-xs text-harbor underline">
                    {t(lang, 'viewReported')}
                  </Link>

                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-harbor mb-1">{t(lang, 'adminNotesLabel')}</label>
                    <textarea
                      rows={2}
                      defaultValue={r.admin_notes || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={() => saveNote(r.id)}
                      className="input-field text-sm"
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap mt-3">
                    {tab !== 'under_review' && (
                      <button onClick={() => updateReportStatus(r.id, 'under_review')} className="btn-secondary text-xs">
                        {t(lang, 'statusUnderReview')}
                      </button>
                    )}
                    {tab !== 'resolved' && (
                      <button onClick={() => updateReportStatus(r.id, 'resolved')} className="btn-secondary text-xs">
                        {t(lang, 'statusResolved')}
                      </button>
                    )}
                    {tab !== 'dismissed' && (
                      <button onClick={() => updateReportStatus(r.id, 'dismissed')} className="btn-secondary text-xs">
                        {t(lang, 'statusDismissed')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
