'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

const emptyNewEntry = { key: '', label: '', value: '' };

export default function CommunityConfigPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [entries, setEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [editedValues, setEditedValues] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [rowSaved, setRowSaved] = useState({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState(emptyNewEntry);
  const [addingSubmitting, setAddingSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

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
    const { data } = await supabase.from('community_config').select('*').order('key', { ascending: true });
    setEntries(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.role === 'board') load();
  }, [profile]);

  function handleValueChange(key, value) {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
    setRowSaved((prev) => ({ ...prev, [key]: false }));
  }

  async function handleSaveRow(key) {
    const newValue = editedValues[key];
    if (newValue === undefined) return;

    setSavingKey(key);
    setRowErrors((prev) => ({ ...prev, [key]: '' }));

    const { error } = await supabase
      .from('community_config')
      .update({ value: newValue, updated_by: session.user.id, updated_at: new Date().toISOString() })
      .eq('key', key);

    setSavingKey(null);

    if (error) {
      setRowErrors((prev) => ({ ...prev, [key]: error.message }));
      return;
    }

    setRowSaved((prev) => ({ ...prev, [key]: true }));
    load();
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    setAddingSubmitting(true);
    setAddError('');

    const key = newEntry.key.trim().toUpperCase().replace(/\s+/g, '_');
    if (!key || !newEntry.label.trim()) {
      setAddError(t(lang, 'communityConfigAddValidation'));
      setAddingSubmitting(false);
      return;
    }

    const { error } = await supabase.from('community_config').insert({
      key,
      label: newEntry.label.trim(),
      value: newEntry.value.trim() || '[TO FILL IN]',
      updated_by: session.user.id,
    });

    setAddingSubmitting(false);

    if (error) {
      setAddError(error.message);
      return;
    }

    setNewEntry(emptyNewEntry);
    setShowAddForm(false);
    load();
  }

  async function handleDelete(key) {
    if (!window.confirm(t(lang, 'confirmDeletePost'))) return;
    const { error } = await supabase.from('community_config').delete().eq('key', key);
    if (error) {
      setRowErrors((prev) => ({ ...prev, [key]: error.message }));
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
        <h1 className="font-display text-2xl text-harbor mb-2">{t(lang, 'communityConfigTitle')}</h1>
        <p className="text-sm text-ink/60 mb-6">{t(lang, 'communityConfigNote')}</p>

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : (
          <div className="space-y-3 mb-8">
            {entries.map((entry) => {
              const currentValue = editedValues[entry.key] ?? entry.value;
              const isPlaceholder = entry.value === '[TO FILL IN]';
              const isDirty = editedValues[entry.key] !== undefined && editedValues[entry.key] !== entry.value;
              return (
                <div key={entry.key} className="card p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="font-semibold text-harbor text-sm">{entry.label}</p>
                      <p className="text-xs text-ink/40 font-mono">{entry.key}</p>
                    </div>
                    {isPlaceholder && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 shrink-0">
                        {t(lang, 'communityConfigNotFilledIn')}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={currentValue}
                    onChange={(e) => handleValueChange(entry.key, e.target.value)}
                    className="input-field text-sm"
                  />
                  {rowErrors[entry.key] && <p className="text-xs text-red-600 mt-1">{rowErrors[entry.key]}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => handleSaveRow(entry.key)}
                      disabled={!isDirty || savingKey === entry.key}
                      className="btn-primary text-xs px-3 py-1 disabled:opacity-40"
                    >
                      {savingKey === entry.key ? t(lang, 'saving') : t(lang, 'save')}
                    </button>
                    {rowSaved[entry.key] && !isDirty && (
                      <span className="text-xs text-green-600">{t(lang, 'communityConfigSaved')}</span>
                    )}
                    <button
                      onClick={() => handleDelete(entry.key)}
                      className="text-xs text-red-500 hover:text-red-700 ml-auto"
                    >
                      {t(lang, 'delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-secondary text-sm mb-4">
          {t(lang, 'communityConfigAddEntry')}
        </button>

        {showAddForm && (
          <form onSubmit={handleAddEntry} className="card p-5 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'communityConfigKeyLabel')}</label>
              <input
                type="text"
                required
                value={newEntry.key}
                onChange={(e) => setNewEntry({ ...newEntry, key: e.target.value })}
                className="input-field"
                placeholder="e.g. GATE_CODE"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'communityConfigLabelLabel')}</label>
              <input
                type="text"
                required
                value={newEntry.label}
                onChange={(e) => setNewEntry({ ...newEntry, label: e.target.value })}
                className="input-field"
                placeholder="e.g. Main gate access code"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'communityConfigValueLabel')}</label>
              <textarea
                rows={2}
                value={newEntry.value}
                onChange={(e) => setNewEntry({ ...newEntry, value: e.target.value })}
                className="input-field"
              />
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={addingSubmitting} className="btn-primary flex-1">
                {addingSubmitting ? t(lang, 'saving') : t(lang, 'save')}
              </button>
              <button
                type="button"
                onClick={() => { setNewEntry(emptyNewEntry); setShowAddForm(false); setAddError(''); }}
                className="px-4 py-2 text-sm text-ink/60 hover:text-ink"
              >
                {t(lang, 'cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
