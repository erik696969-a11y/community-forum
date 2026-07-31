'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../../lib/useProfile';
import { supabase } from '../../../../lib/supabaseClient';
import Header from '../../../components/Header';

const ISSUE_LABELS = {
  new: { label: 'Nové', color: 'bg-red-100 text-red-700' },
  in_progress: { label: 'Rieši sa', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Vyriešené', color: 'bg-green-100 text-green-700' },
};

export default function PostDetailPage() {
  const { loading, session, profile } = useProfile();
  const router = useRouter();
  const params = useParams();

  const [post, setPost] = useState(null);
  const [category, setCategory] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
  }, [loading, session, router]);

  async function loadAll() {
    const { data: postData } = await supabase
      .from('posts')
      .select('*, author:profiles(full_name, apartment_number)')
      .eq('id', params.id)
      .single();
    setPost(postData);

    if (postData) {
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('id', postData.category_id)
        .single();
      setCategory(catData);
    }

    const { data: commentsData } = await supabase
      .from('comments')
      .select('*, author:profiles(full_name, apartment_number)')
      .eq('post_id', params.id)
      .order('created_at', { ascending: true });
    setComments(commentsData || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, profile]);

  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);

    const { error } = await supabase.from('comments').insert({
      post_id: params.id,
      author_id: session.user.id,
      content: newComment.trim(),
    });

    setSubmitting(false);

    if (!error) {
      setNewComment('');
      loadAll();
    }
  }

  if (loading || !profile || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">Načítava sa…</p>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="min-h-screen">
        <Header profile={profile} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-ink">Príspevok sa nenašiel.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header profile={profile} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {category && (
          <Link href={`/dashboard/${category.slug}`} className="text-sm text-harbor/70 hover:text-harbor">
            ← Späť na {category.name}
          </Link>
        )}

        <div className="card p-6 mt-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl text-harbor">{post.title}</h1>
            {post.issue_status && (
              <span className={`text-xs font-semibold px-2 py-1 rounded ${ISSUE_LABELS[post.issue_status]?.color}`}>
                {ISSUE_LABELS[post.issue_status]?.label}
              </span>
            )}
          </div>
          <p className="text-xs text-ink/50 mt-1 mb-4">
            {post.author?.full_name} · apartmán {post.author?.apartment_number} ·{' '}
            {new Date(post.created_at).toLocaleDateString('sk-SK')}
          </p>
          <p className="text-ink whitespace-pre-wrap">{post.content}</p>
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image_url} alt="" className="mt-4 rounded-lg max-w-full" />
          )}
        </div>

        <h2 className="font-display text-lg text-harbor mt-8 mb-3">
          Komentáre ({comments.length})
        </h2>

        <div className="space-y-3 mb-6">
          {comments.map((c) => (
            <div key={c.id} className="card p-4">
              <p className="text-ink text-sm">{c.content}</p>
              <p className="text-xs text-ink/50 mt-1">
                {c.author?.full_name} · apartmán {c.author?.apartment_number} ·{' '}
                {new Date(c.created_at).toLocaleDateString('sk-SK')}
              </p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-ink/60 text-sm">Zatiaľ žiadne komentáre. Buďte prvý!</p>
          )}
        </div>

        <form onSubmit={handleAddComment} className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="input-field"
            placeholder="Napíšte komentár…"
          />
          <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
            Odoslať
          </button>
        </form>
      </div>
    </main>
  );
}
