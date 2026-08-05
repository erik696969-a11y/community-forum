'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function InsightsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [stats, setStats] = useState(null);
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

  useEffect(() => {
    async function loadStats() {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        { count: newPosts },
        { count: newComments },
        { count: newMembers },
        { count: totalMembers },
        { data: monthComments },
        { data: monthPosts },
        { data: upcomingEvents },
      ] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('comments').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .gte('created_at', startOfMonth),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('comments').select('post_id, author_id').gte('created_at', startOfMonth),
        supabase.from('posts').select('id, title, author_id').gte('created_at', startOfMonth),
        supabase.from('events').select('id, title, event_date').gte('event_date', now.toISOString().slice(0, 10)),
      ]);

      // Most discussed topics this month (by comment count)
      const commentCountByPost = {};
      (monthComments || []).forEach((c) => {
        commentCountByPost[c.post_id] = (commentCountByPost[c.post_id] || 0) + 1;
      });
      const topPostIds = Object.entries(commentCountByPost)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([postId, count]) => ({ postId, count }));

      let topTopics = [];
      if (topPostIds.length > 0) {
        const { data: postTitles } = await supabase
          .from('posts')
          .select('id, title')
          .in('id', topPostIds.map((p) => p.postId));
        topTopics = topPostIds.map((p) => ({
          title: postTitles?.find((pt) => pt.id === p.postId)?.title || '—',
          count: p.count,
        }));
      }

      // Active members = distinct authors of posts or comments this month
      const activeAuthorIds = new Set();
      (monthPosts || []).forEach((p) => activeAuthorIds.add(p.author_id));
      (monthComments || []).forEach((c) => activeAuthorIds.add(c.author_id));
      const activePercent = totalMembers > 0 ? Math.round((activeAuthorIds.size / totalMembers) * 100) : 0;

      // RSVP counts for upcoming events
      let eventAttendance = [];
      if (upcomingEvents && upcomingEvents.length > 0) {
        const { data: rsvps } = await supabase
          .from('event_rsvps')
          .select('event_id, status')
          .in('event_id', upcomingEvents.map((e) => e.id))
          .eq('status', 'going');
        eventAttendance = upcomingEvents.map((e) => ({
          title: e.title,
          going: (rsvps || []).filter((r) => r.event_id === e.id).length,
        }));
      }

      setStats({
        newPosts: newPosts || 0,
        newComments: newComments || 0,
        newMembers: newMembers || 0,
        totalMembers: totalMembers || 0,
        activePercent,
        topTopics,
        eventAttendance,
      });
      setLoadingData(false);
    }
    if (profile?.role === 'board') loadStats();
  }, [profile]);

  if (loading || !profile || profile.role !== 'board' || loadingData || !stats) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-1">{t(lang, 'insightsTitle')}</h1>
        <p className="text-sm text-ochre font-semibold mb-6">{t(lang, 'thisMonthLabel')}</p>

        <div className="card p-6 space-y-3 mb-6">
          <p className="text-ink">
            <strong className="text-harbor text-lg">{stats.newPosts}</strong> {t(lang, 'newPostsLabel')}
          </p>
          <p className="text-ink">
            <strong className="text-harbor text-lg">{stats.newComments}</strong> {t(lang, 'newCommentsLabel')}
          </p>
          <p className="text-ink">
            <strong className="text-harbor text-lg">{stats.newMembers}</strong> {t(lang, 'newMembersLabel')}{' '}
            <span className="text-ink/50 text-sm">
              ({stats.totalMembers} {t(lang, 'totalMembersLabel')})
            </span>
          </p>
          <p className="text-ink">
            <strong className="text-harbor text-lg">{stats.activePercent}%</strong> {t(lang, 'activeMembersLabel')}
          </p>
        </div>

        <h2 className="font-display text-lg text-harbor mb-3">{t(lang, 'topTopicsLabel')}</h2>
        <div className="space-y-2 mb-6">
          {stats.topTopics.length === 0 ? (
            <p className="text-ink/60 text-sm">{t(lang, 'noTopicsYet')}</p>
          ) : (
            stats.topTopics.map((topic, i) => (
              <div key={i} className="card p-3 flex items-center justify-between">
                <p className="text-sm text-ink">{topic.title}</p>
                <p className="text-xs text-ochre font-semibold whitespace-nowrap ml-3">
                  {topic.count} {t(lang, 'commentsCount')}
                </p>
              </div>
            ))
          )}
        </div>

        <h2 className="font-display text-lg text-harbor mb-3">{t(lang, 'upcomingEventsAttendance')}</h2>
        <div className="space-y-2">
          {stats.eventAttendance.length === 0 ? (
            <p className="text-ink/60 text-sm">{t(lang, 'noUpcomingEvents')}</p>
          ) : (
            stats.eventAttendance.map((ev, i) => (
              <div key={i} className="card p-3 flex items-center justify-between">
                <p className="text-sm text-ink">{ev.title}</p>
                <p className="text-xs text-ochre font-semibold whitespace-nowrap ml-3">
                  {ev.going} {t(lang, 'peopleGoing')}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
