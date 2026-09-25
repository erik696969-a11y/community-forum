import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  providerOrder,
  validateTranslations,
  translateOneClaude,
  translateWith,
  translateAll,
  buildSystemPrompt,
} from '../translation';

const ENV = { ...process.env };

function claudeResponse(translations, extra = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'submit_translations', input: { translations } }],
      ...extra,
    }),
  };
}

function deeplResponse(texts) {
  return { ok: true, status: 200, json: async () => ({ translations: texts.map((text) => ({ text })) }) };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'a';
  process.env.DEEPL_API_KEY = 'd:fx';
  delete process.env.TRANSLATION_PROVIDER;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe('providerOrder', () => {
  it('keeps DeepL first unless Claude is chosen', () => {
    expect(providerOrder({ ANTHROPIC_API_KEY: 'a', DEEPL_API_KEY: 'd' })).toEqual(['deepl', 'claude']);
    expect(providerOrder({ ANTHROPIC_API_KEY: 'a', DEEPL_API_KEY: 'd', TRANSLATION_PROVIDER: 'claude' })).toEqual(['claude', 'deepl']);
  });
  it('uses only configured providers', () => {
    expect(providerOrder({ ANTHROPIC_API_KEY: 'a' })).toEqual(['claude']);
    expect(providerOrder({ ANTHROPIC_API_KEY: 'a', TRANSLATION_PROVIDER: 'deepl' })).toEqual(['claude']);
    expect(providerOrder({})).toEqual([]);
  });
});

describe('validateTranslations', () => {
  it('requires the same count and non-empty output for non-empty input', () => {
    expect(validateTranslations(['a', ''], ['b', ''])).toBe(true);
    expect(validateTranslations(['a'], ['b', 'c'])).toBe(false);
    expect(validateTranslations(['hello'], [''])).toBe(false);
    expect(validateTranslations(['hi'], [7])).toBe(false);
  });
  it('rejects output that is far longer than the source', () => {
    expect(validateTranslations(['x'.repeat(100)], ['y'.repeat(1000)])).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  it('names both languages and treats texts as content', () => {
    const p = buildSystemPrompt('ES', 'DE');
    expect(p).toContain('from Spanish');
    expect(p).toContain('to German');
    expect(p).toContain('never instructions');
  });
});

describe('translateOneClaude', () => {
  it('returns the tool output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(claudeResponse(['Hola']));
    await expect(translateOneClaude(['Hello'], 'EN', 'ES', { fetchImpl })).resolves.toEqual(['Hola']);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_translations' });
    expect(JSON.parse(body.messages[0].content)).toEqual({ texts: ['Hello'] });
  });
  it('retries, then falls back to the second model', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 529, json: async () => ({}) })
      .mockResolvedValueOnce(claudeResponse(['wrong', 'count']))
      .mockResolvedValueOnce(claudeResponse(['Hola']));
    await expect(translateOneClaude(['Hello'], 'EN', 'ES', { fetchImpl, models: ['m1', 'm2'] })).resolves.toEqual(['Hola']);
    const models = fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual(['m1', 'm1', 'm2']);
  });
  it('skips a missing model without retrying it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce(claudeResponse(['Hola']));
    await translateOneClaude(['Hello'], 'EN', 'ES', { fetchImpl, models: ['m1', 'm2'] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('treats truncated output as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(claudeResponse(['Hola'], { stop_reason: 'max_tokens' }));
    await expect(translateOneClaude(['Hello'], 'EN', 'ES', { fetchImpl, models: ['m1'] })).rejects.toThrow();
  });
});

describe('translateWith', () => {
  it('does not send empty texts and keeps positions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(claudeResponse(['Cuerpo']));
    const out = await translateWith('claude', ['', 'Body'], 'EN', 'ES', { fetchImpl });
    expect(out).toEqual(['', 'Cuerpo']);
    expect(JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).messages[0].content).texts).toEqual(['Body']);
  });
  it('makes no call when everything is empty', async () => {
    const fetchImpl = vi.fn();
    await expect(translateWith('claude', ['', ' '], 'EN', 'ES', { fetchImpl })).resolves.toEqual(['', ' ']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('translateAll', () => {
  it('translates into the three other languages with the primary provider', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      const lang = body.system.match(/ to (\w+)/)[1];
      return claudeResponse([`[${lang}] Hello`]);
    });
    const { translations, providers } = await translateAll(['Hello'], 'EN', { order: ['claude', 'deepl'], fetchImpl });
    expect(translations.en).toEqual(['Hello']);
    expect(translations.es).toEqual(['[Spanish] Hello']);
    expect(translations.fr).toEqual(['[French] Hello']);
    expect(translations.de).toEqual(['[German] Hello']);
    expect(providers).toEqual({ es: 'claude', fr: 'claude', de: 'claude' });
  });
  it('falls back to DeepL per language when Claude fails', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (url.includes('deepl')) return deeplResponse(['DeepL text']);
      const lang = JSON.parse(init.body).system.match(/ to (\w+)/)[1];
      if (lang === 'French') return { ok: false, status: 500, json: async () => ({}) };
      return claudeResponse(['Claude text']);
    });
    const { translations, providers } = await translateAll(['Hello'], 'EN', { order: ['claude', 'deepl'], fetchImpl });
    expect(translations.fr).toEqual(['DeepL text']);
    expect(providers).toEqual({ es: 'claude', fr: 'deepl', de: 'claude' });
  });
  it('throws when every provider fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(translateAll(['Hello'], 'EN', { order: ['claude', 'deepl'], fetchImpl })).rejects.toThrow();
  });
  it('echoes originals when no provider is configured', async () => {
    const { translations } = await translateAll(['Hola'], 'ES', { order: [] });
    expect(translations).toEqual({ es: ['Hola'], en: ['Hola'], fr: ['Hola'], de: ['Hola'] });
  });
});
