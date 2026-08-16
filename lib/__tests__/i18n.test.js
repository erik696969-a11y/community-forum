import { describe, it, expect } from 'vitest';
import { t, DEFAULT_LANG, LANGUAGES } from '../i18n';

describe('i18n t()', () => {
  it('returns the translation for a known key and language', () => {
    expect(t('en', 'appName')).toBe('Mi Hacienda');
  });

  it('falls back to DEFAULT_LANG when the requested language is missing for a key', () => {
    // appName has all 4 languages, so pick a scenario using an actual key
    // that exists - falling back happens when entry[lang] is undefined.
    const result = t('xx', 'appName');
    expect(result).toBe(t(DEFAULT_LANG, 'appName'));
  });

  it('returns the raw key itself if the key does not exist in the dictionary', () => {
    // Bezpečnostný backlog #i18n: toto je presne bug, ktorý appka mala -
    // 'deleting' predtým chýbal a t() ho vrátil takto surovo.
    expect(t('en', 'thisKeyDoesNotExist')).toBe('thisKeyDoesNotExist');
  });

  it('has the "deleting" key with a translation for every supported language', () => {
    for (const { code } of LANGUAGES) {
      const translated = t(code, 'deleting');
      expect(translated).not.toBe('deleting');
      expect(translated.length).toBeGreaterThan(0);
    }
  });

  it('has the "noFacilitiesYet" key distinct from "noSuppliersYet"', () => {
    expect(t('en', 'noFacilitiesYet')).not.toBe(t('en', 'noSuppliersYet'));
  });
});
