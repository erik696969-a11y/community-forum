import { describe, it, expect } from 'vitest';
import {
  detectEmergency,
  hasDangerousCombo,
  tokenize,
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

  it('drops common function words (stopwords) across EN/ES/FR/DE', () => {
    // Regression test for a real bug: "puedo" ("I can", extremely common
    // in Spanish questions) was embedded in an emergency scenario's own
    // keyword phrase ("no puedo contactar al vecino"), causing ANY
    // unrelated Spanish question phrased as "¿Dónde puedo...?" to falsely
    // match that emergency scenario purely on this one generic word.
    expect(tokenize('donde puedo encontrar informacion')).not.toContain('puedo');
    expect(tokenize('donde puedo encontrar informacion')).not.toContain('donde');
    expect(tokenize('can you help with this')).not.toContain('can');
    expect(tokenize('comment puis-je vous contacter')).not.toContain('pour');
    expect(tokenize('wo kann ich das finden')).not.toContain('kann');
  });

  it('keeps distinctive content words alongside stopword removal', () => {
    expect(tokenize('donde puedo encontrar las normas sobre el uso de las piscinas'))
      .toEqual(['encontrar', 'normas', 'uso', 'piscinas']);
  });
});

describe('tokenize / retrieveRelevantEntries — false positive regression (Session 18: "puedo")', () => {
  it('a generic Spanish question no longer false-matches an emergency scenario via a common word', () => {
    // This is the exact bug report: "¿Dónde puedo encontrar las normas
    // sobre el uso de las piscinas?" (pool rules) was matching BLD-08
    // ("no puedo contactar al vecino") purely via the word "puedo".
    const entries = [
      { id: '1', intent_code: 'BLD-08', title: 'Emergency affecting an empty apartment', category: 'Building', keywords: ['no puedo contactar al vecino', 'emergencia apartamento vacio'] },
      { id: '2', intent_code: 'SAF-07', title: 'Cannot contact security', category: 'Safety', keywords: ['no puedo contactar emergencia'] },
    ];
    const result = retrieveRelevantEntries(entries, '¿Dónde puedo encontrar las normas sobre el uso de las piscinas?');
    expect(result.entries).toEqual([]);
    expect(result.fallbackUsed).toBe(true);
  });

  it('a genuine water-leak question in Spanish still matches WAT-01 as the top result', () => {
    const entries = [
      { id: '1', intent_code: 'WAT-01', title: 'Water leak from upstairs', category: 'Water', keywords: ['fuga de agua arriba', 'gotea el techo'] },
      { id: '2', intent_code: 'BLD-08', title: 'Emergency affecting an empty apartment', category: 'Building', keywords: ['no puedo contactar al vecino', 'emergencia apartamento vacio'] },
    ];
    const result = retrieveRelevantEntries(entries, 'Tengo una fuga de agua que parece venir del apartamento de arriba');
    expect(result.entries[0].intent_code).toBe('WAT-01');
    expect(result.fallbackUsed).toBe(false);
  });
});

