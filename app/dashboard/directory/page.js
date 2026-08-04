'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import { BADGE_OPTIONS } from '../../../lib/badges';
import Header from '../../components/Header';
import AuthorBadges from '../../components/AuthorBadges';

const LANG_FLAGS = { en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪' };

export default function DirectoryPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [members, setMembers] = useState([]);
  const [groupsByUser, setGroupsByUser] = useState({});
  const [allGroups, setAllGroups] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterLang, setFilterLang] = useState('all');

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

  useEffect(() => {
    async function loadDirectory() {
      const { data: membersData } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'approved')
        .eq('directory_visible', true)
        .order('full_name');
      setMembers(membersData || []);

      const { data: groupsData } = await supabase.from('interest_groups').select('*').order('sort_order');
      setAllGroups(groupsData || []);

      const { data: membershipData } = await supabase
        .from('interest_group_members')
        .select('user_id, group_id, interest_groups(name_en, icon)');
      const grouped = {};
      (membershipData || []).forEach((m) => {
        if (!grouped[m.user_id]) grouped[m.user_id] = [];
        grouped[m.user_id].push(m.interest_groups);
      });
      setGroupsByUser(grouped);

      setLoadingData(false);
    }
    if (profile?.status === 'approved') loadDirectory();
  }, [profile]);

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const filtered = members.filter((m) => {
    if (filterLang !== 'all' && !(m.spoken_languages || []).includes(filterLang)) return false;
    if (filterGroup !== 'all') {
      const userGroupIds = (groupsByUser[m.id] || []).map((g) => g?.name_en);
      if (!(groupsByUser[m.id] || []).some((g) => g && allGroups.find((ag) => ag.name_en === g.name_en)?.id === filterGroup)) {
        return false;
      }
    }
    return true;
  });

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-6">{t(lang, 'directoryTitle')}</h1>

        <div className="flex gap-2 mb-6 flex-wrap">
          <select value={filterLang} onChange={(e) => setFilterLang(e.target.value)} className="input-field text-sm max-w-[160px]">
            <option value="all">{t(lang, 'filterAll')} 🌐</option>
            {Object.entries(LANG_FLAGS).map(([code, flag]) => (
              <option key={code} value={code}>
                {flag} {code.toUpperCase()}
              </option>
            ))}
          </select>
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="input-field text-sm max-w-[200px]">
            <option value="all">{t(lang, 'filterAll')}</option>
            {allGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon} {g[`name_${lang}`] || g.name_en}
              </option>
            ))}
          </select>
        </div>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noDirectoryMembers')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => (
              <div key={m.id} className="card p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-harbor">
                    {m.full_name}
                    <AuthorBadges badges={m.badges} />
                    {m.role === 'board' && <span className="ml-1 text-xs text-ochre font-semibold">({t(lang, 'board')})</span>}
                  </p>
                  <span className="text-sm">
                    {(m.spoken_languages || []).map((l) => LANG_FLAGS[l]).join(' ')}
                  </span>
                </div>
                {(groupsByUser[m.id] || []).length > 0 && (
                  <p className="text-xs text-ink/60 mt-1">
                    {groupsByUser[m.id].map((g) => `${g?.icon || ''} ${g?.name_en || ''}`).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
