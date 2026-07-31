'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { supabase } from '../../../lib/supabaseClient';
import Header from '../../components/Header';

const ISSUE_LABELS = {
  new: { label: 'Nové', color: 'bg-red-100 text-red-700' },
  in_progress: { label: 'Rieši sa', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Vyriešené', color: 'bg-green-100 text-green-700' },
};

export default function CategoryPage() {
  const { loading, session, profile } = useProfile();
  const router = useRouter();
  const params = useParams();
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    async function load() {
      const { data: cat } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', params.slug)
        .single();

      setCategory(cat);

      if (cat) {
        const { data: postsData } = await supabase
          .from('posts')
          .select('*, author:profiles(full_name, apartment_number)')
          .eq('category_id', cat.id)
          .order('created_at', { ascending: false });
        setPosts(postsData || []);
      }
      setLoadingPosts(false);
    }
    if (profile?.status === 'approved') {
      load();
    }
  }, [params.slug, profile]);

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">Načítava sa…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor">
          ← Späť na kategórie
        </Link>

        <div className="flex items-center justify-between mt-3 mb-6">
          <h1 className="font-display text-2xl text-harbor">
            {category ? category.name : 'Kategória'}
          </h1>
          <Link href={`/dashboard/new-post?category=${params.slug}`} className="btn-primary">
            + Nový príspevok
          </Link>
        </div>

        {loadingPosts ? (
          <p className="text-ink/60">Načítavam príspevky…</p>
        ) : posts.length === 0 ? (
          <p className="text-ink/60">V tejto kategórii ešte nie sú žiadne príspevky. Buďte prvý!</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/dashboard/post/${post.id}`}
                className="card p-5 block hover:border-ochre transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg text-harbor">{post.title}</h2>
                  {post.issue_status && (
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${ISSUE_LABELS[post.issue_status]?.color}`}
                    >
                      {ISSUE_LABELS[post.issue_status]?.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink/70 mt-1 line-clamp-2">{post.content}</p>
                <p className="text-xs text-ink/50 mt-2">
                  {post.author?.full_name} · apartmán {post.author?.apartment_number} ·{' '}
                  {new Date(post.created_at).toLocaleDateString('sk-SK')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
