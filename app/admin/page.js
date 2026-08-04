'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../lib/useProfile';
import { useLanguage } from '../../lib/useLanguage';
import { supabase } from '../../lib/supabaseClient';
import { t } from '../../lib/i18n';
import { BADGE_OPTIONS } from '../../lib/badges';
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
      .in('status', ['approved', 'suspended'])
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

  async function toggleBadge(profileId, badgeKey, currentBadges) {
    const has = (currentBadges || []).includes(badgeKey);
    const next = has
      ? currentBadges.filter((b) => b !== badgeKey)
      : [...(currentBadges || []), badgeKey];
    await supabase.from('profiles').update({ badges: next }).eq('id', profileId);
    loadProfiles();
  }

  async function logAudit(action, targetType, targetId, details) {
    await supabase.from('admin_audit_log').insert({
      admin_id: profile.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
    });
  }

  async function toggleMute(id, name, currentlyMuted) {
    await supabase.from('profiles').update({ muted: !currentlyMuted }).eq('id', id);
    logAudit(currentlyMuted ? 'unmute' : 'mute', 'profile', id, name);
    loadProfiles();
  }

  async function toggleSuspend(id, name, currentlyApproved) {
    if (currentlyApproved) {
      const confirmed = window.confirm(t(lang, 'confirmSuspend').replace('{name}', name));
      if (!confirmed) return;
      await supabase.from('profiles').update({ status: 'suspended' }).eq('id', id);
      logAudit('suspend', 'profile', id, name);
    } else {
      await supabase.from('profiles').update({ status: 'approved' }).eq('id', id);
      logAudit('unsuspend', 'profile', id, name);
    }
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
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'managementTitle')}</h1>
          <Link href="/admin/moderation" className="btn-secondary text-sm">
            {t(lang, 'moderationTitle')}
          </Link>
        </div>

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
              <div>
                <p className="text-sm text-ink">
                  {p.full_name} · {p.apartment_number}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {BADGE_OPTIONS.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => toggleBadge(p.id, b.key, p.badges)}
                      title={b.label}
                      className={`text-sm px-1.5 py-0.5 rounded border ${
                        (p.badges || []).includes(b.key) ? 'bg-ochre/20 border-ochre' : 'border-transparent opacity-40 hover:opacity-100'
                      }`}
                    >
                      {b.emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                {p.role === 'board' && <span className="text-xs font-semibold text-ochre">{t(lang, 'board')}</span>}
                {p.status === 'suspended' && (
                  <span className="text-xs font-semibold text-red-600">{t(lang, 'suspendUser')}</span>
                )}
                {p.muted && <span className="text-xs font-semibold text-red-500">{t(lang, 'mutedLabel')}</span>}
                {p.role !== 'board' && (
                  <>
                    <button
                      onClick={() => toggleMute(p.id, p.full_name, p.muted)}
                      className="text-xs text-harbor/60 hover:text-harbor"
                    >
                      {p.muted ? t(lang, 'unmuteUser') : t(lang, 'muteUser')}
                    </button>
                    <button
                      onClick={() => toggleSuspend(p.id, p.full_name, p.status === 'approved')}
                      className="text-xs text-harbor/60 hover:text-harbor"
                    >
                      {p.status === 'suspended' ? t(lang, 'unsuspendUser') : t(lang, 'suspendUser')}
                    </button>
                    <button
                      onClick={() => handleRemoveAccess(p.id, p.full_name)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      {t(lang, 'removeAccess')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
