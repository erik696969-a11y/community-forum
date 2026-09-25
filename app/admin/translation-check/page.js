'use client';

// Kontrola prekladov: DeepL a Claude vedľa seba na ukážkových aj vlastných textoch.
// Iba pre board. Nič sa neukladá.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';
import Header from '../../components/Header';
import { TRANSLATION_SAMPLES } from '../../../lib/translationSamples';

const L = {
  title: { en: 'Translation check', es: 'Control de traducciones', fr: 'Contrôle des traductions', de: 'Übersetzungsprüfung' },
  intro: {
    en: 'The same texts translated by DeepL and by Claude, side by side. Nothing is saved. Use it to judge quality before switching the translation provider.',
    es: 'Los mismos textos traducidos por DeepL y por Claude, uno al lado del otro. No se guarda nada. Sirve para valorar la calidad antes de cambiar de proveedor de traducción.',
    fr: 'Les mêmes textes traduits par DeepL et par Claude, côte à côte. Rien n’est enregistré. Permet de juger la qualité avant de changer de fournisseur de traduction.',
    de: 'Dieselben Texte, von DeepL und von Claude übersetzt, nebeneinander. Es wird nichts gespeichert. Zum Beurteilen der Qualität vor einem Wechsel des Übersetzungsanbieters.',
  },
  active: { en: 'Currently used for posts:', es: 'Se usa ahora para las publicaciones:', fr: 'Utilisé actuellement pour les publications :', de: 'Derzeit für Beiträge verwendet:' },
  fallback: { en: 'backup:', es: 'respaldo:', fr: 'secours :', de: 'Reserve:' },
  runAll: { en: 'Translate all samples', es: 'Traducir todos los ejemplos', fr: 'Traduire tous les exemples', de: 'Alle Beispiele übersetzen' },
  run: { en: 'Translate', es: 'Traducir', fr: 'Traduire', de: 'Übersetzen' },
  running: { en: 'Translating…', es: 'Traduciendo…', fr: 'Traduction…', de: 'Wird übersetzt…' },
  own: { en: 'Your own text', es: 'Su propio texto', fr: 'Votre propre texte', de: 'Eigener Text' },
  ownTitle: { en: 'Title (optional)', es: 'Título (opcional)', fr: 'Titre (facultatif)', de: 'Titel (optional)' },
  ownBody: { en: 'Text', es: 'Texto', fr: 'Texte', de: 'Text' },
  writtenIn: { en: 'Written in', es: 'Escrito en', fr: 'Écrit en', de: 'Geschrieben auf' },
  samples: { en: 'Samples', es: 'Ejemplos', fr: 'Exemples', de: 'Beispiele' },
  notConfigured: { en: 'not configured', es: 'no configurado', fr: 'non configuré', de: 'nicht eingerichtet' },
  failed: { en: 'failed', es: 'falló', fr: 'échec', de: 'fehlgeschlagen' },
  none: { en: 'none', es: 'ninguno', fr: 'aucun', de: 'keiner' },
};
const LANG_LABEL = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch' };
const lt = (key, lang) => L[key][lang] || L[key].en;

function ProviderCell({ name, res, langKey, lang }) {
  if (!res) return <div className="text-sm text-ink/40">—</div>;
  if (!res.ok) {
    return (
      <div className="text-sm text-red-700">
        {name}: {res.error === 'not_configured' ? lt('notConfigured', lang) : `${lt('failed', lang)} (${res.error})`}
      </div>
    );
  }
  const parts = (res.translations?.[langKey] || []).filter((p) => p && p.trim());
  return (
    <div className="space-y-1">
      {parts.map((p, i) => (
        <p key={i} className={`text-sm whitespace-pre-wrap ${i === 0 && parts.length > 1 ? 'font-semibold text-harbor' : 'text-ink'}`}>{p}</p>
      ))}
    </div>
  );
}

