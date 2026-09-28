'use client';

// Memoria — návod: vyhľadávanie vlastnými slovami, krok-za-krokom články,
// snímka obrazovky, tlačidlo „Otvoriť túto obrazovku“ a prechod do „Ask Memoria“.

import { useEffect, useMemo, useRef, useState } from 'react';
import { mt } from '../../../lib/memoriaI18n';
import { HELP_SECTIONS, HELP_POPULAR, TAB_LABELS, helpArticle, helpImage, searchHelp } from '../../../lib/memoriaHelp';

const SECTION_LABEL = { start: 'helpSectionStart', governance: 'helpSectionGovernance', money: 'helpSectionMoney', reports: 'helpSectionReports' };

function ArticleLink({ article, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      className="w-full text-left card px-4 py-3 hover:border-ochre transition-colors"
    >
      <span className="block font-semibold text-harbor">{article.title}</span>
      <span className="block text-sm text-ink/60 mt-0.5">{article.summary}</span>
    </button>
  );
}

function Screenshot({ id, lang }) {
  const [src, setSrc] = useState(helpImage(id, lang));
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setSrc(helpImage(id, lang));
    setHidden(false);
  }, [id, lang]);
  if (hidden) return null;
  return (
    <figure className="mt-2">
      <img
        src={src}
        alt=""
        className="w-full rounded-lg border border-sand-dark shadow-sm"
        onError={() => {
          const en = helpImage(id, 'en');
          if (src !== en) setSrc(en);
          else setHidden(true);
        }}
      />
      <figcaption className="text-xs text-ink/50 mt-1">{mt(lang, 'helpScreenshot')}</figcaption>
    </figure>
  );
}

export default function HelpPanel({ lang, onOpenTab, onAsk, articleId, onArticleChange }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const article = articleId ? helpArticle(lang, articleId) : null;

  useEffect(() => {
    if (!article) inputRef.current?.focus();
  }, [article]);

  useEffect(() => {
    if (article) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => searchHelp(lang, query, 8), [lang, query]);
  const open = (id) => onArticleChange(id);

  if (article) {
    const related = searchHelp(lang, article.title, 5).filter((a) => a.id !== article.id).slice(0, 3);
    const tabInfo = article.tab ? TAB_LABELS[article.tab] : null;
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => onArticleChange(null)} className="text-sm text-harbor/70 hover:text-harbor print:hidden">
          {mt(lang, 'helpBack')}
        </button>
        <div>
          <h2 className="font-display text-2xl text-harbor">{article.title}</h2>
          <p className="text-base text-ink/70 mt-1">{article.summary}</p>
        </div>

        <section className="card p-5">
          <h3 className="text-xs uppercase tracking-wider text-ochre font-semibold mb-3">{mt(lang, 'helpSteps')}</h3>
          <ol className="space-y-3">
            {article.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-base text-ink leading-relaxed">
                <span className="flex-none w-7 h-7 rounded-full bg-harbor text-white text-sm font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {article.tips?.length > 0 && (
          <section className="rounded-lg border border-ochre/40 bg-ochre/5 p-4">
            <h3 className="text-xs uppercase tracking-wider text-ochre font-semibold mb-2">💡 {mt(lang, 'helpTips')}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
              {article.tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-2 print:hidden">
          {tabInfo && (
            <button type="button" className="btn-primary" onClick={() => onOpenTab(article.tab)}>
              {tabInfo[0]} {mt(lang, tabInfo[1])} · {mt(lang, 'helpOpenScreen')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => window.print()}>{mt(lang, 'helpPrint')}</button>
        </div>

        <Screenshot id={article.id} lang={lang} />

        {related.length > 0 && (
          <section className="print:hidden">
            <h3 className="text-xs uppercase tracking-wider text-ink/50 font-semibold mb-2">{mt(lang, 'helpSeeAlso')}</h3>
            <div className="space-y-2">
              {related.map((a) => <ArticleLink key={a.id} article={a} onOpen={open} />)}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink/60">{mt(lang, 'helpIntro')}</p>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg" aria-hidden>🔎</span>
        <input
          ref={inputRef}
          type="search"
          className="input-field w-full text-base py-3"
          style={{ paddingLeft: '2.6rem' }}
          placeholder={mt(lang, 'helpSearchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={mt(lang, 'helpSearchPlaceholder')}
        />
      </div>

      {query.trim() ? (
        <section className="space-y-2">
          {results.length > 0 ? (
            <>
              <h3 className="text-xs uppercase tracking-wider text-ink/50 font-semibold">{mt(lang, 'helpResults')}</h3>
              {results.map((a) => <ArticleLink key={a.id} article={a} onOpen={open} />)}
            </>
          ) : (
            <p className="text-sm text-ink/60">{mt(lang, 'helpNoResults')}</p>
          )}
          <button type="button" className="btn-secondary mt-2" onClick={() => onAsk(query.trim())}>{mt(lang, 'helpAskInstead')}</button>
        </section>
      ) : (
        <>
          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink/50 font-semibold mb-2">{mt(lang, 'helpPopular')}</h3>
            <div className="flex flex-wrap gap-2">
              {HELP_POPULAR.map((id) => {
                const a = helpArticle(lang, id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => open(id)}
                    className="text-left text-sm rounded-full border border-harbor/30 bg-white px-3 py-1.5 text-harbor hover:bg-harbor/5"
                  >
                    📖 {a.title}
                  </button>
                );
              })}
            </div>
          </section>
          {HELP_SECTIONS.map((s) => (
            <section key={s.key}>
              <h3 className="text-xs uppercase tracking-wider text-ink/50 font-semibold mb-2">{mt(lang, SECTION_LABEL[s.key])}</h3>
              <div className="space-y-2">
                {s.ids.map((id) => <ArticleLink key={id} article={helpArticle(lang, id)} onOpen={open} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
