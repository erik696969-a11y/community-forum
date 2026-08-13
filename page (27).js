'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function FacilitiesPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [facilities, setFacilities] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  async function load() {
    const { data } = await supabase.from('facilities').select('*').order('created_at');
    setFacilities(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') load();
  }, [profile]);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from('facilities').insert({ name, description, created_by: session.user.id });
    setSubmitting(false);
    setName('');
    setDescription('');
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    await supabase.from('facilities').delete().eq('id', id);
    load();
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const isBoard = profile.role === 'board';

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>

        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'facilitiesTitle')}</h1>
          {isBoard && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
              {t(lang, 'addFacility')}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleAdd} className="card p-5 space-y-3 mb-8">
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'facilityNameLabel')}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="e.g. Community Room"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'facilityDescLabel')}</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t(lang, 'saving') : t(lang, 'save')}
            </button>
          </form>
        )}

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : facilities.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noSuppliersYet')}</p>
        ) : (
          <div className="space-y-3">
            {facilities.map((f) => (
              <div key={f.id} className="card p-5 flex items-center justify-between gap-3">
                <Link href={`/dashboard/facilities/${f.id}`} className="flex-1 hover:opacity-80 transition-opacity">
                  <p className="font-display text-lg text-harbor">{f.name}</p>
                  {f.description && <p className="text-sm text-ink/60 mt-1">{f.description}</p>}
                </Link>
                {isBoard && (
                  <button onClick={() => handleDelete(f.id)} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">
                    {t(lang, 'delete')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
