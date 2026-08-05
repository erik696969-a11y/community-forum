'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { useRefreshOnFocus } from '../../../lib/useRefreshOnFocus';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const CATEGORIES = [
  ['electrician', 'categoryElectrician'],
  ['plumber', 'categoryPlumber'],
  ['ac', 'categoryAC'],
  ['cleaning', 'categoryCleaning'],
  ['taxi', 'categoryTaxi'],
  ['golf_coach', 'categoryGolfCoach'],
  ['restaurant', 'categoryRestaurant'],
  ['other', 'categoryOther'],
];

export default function SuppliersPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [suppliers, setSuppliers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState('electrician');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
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
    const { data: supplierData } = await supabase
      .from('suppliers')
      .select('*, recommender:profiles(full_name)')
      .order('created_at', { ascending: false });
    setSuppliers(supplierData || []);

    const { data: voteData } = await supabase.from('supplier_votes').select('*');
    setVotes(voteData || []);

    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') load();
  }, [profile]);

  useRefreshOnFocus(load);

  async function handleAddSupplier(e) {
    e.preventDefault();
    setSubmitting(true);

    await supabase.from('suppliers').insert({
      category,
      name,
      phone,
      notes,
      recommended_by: session.user.id,
    });

    setSubmitting(false);
    setName('');
    setPhone('');
    setNotes('');
    setShowForm(false);
    load();
  }

  async function handleVote(supplierId, vote) {
    const existing = votes.find((v) => v.supplier_id === supplierId && v.user_id === session.user.id);
    if (existing && existing.vote === vote) {
      await supabase.from('supplier_votes').delete().eq('supplier_id', supplierId).eq('user_id', session.user.id);
    } else if (existing) {
      await supabase
        .from('supplier_votes')
        .update({ vote })
        .eq('supplier_id', supplierId)
        .eq('user_id', session.user.id);
    } else {
      await supabase.from('supplier_votes').insert({ supplier_id: supplierId, user_id: session.user.id, vote });
    }
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    await supabase.from('suppliers').delete().eq('id', id);
    load();
  }

  if (loading || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const grouped = CATEGORIES.map(([key, labelKey]) => ({
    key,
    labelKey,
    items: suppliers.filter((s) => s.category === key),
  }));

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-harbor/70 hover:text-harbor block mb-3">
          {t(lang, 'backToDashboard')}
        </Link>

        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-harbor">⭐ {t(lang, 'suppliersTitle')}</h1>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
            {t(lang, 'addSupplier')}
          </button>
        </div>
        <p className="text-xs text-ink/60 mb-6 italic">{t(lang, 'suppliersNote')}</p>

        {showForm && (
          <form onSubmit={handleAddSupplier} className="card p-5 space-y-3 mb-8">
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'supplierCategoryLabel')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
                {CATEGORIES.map(([key, labelKey]) => (
                  <option key={key} value={key}>
                    {t(lang, labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'supplierNameLabel')}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'supplierPhoneLabel')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'supplierNotesLabel')}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t(lang, 'saving') : t(lang, 'save')}
            </button>
          </form>
        )}

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          grouped.map(({ key, labelKey, items }) => (
            <div key={key} className="mb-8">
              <h2 className="text-xs font-semibold text-ochre uppercase tracking-wide mb-3">{t(lang, labelKey)}</h2>
              {items.length === 0 ? (
                <p className="text-ink/50 text-sm">{t(lang, 'noSuppliersYet')}</p>
              ) : (
                <div className="space-y-2">
                  {items.map((s) => {
                    const upCount = votes.filter((v) => v.supplier_id === s.id && v.vote === 'up').length;
                    const downCount = votes.filter((v) => v.supplier_id === s.id && v.vote === 'down').length;
                    const myVote = votes.find((v) => v.supplier_id === s.id && v.user_id === session.user.id);
                    const canDelete = s.recommended_by === session.user.id || profile.role === 'board';

                    return (
                      <div key={s.id} className="card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-harbor">{s.name}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleVote(s.id, 'up')}
                              className={`text-sm px-2 py-0.5 rounded-full border ${
                                myVote?.vote === 'up' ? 'bg-ochre/20 border-ochre' : 'border-transparent hover:bg-sand-dark/60'
                              }`}
                            >
                              👍 {upCount}
                            </button>
                            <button
                              onClick={() => handleVote(s.id, 'down')}
                              className={`text-sm px-2 py-0.5 rounded-full border ${
                                myVote?.vote === 'down' ? 'bg-ochre/20 border-ochre' : 'border-transparent hover:bg-sand-dark/60'
                              }`}
                            >
                              👎 {downCount}
                            </button>
                          </div>
                        </div>
                        {s.phone && (
                          <a href={`tel:${s.phone}`} className="text-sm text-harbor underline">
                            {s.phone}
                          </a>
                        )}
                        {s.notes && <p className="text-sm text-ink/70 mt-1">{s.notes}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-ink/50">
                            {t(lang, 'recommendedBy')}: {s.recommender?.full_name}
                          </p>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              {t(lang, 'delete')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
