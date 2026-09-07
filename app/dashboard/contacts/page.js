'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { supabase } from '../../../lib/supabaseClient';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';

export default function ContactsPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();

  const [contacts, setContacts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [roleLabel, setRoleLabel] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  // Translated variants. The list below falls back to the base (English)
  // column when one of these is empty, so they stay genuinely optional.
  const [tr, setTr] = useState({
    role_label_es: '',
    role_label_fr: '',
    role_label_de: '',
    notes_es: '',
    notes_fr: '',
    notes_de: '',
  });
  const [showTranslations, setShowTranslations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const EMPTY_TR = {
    role_label_es: '',
    role_label_fr: '',
    role_label_de: '',
    notes_es: '',
    notes_fr: '',
    notes_de: '',
  };

  // Store an untouched optional field as NULL rather than '', so the
  // `value || fallback` rendering behaves the same either way and the
  // table does not accumulate empty strings.
  const orNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

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

  async function loadContacts() {
    const { data } = await supabase.from('contacts').select('*').order('sort_order');
    setContacts(data || []);
    setLoadingData(false);
  }

  useEffect(() => {
    if (profile?.status === 'approved') loadContacts();
  }, [profile]);

  function resetForm() {
    setRoleLabel('');
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setTr(EMPTY_TR);
    setShowTranslations(false);
    setEditingId(null);
    setShowForm(false);
    setSaveError('');
  }

  function startEdit(contact) {
    setRoleLabel(contact.role_label || '');
    setName(contact.name || '');
    setPhone(contact.phone || '');
    setEmail(contact.email || '');
    setNotes(contact.notes || '');
    const loaded = Object.fromEntries(
      Object.keys(EMPTY_TR).map((k) => [k, contact[k] || ''])
    );
    setTr(loaded);
    // Open the section straight away when this contact already has
    // translations, so they are visible rather than hidden behind a click.
    setShowTranslations(Object.values(loaded).some((v) => v !== ''));
    setEditingId(contact.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    const translated = Object.fromEntries(
      Object.entries(tr).map(([k, v]) => [k, orNull(v)])
    );

    const payload = {
      role_label: roleLabel.trim(),
      name: orNull(name),
      phone: orNull(phone),
      email: orNull(email),
      notes: orNull(notes),
      ...translated,
    };

    const { error } = editingId
      ? await supabase.from('contacts').update(payload).eq('id', editingId)
      : await supabase.from('contacts').insert({ ...payload, sort_order: contacts.length });

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    resetForm();
    loadContacts();
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) {
      setSaveError(error.message);
      return;
    }
    loadContacts();
  }

  if (loading || !profile || profile.status !== 'approved') {
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
          <h1 className="font-display text-2xl text-harbor">{t(lang, 'contacts')}</h1>
          {isBoard && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              {t(lang, 'addContact')}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'roleLabel')}</label>
              <input
                type="text"
                required
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                className="input-field"
                placeholder={t(lang, 'rolePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'contactName')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'phone')}</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'email')}</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-harbor mb-1">{t(lang, 'notesLabel')}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
            </div>

            <div className="border-t border-harbor/10 pt-4">
              <button
                type="button"
                onClick={() => setShowTranslations((v) => !v)}
                className="text-sm font-semibold text-harbor hover:text-ochre"
              >
                {showTranslations ? '▾' : '▸'} {t(lang, 'contactTranslations')}
              </button>

              {showTranslations && (
                <div className="mt-3 space-y-4">
                  <p className="text-xs text-ink/60">{t(lang, 'contactTranslationsHint')}</p>
                  {[
                    { code: 'es', name: 'Español' },
                    { code: 'fr', name: 'Français' },
                    { code: 'de', name: 'Deutsch' },
                  ].map(({ code, name: langName }) => (
                    <div key={code} className="space-y-2">
                      <p className="text-xs font-semibold text-ochre uppercase tracking-wide">{langName}</p>
                      <input
                        type="text"
                        value={tr[`role_label_${code}`]}
                        onChange={(e) => setTr((p) => ({ ...p, [`role_label_${code}`]: e.target.value }))}
                        className="input-field"
                        placeholder={t(lang, 'roleLabel')}
                      />
                      <textarea
                        rows={2}
                        value={tr[`notes_${code}`]}
                        onChange={(e) => setTr((p) => ({ ...p, [`notes_${code}`]: e.target.value }))}
                        className="input-field"
                        placeholder={t(lang, 'notesLabel')}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? t(lang, 'saving') : t(lang, 'save')}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                ✕
              </button>
            </div>
          </form>
        )}

        {loadingData ? (
          <p className="text-ink/60">{t(lang, 'loading')}</p>
        ) : contacts.length === 0 ? (
          <p className="text-ink/60">{t(lang, 'noContactsYet')}</p>
        ) : (
          <div className="space-y-3">
            {contacts.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-ochre uppercase tracking-wide">{c[`role_label_${lang}`] || c.role_label}</p>
                    {c.name && <p className="font-display text-lg text-harbor">{c.name}</p>}
                    {c.phone && (
                      <p className="text-sm text-ink mt-1">
                        <a href={`tel:${c.phone}`} className="hover:text-ochre">{c.phone}</a>
                      </p>
                    )}
                    {c.email && (
                      <p className="text-sm text-ink">
                        <a href={`mailto:${c.email}`} className="hover:text-ochre">{c.email}</a>
                      </p>
                    )}
                    {(c[`notes_${lang}`] || c.notes) && <p className="text-sm text-ink/70 mt-1">{c[`notes_${lang}`] || c.notes}</p>}
                  </div>
                  {isBoard && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(c)} className="text-xs text-harbor/60 hover:text-harbor underline">
                        {t(lang, 'edit')}
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:text-red-700">
                        {t(lang, 'delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
