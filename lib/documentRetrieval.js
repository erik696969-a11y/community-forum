// Document chunk retrieval for the AI Assistant.
//
// Lets the assistant pull relevant excerpts from full documents (AGM
// minutes, Statutes, etc.) at question time, instead of relying only on
// manually-curated community_config facts. Uses the SAME keyword-overlap
// scoring style as retrieveRelevantEntries() in lib/aiAssistant.js -
// reuses its exported tokenize() directly rather than duplicating
// tokenization logic.
//
// A chunk is one excerpt of a document (e.g. one agenda item), stored in
// the community_documents table (see
// supabase/migrations/20260902000000_community_documents.sql). Retrieval
// scores every active chunk against the question and returns the
// strongest few matches - never the whole document on every question.

import { tokenize } from './aiAssistant';

// A chunk needs at least this many independent word-overlap hits with the
// question to be considered relevant at all - mirrors
// MIN_MEANINGFUL_TOKENS in lib/aiAssistant.js's scoreEntry(), so a single
// generic word shared between question and chunk can never alone trigger
// a document excerpt being attached.
export const MIN_MEANINGFUL_TOKENS = 2;

// Cap on how many chunks get attached to a single prompt, regardless of
// how many score above the threshold - keeps prompt size and latency
// bounded even as the document library grows.
export const MAX_RETRIEVED_CHUNKS = 3;

// Scores one chunk against a pre-tokenized question. Returns the number
// of distinct question tokens found in the chunk's own text (title +
// body + explicit keywords combined) - simple, deterministic overlap
// counting, no external ranking service or embeddings required.
export function scoreChunk(chunk, questionTokens) {
  const chunkSourceText = [
    chunk.chunk_title || '',
    chunk.chunk_text || '',
    ...(Array.isArray(chunk.keywords) ? chunk.keywords : []),
  ].join(' ');
  const chunkTokens = new Set(tokenize(chunkSourceText));
  let matches = 0;
  for (const t of questionTokens) {
    if (chunkTokens.has(t)) matches += 1;
  }
  return matches;
}

// Returns the top-scoring active chunks for a question, sorted by score
// descending, with a deterministic tie-break (chunk_index, then
// document_title) so the same question always returns the same result
// regardless of database row order.
export function retrieveRelevantDocumentChunks(chunks, question, maxChunks = MAX_RETRIEVED_CHUNKS) {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return [];

  const scored = (chunks || [])
    .filter((c) => c && c.active !== false)
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, questionTokens) }))
    .filter((s) => s.score >= MIN_MEANINGFUL_TOKENS);

  scored.sort((a, b) => (
    b.score - a.score
    || (a.chunk.chunk_index ?? 0) - (b.chunk.chunk_index ?? 0)
    || (a.chunk.document_title || '').localeCompare(b.chunk.document_title || '')
  ));

  return scored.slice(0, maxChunks).map((s) => s.chunk);
}

// Formats matched chunks for the system prompt - grouped so the model can
// clearly see which document each excerpt came from, for accurate
// citation ("Per the AGM 2026 minutes...") rather than treating every
// excerpt as one undifferentiated blob.
export function formatDocumentExcerptsForPrompt(matchedChunks) {
  if (!matchedChunks || matchedChunks.length === 0) return '(none)';
  return matchedChunks
    .map((c) => `[${c.document_title}${c.chunk_title ? ` - ${c.chunk_title}` : ''}]\n${c.chunk_text}`)
    .join('\n\n');
}
