'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import { supabase } from '../../lib/supabaseClient';
import { t } from '../../lib/i18n';
import Header from '../components/Header';

export default function AdminPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

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

  async function loadProfiles() {
    const { data: pendingData } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setPending(pendingData || []);

    const { data: approvedData } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'approved')
      .order('full_name', { ascending: true });
    setApproved(approvedData || []);

    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.role === 'board') {
      loadProfiles();
    }
  }, [profile]);

  async function updateStatus(id, status) {
    await supabase.from('profiles').update({ status }).eq('id', id);
    loadProfiles();
  }

  async function handleRemoveAccess(id, name) {
    const confirmed = window.confirm(t(lang, 'removeAccessConfirm').replace('{name}', name));
    if (!confirmed) return;
    await supabase.from('profiles').update({ status: 'rejected' }).eq('id', id);
    loadProfiles();
  }

  if (loading || !profile || profile.role !== 'board') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'managementTitle')}</h1>

        <h2 className="font-display text-lg text-harbor mb-3">
          {t(lang, 'pendingRequests')} ({pending.length})
        </h2>
        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : pending.length === 0 ? (
          <p className="text-ink/60 mb-8">{t(lang, 'noPendingRequests')}</p>
        ) : (
          <div className="space-y-3 mb-8">
            {pending.map((p) => (
              <div key={p.id} className="card p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-ink">{p.full_name}</p>
                  <p className="text-sm text-ink/60">{t(lang, 'apartment')}: {p.apartment_number}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => updateStatus(p.id, 'approved')} className="btn-primary text-sm">
                    {t(lang, 'approve')}
                  </button>
                  <button onClick={() => updateStatus(p.id, 'rejected')} className="btn-secondary text-sm">
                    {t(lang, 'reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="font-display text-lg text-harbor mb-3">
          {t(lang, 'approvedOwners')} ({approved.length})
        </h2>
        <div className="space-y-2">
          {approved.map((p) => (
            <div key={p.id} className="card p-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-ink">
                {p.full_name} · {p.apartment_number}
              </p>
              <div className="flex items-center gap-3 flex-shrink-0">
                {p.role === 'board' && <span className="text-xs font-semibold text-ochre">{t(lang, 'board')}</span>}
                {p.role !== 'board' && (
                  <button
                    onClick={() => handleRemoveAccess(p.id, p.full_name)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    {t(lang, 'removeAccess')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
