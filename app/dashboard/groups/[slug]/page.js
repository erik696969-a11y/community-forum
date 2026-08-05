'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { useLanguage } from '../../../../lib/useLanguage';
import { useRefreshOnFocus } from '../../../../lib/useRefreshOnFocus';
import { markSeen } from '../../../../lib/useLastSeen';
import { supabase } from '../../../../lib/supabaseClient';
import { t } from '../../../../lib/i18n';
import Header from '../../../components/Header';

function localizedField(item, field, lang) {
  if (item.original_lang === lang) return item[field];
  const translations = item[`${field}_translations`];
  return translations?.[lang] || item[field];
}

export default function GroupDetailPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const params = useParams();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [isMember, setIsMember] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  const load = useCallback(async () => {
    const { data: groupData } = await supabase
      .from('interest_groups')
      .select('*')
      .eq('slug', params.slug)
      .single();
    setGroup(groupData);

    if (groupData) {
      const { data: memberData } = await supabase
        .from('interest_group_members')
        .select('user_id, profiles(full_name, apartment_number)')
        .eq('group_id', groupData.id);
      setMembers(memberData || []);
      setIsMember((memberData || []).some((m) => m.user_id === session?.user?.id));

      const { data: postsData } = await supabase
        .from('posts')
        .select('*, author:profiles(full_name, apartment_number)')
        .eq('interest_group_id', groupData.id)
        .order('created_at', { ascending: false });
      setPosts(postsData || []);
      markSeen(`group:${groupData.id}`);
    }
    setLoadingData(false);
  }, [params.slug, session]);

  useEffect(() => {
    if (profile?.status === 'approved') load();
  }, [profile, load]);

  useRefreshOnFocus(load);

  async function toggleMembership() {
    if (isMember) {
      await supabase
        .from('interest_group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', session.user.id);
    } else {
      await supabase.from('interest_group_members').insert({ group_id: group.id, user_id: session.user.id });
    }
    load();
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">{t(lang, 'postNotFound')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard/groups" className="text-sm text-harbor/70 hover:text-harbor">
          {t(lang, 'backToGroups')}
        </Link>

        <div className="flex items-center justify-between mt-3 mb-2 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor flex items-center gap-2">
            <span>{group.icon}</span> {group[`name_${lang}`] || group.name_en}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              disabled={refreshing}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <span className={refreshing ? 'inline-block animate-spin' : ''}>🔄</span>
              {t(lang, 'refreshButton')}
            </button>
            <button
              onClick={toggleMembership}
              className={isMember ? 'btn-secondary text-sm' : 'btn-primary text-sm'}
            >
              {isMember ? t(lang, 'leaveGroup') : t(lang, 'joinGroup')}
            </button>
          </div>
        </div>

        <p className="text-sm text-ink/60 mb-6">
          {members.length} {t(lang, 'members')}
          {members.length > 0 && ': ' + members.map((m) => m.profiles?.full_name).filter(Boolean).join(', ')}
        </p>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-harbor">{t(lang, 'postsLabel')}</h2>
          <Link
            href={`/dashboard/new-post?category=aktivity&group=${group.slug}`}
            className="btn-primary text-sm"
          >
            {t(lang, 'newPost')}
          </Link>
        </div>

        {posts.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noPostsYet')}</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/dashboard/post/${post.id}`}
                className="card p-5 block hover:border-ochre transition-colors"
              >
                <h3 className="font-display text-lg text-harbor">{localizedField(post, 'title', lang)}</h3>
                <p className="text-sm text-ink/70 mt-1 line-clamp-2">{localizedField(post, 'content', lang)}</p>
                <p className="text-xs text-ink/50 mt-2">
                  {post.author?.full_name} · {post.author?.apartment_number} ·{' '}
                  {new Date(post.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