describe('retrieveRelevantEntries — Session 19 hardening (generic-term & single-word-phrase regression)', () => {
  // Real bug #2: "apagón comunidad" (ELE-02) matched "¿Qué eventos hay
  // próximamente en la comunidad?" purely via the word "comunidad" -
  // exactly the same failure class as "puedo", just a different generic
  // word embedded inside an otherwise-specific keyword phrase.
  const eventsEntries = [
    { id: '1', intent_code: 'ELE-02', category: 'Electricity', keywords: ['corte de luz edificio', 'apagón comunidad', 'fallo eléctrico general'], logic_json: { example_user_queries: [] } },
  ];

  it('a neutral events question does not false-match a power outage scenario via "comunidad"', () => {
    const result = retrieveRelevantEntries(eventsEntries, '¿Qué eventos hay próximamente en la comunidad?');
    expect(result.entries).toEqual([]);
    expect(result.fallbackUsed).toBe(true);
  });

  // Real bug #3: several Session 16 translations all ended with the
  // generic qualifier "zona común" (WAT-04, ELE-06, MED-03), so a totally
  // unrelated "can I book a common area?" question matched all three.
  const commonAreaEntries = [
    { id: '1', intent_code: 'WAT-04', category: 'Water', keywords: ['inundación zona común'], logic_json: { example_user_queries: [] } },
    { id: '2', intent_code: 'ELE-06', category: 'Electricity', keywords: ['cable vivo zona común'], logic_json: { example_user_queries: [] } },
    { id: '3', intent_code: 'MED-03', category: 'Medical', keywords: ['lesión zona común'], logic_json: { example_user_queries: [] } },
  ];

  it('booking a common area does not false-match flooding/cable/injury scenarios via "zona común"', () => {
    const result = retrieveRelevantEntries(commonAreaEntries, '¿Puedo reservar una zona común?');
    expect(result.entries).toEqual([]);
    expect(result.fallbackUsed).toBe(true);
  });

  // Real bug #4: a "phrase" that reduces to a single word after generic
  // filtering ("no water" -> just "water") was still getting the full
  // multi-word PHRASE_MATCH_SCORE bonus, letting WAT-06 (no water
  // pressure) outrank WAT-01 (ceiling leak) for a ceiling-leak question
  // that only coincidentally shares the single word "water".
  const waterEntries = [
    {
      id: '1', intent_code: 'WAT-01', category: 'Water',
      keywords: ['water leak upstairs', 'ceiling leak', 'water from above'],
      logic_json: { example_user_queries: ['Water is coming through my ceiling.'] },
    },
    {
      id: '2', intent_code: 'WAT-06', category: 'Water',
      keywords: ['no water', 'low pressure', 'water supply off'],
      logic_json: { example_user_queries: ['I have no water.'] },
    },
  ];

  it('a ceiling-leak question matches WAT-01, not WAT-06, despite both sharing the word "water"', () => {
    const result = retrieveRelevantEntries(waterEntries, 'There is water coming through my ceiling.');
    expect(result.entries[0].intent_code).toBe('WAT-01');
  });

  it('a single-word "phrase" alone is not enough to reach eligibility on its own', () => {
    const soleWaterMention = [{ id: '1', intent_code: 'WAT-06', category: 'Water', keywords: ['no water'], logic_json: { example_user_queries: [] } }];
    const result = retrieveRelevantEntries(soleWaterMention, 'I was just wondering about water in general.');
    expect(result.entries).toEqual([]);
  });
});

