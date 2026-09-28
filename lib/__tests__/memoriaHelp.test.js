import { describe, it, expect } from 'vitest';
import en from '../memoriaHelp/en.json';
import es from '../memoriaHelp/es.json';
import fr from '../memoriaHelp/fr.json';
import de from '../memoriaHelp/de.json';
import { HELP_IDS, HELP_TAB, MEMORIA_TABS, searchHelp, helpForPrompt, extractHelpLinks, helpArticle, normalize } from '../memoriaHelp';
import { parseAnswer } from '../answerFormat';

describe('guide content', () => {
  it('has every article in every language with the same number of steps and tips', () => {
    for (const lang of [en, es, fr, de]) {
      expect(Object.keys(lang).sort()).toEqual([...HELP_IDS].sort());
      for (const id of HELP_IDS) {
        expect(lang[id].title).toBeTruthy();
        expect(lang[id].steps.length).toBe(en[id].steps.length);
        expect(lang[id].tips.length).toBe(en[id].tips.length);
      }
    }
  });
  it('points every article to a real tab (or none)', () => {
    for (const id of HELP_IDS) expect(HELP_TAB[id] === null || MEMORIA_TABS.includes(HELP_TAB[id])).toBe(true);
  });
});

describe('searchHelp', () => {
  const top = (lang, q) => searchHelp(lang, q, 3).map((a) => a.id);
  it('understands whole questions in each language', () => {
    expect(top('en', 'Where can I see all quotes for pool cleaning, and how do I make an analysis?')).toEqual(expect.arrayContaining(['quotes-find', 'quotes-analyse']));
    expect(top('es', '¿Dónde veo todas las ofertas de limpieza de piscinas?')[0]).toBe('quotes-find');
    expect(top('fr', 'comparer les devis piscine')).toContain('quotes-analyse');
    expect(top('de', 'Angebote Poolreinigung vergleichen')).toContain('quotes-find');
    expect(top('en', 'how do I stop the emails')[0]).toBe('email-settings');
    expect(top('es', 'importar facturas del administrador')[0]).toBe('invoices-import');
    expect(top('en', 'insurance claim water damage')[0]).toBe('case-new');
  });
  it('ignores accents and returns nothing for empty questions', () => {
    expect(normalize('Licitación ÁREA')).toBe('licitacion area');
    expect(searchHelp('en', '   ')).toEqual([]);
    expect(searchHelp('en', 'the and of')).toEqual([]);
  });
});

describe('Ask Memoria guide support', () => {
  it('puts the matching guide steps into the prompt', () => {
    const g = helpForPrompt('en', 'how do I import the minutes of a meeting');
    expect(g).toContain('[guide id=minutes-import tab=meetings]');
    expect(g).toMatch(/\n1\. /);
    expect(helpForPrompt('en', 'xyz qqq')).toBe('');
  });
  it('turns only valid markers into links and strips them from the text', () => {
    const { text, links } = extractHelpLinks('Steps…\n1. Click\n[[open:tenders]]\n[[help:quotes-find]]\n[[open:nowhere]] [[help:hack]] [[open:tenders]]');
    expect(links).toEqual([{ kind: 'open', value: 'tenders' }, { kind: 'help', value: 'quotes-find' }]);
    expect(text).toBe('Steps…\n1. Click');
  });
  it('returns localized articles with a tab', () => {
    expect(helpArticle('es', 'quotes-find').tab).toBe('tenders');
    expect(helpArticle('xx', 'open').title).toBe(en.open.title);
  });
});

describe('numbered lists in answers', () => {
  it('keeps numbered steps apart from bullets', () => {
    const b = parseAnswer('- a\n- b\n1. one\n2. two');
    expect(b.map((x) => x.type)).toEqual(['ul', 'ol']);
    expect(b[1].items).toEqual(['one', 'two']);
  });
});
