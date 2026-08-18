'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function PreapprovedMembersPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [entries, setEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('owner');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    const { data } = await supabase.from('preapproved_members').select('*').order('added_at', { ascending: false });
    setEntries(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.role === 'board') load();
  }, [profile]);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError(t(lang, 'preapprovedInvalidEmail'));
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('preapproved_members').insert({
      email: normalizedEmail,
      role,
      notes: notes.trim() || null,
      added_by: session.user.id,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.code === '23505' ? t(lang, 'preapprovedDuplicateEmail') : insertError.message);
      return;
    }

    setEmail('');
    setRole('owner');
    setNotes('');
    load();
  }

  async function handleDelete(emailToDelete) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    const { error: deleteError } = await supabase.from('preapproved_members').delete().eq('email', emailToDelete);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-harbor mb-2">{t(lang, 'preapprovedMembersTitle')}</h1>
        <p className="text-sm text-ink/60 mb-6">{t(lang, 'preapprovedMembersNote')}</p>

        <form onSubmit={handleAdd} className="card p-5 space-y-3 mb-8">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'preapprovedEmailLabel')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'preapprovedRoleLabel')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input-field">
              <option value="owner">{t(lang, 'roleOwner')}</option>
              <option value="board">{t(lang, 'board')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'preapprovedNotesLabel')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field"
              placeholder={t(lang, 'preapprovedNotesPlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t(lang, 'saving') : t(lang, 'preapprovedAddButton')}
          </button>
        </form>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : entries.length === 0 ? (
          <p className="text-ink/60 text-sm">{t(lang, 'preapprovedNoneYet')}</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.email} className="card p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-harbor">{entry.email}</p>
                  <p className="text-xs text-ink/50">
                    {entry.role === 'board' ? t(lang, 'board') : t(lang, 'roleOwner')}
                    {entry.notes && ` · ${entry.notes}`}
                  </p>
                </div>
                <button onClick={() => handleDelete(entry.email)} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">
                  {t(lang, 'delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
