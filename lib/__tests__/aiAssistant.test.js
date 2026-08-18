import { describe, it, expect } from 'vitest';
import {
  detectEmergency,
  hasDangerousCombo,
  tokenize,
  keywordPoolForEntry,
  retrieveRelevantEntries,
  selectAttachedEntries,
  computeRelatedIntents,
  applyDeterministicBranching,
  resolveModules,
  resolvePlaceholdersInText,
  resolvePlaceholdersInArray,
  safeParseJson,
  clampUrgency,
  validateSources,
  ALLOWED_SOURCE_STATUS,
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

describe('keywordPoolForEntry', () => {
  it('merges intent_tags with tokenized example_user_queries', () => {
    const entry = {
      keywords: ['leak'],
      logic_json: { example_user_queries: ['Water is coming through my ceiling'] },
    };
    const pool = keywordPoolForEntry(entry);
    expect(pool).toContain('leak');
    expect(pool).toContain('ceiling');
  });
});

describe('selectAttachedEntries / computeRelatedIntents (V2 follow-up state)', () => {
  const WAT01 = {
    id: '1',
    intent_code: 'WAT-01',
    logic_json: { related_intents: ['ELE-05'] },
  };
  const ELE05 = { id: '2', intent_code: 'ELE-05', logic_json: {} };
  const PRK01 = { id: '3', intent_code: 'PRK-01', logic_json: {} };
  const entries = [WAT01, ELE05, PRK01];

  it('first turn: matched entry becomes primary and pulls in its related_intents', () => {
    const { primary, attached } = selectAttachedEntries(entries, [WAT01], false, null, []);
    expect(primary.intent_code).toBe('WAT-01');
    expect(attached.map((e) => e.intent_code)).toContain('ELE-05');
  });

  it('follow-up: keeps the previous primary even when the new question matches nothing', () => {
    const { primary, attached } = selectAttachedEntries(entries, [], true, 'WAT-01', ['ELE-05']);
    expect(primary.intent_code).toBe('WAT-01');
    expect(attached.map((e) => e.intent_code)).toContain('ELE-05');
  });

  it('a genuinely new match becomes the new primary while old context is still attached', () => {
    const { primary, attached } = selectAttachedEntries(entries, [PRK01], false, 'WAT-01', ['ELE-05']);
    expect(primary.intent_code).toBe('PRK-01');
    expect(attached.map((e) => e.intent_code)).toEqual(expect.arrayContaining(['PRK-01', 'WAT-01', 'ELE-05']));
  });

  it('computeRelatedIntents excludes the primary itself', () => {
    const { primary, attached } = selectAttachedEntries(entries, [WAT01], false, null, []);
    const related = computeRelatedIntents(primary, attached);
    expect(related).not.toContain('WAT-01');
    expect(related).toContain('ELE-05');
  });
});

describe('applyDeterministicBranching', () => {
  const entry = {
    logic_json: {
      post_incident_branching: [
        { when: 'source_status == communal', apply: ['COMMUNAL_SOURCE'] },
        { when: 'source_status == private_other', apply: ['PRIVATE_OTHER_SOURCE'] },
      ],
    },
  };

  it('attaches the module whose condition matches the current source_status', () => {
    expect(applyDeterministicBranching(entry, 'communal')).toEqual(['COMMUNAL_SOURCE']);
  });

  it('attaches nothing while source_status is still unknown', () => {
    expect(applyDeterministicBranching(entry, 'unknown')).toEqual([]);
  });

  it('is a pure server-side decision, unaffected by anything the model claims', () => {
    // Same entry, different status -> different, still deterministic, result.
    expect(applyDeterministicBranching(entry, 'private_other')).toEqual(['PRIVATE_OTHER_SOURCE']);
  });
});

describe('resolveModules', () => {
  const candidates = [
    { module_code: 'SOURCE_DETERMINATION', title: 'Determine source', content_json: { actions: ['Ask maintenance'], do_not: ['Do not guess'] } },
  ];

  it('resolves a genuinely offered module with its content', () => {
    const result = resolveModules(['SOURCE_DETERMINATION'], candidates);
    expect(result).toEqual([{ code: 'SOURCE_DETERMINATION', title: 'Determine source', actions: ['Ask maintenance'], doNot: ['Do not guess'] }]);
  });

  it('never lets the model attach a module it was not actually offered', () => {
    expect(resolveModules(['INVENTED_MODULE'], candidates)).toEqual([]);
  });
});

describe('resolvePlaceholdersInText / resolvePlaceholdersInArray', () => {
  const contacts = [{ role_label: 'Maintenance', name: 'Juan', phone: '+34 600 000 000', email: '' }];
  const config = [{ key: 'EVACUATION_MEETING_POINT', value: 'Main gate' }];

  it('resolves a contact-type placeholder from the contacts table', () => {
    expect(resolvePlaceholdersInText('Call [MAINTENANCE_PHONE].', contacts, config)).toBe('Call +34 600 000 000.');
  });

  it('resolves a fact-type placeholder from community_config', () => {
    expect(resolvePlaceholdersInText('Meet at [EVACUATION_MEETING_POINT].', contacts, config)).toBe('Meet at Main gate.');
  });

  it('never invents a value for an unconfigured placeholder - gives an honest fallback instead', () => {
    const result = resolvePlaceholdersInText('Email [ADMINISTRATOR_EMAIL].', contacts, config);
    expect(result).not.toContain('[ADMINISTRATOR_EMAIL]');
    expect(result.toLowerCase()).toContain('not yet set up');
  });

  it('applies to every string in an array', () => {
    const result = resolvePlaceholdersInArray(['Call [MAINTENANCE_PHONE].', 'Go to [EVACUATION_MEETING_POINT].'], contacts, config);
    expect(result).toEqual(['Call +34 600 000 000.', 'Go to Main gate.']);
  });
});

describe('ALLOWED_SOURCE_STATUS', () => {
  it('includes all statuses defined in the deployment logic doc', () => {
    expect(ALLOWED_SOURCE_STATUS).toEqual([
      'unknown', 'private_own', 'private_other', 'communal',
      'external_or_unknown', 'criminal_act', 'contractor', 'not_applicable',
    ]);
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
    expect(clampUrgency('orange', 'yellow')).toBe('orange');
  });

  it('falls back for a hallucinated/invalid urgency value', () => {
    expect(clampUrgency('super-critical', 'yellow')).toBe('yellow');
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