describe('retrieveRelevantEntries — full spec regression suite (neutral vs incident queries)', () => {
  const entries = [
    { id: '1', intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak', 'water from above'], logic_json: { example_user_queries: ['Water is coming through my ceiling.'] } },
    { id: '2', intent_code: 'ELE-02', category: 'Electricity', keywords: ['corte de luz edificio', 'apagón comunidad', 'fallo eléctrico general', 'sin electricidad', 'no tenemos electricidad'], logic_json: { example_user_queries: [] } },
    { id: '3', intent_code: 'ADM-02', category: 'Administration', keywords: ['documents', 'AGM minutes', 'budget', 'insurance policy'], logic_json: { example_user_queries: [] } },
    { id: '4', intent_code: 'BLD-08', category: 'Building', keywords: ['no puedo contactar al vecino', 'emergencia apartamento vacio'], logic_json: { example_user_queries: [] } },
  ];

  it('1. events question stays on the neutral knowledge path', () => {
    expect(retrieveRelevantEntries(entries, '¿Qué eventos hay próximamente en la comunidad?').entries).toEqual([]);
  });

  it('2. document question may route to the relevant info-request scenario (not an emergency one)', () => {
    const r = retrieveRelevantEntries(entries, 'Where can I find the community documents?');
    expect(r.entries.every((e) => e.intent_code !== 'BLD-08' && e.intent_code !== 'ELE-02')).toBe(true);
  });

  it('3. booking a common area stays on the neutral knowledge path', () => {
    expect(retrieveRelevantEntries(entries, '¿Puedo reservar una zona común?').entries).toEqual([]);
  });

  it('4. asking for a plumber recommendation does not force a water-leak scenario', () => {
    expect(retrieveRelevantEntries(entries, 'Can anyone recommend a plumber?').entries).toEqual([]);
  });

  it('5. pool rules stays on the neutral knowledge path', () => {
    expect(retrieveRelevantEntries(entries, '¿Dónde puedo encontrar las normas de la piscina?').entries).toEqual([]);
  });

  it('6. asking who the administrator is does not trigger an incident scenario', () => {
    const r = retrieveRelevantEntries(entries, 'Who is the administrator of the community?');
    expect(r.entries.every((e) => e.intent_code !== 'BLD-08' && e.intent_code !== 'ELE-02' && e.intent_code !== 'WAT-01')).toBe(true);
  });

  it('7. a genuine Spanish water-leak question matches WAT-01', () => {
    expect(retrieveRelevantEntries(entries, 'Tengo una fuga de agua del apartamento de arriba.').entries[0].intent_code).toBe('WAT-01');
  });

  it('8. a genuine English water-leak question matches WAT-01', () => {
    expect(retrieveRelevantEntries(entries, 'There is water coming through my ceiling.').entries[0].intent_code).toBe('WAT-01');
  });

  it('9. a genuine power outage question matches ELE-02', () => {
    expect(retrieveRelevantEntries(entries, 'No tenemos electricidad en las zonas comunes.').entries[0].intent_code).toBe('ELE-02');
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

describe('retrieveRelevantEntries — Session 21 (negation/state patterns + singleton anchors)', () => {
  const ele01 = {
    id: 'a', intent_code: 'ELE-01', category: 'Electricity & Utilities',
    keywords: ['power out', 'fuse box', 'breaker', 'only my apartment no electricity', 'only in my apartment no power', 'power out only in my flat'],
    logic_json: { example_user_queries: ['My apartment has no electricity but neighbours do.', 'The power went off only in my flat.'] },
  };
  const ele02 = {
    id: 'b', intent_code: 'ELE-02', category: 'Electricity & Utilities',
    keywords: ['no electricity', 'power outage', 'no power', 'lights are out', 'lights out'],
    logic_json: { example_user_queries: [] },
  };
  const entries = [ele01, ele02];

  // "no electricity" / "no power" - "no" is normally dropped by the length
  // filter, but as a STATE_MARKER it survives specifically for phrase
  // matching, so "no electricity" scores as a genuine 2-word phrase
  // rather than needing "electricity" to become sufficient alone.
  it('matches ELE-02 for "no electricity in the common areas" via the negation-pattern phrase', () => {
    const r = retrieveRelevantEntries(entries, 'There is no electricity in the common areas.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  it('matches ELE-02 for "no power in the building"', () => {
    const r = retrieveRelevantEntries(entries, 'There is no power in the building.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  // "out" is in STOPWORDS generally, but survives via STATE_MARKERS for
  // phrase matching, so "lights are out" -> "lights out" phrase matches.
  it('matches ELE-02 for "the lights are out in the common areas"', () => {
    const r = retrieveRelevantEntries(entries, 'The lights are out in the common areas.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  // "blackout" has no negation pattern in the sentence at all - it is a
  // single word, and the only mechanism that can legitimately let it
  // through is the narrow, explicitly-curated HIGH_CONFIDENCE_SINGLETONS
  // list for this one scenario.
  it('matches ELE-02 for the bare singleton anchor "blackout"', () => {
    const r = retrieveRelevantEntries(entries, 'Blackout in our block.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  it('does NOT match ELE-02 for a bare mention of "electricity" with no negation/state pattern', () => {
    expect(retrieveRelevantEntries(entries, 'Where can I find information about electricity bills?').entries).toEqual([]);
    expect(retrieveRelevantEntries(entries, 'Where is the electrical meter?').entries).toEqual([]);
  });

  it('does NOT match ELE-02 for an unrelated recommendation request', () => {
    expect(retrieveRelevantEntries(entries, 'Can anyone recommend an electrician?').entries).toEqual([]);
  });

  it('does NOT match ELE-02 merely because "electricity" appears in a fees question', () => {
    expect(retrieveRelevantEntries(entries, 'Is electricity included in the community fees?').entries).toEqual([]);
  });

  // ELE-01 vs ELE-02 disambiguation: both are legitimately about power
  // outages, differing only by scope (one apartment vs common areas) -
  // "apartment" being GENERIC means this distinction is invisible to
  // plain keyword overlap unless ELE-01's own phrases explicitly encode
  // the exclusive/single-apartment scope via a non-generic, non-stopword
  // word like "only".
  it('routes a single-apartment outage to ELE-01, not ELE-02', () => {
    const r = retrieveRelevantEntries(entries, 'Only my apartment has no electricity, my neighbours are fine.');
    expect(r.entries[0].intent_code).toBe('ELE-01');
  });
});

describe('retrieveRelevantEntries — Session 22 ("blackout" medical/electrical ambiguity)', () => {
  // "blackout" was removed from HIGH_CONFIDENCE_SINGLETONS because it can
  // also mean loss of consciousness/memory, which would otherwise route a
  // possible medical event (MED-02) into an electrical-outage workflow.
  // Its electrical meaning is preserved via ordinary phrase matching
  // ("power blackout", "blackout block") rather than a singleton
  // exception, following the standard phrase-matching architecture.
  const ele02 = {
    id: 'b', intent_code: 'ELE-02', category: 'Electricity & Utilities',
    keywords: ['no electricity', 'power outage', 'blackout block', 'power blackout', 'electricity blackout', 'apagon comunidad', 'panne electricite', 'coupure de courant', 'stromausfall'],
    logic_json: { example_user_queries: [] },
  };
  const med02 = {
    id: 'm', intent_code: 'MED-02', category: 'Medical & Personal Safety',
    keywords: ['unconscious', 'collapsed', 'not responding'],
    logic_json: { example_user_queries: [] },
  };
  const entries = [ele02, med02];

  it('matches ELE-02 for "blackout in our block" (via phrase, not singleton)', () => {
    const r = retrieveRelevantEntries(entries, 'Blackout in our block.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  it('matches ELE-02 for "power blackout"', () => {
    const r = retrieveRelevantEntries(entries, 'Power blackout in the common areas.');
    expect(r.entries[0].intent_code).toBe('ELE-02');
  });

  // Known, accepted architectural limitation: "building"/"community" are
  // GENERIC_TERMS, so "blackout in the building" collapses to the single
  // token "blackout" - exactly as insufficient alone as bare "Blackout"
  // is. This is intentional given the removal of the EN singleton; a
  // resident phrasing it this specific way gets primary: null rather
  // than a forced (and possibly wrong) ELE-02 match.
  it('does NOT force ELE-02 for "blackout in the building" (single meaningful token after generic filtering)', () => {
    const r = retrieveRelevantEntries(entries, 'There is a blackout in the building.');
    expect(r.entries).toEqual([]);
  });

  it('does NOT route a medical blackout/collapse to ELE-02', () => {
    expect(retrieveRelevantEntries(entries, 'Someone had a blackout and collapsed.').entries.map((e) => e.intent_code)).not.toContain('ELE-02');
  });

  it('does NOT match ELE-02 for "blacked out" (different word from the "blackout" noun anyway)', () => {
    expect(retrieveRelevantEntries(entries, 'I blacked out for a few seconds.').entries).toEqual([]);
  });

  it('does NOT force ELE-02 for a bare mention of "blackout" with no electrical context', () => {
    const r = retrieveRelevantEntries(entries, "I had a blackout and don't remember what happened.");
    expect(r.entries.map((e) => e.intent_code)).not.toContain('ELE-02');
  });

  it('prefers primary: null over forcing ELE-02 for the single word "Blackout" alone', () => {
    expect(retrieveRelevantEntries(entries, 'Blackout').entries).toEqual([]);
  });
});

describe('retrieveRelevantEntries — Session 26 (WAT-01 apartment-above vs WAT-07 roof/rain)', () => {
  // Root cause: WAT-01 only had "arriba" (ES) as an "above" anchor, not
  // "superior" - the exact terminology used in the localized answer text
  // since the prior ES language-polish session. A question phrased with
  // "apartamento superior" only scored via generic fuga/agua partial
  // credit, tying with WAT-07 (roof/rain) and other WAT-* scenarios that
  // share the same generic water vocabulary but nothing scenario-specific.
  const wat01 = {
    id: 'a', intent_code: 'WAT-01', category: 'Water & Plumbing',
    keywords: [
      'water leak upstairs', 'ceiling leak', 'neighbour flooding', 'water from above',
      'fuga de agua arriba', 'gotea el techo', 'vecino de arriba inunda', 'agua desde arriba',
      'fuga apartamento superior', 'agua apartamento superior', 'gotea apartamento superior',
      'apartment above leak', 'apartment above water', 'leak from apartment above',
      'wasser wohnung darüber', 'leck wohnung darüber',
      'fuite appartement du dessus', 'eau appartement du dessus',
    ],
    logic_json: { example_user_queries: ['Water is coming through my ceiling.', 'The neighbour above is leaking into my apartment.'] },
  };
  const wat07 = {
    id: 'b', intent_code: 'WAT-07', category: 'Water & Plumbing',
    keywords: [
      'rain leak', 'roof leak', 'terrace leak', 'water through window', 'storm ingress',
      'gotea la lluvia', 'fuga en el techo', 'fuga en la terraza', 'agua por la ventana',
      'rain ceiling', 'heavy rain ceiling', 'storm ceiling leak',
      'lluvia techo', 'entra agua lluvia techo',
      'regen decke', 'starker regen decke',
      'pluie plafond', 'forte pluie plafond',
    ],
    logic_json: { example_user_queries: ['Rain is coming through my ceiling.', 'Water is entering from the terrace door.'] },
  };
  const entries = [wat01, wat07];

  it('matches WAT-01 for "apartamento superior" phrasing (ES) - the reported bug', () => {
    const r = retrieveRelevantEntries(entries, 'Tengo una fuga de agua que parece venir del apartamento superior.');
    expect(r.entries[0].intent_code).toBe('WAT-01');
  });

  it('matches WAT-01 for "apartment above" phrasing (EN)', () => {
    expect(retrieveRelevantEntries(entries, 'Water is coming from the apartment above.').entries[0].intent_code).toBe('WAT-01');
  });

  it('matches WAT-01 for "Wohnung darüber" phrasing (DE)', () => {
    expect(retrieveRelevantEntries(entries, 'Es kommt Wasser aus der Wohnung darüber.').entries[0].intent_code).toBe('WAT-01');
  });

  it('matches WAT-01 for "appartement du dessus" phrasing (FR)', () => {
    expect(retrieveRelevantEntries(entries, "De l'eau vient de l'appartement du dessus.").entries[0].intent_code).toBe('WAT-01');
  });

  it('matches WAT-07 (not WAT-01) when rain/ceiling combination is explicit (EN)', () => {
    expect(retrieveRelevantEntries(entries, 'Water is coming through the ceiling during heavy rain.').entries[0].intent_code).toBe('WAT-07');
  });

  it('matches WAT-07 for rain+roof phrasing (ES)', () => {
    expect(retrieveRelevantEntries(entries, 'Entra agua por el techo cuando llueve.').entries[0].intent_code).toBe('WAT-07');
  });

  it('matches WAT-07 for rain+ceiling phrasing (DE)', () => {
    expect(retrieveRelevantEntries(entries, 'Bei starkem Regen kommt Wasser durch die Decke.').entries[0].intent_code).toBe('WAT-07');
  });

  it('matches WAT-07 for rain+ceiling phrasing (FR)', () => {
    expect(retrieveRelevantEntries(entries, "De l'eau entre par le plafond pendant une forte pluie.").entries[0].intent_code).toBe('WAT-07');
  });

  it('does not confidently force the roof scenario for the ambiguous bare phrase "Water is coming from above."', () => {
    const r = retrieveRelevantEntries(entries, 'Water is coming from above.');
    const primary = r.entries.length > 0 ? r.entries[0].intent_code : null;
    // WAT-01's own pre-existing "water from above" tag legitimately covers
    // this phrasing (in a residential building, "from above" most
    // naturally means the apartment above) - the requirement being
    // guarded against here is specifically WAT-07 (roof/rain) winning
    // without any roof/rain-specific evidence at all.
    expect(primary).not.toBe('WAT-07');
  });

  it('ties are broken deterministically by intent_code, not by unordered DB row order', () => {
    // Regression guard for the actual root cause: two entries scoring
    // identically (both reaching eligibility via the same shared generic
    // "fuga"/"agua" partial credit, exactly like the original WAT-01 vs
    // WAT-07 tie) must always resolve to the same winner regardless of
    // the order they're passed in - simulating a non-deterministic
    // Postgres row order for an unordered SELECT.
    const tiedA = { id: 'x', intent_code: 'WAT-04', category: 'Water & Plumbing', keywords: ['fuga tubería comunitaria', 'agua en el pasillo'], logic_json: { example_user_queries: [] } };
    const tiedB = { id: 'y', intent_code: 'WAT-02', category: 'Water & Plumbing', keywords: ['fuga en mi apartamento', 'fuga de agua interna'], logic_json: { example_user_queries: [] } };
    const q = 'Tengo una fuga de agua en mi apartamento.';
    const orderA = retrieveRelevantEntries([tiedA, tiedB], q).entries.map((e) => e.intent_code);
    const orderB = retrieveRelevantEntries([tiedB, tiedA], q).entries.map((e) => e.intent_code);
    expect(orderA.length).toBeGreaterThan(0);
    expect(orderA).toEqual(orderB);
  });
});
