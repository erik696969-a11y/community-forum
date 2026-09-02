import { describe, it, expect } from 'vitest';
import {
  scoreChunk,
  retrieveRelevantDocumentChunks,
  formatDocumentExcerptsForPrompt,
  MIN_MEANINGFUL_TOKENS,
  MAX_RETRIEVED_CHUNKS,
} from '../documentRetrieval';

function chunk(overrides) {
  return {
    id: 'chunk-1',
    document_title: 'AGM Minutes 2026',
    document_type: 'agm_minutes',
    document_year: 2026,
    chunk_index: 0,
    chunk_title: 'Item 4: Budget',
    chunk_text: 'The costs of the Site Manager and new maintenance staff have been taken into account.',
    keywords: [],
    active: true,
    ...overrides,
  };
}

describe('scoreChunk', () => {
  it('counts distinct overlapping tokens between question and chunk text', () => {
    const c = chunk({ chunk_text: 'The site manager position is community funded.' });
    const questionTokens = new Set(['site', 'manager', 'unrelated']);
    expect(scoreChunk(c, questionTokens)).toBe(2);
  });

  it('includes chunk_title in the scored text', () => {
    const c = chunk({ chunk_title: 'Site Manager Role', chunk_text: 'Some unrelated body text here.' });
    const questionTokens = new Set(['site', 'manager']);
    expect(scoreChunk(c, questionTokens)).toBe(2);
  });

  it('includes explicit keywords in the scored text', () => {
    const c = chunk({ chunk_text: 'Unrelated body.', keywords: ['sitemanager', 'staffing'] });
    const questionTokens = new Set(['staffing']);
    expect(scoreChunk(c, questionTokens)).toBe(1);
  });

  it('returns 0 for no overlap at all', () => {
    const c = chunk({ chunk_text: 'Completely different topic about gardening rules.' });
    const questionTokens = new Set(['electrical', 'socket']);
    expect(scoreChunk(c, questionTokens)).toBe(0);
  });

  it('handles missing/null chunk fields gracefully', () => {
    const c = { chunk_title: null, chunk_text: null, keywords: null };
    const questionTokens = new Set(['anything']);
    expect(scoreChunk(c, questionTokens)).toBe(0);
  });
});

describe('retrieveRelevantDocumentChunks', () => {
  it('returns chunks meeting the minimum-token threshold, sorted by score', () => {
    const chunks = [
      chunk({ id: 'a', chunk_index: 0, chunk_text: 'Site manager position and maintenance staff budget.' }),
      chunk({ id: 'b', chunk_index: 1, chunk_text: 'Garden alteration rules for communal areas.' }),
      chunk({ id: 'c', chunk_index: 2, chunk_text: 'The site manager role is funded by the community.' }),
    ];
    const result = retrieveRelevantDocumentChunks(chunks, 'is there a paid site manager position?');
    expect(result.length).toBeGreaterThan(0);
    expect(result.map((c) => c.id)).toContain('a');
    expect(result.map((c) => c.id)).not.toContain('b');
  });

  it('excludes inactive chunks even if they would otherwise match strongly', () => {
    const chunks = [
      chunk({ id: 'active-match', active: true, chunk_text: 'Site manager position funded by community.' }),
      chunk({ id: 'inactive-match', active: false, chunk_text: 'Site manager position funded by community.' }),
    ];
    const result = retrieveRelevantDocumentChunks(chunks, 'site manager position');
    expect(result.map((c) => c.id)).toEqual(['active-match']);
  });

  it('returns empty array for an empty/whitespace-only question', () => {
    const chunks = [chunk({})];
    expect(retrieveRelevantDocumentChunks(chunks, '')).toEqual([]);
    expect(retrieveRelevantDocumentChunks(chunks, '   ')).toEqual([]);
  });

  it('returns empty array when no chunk meets MIN_MEANINGFUL_TOKENS', () => {
    const chunks = [chunk({ chunk_text: 'Only one word overlaps here: manager.' })];
    // "manager" alone is a single token overlap - below the 2-token minimum.
    const result = retrieveRelevantDocumentChunks(chunks, 'who is the manager?');
    expect(result).toEqual([]);
  });

  it('respects the maxChunks cap even when more chunks qualify', () => {
    const chunks = Array.from({ length: 6 }, (_, i) => chunk({
      id: `c${i}`,
      chunk_index: i,
      chunk_text: 'Site manager position and community funded staff role.',
    }));
    const result = retrieveRelevantDocumentChunks(chunks, 'site manager position funded', 2);
    expect(result).toHaveLength(2);
  });

  it('defaults to MAX_RETRIEVED_CHUNKS when maxChunks is not specified', () => {
    const chunks = Array.from({ length: 6 }, (_, i) => chunk({
      id: `c${i}`,
      chunk_index: i,
      chunk_text: 'Site manager position and community funded staff role.',
    }));
    const result = retrieveRelevantDocumentChunks(chunks, 'site manager position funded');
    expect(result.length).toBeLessThanOrEqual(MAX_RETRIEVED_CHUNKS);
  });

  it('breaks score ties deterministically by chunk_index', () => {
    const chunks = [
      chunk({ id: 'later', chunk_index: 5, chunk_text: 'Site manager position details here.' }),
      chunk({ id: 'earlier', chunk_index: 1, chunk_text: 'Site manager position details here.' }),
