import { describe, it, expect } from 'vitest';
import { parseAnswer } from '../answerFormat';

describe('parseAnswer', () => {
  it('parses tables, bullets, headings and rules', () => {
    const text = [
      '## Contracts',
      '| Contract | Notice |',
      '|---|---|',
      '| Cleaning | 2026-10-31 |',
      '| Gardening | 2026-11-01 |',
      '',
      '- one',
      '- two',
      '---',
      'Done.',
    ].join('\n');
    const b = parseAnswer(text);
    expect(b.map((x) => x.type)).toEqual(['h', 'table', 'ul', 'hr', 'p']);
    expect(b[1].head).toEqual(['Contract', 'Notice']);
    expect(b[1].rows).toEqual([['Cleaning', '2026-10-31'], ['Gardening', '2026-11-01']]);
    expect(b[2].items).toEqual(['one', 'two']);
  });
  it('keeps a lone pipe line as text', () => {
    expect(parseAnswer('a | b')[0]).toEqual({ type: 'p', text: 'a | b' });
  });
});
