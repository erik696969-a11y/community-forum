import { describe, it, expect } from 'vitest';
import {
  detectEmergency,
  hasDangerousCombo,
  tokenize,
  retrieveRelevantEntries,
  mergeCarriedSources,
  safeParseJson,
  clampUrgency,
  validateSources,
  resolveContactRoles,
} from '../aiAssistant';

describe('detectEmergency', () => {
  it('flags an obvious fire mention', () => {
    expect(detectEmergency('There is a fire in the hallway')).toBe(true);
  });

  it('does not flag a routine, non-urgent question', () => {
    expect(detectEmergency('Where can my visitor park?')).toBe(false);
  });

  it('flags Spanish emergency language', () => {
    expect(detectEmergency('Huele mucho a gas en el pasillo')).toBe(true);
  });

  it('flags French emergency language', () => {
    expect(detectEmergency('Il y a de la fumée dans le couloir')).toBe(true);
  });

  it('flags German emergency language', () => {
    expect(detectEmergency('Ich rieche Gas in der Küche')).toBe(true);
  });

  it('flags the water+light combo even though neither word alone is dangerous', () => {
    expect(detectEmergency('Water is coming through my bathroom light')).toBe(true);
  });

  it('does not flag water or electricity mentioned separately in unrelated contexts', () => {
    expect(detectEmergency('Can someone fix the water pressure in my sink?')).toBe(false);
    expect(detectEmergency('When is the electricity bill due?')).toBe(false);
  });

  it('flags a trapped person regardless of cause', () => {
    expect(detectEmergency('My neighbour is trapped in the elevator')).toBe(true);
  });

  it('flags sparks on their own', () => {
    expect(detectEmergency('I saw sparks coming from the wall socket')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectEmergency('FIRE FIRE FIRE')).toBe(true);
  });
});

describe('hasDangerousCombo', () => {
  it('requires both a water term and an electrical term', () => {
    expect(hasDangerousCombo('water leak near the socket')).toBe(true);
    expect(hasDangerousCombo('water leak in the garden')).toBe(false);
    expect(hasDangerousCombo('the socket is loose')).toBe(false);
  });
});

describe('tokenize', () => {
  it('strips accents so accented and unaccented forms match', () => {
    expect(tokenize('fugó')).toEqual(['fugo']);
  });

  it('drops words shorter than 3 characters', () => {
    expect(tokenize('is my a leak')).toEqual(['leak']);
  });
});

describe('retrieveRelevantEntries', () => {
  const entries = [
    { id: '1', intent_code: 'WAT-01', title: 'Water leak from upstairs', category: 'water', keywords: ['water', 'leak', 'ceiling', 'upstairs'] },
    { id: '2', intent_code: 'PRK-01', title: 'Visitor parking', category: 'parking', keywords: ['parking', 'visitor', 'guest'] },
    { id: '3', intent_code: 'GEN-01', title: 'General welcome info', category: 'general', keywords: [] },
  ];

  it('matches the entry whose keywords overlap the question', () => {
    const { entries: matched, fallbackUsed } = retrieveRelevantEntries(entries, 'Water is leaking from the ceiling');
    expect(matched.map((e) => e.intent_code)).toContain('WAT-01');
    expect(matched.map((e) => e.intent_code)).not.toContain('PRK-01');
    expect(fallbackUsed).toBe(false);
  });

  it('falls back to general entries when nothing matches', () => {
    const { entries: matched, fallbackUsed } = retrieveRelevantEntries(entries, 'xyzzyplugh completely unrelated gibberish');
    expect(fallbackUsed).toBe(true);
    expect(matched.every((e) => e.category === 'general')).toBe(true);
  });

  it('returns nothing for an empty question', () => {
    const { entries: matched, fallbackUsed } = retrieveRelevantEntries(entries, '');
    expect(matched).toEqual([]);
    expect(fallbackUsed).toBe(false);
  });
});