function Result({ item, result, lang }) {
  const targets = ['en', 'es', 'fr', 'de'].filter((l) => l !== item.lang);
  return (
    <div className="card p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-ochre font-semibold mb-1">{lt('writtenIn', lang)}: {LANG_LABEL[item.lang]}</p>
        {item.title && <p className="font-semibold text-harbor">{item.title}</p>}
        <p className="text-sm text-ink whitespace-pre-wrap">{item.body}</p>
      </div>
      {result?.error && <p className="text-sm text-red-700">{result.error}</p>}
      {result?.results && (
        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr_1fr] gap-3 text-xs font-semibold text-harbor/70">
            <span />
            <span>DeepL · {(result.results.deepl.ms / 1000).toFixed(1)} s</span>
            <span>Claude · {(result.results.claude.ms / 1000).toFixed(1)} s</span>
          </div>
          {targets.map((l) => (
            <div key={l} className="grid grid-cols-[60px_1fr_1fr] gap-3 border-t border-sand pt-2">
              <span className="text-xs font-semibold text-ochre uppercase">{l}</span>
              <ProviderCell name="DeepL" res={result.results.deepl} langKey={l} lang={lang} />
              <ProviderCell name="Claude" res={result.results.claude} langKey={l} lang={lang} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TranslationCheckPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [active, setActive] = useState(null);
  const [own, setOwn] = useState({ lang: 'es', title: '', body: '' });

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login?next=/admin/translation-check');
      return;
    }
    if (profile && (profile.role !== 'board' || profile.status !== 'approved')) router.replace('/dashboard');
  }, [loading, session, profile, router]);

  async function translateItem(item) {
    const texts = item.title ? [item.title, item.body] : [item.body];
    try {
      const res = await fetch('/api/translate-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ texts, authorLang: item.lang }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
      if (data.active) setActive(data.active);
      return data;
    } catch (e) {
      return { error: e.message };
    }
  }

  async function runOne(item) {
    setBusy(item.id);
    const r = await translateItem(item);
    setResults((prev) => ({ ...prev, [item.id]: r }));
    setBusy(null);
  }

  async function runAll() {
    setBusy('all');
    for (const item of TRANSLATION_SAMPLES) {
      // eslint-disable-next-line no-await-in-loop
      const r = await translateItem(item);
      setResults((prev) => ({ ...prev, [item.id]: r }));
    }
    setBusy(null);
  }

  if (loading || !profile || profile.role !== 'board') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const ownItem = { id: 'own', lang: own.lang, title: own.title.trim(), body: own.body.trim() };

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor block mb-3">← Admin</Link>
          <h1 className="font-display text-2xl text-harbor mb-2">🌐 {lt('title', lang)}</h1>
          <p className="text-sm text-ink/80">{lt('intro', lang)}</p>
          {active && (
            <p className="text-sm text-harbor mt-2">
              {lt('active', lang)} <strong>{active[0] === 'claude' ? 'Claude' : active[0] === 'deepl' ? 'DeepL' : lt('none', lang)}</strong>
              {active[1] && <> · {lt('fallback', lang)} {active[1] === 'claude' ? 'Claude' : 'DeepL'}</>}
            </p>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="font-display text-lg text-harbor">{lt('own', lang)}</h2>
          <div className="flex gap-3 flex-wrap items-center">
            <label className="text-sm text-harbor">{lt('writtenIn', lang)}</label>
            <select className="input-field !w-auto" value={own.lang} onChange={(e) => setOwn({ ...own, lang: e.target.value })}>
              {Object.entries(LANG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input className="input-field" placeholder={lt('ownTitle', lang)} value={own.title} maxLength={300} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
          <textarea className="input-field" rows={4} placeholder={lt('ownBody', lang)} value={own.body} maxLength={3000} onChange={(e) => setOwn({ ...own, body: e.target.value })} />
          <button type="button" className="btn-primary" disabled={!ownItem.body || busy !== null} onClick={() => runOne(ownItem)}>
            {busy === 'own' ? lt('running', lang) : lt('run', lang)}
          </button>
          {results.own && <Result item={ownItem} result={results.own} lang={lang} />}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-lg text-harbor">{lt('samples', lang)} ({TRANSLATION_SAMPLES.length})</h2>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={runAll}>
            {busy === 'all' ? lt('running', lang) : lt('runAll', lang)}
          </button>
        </div>
        {TRANSLATION_SAMPLES.map((item) => (
          <div key={item.id}>
            <Result item={item} result={results[item.id]} lang={lang} />
            {!results[item.id] && (
              <button type="button" className="btn-secondary text-sm mt-2" disabled={busy !== null} onClick={() => runOne(item)}>
                {busy === item.id ? lt('running', lang) : lt('run', lang)}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
