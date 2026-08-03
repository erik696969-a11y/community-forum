'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function GroupsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [groups, setGroups] = useState([]);
  const [myGroupIds, setMyGroupIds] = useState(new Set());
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!profile || profile.status !== 'approved') {
      router.replace('/pending');
    }
  }, [loading, session, profile, router]);

  async function loadGroups() {
    const { data: groupsData } = await supabase
      .from('interest_groups')
      .select('*, interest_group_members(user_id)')
      .order('sort_order');
    setGroups(groupsData || []);

    if (session) {
      const mine = new Set();
      (groupsData || []).forEach((g) => {
        if (g.interest_group_members.some((m) => m.user_id === session.user.id)) mine.add(g.id);
      });
      setMyGroupIds(mine);
    }
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function toggleMembership(groupId, isMember) {
    if (isMember) {
      await supabase
        .from('interest_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', session.user.id);
    } else {
      await supabase.from('interest_group_members').insert({ group_id: groupId, user_id: session.user.id });
    }
    loadGroups();
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'interestGroupsTitle')}</h1>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => {
              const isMember = myGroupIds.has(g.id);
              const memberCount = g.interest_group_members.length;
              return (
                <div key={g.id} className="card p-5">
                  <Link href={`/dashboard/groups/${g.slug}`} className="block hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{g.icon}</span>
                      <h2 className="font-display text-lg text-harbor">{g[`name_${lang}`] || g.name_en}</h2>
                    </div>
                    <p className="text-sm text-ink/60">
                      {memberCount} {t(lang, 'members')}
                    </p>
                  </Link>
                  <button
                    onClick={() => toggleMembership(g.id, isMember)}
                    className={isMember ? 'btn-secondary text-sm mt-3' : 'btn-primary text-sm mt-3'}
                  >
                    {isMember ? t(lang, 'leaveGroup') : t(lang, 'joinGroup')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