describe('mergeCarriedSources', () => {
  const entries = [
    { id: '1', intent_code: 'WAT-01' },
    { id: '2', intent_code: 'ACC-03' },
    { id: '3', intent_code: 'PRK-01' },
  ];

  it('carries forward a previously matched source not found by the current retrieval', () => {
    const currentRetrieval = [entries[1]]; // ACC-03 matched this turn
    const previousSourceCodes = new Set(['WAT-01']); // from the prior turn
    const merged = mergeCarriedSources(entries, currentRetrieval, previousSourceCodes);
    expect(merged.map((e) => e.intent_code).sort()).toEqual(['ACC-03', 'WAT-01']);
  });

  it('does not duplicate an entry already present in the current retrieval', () => {
    const currentRetrieval = [entries[0]];
    const previousSourceCodes = new Set(['WAT-01']);
    const merged = mergeCarriedSources(entries, currentRetrieval, previousSourceCodes);
    expect(merged).toHaveLength(1);
  });

  it('is a no-op when there is no history', () => {
    const currentRetrieval = [entries[2]];
    const merged = mergeCarriedSources(entries, currentRetrieval, new Set());
    expect(merged).toBe(currentRetrieval);
  });
});

describe('safeParseJson', () => {
  it('parses plain valid JSON', () => {
    expect(safeParseJson('{"answer": "hi"}')).toEqual({ answer: 'hi' });
  });

  it('strips a ```json code fence the model was told not to use', () => {
    const raw = '```json\n{"answer": "hi"}\n```';
    expect(safeParseJson(raw)).toEqual({ answer: 'hi' });
  });

  it('returns null for invalid JSON instead of throwing', () => {
    expect(safeParseJson('not json at all')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(safeParseJson('')).toBeNull();
    expect(safeParseJson(null)).toBeNull();
  });
});

describe('clampUrgency', () => {
  it('accepts an allowed value unchanged', () => {
    expect(clampUrgency('orange', 'info')).toBe('orange');
  });

  it('falls back for a hallucinated/invalid urgency value', () => {
    expect(clampUrgency('super-critical', 'info')).toBe('info');
    expect(clampUrgency(undefined, 'red')).toBe('red');
  });
});

describe('validateSources', () => {
  const relevantEntries = [{ id: '1', intent_code: 'WAT-01' }, { id: '2', intent_code: 'ACC-03' }];

  it('keeps sources that were actually retrieved', () => {
    expect(validateSources(['WAT-01'], relevantEntries)).toEqual(['WAT-01']);
  });

  it('drops a source the model invented that was never retrieved', () => {
    expect(validateSources(['WAT-99'], relevantEntries)).toEqual([]);
  });

  it('handles a non-array input gracefully', () => {
    expect(validateSources(undefined, relevantEntries)).toEqual([]);
  });
});

describe('resolveContactRoles', () => {
  const contacts = [
    { role_label: 'Maintenance', name: 'Juan', phone: '+34 600 000 000', email: 'maintenance@example.com' },
    { role_label: 'Security', name: 'Ana', phone: '+34 600 111 111', email: 'security@example.com' },
  ];

  it('resolves an exact role_label match to the real contact', () => {
    const result = resolveContactRoles(['Maintenance'], contacts);
    expect(result).toEqual([{ label: 'Maintenance', name: 'Juan', phone: '+34 600 000 000', email: 'maintenance@example.com' }]);
  });

  it('never invents a contact for a role that does not exist', () => {
    const result = resolveContactRoles(['Plumber'], contacts);
    expect(result).toEqual([]);
  });

  it('does not let the model smuggle a fabricated phone number through', () => {
    // Even if the model tries to pass an object instead of a plain role
    // string, resolveContactRoles only ever reads from the real contacts
    // table - there is no code path that copies caller-supplied phone/email.
    const result = resolveContactRoles([{ role_label: 'Maintenance', phone: '+34 999 999 999' }], contacts);
    expect(result).toEqual([]); // non-string entries are ignored entirely
  });

  it('deduplicates if the same role is requested twice', () => {
    const result = resolveContactRoles(['Maintenance', 'maintenance'], contacts);
    expect(result).toHaveLength(1);
  });
});
