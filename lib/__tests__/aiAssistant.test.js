import { describe, it, expect } from 'vitest';
import {
  detectEmergency,
  detectSafetyContext,
  hasDangerousCombo,
  analyzeWaterElectricalRelationships,
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
    {
      id: '1', intent_code: 'WAT-01', category: 'Water',
      // Mirrors the actual current production WAT-01 keyword set (EN
      // intent_tags + ES/FR/DE anchors added across the multilingual
      // keyword and WAT-01/WAT-07 disambiguation work), not a divergent
      // miniature invented for this test alone.
      keywords: [
        'water leak upstairs', 'ceiling leak', 'neighbour flooding', 'water from above',
        'fuga de agua arriba', 'gotea el techo', 'vecino de arriba inunda', 'agua desde arriba',
        "fuite d'eau au-dessus", 'plafond qui coule', 'voisin du dessus inonde', "eau venant d'en haut",
        'wasser von oben', 'decke tropft', 'nachbar oben überflutet', 'wasser sickert durch',
        'fuga apartamento superior', 'agua apartamento superior', 'gotea apartamento superior',
        'apartment above leak', 'apartment above water', 'leak from apartment above',
        'wasser wohnung darüber', 'leck wohnung darüber',
        'fuite appartement du dessus', 'eau appartement du dessus',
      ],
      logic_json: { example_user_queries: ['Water is coming through my ceiling.'] },
    },
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

  it('follow-up: keeps the previous primary even when the new question matches nothing (genuine short follow-up)', () => {
    // A short follow-up ("Is it safe now?", 4 words) is exactly the
    // case selectAttachedEntries is meant to treat as a continuation of
    // the prior topic - see isShortQuestion/isContinuation in
    // lib/aiAssistant.js.
    const { primary, attached } = selectAttachedEntries(entries, [], true, 'WAT-01', ['ELE-05'], 'Is it safe now?');
    expect(primary.intent_code).toBe('WAT-01');
    expect(attached.map((e) => e.intent_code)).toContain('ELE-05');
  });

  it('a genuinely new, unrelated match becomes the new primary and does NOT carry forward the old topic\'s context (context-bleeding fix)', () => {
    // This is the exact shape of the real production bug fixed this
    // morning: a substantive, unrelated new question (here standing in
    // for e.g. "What happened with the tourist licence applications at
    // the last AGM?") must NOT drag the prior turn's emergency context
    // (WAT-01/ELE-05) along with it just because a primary was found.
    // fallbackUsed=false here (a genuine new match, PRK-01) and PRK-01
    // is a different scenario than the prior primary (WAT-01), so
    // isContinuation is false and neither WAT-01 nor ELE-05 should be
    // attached - only the new match itself (plus its own declared
    // related_intents, none here).
    const { primary, attached } = selectAttachedEntries(
      entries,
      [PRK01],
      false,
      'WAT-01',
      ['ELE-05'],
      'What are the rules about parking a second car in the visitor spaces?',
    );
    expect(primary.intent_code).toBe('PRK-01');
    expect(attached.map((e) => e.intent_code)).toEqual(['PRK-01']);
    expect(attached.map((e) => e.intent_code)).not.toContain('WAT-01');
    expect(attached.map((e) => e.intent_code)).not.toContain('ELE-05');
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
    keywords: ['no electricity', 'power outage', 'no power', 'lights are out', 'lights out', 'power blackout'],
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

  // "blackout" has no negation pattern in the sentence at all, and is no
  // longer a HIGH_CONFIDENCE_SINGLETON for ELE-02 (removed: it can also
  // mean loss of consciousness/memory, which would otherwise route a
  // possible medical event into an electrical-outage workflow). The bare
  // word alone must not deterministically force ELE-02.
  it('does NOT force ELE-02 from the bare ambiguous word "blackout" alone', () => {
    const r = retrieveRelevantEntries(entries, 'Blackout in our block.');
    expect(r.entries.map((e) => e.intent_code)).not.toContain('ELE-02');
  });

  // The electrical meaning of "blackout" is still reachable through
  // ordinary phrase matching when there is genuine electricity context
  // ("power blackout"), not via a bare-word singleton exception.
  it('matches ELE-02 for "power blackout" with explicit electricity context', () => {
    const r = retrieveRelevantEntries(entries, 'The whole building has a power blackout.');
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

describe('Phase 3A — safety-critical retrieval matrix (SEC/WEA/FIR/BLD/ELE/MED)', () => {
  // Root cause (confirmed by live production preflight): GENERIC_TERMS
  // strips "apartment"/"building"/"neighbour"/etc before phrase
  // eligibility, so phrases like "apartment fire" or "building shaking"
  // collapse to a single meaningful token and never reach
  // MIN_PHRASE_TOKENS=2. This suite exercises the fix: HIGH_CONFIDENCE_
  // SINGLETONS for genuinely unambiguous words (intruder, earthquake,
  // "brennt", drowning verb forms) and PROTECTED_SAFETY_PHRASES for
  // curated two-word combinations that legitimately need a generic word
  // paired with a diagnostic one.
  const entries = [
    { id: '1', intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress', 'robo en curso', 'intruso', 'allanamiento en progreso', 'cambriolage en cours', 'intrus', 'effraction en cours', 'einbruch im gange', 'eindringling', 'einbruch läuft gerade'], logic_json: { example_user_queries: [] } },
    { id: '2', intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening', 'persona agresiva', 'amenaza', 'violencia', 'vecino amenazante', 'personne agressive', 'menace', 'violence', 'voisin menaçant', 'drohung', 'gewalt', 'bedrohlicher nachbar'], logic_json: { example_user_queries: [] } },
    { id: '3', intent_code: 'WEA-04', category: 'Weather', keywords: ['earthquake', 'building shaking', 'tremor', 'terremoto', 'temblor', 'el edificio tiembla', 'tremblement de terre', 'séisme', 'le bâtiment tremble', 'erdbeben', 'beben', 'das gebäude wackelt'], logic_json: { example_user_queries: [] } },
    { id: '4', intent_code: 'FIR-01', category: 'Fire', keywords: ['apartment fire', 'kitchen fire', 'fire in flat', 'incendio en mi apartamento', 'fuego en la cocina', 'incendio en mi piso', 'incendie dans mon appartement', 'feu dans la cuisine', 'incendie chez moi', 'feuer in meiner wohnung', 'küchenbrand', 'brand in meiner wohnung'], logic_json: { example_user_queries: [] } },
    { id: '5', intent_code: 'FIR-02', category: 'Fire', keywords: ['smoke neighbour', 'fire next door', 'smoke from apartment'], logic_json: { example_user_queries: [] } },
    { id: '6', intent_code: 'FIR-04', category: 'Fire', keywords: ['EV fire', 'battery smoke', 'charger overheating', 'e-bike battery'], logic_json: { example_user_queries: ['An electric car charger is smoking.', 'An e-bike battery is overheating.', 'There is smoke from an EV in the garage.'] } },
    { id: '7', intent_code: 'BLD-01', category: 'Building', keywords: ['stuck in lift', 'trapped elevator', 'elevator trapped'], logic_json: { example_user_queries: [] } },
    { id: '8', intent_code: 'MED-04', category: 'Medical', keywords: ['drowning', 'pool emergency', 'underwater', 'near drowning'], logic_json: { example_user_queries: [] } },
    { id: '9', intent_code: 'NUI-04', category: 'Nuisance', keywords: ['smell neighbour', 'cigarette smoke', 'odour nuisance', 'smoke smell'], logic_json: { example_user_queries: [] } },
    { id: '10', intent_code: 'FIR-03', category: 'Fire', keywords: ['garage fire', 'car fire', 'parking fire'], logic_json: { example_user_queries: ['A car is burning in the garage.', 'There is smoke in the underground parking.', 'I think there is a fire in the garage.'] } },
    { id: '11', intent_code: 'ELE-02', category: 'Electricity', keywords: ['no electricity', 'power outage', 'no power', 'lights are out', 'lights out', 'power blackout'], logic_json: { example_user_queries: [] } },
  ];

  function primaryFor(question) {
    const r = retrieveRelevantEntries(entries, question);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  // --- Verified live failures (previously E, now must be A) ---
  it('SEC-01: "There is an intruder in the building." (canonical KB example query)', () => {
    expect(primaryFor('There is an intruder in the building.')).toBe('SEC-01');
  });

  it('SEC-04: "A neighbour is threatening me." (canonical KB example query)', () => {
    expect(primaryFor('A neighbour is threatening me.')).toBe('SEC-04');
  });

  it('SEC-04: "There is a fight in the common area." (canonical KB example query)', () => {
    expect(primaryFor('There is a fight in the common area.')).toBe('SEC-04');
  });

  it('WEA-04: "We just had an earthquake." (canonical KB example query)', () => {
    expect(primaryFor('We just had an earthquake.')).toBe('WEA-04');
  });

  it('WEA-04: "The building is shaking." (canonical KB example query)', () => {
    expect(primaryFor('The building is shaking.')).toBe('WEA-04');
  });

  it('FIR-01: "There is a fire in my apartment." (canonical KB example query - must be a real match, not just emergency-detector fallback)', () => {
    expect(primaryFor('There is a fire in my apartment.')).toBe('FIR-01');
  });

  it('FIR-01 DE: "In meiner Wohnung brennt es." (natural verb form, not a keyword-phrase match)', () => {
    expect(primaryFor('In meiner Wohnung brennt es.')).toBe('FIR-01');
  });

  it('MED-04 ES: "Alguien se está ahogando en la piscina." (natural verb form)', () => {
    expect(primaryFor('Alguien se está ahogando en la piscina.')).toBe('MED-04');
  });

  // --- Confirmed dangerous false positive (previously D) ---
  it('SEC-01 FR: "Un cambrioleur est en train d\'entrer chez moi." must NOT misroute to FIR-01 (was: false-positive from "chez"/"moi" as weak evidence)', () => {
    expect(primaryFor("Un cambrioleur est en train d'entrer chez moi.")).toBe('SEC-01');
  });

  it('DE: "Ein Eindringling ist im Gebäude." resolves correctly despite "ein"/"ist" grammar-word overlap risk', () => {
    expect(primaryFor('Ein Eindringling ist im Gebäude.')).toBe('SEC-01');
  });

  // --- Multilingual paraphrase coverage ---
  it('WEA-04 ES: terremoto paraphrase', () => {
    expect(primaryFor('Acabamos de sentir un terremoto.')).toBe('WEA-04');
  });

  it('WEA-04 FR: séisme paraphrase', () => {
    expect(primaryFor('Nous venons de ressentir un séisme.')).toBe('WEA-04');
  });

  it('WEA-04 DE: Erdbeben paraphrase', () => {
    expect(primaryFor('Wir hatten gerade ein Erdbeben.')).toBe('WEA-04');
  });

  it('FIR-01 ES: incendio paraphrase', () => {
    expect(primaryFor('Hay un incendio en mi apartamento.')).toBe('FIR-01');
  });

  it('FIR-01 FR: incendie paraphrase', () => {
    expect(primaryFor("Il y a un incendie dans mon appartement.")).toBe('FIR-01');
  });

  it('MED-04 FR: "se noie" paraphrase', () => {
    expect(primaryFor('Quelqu\'un se noie dans la piscine.')).toBe('MED-04');
  });

  it('MED-04 DE: "ertrinkt" paraphrase', () => {
    expect(primaryFor('Jemand ertrinkt im Pool.')).toBe('MED-04');
  });

  // --- Specificity preserved (must not create new collisions) ---
  it('PRESERVES: "smoke...next door" still matches FIR-02, not the generic NUI-04 odour scenario', () => {
    expect(primaryFor('I smell strong smoke from the flat next door.')).toBe('FIR-02');
  });

  it('PRESERVES: EV-specific smoke matches FIR-04, not the generic FIR-03 garage-fire scenario', () => {
    expect(primaryFor('There is smoke from an EV in the garage.')).toBe('FIR-04');
  });

  it('PRESERVES: ELE-02 outage phrase matching from earlier sessions still works', () => {
    expect(primaryFor('The whole building has a power blackout.')).toBe('ELE-02');
  });

  it('PRESERVES: bare "Blackout" still returns null (medical-ambiguity protection from earlier session)', () => {
    expect(primaryFor('Blackout')).toBeNull();
  });

  // --- Adversarial: generic words must not alone trigger a safety scenario ---
  it('ADVERSARIAL: a neutral question mentioning "building"/"neighbour" alone does not trigger SEC-01/SEC-04/FIR-01', () => {
    const r = retrieveRelevantEntries(entries, 'Can you ask my neighbour in the building about the parking rules?');
    expect(r.entries.map((e) => e.intent_code)).not.toContain('SEC-01');
    expect(r.entries.map((e) => e.intent_code)).not.toContain('SEC-04');
    expect(r.entries.map((e) => e.intent_code)).not.toContain('FIR-01');
  });

  it('ADVERSARIAL: a neutral pool-rules question does not trigger MED-04', () => {
    expect(primaryFor('¿Dónde puedo encontrar las normas sobre el uso de las piscinas?')).toBeNull();
  });
});

describe('Phase 3A Pass 2 — context layer (detectSafetyContext / detectEmergency)', () => {
  // Architectural principle: RETRIEVAL answers "what kind of incident is
  // this" and is unaffected by historical/drill/nuisance wording.
  // EMERGENCY DETECTION answers "is this active right now" and MUST be
  // context-sensitive. A strong, independent description of an actually
  // ongoing hazard always overrides suppression, regardless of
  // historical/drill/nuisance markers elsewhere in the same sentence.

  it('does not treat a resolved historical break-in as an active emergency (EN)', () => {
    expect(detectEmergency('There was a break-in last week. Nobody is there now.')).toBe(false);
  });

  it('does not treat a resolved historical fight as an active emergency (EN)', () => {
    expect(detectEmergency('The neighbours had a fight yesterday.')).toBe(false);
  });

  it('does not treat an earthquake drill as a real emergency (EN/ES/FR/DE)', () => {
    expect(detectEmergency('We are doing an earthquake drill.')).toBe(false);
    expect(detectEmergency('Estamos haciendo un simulacro de terremoto.')).toBe(false);
    expect(detectEmergency("C'est un exercice de tremblement de terre.")).toBe(false);
    expect(detectEmergency('Wir machen eine Erdbebenübung.')).toBe(false);
  });

  it('does not treat a fire-alarm test as a real emergency (EN/ES/FR/DE)', () => {
    expect(detectEmergency('The fire alarm is being tested.')).toBe(false);
    expect(detectEmergency('Es una prueba de la alarma de incendios.')).toBe(false);
    expect(detectEmergency("C'est un test de l'alarme incendie.")).toBe(false);
    expect(detectEmergency('Der Feueralarm wird getestet.')).toBe(false);
  });

  it('does not treat cigarette smoke as a fire emergency (EN/FR)', () => {
    expect(detectEmergency('I smell cigarette smoke from my neighbour.')).toBe(false);
    expect(detectEmergency('Je sens la fumée de cigarette de mon voisin.')).toBe(false);
  });

  it('MIXED CONTEXT: a real active break-in overrides historical framing in the same sentence', () => {
    expect(detectEmergency('There was a break-in last week but someone is breaking in again now.')).toBe(true);
  });

  it('MIXED CONTEXT: an actually-shaking building overrides drill framing in the same sentence', () => {
    expect(detectEmergency('We are doing an earthquake drill but the building is actually shaking.')).toBe(true);
  });

  it('MIXED CONTEXT: thick smoke overrides cigarette-nuisance framing in the same sentence', () => {
    expect(detectEmergency('I usually smell cigarette smoke, but now thick smoke is coming from the apartment.')).toBe(true);
  });

  it('MIXED CONTEXT: an active current threat overrides historical fight framing in the same sentence', () => {
    expect(detectEmergency('They had a fight yesterday and he is threatening me now.')).toBe(true);
  });

  it('retrieval itself is unaffected by historical/drill/nuisance context - only emergencyDetected changes', () => {
    // A resolved historical burglary can still legitimately resolve to a
    // security scenario informationally; what must change is only
    // whether it's flagged as an active emergency.
    expect(detectSafetyContext('There was a break-in last week. Nobody is there now.').historical_or_resolved).toBe(true);
    expect(detectSafetyContext('We are doing an earthquake drill.').drill_or_test).toBe(true);
    expect(detectSafetyContext('I smell cigarette smoke from my neighbour.').nuisance_smoke).toBe(true);
  });
});

describe('Phase 3A Pass 2 — SEC-01/SEC-04 collision fix and ELE-05/NUI-04 specificity', () => {
  const entries = [
    { id: '1', intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress'], logic_json: { example_user_queries: ['Someone is breaking into my apartment right now.'] } },
    { id: '2', intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { id: '3', intent_code: 'FIR-02', category: 'Fire', keywords: ['smoke neighbour', 'fire next door'], logic_json: { example_user_queries: [] } },
    { id: '4', intent_code: 'NUI-04', category: 'Nuisance', keywords: ['smell neighbour', 'cigarette smoke', 'odour nuisance', 'smoke smell'], logic_json: { example_user_queries: [] } },
    { id: '5', intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
    { id: '6', intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];

  function primaryFor(question) {
    const r = retrieveRelevantEntries(entries, question);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  it('FIXED: "Someone is threatening me right now." no longer misroutes to SEC-01 via shared "right"/"now" tokens', () => {
    expect(primaryFor('Someone is threatening me right now.')).toBe('SEC-04');
  });

  it('FIXED: cigarette-qualified smoke prefers NUI-04, not FIR-02', () => {
    expect(primaryFor('I smell cigarette smoke from my neighbour.')).toBe('NUI-04');
  });

  it('PRESERVES: genuine fire smoke (no cigarette qualifier) still matches FIR-02', () => {
    expect(primaryFor('There is thick smoke coming from next door.')).toBe('FIR-02');
  });

  it('FIXED: water reaching a light fitting prefers ELE-05 over plain WAT-01', () => {
    expect(primaryFor('Water is dripping through my ceiling light.')).toBe('ELE-05');
    expect(primaryFor('Wasser tropft durch meine Deckenlampe.')).toBe('ELE-05');
  });
});

describe('Phase 3A safety-routing patch — MED-02 / SAF-03 vs SEC-04 / WAT-01 vs ELE-05 / SEC-01', () => {
  // Uses production-shaped entries (keywords/logic_json field names as
  // they actually appear in the live ai_knowledge_base export).
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'MED-04', category: 'Medical', keywords: ['drowning', 'pool emergency', 'underwater'], logic_json: { example_user_queries: ['Someone has been pulled from the pool and is not responding.'] } },
    { intent_code: 'SAF-03', category: 'General Safety', keywords: ['aggressive dog', 'loose dog', 'dangerous animal', 'perro agresivo', 'aggressiver hund', 'chien agressif'], logic_json: { example_user_queries: ['A dog is threatening people in the garden.'] } },
    { intent_code: 'SAF-07', category: 'General Safety', keywords: ['maintenance not answering', 'security not answering'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress'], logic_json: { example_user_queries: ['Someone is breaking into my apartment now.'] } },
    { intent_code: 'SEC-06', category: 'Security', keywords: ['vandalism', 'graffiti', 'damaged common property'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: ['Water is coming through my ceiling.', 'My ceiling is wet and dripping.'] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: ['Water is dripping through my ceiling light.'] } },
  ];

  function primaryFor(question) {
    const r = retrieveRelevantEntries(entries, question);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. MED-02 unresponsive person', () => {
    it('FIXED: "They are not responding." resolves to MED-02 with emergencyDetected=true', () => {
      expect(primaryFor('They are not responding.')).toBe('MED-02');
      expect(detectEmergency('They are not responding.')).toBe(true);
    });

    it('negative control: a lift not responding is not a medical emergency', () => {
      expect(primaryFor('The lift is not responding.')).not.toBe('MED-02');
      expect(detectEmergency('The lift is not responding.')).toBe(false);
    });

    it('negative control: an app not responding is not a medical emergency', () => {
      expect(primaryFor('The app is not responding.')).not.toBe('MED-02');
      expect(detectEmergency('The app is not responding.')).toBe(false);
    });

    it('negative control: a gate remote not responding is not a medical emergency', () => {
      expect(primaryFor('The gate remote is not responding.')).not.toBe('MED-02');
      expect(detectEmergency('The gate remote is not responding.')).toBe(false);
    });

    it('negative control: an unreachable contact/service is not a medical emergency (SAF-07 stays SAF-07)', () => {
      expect(primaryFor('The after-hours contact is not responding.')).not.toBe('MED-02');
    });

    it('PRESERVES: a drowning victim pulled from the pool and not responding still resolves to MED-04, not MED-02', () => {
      expect(primaryFor('Someone has been pulled from the pool and is not responding.')).toBe('MED-04');
    });
  });

  describe('2. SAF-03 (animal threat) versus SEC-04 (human threat)', () => {
    it('FIXED: "A dog is threatening people in the garden." resolves to SAF-03, not the human-violence SEC-04 procedure', () => {
      expect(primaryFor('A dog is threatening people in the garden.')).toBe('SAF-03');
    });

    it('PRESERVES: a human threat still correctly resolves to SEC-04', () => {
      expect(primaryFor('A man is threatening people in the garden.')).toBe('SEC-04');
      expect(primaryFor('Someone is threatening a resident.')).toBe('SEC-04');
    });

    it('multilingual animal-vs-human (ES/DE/FR), using each scenario\'s own existing keyword vocabulary', () => {
      expect(primaryFor('Hay un perro agresivo amenazando a la gente en el jardín.')).toBe('SAF-03');
      expect(primaryFor('Ein aggressiver Hund bedroht Menschen im Garten.')).toBe('SAF-03');
      expect(primaryFor('Un chien agressif menace des gens dans le jardin.')).toBe('SAF-03');
      expect(primaryFor('Un hombre está amenazando a la gente.')).toBe('SEC-04');
      expect(primaryFor('Ein Mann bedroht Menschen.')).toBe('SEC-04');
      expect(primaryFor('Un homme menace des gens.')).toBe('SEC-04');
    });
  });

  describe('3. WAT-01 versus ELE-05', () => {
    it('FIXED: plain ceiling water (no electrical mention) resolves to WAT-01, not ELE-05', () => {
      expect(primaryFor('Water is coming through my ceiling.')).toBe('WAT-01');
      expect(primaryFor('My ceiling is wet and dripping.')).toBe('WAT-01');
    });

    it('PRESERVES: water reaching an explicit electrical fitting still resolves to ELE-05 with emergencyDetected=true', () => {
      expect(primaryFor('Water is dripping through my ceiling light.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping through my ceiling light.')).toBe(true);
    });
  });

  describe('4. SEC-01 live break-in detection', () => {
    it('FIXED: "breaking into" (not just "breaking in") triggers emergencyDetected', () => {
      expect(primaryFor('Someone is breaking into my apartment now.')).toBe('SEC-01');
      expect(detectEmergency('Someone is breaking into my apartment now.')).toBe(true);
    });

    it('FIXED: "trying to break into" triggers emergencyDetected', () => {
      expect(detectEmergency('Someone is trying to break into my apartment.')).toBe(true);
    });

    it('historical wording does not trigger an active emergency', () => {
      expect(detectEmergency('Someone broke into my apartment last week.')).toBe(false);
    });
  });
});

describe('Phase 3A hardening pass — subject-aware MED-02 / active-vs-historical SEC-01 / actor-aware SAF-03', () => {
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-07', category: 'General Safety', keywords: ['maintenance not answering', 'security not answering', 'contact not answering'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-03', category: 'General Safety', keywords: ['aggressive dog', 'loose dog', 'dangerous animal', 'perro agresivo', 'aggressiver hund', 'chien agressif'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-06', category: 'Security', keywords: ['vandalism', 'graffiti', 'damaged common property', 'someone broke into my storage room'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. MED-02 subject-aware precedence (not a blunt keyword blacklist)', () => {
    it('service/role nouns without a human subject do not trigger MED-02', () => {
      expect(detectEmergency('The administrator is not responding.')).toBe(false);
      expect(detectEmergency('Maintenance is not responding.')).toBe(false);
      expect(detectEmergency('The after-hours contact is not responding.')).toBe(false);
    });

    it('an explicit human subject wins even next to a location/service word', () => {
      expect(primaryFor('A man at the gate is not responding.')).toBe('MED-02');
      expect(detectEmergency('A man at the gate is not responding.')).toBe(true);
      expect(primaryFor('A person beside the pool is not responding.')).toBe('MED-02');
      expect(detectEmergency('A person beside the pool is not responding.')).toBe(true);
    });

    it('contraction forms (aren\'t responding) are recognized', () => {
      expect(primaryFor("They aren't responding.")).toBe('MED-02');
      expect(detectEmergency("They aren't responding.")).toBe(true);
    });
  });

  describe('2. SEC-01 active-vs-historical/hypothetical grammar', () => {
    it('active/imminent grammar triggers emergencyDetected', () => {
      expect(detectEmergency('Someone is breaking into my apartment now.')).toBe(true);
      expect(detectEmergency('Someone is trying to break into my apartment.')).toBe(true);
      expect(detectEmergency('There is an intruder inside.')).toBe(true);
    });

    it('hypothetical/worry phrasing does NOT trigger emergencyDetected', () => {
      expect(detectEmergency('How can someone break into an apartment?')).toBe(false);
      expect(detectEmergency('I am worried someone might break into my apartment.')).toBe(false);
    });

    it('bare past-tense "broke into" (no active/imminent marker) does NOT trigger emergencyDetected', () => {
      expect(detectEmergency('Someone broke into my apartment.')).toBe(false);
      expect(detectEmergency('Someone broke into my apartment last week.')).toBe(false);
    });
  });

  describe('3. SAF-03 vs SEC-04 — actor identification, not victim-noun presence', () => {
    it('an animal actor suppresses SEC-04 even when a human victim noun is also present', () => {
      expect(primaryFor('A dog is threatening a resident.')).toBe('SAF-03');
      expect(primaryFor('A dog is attacking a woman.')).toBe('SAF-03');
    });

    it('multilingual animal-actor-with-human-victim (ES/FR/DE)', () => {
      expect(primaryFor('Un perro amenaza a un vecino.')).toBe('SAF-03');
      expect(primaryFor('Un chien menace un résident.')).toBe('SAF-03');
      expect(primaryFor('Ein Hund bedroht einen Bewohner.')).toBe('SAF-03');
    });

    it('a human actor still correctly triggers SEC-04', () => {
      expect(primaryFor('A man is threatening a resident.')).toBe('SEC-04');
    });
  });

  describe('4. ELE-05 explicit water AND electrical requirement', () => {
    it('German compound electrical nouns (Deckenlampe) are recognized', () => {
      expect(primaryFor('Wasser tropft durch meine Deckenlampe.')).toBe('ELE-05');
    });

    it('plain ceiling water without electrical evidence still resolves to WAT-01', () => {
      expect(primaryFor('Water is coming through my ceiling.')).toBe('WAT-01');
    });
  });
});


describe('Phase 3A round-2 hardening — clause-scoped subject/actor classification, SEC-01 informational context, ELE-05 accent normalization', () => {
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-07', category: 'General Safety', keywords: ['maintenance not answering', 'security not answering', 'contact not answering'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-03', category: 'General Safety', keywords: ['aggressive dog', 'loose dog', 'dangerous animal', 'perro agresivo', 'aggressiver hund', 'chien agressif'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }
  function allPrimaries(q) {
    return retrieveRelevantEntries(entries, q).entries.map((e) => e.intent_code);
  }

  describe('1. MED-02 clause-scoped subject (not "human word anywhere in sentence")', () => {
    it('a service-role subject stays false even when a human noun appears later as the OBJECT', () => {
      expect(primaryFor('The administrator is not responding to a resident.')).not.toBe('MED-02');
      expect(detectEmergency('The administrator is not responding to a resident.')).toBe(false);
    });

    it('a reporting verb ("says") starts a new subject scope, excluding the reporter as subject', () => {
      expect(primaryFor('A resident says the administrator is not responding.')).not.toBe('MED-02');
      expect(detectEmergency('A resident says the administrator is not responding.')).toBe(false);
    });

    it('an explicit human subject still wins next to a location word', () => {
      expect(primaryFor('A man at the gate is not responding.')).toBe('MED-02');
      expect(detectEmergency('A man at the gate is not responding.')).toBe(true);
    });

    it('German present-tense singular AND plural "not responding" forms are both recognized', () => {
      expect(detectEmergency('Sie reagieren nicht.')).toBe(true);
      expect(detectEmergency('Die Bewohner reagieren nicht.')).toBe(true);
      expect(detectEmergency('Der Verwalter reagiert nicht.')).toBe(false);
    });
  });

  describe('2. SAF-03 vs SEC-04 clause-aware actor classification', () => {
    it('an animal in an unrelated earlier clause does not credit SAF-03 or suppress SEC-04', () => {
      expect(primaryFor('A dog is nearby while a man is threatening a resident.')).toBe('SEC-04');
    });

    it('a mixed animal+human actor in the SAME clause: SEC-04 primary, SAF-03 still retrieved as related', () => {
      const all = allPrimaries('A dog and a man are threatening a resident.');
      expect(all[0]).toBe('SEC-04');
      expect(all).toContain('SAF-03');
    });

    it('human actor with an unrelated animal in a later clause stays SEC-04', () => {
      expect(primaryFor('A man is threatening a resident while his dog is nearby.')).toBe('SEC-04');
    });

    it('multilingual animal-actor-with-human-victim (ES/FR/DE) still resolves to SAF-03', () => {
      expect(primaryFor('Un perro amenaza a un vecino.')).toBe('SAF-03');
      expect(primaryFor('Un chien menace un résident.')).toBe('SAF-03');
      expect(primaryFor('Ein Hund bedroht einen Bewohner.')).toBe('SAF-03');
    });
  });

  describe('3. SEC-01 active-vs-informational context', () => {
    it('direct/current presence triggers emergencyDetected', () => {
      expect(detectEmergency('There is a burglar inside.')).toBe(true);
      expect(detectEmergency('Someone is breaking into my apartment.')).toBe(true);
      expect(detectEmergency('Burglar!')).toBe(true);
    });

    it('informational/educational/hypothetical mention does not trigger emergencyDetected', () => {
      expect(detectEmergency('I read an article about a burglar.')).toBe(false);
      expect(detectEmergency('What does burglar mean?')).toBe(false);
      expect(detectEmergency('I am worried that a burglar might come.')).toBe(false);
    });
  });

  describe('4. ELE-05 real accent-insensitive matching', () => {
    it('accented and unaccented Spanish "lámpara"/"lampara" both resolve to ELE-05', () => {
      expect(primaryFor('Agua gotea por la lámpara.')).toBe('ELE-05');
      expect(detectEmergency('Agua gotea por la lámpara.')).toBe(true);
      expect(primaryFor('Agua gotea por la lampara.')).toBe('ELE-05');
      expect(detectEmergency('Agua gotea por la lampara.')).toBe(true);
    });

    it('plain ceiling water without electrical evidence still resolves to WAT-01', () => {
      expect(primaryFor('Water is coming through my ceiling.')).toBe('WAT-01');
      expect(detectEmergency('Water is coming through my ceiling.')).toBe(false);
    });

    it('German compound electrical nouns are still recognized after normalization', () => {
      expect(primaryFor('Wasser tropft durch meine Deckenlampe.')).toBe('ELE-05');
    });
  });
});

describe('Phase 3A round-3 architecture hardening — scoped informational suppression, MED-02 head-noun, multi-clause threat classification, ELE-05 vocabulary sync', () => {
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'FIR-02', category: 'Fire', keywords: ['smoke neighbour', 'fire next door'], logic_json: { example_user_queries: [] } },
    { intent_code: 'FIR-05', category: 'Fire', keywords: ['gas leak', 'smell gas'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-03', category: 'General Safety', keywords: ['aggressive dog', 'loose dog', 'dangerous animal', 'perro agresivo', 'aggressiver hund', 'chien agressif'], logic_json: { example_user_queries: ['A dog is threatening people in the garden.'] } },
    { intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SEC-01', category: 'Security', keywords: ['break in now', 'intruder', 'burglary in progress'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }
  function allPrimaries(q) {
    return retrieveRelevantEntries(entries, q).entries.map((e) => e.intent_code);
  }

  describe('1. Informational suppression scoped to intruder/burglar only', () => {
    it('a genuinely unrelated hazard (smoke) mentioned alongside an informational burglar reference still triggers emergency', () => {
      expect(detectEmergency('I read an article about burglars, but there is smoke in my apartment.')).toBe(true);
    });

    it('informational intruder mention alone stays suppressed', () => {
      expect(detectEmergency('I am worried that a burglar might come.')).toBe(false);
    });

    it('a gas hazard is NOT suppressed just because "worried that" also matches the intruder-family informational pattern', () => {
      expect(detectEmergency('I am worried that I smell gas in the hallway.')).toBe(true);
    });

    it('a violence hazard is NOT suppressed just because "worried that" also matches the intruder-family informational pattern', () => {
      expect(detectEmergency('I am worried that my neighbour is threatening me.')).toBe(true);
    });
  });

  describe('2. MED-02 head-noun identification (not "any human word in the clause")', () => {
    it('a possessive human owner of a device subject does not trigger MED-02', () => {
      expect(primaryFor("My neighbour's app is not responding.")).not.toBe('MED-02');
      expect(primaryFor("A resident's phone is not responding.")).not.toBe('MED-02');
    });

    it('a human "inside" a device subject (prepositional modifier) does not trigger MED-02', () => {
      expect(primaryFor('The lift with a resident inside is not responding.')).not.toBe('MED-02');
    });

    it('a human in a "responsible for"/"for" modifier phrase does not trigger MED-02', () => {
      expect(primaryFor('The administrator responsible for a resident is not responding.')).not.toBe('MED-02');
    });

    it('a genuine human subject with only a trailing location phrase still triggers MED-02', () => {
      expect(primaryFor('A resident at the gate is not responding.')).toBe('MED-02');
      expect(detectEmergency('A resident at the gate is not responding.')).toBe(true);
    });
  });

  describe('3. Multi-clause threat actor classification (iterates every threat verb occurrence)', () => {
    it('two separate clauses, one animal-only and one human-only, combine to SEC-04 primary with SAF-03 related', () => {
      const all = allPrimaries('A dog is threatening a resident, but a man is threatening another resident.');
      expect(all[0]).toBe('SEC-04');
      expect(all).toContain('SAF-03');
    });

    it('order does not matter: human-first then animal-second clause still combines correctly', () => {
      const all = allPrimaries('A man is threatening a resident, but a dog is attacking another resident.');
      expect(all[0]).toBe('SEC-04');
      expect(all).toContain('SAF-03');
    });

    it('an unrelated animal in a non-threat clause gives SAF-03 zero credit (not just denied primary)', () => {
      const all = allPrimaries('A dog is nearby while a man is threatening a resident.');
      expect(all).toEqual(['SEC-04']);
    });

    it('a possessive/ownership modifier ("belonging to") excludes the owner as a human aggressor', () => {
      expect(primaryFor('A dog belonging to a man is threatening a resident.')).toBe('SAF-03');
    });

    it('PRESERVES: an ordinary SAF-03 report with no threat verb at all is unaffected by the new gating', () => {
      expect(primaryFor('There is an aggressive dog loose near the pool.')).toBe('SAF-03');
    });
  });

  describe('4. ELE-05 electrical vocabulary synchronized with PROTECTED_SAFETY_PHRASES', () => {
    it('French "luminaire" (used in the protected phrase) now also satisfies the AND-gate', () => {
      expect(primaryFor('Eau coule du luminaire.')).toBe('ELE-05');
      expect(detectEmergency('Eau coule du luminaire.')).toBe(true);
    });

    it('French "lampe" still resolves to ELE-05', () => {
      expect(primaryFor("De l'eau coule de la lampe.")).toBe('ELE-05');
    });

    it('German "Deckenleuchte" compound (different from "Deckenlampe") is recognized', () => {
      expect(primaryFor('Wasser tropft aus der Deckenleuchte.')).toBe('ELE-05');
    });
  });
});

describe('Phase 3A round-4 architecture hardening — clause-scoped independent hazard families, deterministic MED-02 subject-head, centralized threat vocabulary', () => {
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-07', category: 'General Safety', keywords: ['maintenance not answering', 'security not answering', 'contact not answering'], logic_json: { example_user_queries: [] } },
    { intent_code: 'SAF-03', category: 'General Safety', keywords: ['aggressive dog', 'loose dog', 'dangerous animal', 'perro agresivo', 'aggressiver hund', 'chien agressif'], logic_json: { example_user_queries: ['A dog is threatening people in the garden.'] } },
    { intent_code: 'SEC-04', category: 'Security', keywords: ['aggressive person', 'threat', 'violence', 'neighbour threatening'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-01', category: 'Electricity', keywords: ['no power apartment'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. Independent hazard families with clause-scoped suppression', () => {
    it('a genuinely unrelated hazard in a different clause is not suppressed by another clause\'s historical/drill/nuisance context', () => {
      expect(detectEmergency('There was a fight yesterday, but I smell gas in the hallway.')).toBe(true);
      expect(detectEmergency('We were doing a fire drill, but I smell gas in the hallway.')).toBe(true);
      expect(detectEmergency('I smell cigarette smoke, but the building is shaking.')).toBe(true);
    });

    it('suppression still applies correctly when the marker is in the SAME clause as the hazard', () => {
      expect(detectEmergency('There was a gas leak yesterday.')).toBe(false);
      expect(detectEmergency('This is a fire drill.')).toBe(false);
      expect(detectEmergency('I smell cigarette smoke from my neighbour.')).toBe(false);
    });

    it('PRESERVES: a later unsuppressed occurrence of the same pattern still registers even when an earlier occurrence was suppressed', () => {
      expect(detectEmergency('I usually smell cigarette smoke, but now thick smoke is coming from the apartment.')).toBe(true);
      expect(detectEmergency('We were doing a drill but the building is actually shaking.')).toBe(true);
    });
  });

  describe('2. MED-02 deterministic subject-head (first-match-wins, not "human always first")', () => {
    it('English possessive (with or without a preceding adjective) correctly identifies the device as head', () => {
      expect(primaryFor("My neighbour's app is not responding.")).not.toBe('MED-02');
      expect(primaryFor("My elderly neighbour's app is not responding.")).not.toBe('MED-02');
    });

    it('"next to"/"near"/"beside" location modifiers on a device subject do not introduce a false human subject', () => {
      expect(primaryFor('The app next to a resident is not responding.')).not.toBe('MED-02');
    });

    it('Spanish/French trailing possessive ("de"/"del"/"du") correctly identifies the leading device as head', () => {
      expect(primaryFor('El teléfono de mi vecino no responde.')).not.toBe('MED-02');
      expect(primaryFor('La aplicación del residente no responde.')).not.toBe('MED-02');
      expect(primaryFor('Le téléphone de mon voisin ne répond pas.')).not.toBe('MED-02');
      expect(primaryFor("L'application du résident ne répond pas.")).not.toBe('MED-02');
    });

    it('German genitive possessive pronoun + noun correctly identifies the leading device as head', () => {
      expect(primaryFor('Das Telefon meines Nachbarn reagiert nicht.')).not.toBe('MED-02');
    });

    it('PRESERVES: a genuine human subject (no device modifier) still resolves to MED-02 in all four languages', () => {
      expect(primaryFor('My neighbour is not responding.')).toBe('MED-02');
      expect(primaryFor('El vecino no responde.')).toBe('MED-02');
      expect(primaryFor('Le résident ne répond pas.')).toBe('MED-02');
      expect(primaryFor('Der Bewohner reagiert nicht.')).toBe('MED-02');
    });

    it('CRITICAL: the subject gate blocks ALL evidence paths for MED-02, not only the raw-anchor mechanism (regular keywords cannot bypass it)', () => {
      // "no responde" is plausibly also a literal MED-02 keyword in
      // production - the gate must still suppress it via the ordinary
      // phrase-match loop, not just the raw-anchor shortcut.
      expect(primaryFor('El teléfono de mi vecino no responde.')).not.toBe('MED-02');
    });
  });

  describe('3. Centralized threat/attack vocabulary and ß/accent normalization', () => {
    it('bare (non-gerund) Spanish verb forms are recognized via the shared vocabulary', () => {
      expect(primaryFor('Un perro ataca a un vecino.')).toBe('SAF-03');
      expect(detectEmergency('Un perro ataca a un vecino.')).toBe(true);
    });

    it('German separable-verb "greift...an" (prefix at clause end) is recognized via the verb stem', () => {
      expect(primaryFor('Ein Hund greift einen Bewohner an.')).toBe('SAF-03');
      expect(detectEmergency('Ein Hund greift einen Bewohner an.')).toBe(true);
    });

    it('German ß correctly normalizes to ss for both retrieval and emergency detection', () => {
      expect(primaryFor('Ein Hund beißt einen Bewohner.')).toBe('SAF-03');
      expect(detectEmergency('Ein Hund beißt einen Bewohner.')).toBe(true);
    });

    it('French verb forms are recognized via the shared vocabulary', () => {
      expect(primaryFor('Un chien attaque un résident.')).toBe('SAF-03');
      expect(detectEmergency('Un chien attaque un résident.')).toBe(true);
    });
  });
});

describe('Phase 3A round-5 hardening — occurrence-based MED-02 evaluator and clause-local ELE-05 relationship (no global bypasses)', () => {
  const entries = [
    { intent_code: 'MED-02', category: 'Medical', keywords: ['unconscious', 'collapsed', 'not responding'], logic_json: { example_user_queries: [] } },
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. MED-02 occurrence-based evaluator', () => {
    it('a historical human occurrence retrieves MED-02 informationally but is not an active emergency', () => {
      expect(primaryFor('They were not responding yesterday.')).toBe('MED-02');
      expect(detectEmergency('They were not responding yesterday.')).toBe(false);
      expect(primaryFor('My neighbour was not responding yesterday.')).toBe('MED-02');
      expect(detectEmergency('My neighbour was not responding yesterday.')).toBe(false);
    });

    it('a device occurrence followed by a human occurrence in the same message still triggers MED-02 (order: device then human)', () => {
      expect(primaryFor('The app is not responding, but a resident is not responding.')).toBe('MED-02');
      expect(detectEmergency('The app is not responding, but a resident is not responding.')).toBe(true);
      expect(primaryFor('The administrator is not responding, but a man is not responding.')).toBe('MED-02');
      expect(detectEmergency('The administrator is not responding, but a man is not responding.')).toBe(true);
    });

    it('a human occurrence followed by a device occurrence still triggers MED-02 (order: human then device)', () => {
      expect(primaryFor('A resident is not responding, but the app is not responding.')).toBe('MED-02');
      expect(detectEmergency('A resident is not responding, but the app is not responding.')).toBe(true);
    });

    it('a lone device occurrence with no human occurrence anywhere does not trigger MED-02 at all', () => {
      expect(primaryFor('The app is not responding.')).not.toBe('MED-02');
      expect(detectEmergency('The app is not responding.')).toBe(false);
    });
  });

  describe('2. ELE-05 clause-local water/electrical relationship (not a global "both words present" check)', () => {
    it('a direct water-to-fixture relationship triggers ELE-05 with emergencyDetected=true', () => {
      expect(primaryFor('Water is dripping through the ceiling light.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping through the ceiling light.')).toBe(true);
      expect(primaryFor('Water is entering an electrical socket.')).toBe('ELE-05');
      expect(detectEmergency('Water is entering an electrical socket.')).toBe(true);
    });

    it('a historical relationship retrieves ELE-05 informationally but is not an active emergency', () => {
      expect(primaryFor('Water was dripping through the ceiling light last week.')).toBe('ELE-05');
      expect(detectEmergency('Water was dripping through the ceiling light last week.')).toBe(false);
    });

    it('water and an explicitly-fine electrical fixture in a different clause do not trigger ELE-05', () => {
      expect(primaryFor('There is water on the floor, but the lamp is working normally.')).not.toBe('ELE-05');
      expect(detectEmergency('There is water on the floor, but the lamp is working normally.')).toBe(false);
    });

    it('unrelated water and lamp mentions joined by "and" (different rooms) do not trigger ELE-05', () => {
      expect(primaryFor('There is a water leak in the bathroom and a lamp in the bedroom.')).not.toBe('ELE-05');
      expect(detectEmergency('There is a water leak in the bathroom and a lamp in the bedroom.')).toBe(false);
    });

    it('a later unsuppressed relationship still registers even when an earlier one in the same message was historical', () => {
      expect(primaryFor('Water dripped through the light last week, but now water is entering a socket.')).toBe('ELE-05');
      expect(detectEmergency('Water dripped through the light last week, but now water is entering a socket.')).toBe(true);
    });

    it('multilingual direct relationships (ES/FR/DE) all resolve to ELE-05 with emergencyDetected=true', () => {
      expect(primaryFor('Agua gotea por la lámpara.')).toBe('ELE-05');
      expect(detectEmergency('Agua gotea por la lámpara.')).toBe(true);
      expect(primaryFor('Eau coule du luminaire.')).toBe('ELE-05');
      expect(detectEmergency('Eau coule du luminaire.')).toBe(true);
      expect(primaryFor('Wasser tropft aus der Deckenleuchte.')).toBe('ELE-05');
      expect(detectEmergency('Wasser tropft aus der Deckenleuchte.')).toBe(true);
    });
  });
});

describe('Phase 3A round-6 hardening — ELE-05 relation-aware conjunction handling (verb-continuation vs new-subject)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. A conjunction continuing the SAME action (verb after "and") does not block the relationship', () => {
    it('EN verb-chained single incident', () => {
      expect(primaryFor('Water is leaking and reaching the electrical socket.')).toBe('ELE-05');
      expect(detectEmergency('Water is leaking and reaching the electrical socket.')).toBe(true);
      expect(primaryFor('Water is dripping from the ceiling and entering a light fitting.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping from the ceiling and entering a light fitting.')).toBe(true);
    });

    it('EN compound subject joined by "and"', () => {
      expect(primaryFor('Water and electricity are mixing at the socket.')).toBe('ELE-05');
      expect(detectEmergency('Water and electricity are mixing at the socket.')).toBe(true);
    });

    it('multilingual verb-chained single incident (ES/FR/DE)', () => {
      expect(primaryFor('El agua gotea y llega al enchufe eléctrico.')).toBe('ELE-05');
      expect(detectEmergency('El agua gotea y llega al enchufe eléctrico.')).toBe(true);
      expect(primaryFor("L'eau coule et atteint la prise électrique.")).toBe('ELE-05');
      expect(detectEmergency("L'eau coule et atteint la prise électrique.")).toBe(true);
      expect(primaryFor('Wasser tropft und erreicht die Steckdose.')).toBe('ELE-05');
      expect(detectEmergency('Wasser tropft und erreicht die Steckdose.')).toBe(true);
    });
  });

  describe('2. A conjunction introducing a NEW SUBJECT (article + noun after "and") still blocks the relationship', () => {
    it('two independent facts joined by "and" are not combined into ELE-05', () => {
      expect(primaryFor('There is a leak in the bathroom and the lamp in the bedroom works normally.')).not.toBe('ELE-05');
      expect(detectEmergency('There is a leak in the bathroom and the lamp in the bedroom works normally.')).toBe(false);
      expect(primaryFor('Water is on the floor and the lamp works normally.')).not.toBe('ELE-05');
      expect(detectEmergency('Water is on the floor and the lamp works normally.')).toBe(false);
      expect(primaryFor('The bathroom has a leak and the hallway light is working normally.')).not.toBe('ELE-05');
      expect(detectEmergency('The bathroom has a leak and the hallway light is working normally.')).toBe(false);
    });
  });

  describe('3. Historical and multi-occurrence contract for verb-chained relationships', () => {
    it('a historical verb-chained relationship retrieves ELE-05 informationally but is not an active emergency', () => {
      expect(primaryFor('Water was leaking and reaching the electrical socket yesterday.')).toBe('ELE-05');
      expect(detectEmergency('Water was leaking and reaching the electrical socket yesterday.')).toBe(false);
    });

    it('a later active relationship wins over an earlier historical one in the same message', () => {
      expect(primaryFor('Water was near the socket yesterday, but water is now entering the electrical socket.')).toBe('ELE-05');
      expect(detectEmergency('Water was near the socket yesterday, but water is now entering the electrical socket.')).toBe(true);
    });
  });

  describe('4. Round-5 regressions preserved', () => {
    it('direct relationship still works', () => {
      expect(primaryFor('Water is dripping through the ceiling light.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping through the ceiling light.')).toBe(true);
    });

    it('unrelated water/lamp mentions in different rooms still excluded', () => {
      expect(primaryFor('There is a water leak in the bathroom and a lamp in the bedroom.')).not.toBe('ELE-05');
    });

    it('an explicitly-fine fixture in a different clause still excluded', () => {
      expect(primaryFor('There is water on the floor, but the lamp is working normally.')).not.toBe('ELE-05');
    });
  });
});

describe('Phase 3A round-7 hardening — ELE-05 positive relationship evidence (not syntactic heuristics)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. Bidirectional relationship evidence - electrical term getting wet (reverse direction)', () => {
    it('water reported first, electrical component getting wet reported after', () => {
      expect(primaryFor('Water is dripping down the wall and the electrical socket is getting wet.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping down the wall and the electrical socket is getting wet.')).toBe(true);
      expect(primaryFor('Water is running down the wall and this socket is becoming wet.')).toBe('ELE-05');
    });

    it('electrical component reported first, water cause reported after', () => {
      expect(primaryFor('The electrical socket is getting wet from water running down the wall.')).toBe('ELE-05');
      expect(detectEmergency('The electrical socket is getting wet from water running down the wall.')).toBe(true);
    });

    it('multilingual reverse-direction (electrical term + wet state)', () => {
      expect(primaryFor('El enchufe se está mojando por el agua.')).toBe('ELE-05');
      expect(primaryFor("La prise électrique est mouillée par l'eau.")).toBe('ELE-05');
      expect(primaryFor('Die Steckdose wird durch das Wasser nass.')).toBe('ELE-05');
    });
  });

  describe('2. Explicit dangerous spatial proximity', () => {
    it('"around"/"next to" register as relationship evidence', () => {
      expect(primaryFor('There is water around the electrical panel.')).toBe('ELE-05');
      expect(detectEmergency('There is water around the electrical panel.')).toBe(true);
      expect(primaryFor('Water is next to exposed wiring.')).toBe('ELE-05');
      expect(detectEmergency('Water is next to exposed wiring.')).toBe(true);
    });
  });

  describe('3. No positive relationship evidence -> not ELE-05, regardless of syntax around the conjunction', () => {
    it('an explicitly-fine electrical fixture mentioned alongside a leak is not combined', () => {
      expect(primaryFor('There is a water leak in the bathroom and my lamp works normally.')).not.toBe('ELE-05');
      expect(primaryFor('There is a leak in the bathroom and bedroom lights work normally.')).not.toBe('ELE-05');
      expect(primaryFor('Water is on the floor and this lamp works normally.')).not.toBe('ELE-05');
      expect(primaryFor('There is a leak in the bathroom and our electrical panel is fine.')).not.toBe('ELE-05');
      expect(detectEmergency('There is a leak in the bathroom and our electrical panel is fine.')).toBe(false);
    });

    it('multilingual "explicitly fine" fixtures are not combined', () => {
      expect(primaryFor('Hay una fuga en el baño y mi lámpara funciona bien.')).not.toBe('ELE-05');
      expect(primaryFor('Il y a une fuite dans la salle de bain et ma lampe fonctionne bien.')).not.toBe('ELE-05');
      expect(primaryFor('Wasser ist im Bad und meine Lampe funktioniert normal.')).not.toBe('ELE-05');
    });
  });

  describe('4. Round-6 acceptance contract preserved', () => {
    it('verb-chained single incidents still resolve to ELE-05', () => {
      expect(primaryFor('Water is leaking and reaching the electrical socket.')).toBe('ELE-05');
      expect(primaryFor('Water is dripping from the ceiling and entering a light fitting.')).toBe('ELE-05');
      expect(primaryFor('Water and electricity are mixing at the socket.')).toBe('ELE-05');
      expect(primaryFor('Water is dripping through the ceiling light.')).toBe('ELE-05');
    });

    it('unrelated facts joined by a conjunction still excluded', () => {
      expect(primaryFor('There is a leak in the bathroom and the lamp in the bedroom works normally.')).not.toBe('ELE-05');
      expect(primaryFor('There is a water leak in the bathroom and a lamp in the bedroom.')).not.toBe('ELE-05');
    });
  });

  describe('5. Historical and multi-occurrence contract', () => {
    it('a historical relationship retrieves ELE-05 informationally but is not an active emergency', () => {
      expect(primaryFor('Water was leaking and reaching the electrical socket yesterday.')).toBe('ELE-05');
      expect(detectEmergency('Water was leaking and reaching the electrical socket yesterday.')).toBe(false);
    });

    it('a later active relationship wins over an earlier historical one', () => {
      expect(primaryFor('Water was near the socket yesterday, but water is now entering the electrical socket.')).toBe('ELE-05');
      expect(detectEmergency('Water was near the socket yesterday, but water is now entering the electrical socket.')).toBe(true);
    });
  });

  describe('6. Regression guard: general "through" preposition (not just "drip through")', () => {
    it('other verbs combined with "through" still register the relationship', () => {
      expect(primaryFor('Water is coming through an electrical fitting.')).toBe('ELE-05');
      expect(detectEmergency('Water is coming through an electrical fitting.')).toBe(true);
    });
  });
});

describe('Phase 3A round-8 hardening — ELE-05 pair-bound relationship (positional endpoint binding, not clause-global tokens)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. Positive: relation bridge binds the SPECIFIC water/electrical pair', () => {
    it('bidirectional wet-state predicate binds correctly', () => {
      expect(primaryFor('Water is dripping down the wall and the electrical socket is getting wet.')).toBe('ELE-05');
      expect(detectEmergency('Water is dripping down the wall and the electrical socket is getting wet.')).toBe(true);
      expect(primaryFor('The electrical socket is getting wet from water running down the wall.')).toBe('ELE-05');
    });

    it('directional verbs bind water to the electrical endpoint', () => {
      expect(primaryFor('Water is coming through an electrical fitting.')).toBe('ELE-05');
      expect(primaryFor('Water is leaking and reaching the electrical socket.')).toBe('ELE-05');
      expect(primaryFor('Water is dripping from the ceiling and entering a light fitting.')).toBe('ELE-05');
    });

    it('compound-subject mixing and explicit proximity bind correctly', () => {
      expect(primaryFor('Water and electricity are mixing at the socket.')).toBe('ELE-05');
      expect(primaryFor('There is water around the electrical panel.')).toBe('ELE-05');
      expect(primaryFor('Water is next to exposed wiring.')).toBe('ELE-05');
    });

    it('multilingual motion+preposition bridges bind correctly (ES/FR/DE)', () => {
      expect(primaryFor('El agua gotea y llega al enchufe eléctrico.')).toBe('ELE-05');
      expect(primaryFor('El enchufe se está mojando por el agua.')).toBe('ELE-05');
      expect(primaryFor("L'eau coule et atteint la prise électrique.")).toBe('ELE-05');
      expect(primaryFor("La prise électrique est mouillée par l'eau.")).toBe('ELE-05');
      expect(primaryFor('Wasser tropft und erreicht die Steckdose.')).toBe('ELE-05');
      expect(primaryFor('Die Steckdose wird durch das Wasser nass.')).toBe('ELE-05');
    });
  });

  describe('2. Negative: a relation word present elsewhere in the clause must NOT bind an unrelated pair', () => {
    it('a directional verb bound to a DIFFERENT noun does not bridge to a later unrelated electrical term', () => {
      expect(primaryFor('Water is running down the wall and the lamp works normally.')).not.toBe('ELE-05');
      expect(primaryFor('Water came through the door and the electrical panel works normally.')).not.toBe('ELE-05');
      expect(detectEmergency('Water came through the door and the electrical panel works normally.')).toBe(false);
    });

    it('proximity word bound to a different noun does not bridge', () => {
      expect(primaryFor('There is a water leak near the bathroom and the lamp works normally.')).not.toBe('ELE-05');
    });

    it('a bare "contact" verb unrelated to water/electrical does not count as evidence', () => {
      expect(primaryFor('There is a water leak and I will contact maintenance because the light works normally.')).not.toBe('ELE-05');
    });

    it('"wet" describing a PERSON, not the electrical term, does not count', () => {
      expect(primaryFor('I got wet cleaning the water and the lamp works normally.')).not.toBe('ELE-05');
    });

    it('multilingual "unrelated fine fixture" cases stay excluded', () => {
      expect(primaryFor('El agua corre por la pared y la lámpara funciona bien.')).not.toBe('ELE-05');
      expect(primaryFor("L'eau coule sur le sol et la lampe fonctionne bien.")).not.toBe('ELE-05');
      expect(primaryFor('Wasser läuft auf den Boden und die Lampe funktioniert normal.')).not.toBe('ELE-05');
    });
  });

  describe('3. Local negation on the specific relationship', () => {
    it('negated water-near-electrical is excluded', () => {
      expect(primaryFor('There is no water near the electrical socket.')).not.toBe('ELE-05');
      expect(detectEmergency('There is no water near the electrical socket.')).toBe(false);
    });

    it('negated wet-state predicate is excluded even though the bare "wet" word matches', () => {
      expect(primaryFor('The socket is not wet and there is no water leak.')).not.toBe('ELE-05');
    });

    it('multilingual negated wet-state is excluded', () => {
      expect(primaryFor('Hay una fuga de agua, pero el enchufe no está mojado.')).not.toBe('ELE-05');
      expect(primaryFor("Il y a une fuite, mais la prise n'est pas mouillée.")).not.toBe('ELE-05');
      expect(primaryFor('Es gibt ein Wasserleck, aber die Steckdose ist nicht nass.')).not.toBe('ELE-05');
    });

    it('a later positive pair still works independently of an earlier negated one', () => {
      expect(primaryFor('There was no water near the socket earlier, but water is now entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('There was no water near the socket earlier, but water is now entering the socket.')).toBe(true);
    });
  });

  describe('4. Hypothetical and historical context, scoped locally', () => {
    it('a hypothetical question retrieves ELE-05 informationally but is not an active emergency', () => {
      expect(primaryFor('What should I do if water gets near an electrical socket?')).toBe('ELE-05');
      expect(detectEmergency('What should I do if water gets near an electrical socket?')).toBe(false);
    });

    it('a historical relationship retrieves informationally but is not an active emergency', () => {
      expect(primaryFor('Water was leaking into the socket yesterday.')).toBe('ELE-05');
      expect(detectEmergency('Water was leaking into the socket yesterday.')).toBe(false);
    });

    it('hypothetical framing in an earlier clause does not suppress a later active relationship', () => {
      expect(primaryFor('I asked what would happen if water reached a socket, but water is now entering the electrical panel.')).toBe('ELE-05');
      expect(detectEmergency('I asked what would happen if water reached a socket, but water is now entering the electrical panel.')).toBe(true);
    });
  });
});

describe('Phase 3A round-9 hardening — ELE-05 two-phase candidate evaluator (positional/predicate-tight binding, no unrestricted reverse directional)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
    { intent_code: 'WAT-01', category: 'Water', keywords: ['water leak upstairs', 'ceiling leak'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('1. No unrestricted reverse directional (bug A)', () => {
    it('an electrical mention followed by an unrelated "entering the water" does not bind', () => {
      expect(primaryFor('The light is on and children are entering the water.')).not.toBe('ELE-05');
      expect(detectEmergency('The light is on and children are entering the water.')).toBe(false);
      expect(primaryFor('The electrical panel is monitored as workers enter the water tank.')).not.toBe('ELE-05');
    });

    it('explicit passive/containment reverse forms still work', () => {
      expect(primaryFor('The socket contains water.')).toBe('ELE-05');
      expect(primaryFor('The socket has water in it.')).toBe('ELE-05');
    });
  });

  describe('2. Wet-state predicate must be tightly bound, not a stray nearby "wet" (bug B)', () => {
    it('"wet" describing an unrelated object near an electrical term does not bind', () => {
      expect(primaryFor('Wet shoes are under the lamp.')).not.toBe('ELE-05');
      expect(primaryFor('The lamp illuminates wet paint.')).not.toBe('ELE-05');
      expect(primaryFor('The socket is beside wet towels.')).not.toBe('ELE-05');
    });

    it('a genuine wet-state predicate on the electrical term itself still works', () => {
      expect(primaryFor('The socket is getting wet from water running down the wall.')).toBe('ELE-05');
      expect(detectEmergency('The socket is getting wet from water running down the wall.')).toBe(true);
    });
  });

  describe('3. Destination preposition binds directly to the electrical noun phrase, not a skipped-over unrelated noun (bug C)', () => {
    it('a completed destination noun blocks binding to a later unrelated electrical term', () => {
      expect(primaryFor('Water came through wall and lamp works normally.')).not.toBe('ELE-05');
      expect(primaryFor('Water flows through wall and lamp works normally.')).not.toBe('ELE-05');
    });

    it('multilingual equivalents are also excluded', () => {
      expect(primaryFor('El agua corre por suelo y lámpara funciona bien.')).not.toBe('ELE-05');
      expect(primaryFor("L'eau coule dans sol et lampe fonctionne bien.")).not.toBe('ELE-05');
      expect(primaryFor('Wasser läuft auf Boden und Lampe funktioniert normal.')).not.toBe('ELE-05');
    });

    it('safe modifiers (articles, possessives, room names) between preposition and electrical term still bind correctly', () => {
      expect(primaryFor('Water is coming through my bathroom light.')).toBe('ELE-05');
      expect(primaryFor('Water is coming through an electrical fitting.')).toBe('ELE-05');
    });
  });

  describe('4. Negation checked across every family, not only wet-state (bug D)', () => {
    it('negated directional/proximity/contact/mixing candidates are all excluded', () => {
      expect(primaryFor('Water is not near the electrical socket.')).not.toBe('ELE-05');
      expect(primaryFor('The electrical socket is not near water.')).not.toBe('ELE-05');
      expect(primaryFor('Water is not entering the socket.')).not.toBe('ELE-05');
      expect(primaryFor('Water is not in contact with wiring.')).not.toBe('ELE-05');
      expect(primaryFor('Water and electricity are not mixing.')).not.toBe('ELE-05');
      expect(primaryFor('Water is not around the electrical panel.')).not.toBe('ELE-05');
    });
  });

  describe('5. Negation lookback is clause-bounded, not a fixed character count (bug E)', () => {
    it('negation in an earlier, separate sentence does not suppress a later active candidate', () => {
      expect(primaryFor('No issue. Water is entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('No issue. Water is entering the socket.')).toBe(true);
      expect(primaryFor('No water near the lamp. Water is entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('No water near the lamp. Water is entering the socket.')).toBe(true);
      expect(primaryFor('Yesterday there was no water. Water is entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('Yesterday there was no water. Water is entering the socket.')).toBe(true);
    });

    it('genuine same-clause negation before the water term still correctly suppresses', () => {
      expect(detectEmergency('There is no water near the electrical socket.')).toBe(false);
    });
  });

  describe('6. Hypothetical marker must be tightly bound to the specific construction (bug F)', () => {
    it('an unrelated distant "if" clause about a different topic does not suppress a later active relationship', () => {
      expect(primaryFor('I wonder if maintenance is available because water is entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('I wonder if maintenance is available because water is entering the socket.')).toBe(true);
    });

    it('a genuinely bound hypothetical still suppresses only the emergency flag', () => {
      expect(primaryFor('What should I do if water gets near an electrical socket?')).toBe('ELE-05');
      expect(detectEmergency('What should I do if water gets near an electrical socket?')).toBe(false);
    });
  });

  describe('7. New semantic families: containment, direct contact, mixing-with, additional destination verbs', () => {
    it('containment phrasing resolves to ELE-05', () => {
      expect(primaryFor('There is water inside the electrical panel.')).toBe('ELE-05');
      expect(primaryFor('I found water in the socket.')).toBe('ELE-05');
    });

    it('past-tense destination verbs resolve to ELE-05 with emergencyDetected=true (bare past tense alone is not historical)', () => {
      expect(primaryFor('Water reached the electrical socket.')).toBe('ELE-05');
      expect(detectEmergency('Water reached the electrical socket.')).toBe(true);
      expect(primaryFor('Water has entered the electrical panel.')).toBe('ELE-05');
      expect(primaryFor('Water leaked into the wiring.')).toBe('ELE-05');
    });

    it('"mixing with" structure (not only compound-subject "and mixing") resolves to ELE-05', () => {
      expect(primaryFor('Water is mixing with electricity at the socket.')).toBe('ELE-05');
    });

    it('"outlet"/"power outlet" terminology is recognized', () => {
      expect(primaryFor('Water is dripping over the power outlet.')).toBe('ELE-05');
    });
  });
});

describe('Phase 3A round-10 hardening — subject-aware segmentation, entity-type classification, candidate-local negation/modality/temporal scope', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('8.1 Subject/role binding — a new subject after a conjunction breaks the water-endpoint chain', () => {
    it('a technician (not water) is the subject of "reached"', () => {
      expect(primaryFor('Water service is normal and the technician reached the electrical panel.')).not.toBe('ELE-05');
    });
    it('"socket technician" names a person, not an electrical component', () => {
      expect(primaryFor('The socket technician has water in his bottle.')).not.toBe('ELE-05');
    });
    it('"electrical contractor" names a person, not an electrical component', () => {
      expect(primaryFor('The electrical contractor has water in the van.')).not.toBe('ELE-05');
    });
    it('a new human subject ("I") after the conjunction breaks the electrical-panel clause', () => {
      expect(primaryFor('The electrical panel is fine and I came into contact with water.')).not.toBe('ELE-05');
    });
    it('"mixing paint" is not bound to the "water and electricity" compound noun (bills)', () => {
      expect(primaryFor('Water and electricity bills are rising when mixing paint.')).not.toBe('ELE-05');
    });
    it('a new subject ("the electrician") after the conjunction breaks the water clause', () => {
      expect(primaryFor('Water is in the bathroom and the electrician entered the utility room.')).not.toBe('ELE-05');
    });
    it('a new subject ("the contractor") after the conjunction breaks the leak clause', () => {
      expect(primaryFor('The leak stopped and the contractor inspected the socket.')).not.toBe('ELE-05');
    });
  });

  describe('8.2 Negated relationships — extended negation vocabulary bound to the predicate', () => {
    it('EN never/cannot/can\'t', () => {
      expect(primaryFor('Water has never come into contact with wiring.')).not.toBe('ELE-05');
      expect(primaryFor('Water cannot reach the electrical socket.')).not.toBe('ELE-05');
      expect(primaryFor("Water can't enter the electrical panel.")).not.toBe('ELE-05');
    });
    it('ES nunca/no puede', () => {
      expect(primaryFor('El agua nunca llegó al enchufe.')).not.toBe('ELE-05');
      expect(primaryFor('El agua no puede entrar en el cuadro eléctrico.')).not.toBe('ELE-05');
    });
    it('FR jamais/ne peut pas', () => {
      expect(primaryFor("L'eau n'est jamais entrée dans la prise.")).not.toBe('ELE-05');
      expect(primaryFor("L'eau ne peut pas atteindre le tableau électrique.")).not.toBe('ELE-05');
    });
    it('DE nie/kann nicht', () => {
      expect(primaryFor('Wasser ist nie in die Steckdose gelangt.')).not.toBe('ELE-05');
      expect(primaryFor('Wasser kann nicht in den Schaltschrank eindringen.')).not.toBe('ELE-05');
    });
  });

  describe('8.3 Unrelated negation must not suppress a later, subject-distinct active pair', () => {
    it('EN "no one is injured" does not suppress a later water/socket clause', () => {
      expect(primaryFor('No one is injured and water is entering the socket.')).toBe('ELE-05');
      expect(detectEmergency('No one is injured and water is entering the socket.')).toBe(true);
    });
    it('EN "the lamp is not damaged" does not suppress a later water/socket clause', () => {
      expect(primaryFor('The lamp is not damaged and water is entering another socket.')).toBe('ELE-05');
    });
    it('EN semicolon-separated "no person is trapped" does not suppress the following clause', () => {
      expect(primaryFor('No person is trapped; water is entering the electrical panel.')).toBe('ELE-05');
    });
    it('ES "nadie está herido" does not suppress a later active pair', () => {
      expect(primaryFor('Nadie está herido y el agua entra en el enchufe.')).toBe('ELE-05');
    });
    it('FR "personne n\'est blessé" does not suppress a later active pair', () => {
      expect(primaryFor("Personne n'est blessé et l'eau entre dans la prise.")).toBe('ELE-05');
    });
    it('DE "niemand ist verletzt" does not suppress a later active pair', () => {
      expect(primaryFor('Niemand ist verletzt und Wasser gelangt in die Steckdose.')).toBe('ELE-05');
    });
  });

  describe('8.4 Candidate-local historical/drill context', () => {
    it('EN a repair mentioned in an earlier, subject-distinct clause does not suppress a later active pair', () => {
      expect(detectEmergency('Yesterday the lamp was repaired and water is entering the socket.')).toBe(true);
    });
    it('EN a completed drill does not suppress a later active pair', () => {
      expect(detectEmergency('The fire drill ended and water is entering the socket.')).toBe(true);
    });
    it('EN an earlier historical water/socket pair does not suppress a later active one', () => {
      expect(detectEmergency('Water was near the socket yesterday and water is entering another socket.')).toBe(true);
    });
    it('DE a repair mentioned earlier does not suppress a later active pair', () => {
      expect(detectEmergency('Gestern wurde die Lampe repariert und jetzt tritt Wasser in die Steckdose ein.')).toBe(true);
    });
    it('FR a repair mentioned earlier does not suppress a later active pair', () => {
      expect(detectEmergency("Hier, la lampe a été réparée et maintenant l'eau entre dans la prise.")).toBe(true);
    });
    it('ES a repair mentioned earlier does not suppress a later active pair', () => {
      expect(detectEmergency('Ayer repararon la lámpara y ahora el agua entra en el enchufe.')).toBe(true);
    });
    it('EN a genuinely historical single pair retrieves informationally but is not an active emergency', () => {
      expect(primaryFor('Water entered the socket yesterday.')).toBe('ELE-05');
      expect(detectEmergency('Water entered the socket yesterday.')).toBe(false);
    });
    it('ES a genuinely historical single pair is not an active emergency', () => {
      expect(detectEmergency('El agua entró en el enchufe ayer.')).toBe(false);
    });
    it('FR a genuinely historical single pair is not an active emergency', () => {
      expect(detectEmergency("L'eau est entrée dans la prise hier.")).toBe(false);
    });
    it('DE a genuinely historical single pair is not an active emergency', () => {
      expect(detectEmergency('Gestern gelangte Wasser in die Steckdose.')).toBe(false);
    });
  });

  describe('8.5 Candidate-local hypothetical context', () => {
    it('a directly-bound "if" suppresses only the emergency flag, retrieval still works', () => {
      expect(primaryFor('If water enters the socket, what should I do?')).toBe('ELE-05');
      expect(detectEmergency('If water enters the socket, what should I do?')).toBe(false);
    });
    it('an unrelated "if possible" does not suppress a stated-as-fact active relationship', () => {
      expect(detectEmergency('If possible, please call Ammex because water is entering the socket now.')).toBe(true);
    });
    it('a reason-connector separates an unrelated hypothetical from a stated fact', () => {
      expect(detectEmergency('I asked what would happen if water reached a socket, and water is now entering the electrical panel.')).toBe(true);
    });
  });

  describe('8.6 Direct multilingual incident recognition', () => {
    it('EN bare incident forms', () => {
      expect(primaryFor('The socket is wet.')).toBe('ELE-05');
      expect(primaryFor('There is water inside the electrical panel.')).toBe('ELE-05');
      expect(primaryFor('Water is in direct contact with the cable.')).toBe('ELE-05');
      expect(primaryFor('There is water near the outlet.')).toBe('ELE-05');
      expect(primaryFor('Water is entering the socket.')).toBe('ELE-05');
    });
    it('ES bare incident forms', () => {
      expect(primaryFor('El enchufe está mojado.')).toBe('ELE-05');
      expect(primaryFor('Hay agua dentro del cuadro eléctrico.')).toBe('ELE-05');
      expect(primaryFor('El agua está en contacto directo con el cable.')).toBe('ELE-05');
      expect(primaryFor('Hay agua cerca del enchufe.')).toBe('ELE-05');
      expect(primaryFor('El agua entra en el enchufe.')).toBe('ELE-05');
    });
    it('FR bare incident forms', () => {
      expect(primaryFor('La prise est mouillée.')).toBe('ELE-05');
      expect(primaryFor("Il y a de l'eau dans le tableau électrique.")).toBe('ELE-05');
      expect(primaryFor("L'eau est en contact direct avec le câble électrique.")).toBe('ELE-05');
      expect(primaryFor("Il y a de l'eau près de la prise.")).toBe('ELE-05');
      expect(primaryFor("L'eau entre dans la prise.")).toBe('ELE-05');
    });
    it('DE bare incident forms', () => {
      expect(primaryFor('Die Steckdose ist nass.')).toBe('ELE-05');
      expect(primaryFor('Wasser ist im Schaltschrank.')).toBe('ELE-05');
      expect(primaryFor('Wasser ist in direktem Kontakt mit dem Kabel.')).toBe('ELE-05');
      expect(primaryFor('Wasser ist in der Nähe der Steckdose.')).toBe('ELE-05');
      expect(primaryFor('Wasser tritt in die Steckdose ein.')).toBe('ELE-05');
    });
  });
});

describe('Phase 3A round-11 hardening — genuine token/mention/candidate model (analyzeWaterElectricalRelationships), replaces Round-10 boolean segment evaluator', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('13.1 Negative adversarial cases (each a separate test, not merged)', () => {
    it('13.1.01 water prices reaching an electricity price cap is financial, not physical', () => {
      expect(primaryFor('Water prices are reaching the electricity price cap.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water prices are reaching the electricity price cap.')).toBe(false);
      expect(detectEmergency('Water prices are reaching the electricity price cap.')).toBe(false);
    });
    it('13.1.02 "the Water Committee" is an organization, not liquid water', () => {
      expect(primaryFor('The Water Committee reached the electrical panel to inspect it.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('The Water Committee reached the electrical panel to inspect it.')).toBe(false);
    });
    it('13.1.03 water going through a pipe is unrelated to an electrical panel working normally', () => {
      expect(primaryFor('Water went through the pipe while the electrical panel works normally.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water went through the pipe while the electrical panel works normally.')).toBe(false);
    });
    it('13.1.04 "electrical panel documentation" inside a relative clause is not the destination of "entered"', () => {
      expect(primaryFor('Water entered the bathroom where the electrical panel documentation is stored.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water entered the bathroom where the electrical panel documentation is stored.')).toBe(false);
    });
    it('13.1.05 proximity relation belongs to water/bathroom, not water/electrical panel', () => {
      expect(primaryFor('Water is near the bathroom while the electrical panel works normally.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water is near the bathroom while the electrical panel works normally.')).toBe(false);
    });
    it('13.1.06 containment relation belongs to water/bathroom, not water/electrical panel', () => {
      expect(primaryFor('Water is inside the bathroom while the electrical panel works normally.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water is inside the bathroom while the electrical panel works normally.')).toBe(false);
    });
    it('13.1.07 contact relation belongs to tank/bracket, not water/electrical panel', () => {
      expect(primaryFor('Water is stored in a tank that is in contact with a metal bracket while the electrical panel works normally.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water is stored in a tank that is in contact with a metal bracket while the electrical panel works normally.')).toBe(false);
    });
    it('13.1.08 mixing relation belongs to paint/mixer, not water/electricity', () => {
      expect(primaryFor('Water is in the kitchen while the electrician is mixing paint with an electrical mixer.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water is in the kitchen while the electrician is mixing paint with an electrical mixer.')).toBe(false);
    });
    it('13.1.09 "electrical panel installer" head is a person, not a component', () => {
      expect(primaryFor('The electrical panel installer has water in his bottle.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('The electrical panel installer has water in his bottle.')).toBe(false);
    });
    it('13.1.10 "socket wrench" is a tool, not an electrical component', () => {
      expect(primaryFor('Water reached the socket wrench.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water reached the socket wrench.')).toBe(false);
    });
    it('13.1.11 "discussion panel" is a meeting format, not an electrical component', () => {
      expect(primaryFor('Water reached the discussion panel.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water reached the discussion panel.')).toBe(false);
    });
    it('13.1.12 "light-blue paint" is a color modifier, not the electrical term "light"', () => {
      expect(primaryFor('Water is reaching the light-blue paint.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('Water is reaching the light-blue paint.')).toBe(false);
    });
    it('13.1.13 "wet-tested" is a compound modifier, not a wet-state predicate', () => {
      expect(primaryFor('The lamp was wet-tested at the factory.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('The lamp was wet-tested at the factory.')).toBe(false);
    });
    it('13.1.14 "wet-paint resistant" is a compound modifier, not a wet-state predicate', () => {
      expect(primaryFor('The socket is wet-paint resistant.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('The socket is wet-paint resistant.')).toBe(false);
    });
    it('13.1.15 ES "instalador electrico" head is a person (postponed adjective), not a component', () => {
      expect(primaryFor('El instalador eléctrico tiene agua en su botella.')).not.toBe('ELE-05');
      expect(hasDangerousCombo('El instalador eléctrico tiene agua en su botella.')).toBe(false);
    });
  });

  describe('13.2 Current positive adversarial cases (each a separate test, not merged)', () => {
    it('13.2.01 negative "damage" predicate does not suppress the independent, positive "entering" predicate', () => {
      expect(primaryFor('Water did not damage the floor and is entering the socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('Water did not damage the floor and is entering the socket.')).toBe(true);
      expect(detectEmergency('Water did not damage the floor and is entering the socket.')).toBe(true);
    });
    it('13.2.02 two candidates of different polarity aggregate correctly (negative proximity, positive directional)', () => {
      expect(primaryFor('Water is not near the first socket and is entering the second socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('Water is not near the first socket and is entering the second socket.')).toBe(true);
    });
    it('13.2.03 shared subject via "but" - negative "damaged" then positive "wet"', () => {
      expect(primaryFor('The socket is not damaged but is wet from water.')).toBe('ELE-05');
      expect(hasDangerousCombo('The socket is not damaged but is wet from water.')).toBe(true);
    });
    it('13.2.04 historical "reached...yesterday" does not mark the independent current "entering" as historical', () => {
      expect(primaryFor('Water reached the floor yesterday and is entering the socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('Water reached the floor yesterday and is entering the socket.')).toBe(true);
    });
    it('13.2.05 an unrelated earlier activity ("checked the lamp") does not suppress the current entering candidate', () => {
      expect(primaryFor('Yesterday I checked the lamp while water is entering the socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('Yesterday I checked the lamp while water is entering the socket.')).toBe(true);
    });
    it('13.2.06 an unrelated "if you can" request does not suppress the stated-as-fact water/socket clause', () => {
      expect(primaryFor('If you can, send help: water is entering the socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('If you can, send help: water is entering the socket.')).toBe(true);
    });
    it('13.2.07 an unrelated "if the gate is open" does not suppress the water/socket clause', () => {
      expect(primaryFor('Please tell me if the gate is open while water is entering the socket.')).toBe('ELE-05');
      expect(hasDangerousCombo('Please tell me if the gate is open while water is entering the socket.')).toBe(true);
    });
    it('13.2.08 ES negative-then-positive coordinated predicates aggregate correctly', () => {
      expect(primaryFor('El agua no dañó el suelo y está entrando en el enchufe.')).toBe('ELE-05');
      expect(hasDangerousCombo('El agua no dañó el suelo y está entrando en el enchufe.')).toBe(true);
    });
    it('13.2.09 FR negative-then-positive coordinated predicates aggregate correctly', () => {
      expect(primaryFor("L'eau n'a pas abîmé le sol et entre dans la prise.")).toBe('ELE-05');
      expect(hasDangerousCombo("L'eau n'a pas abîmé le sol et entre dans la prise.")).toBe(true);
    });
    it('13.2.10 DE negative-then-positive coordinated predicates aggregate correctly', () => {
      expect(primaryFor('Wasser hat den Boden nicht beschädigt und dringt in die Steckdose ein.')).toBe('ELE-05');
      expect(hasDangerousCombo('Wasser hat den Boden nicht beschädigt und dringt in die Steckdose ein.')).toBe(true);
    });
  });

  describe('12. Diagnostic architectural tests against analyzeWaterElectricalRelationships() itself', () => {
    it('12.1 wrong destination: "electrical panel" inside a relative clause is never the destination of the outer "entered"', () => {
      const a = analyzeWaterElectricalRelationships('Water entered the bathroom where the electrical panel documentation is stored.');
      const validPositive = a.candidates.filter((c) => c.valid && c.polarity === 'positive');
      expect(validPositive.length).toBe(0);
      expect(a.anyRelationshipAtAll).toBe(false);
    });

    it('12.2 two predicates with different polarity produce two distinct candidates that aggregate correctly', () => {
      const a = analyzeWaterElectricalRelationships('Water is not near the first socket and is entering the second socket.');
      const proximityCand = a.candidates.find((c) => c.family === 'proximity');
      const directionalCand = a.candidates.find((c) => c.family === 'directional');
      expect(proximityCand).toBeTruthy();
      expect(proximityCand.polarity).toBe('negative');
      expect(directionalCand).toBeTruthy();
      expect(directionalCand.polarity).toBe('positive');
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(true);
    });

    it('12.3 shared subject via "but": wet_state candidate has exact subjectSpan="socket" and predicateSpan="wet"', () => {
      const a = analyzeWaterElectricalRelationships('The socket is not damaged but is wet from water.');
      const wetCand = a.candidates.find((c) => c.family === 'wet_state' && c.polarity === 'positive');
      expect(wetCand).toBeTruthy();
      expect(a.normalizedText.slice(wetCand.subjectSpan.start, wetCand.subjectSpan.end)).toBe('socket');
      expect(a.normalizedText.slice(wetCand.predicateSpan.start, wetCand.predicateSpan.end)).toBe('wet');
      expect(wetCand.valid).toBe(true);
    });

    it('12.4 different temporality per coordinated predicate: "reached" is historical, "entering" is current', () => {
      const a = analyzeWaterElectricalRelationships('Water reached the floor yesterday and is entering the socket.');
      const reachedCand = a.candidates.find((c) => a.normalizedText.slice(c.relationSpan.start, c.relationSpan.end) === 'reached');
      const enteringCand = a.candidates.find((c) => a.normalizedText.slice(c.relationSpan.start, c.relationSpan.end) === 'entering');
      expect(reachedCand).toBeFalsy();
      expect(enteringCand).toBeTruthy();
      expect(enteringCand.temporality).toBe('current');
    });

    it('12.5 unrelated hypothetical ("if the gate is open") leaves the water/socket candidate actual/current', () => {
      const a = analyzeWaterElectricalRelationships('Please tell me if the gate is open while water is entering the socket.');
      const cand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
      expect(cand).toBeTruthy();
      expect(cand.modality).toBe('actual');
      expect(cand.temporality).toBe('current');
    });

    it('12.6 span integrity: every valid candidate span slices back to the exact expected text', () => {
      const cases = [
        'Water reached the electrical socket.',
        'The socket is wet.',
        'Water is in contact with wiring.',
        'Water is near the socket.',
        'There is water inside the electrical panel.',
        'Water and electricity are mixing at the socket.',
      ];
      for (const q of cases) {
        const a = analyzeWaterElectricalRelationships(q);
        const validCand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
        expect(validCand).toBeTruthy();
        const elecMention = a.mentions.find((m) => m.id === validCand.electricalMentionId);
        expect(a.normalizedText.slice(validCand.electricalSpan.start, validCand.electricalSpan.end)).toBe(elecMention.text.toLowerCase());
      }
    });
  });
});

describe('Phase 3A round-11 hardening — genuine span-based candidate model (analyzeWaterElectricalRelationships)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('13.1 Adversarial negative cases (25-case set, section A)', () => {
    it('Water prices are reaching the electricity price cap.', () => {
      const q = 'Water prices are reaching the electricity price cap.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(false);
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(false);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('The Water Committee reached the electrical panel to inspect it.', () => {
      const q = 'The Water Committee reached the electrical panel to inspect it.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water went through the pipe while the electrical panel works normally.', () => {
      const q = 'Water went through the pipe while the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water entered the bathroom where the electrical panel documentation is stored.', () => {
      const q = 'Water entered the bathroom where the electrical panel documentation is stored.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water is near the bathroom while the electrical panel works normally.', () => {
      const q = 'Water is near the bathroom while the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water is inside the bathroom while the electrical panel works normally.', () => {
      const q = 'Water is inside the bathroom while the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water is stored in a tank that is in contact with a metal bracket while the electrical panel works normally.', () => {
      const q = 'Water is stored in a tank that is in contact with a metal bracket while the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water is in the kitchen while the electrician is mixing paint with an electrical mixer.', () => {
      const q = 'Water is in the kitchen while the electrician is mixing paint with an electrical mixer.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('The electrical panel installer has water in his bottle.', () => {
      const q = 'The electrical panel installer has water in his bottle.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water reached the socket wrench.', () => {
      const q = 'Water reached the socket wrench.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water reached the discussion panel.', () => {
      const q = 'Water reached the discussion panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('Water is reaching the light-blue paint.', () => {
      const q = 'Water is reaching the light-blue paint.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('The lamp was wet-tested at the factory.', () => {
      const q = 'The lamp was wet-tested at the factory.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('The socket is wet-paint resistant.', () => {
      const q = 'The socket is wet-paint resistant.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('El instalador eléctrico tiene agua en su botella.', () => {
      const q = 'El instalador eléctrico tiene agua en su botella.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('13.2 Adversarial current-positive cases (25-case set, section B)', () => {
    it('Water did not damage the floor and is entering the socket.', () => {
      const q = 'Water did not damage the floor and is entering the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(true);
      expect(detectEmergency(q)).toBe(true);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(true);
    });
    it('Water is not near the first socket and is entering the second socket.', () => {
      const q = 'Water is not near the first socket and is entering the second socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('The socket is not damaged but is wet from water.', () => {
      const q = 'The socket is not damaged but is wet from water.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('Water reached the floor yesterday and is entering the socket.', () => {
      const q = 'Water reached the floor yesterday and is entering the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('Yesterday I checked the lamp while water is entering the socket.', () => {
      const q = 'Yesterday I checked the lamp while water is entering the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('If you can, send help: water is entering the socket.', () => {
      const q = 'If you can, send help: water is entering the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('Please tell me if the gate is open while water is entering the socket.', () => {
      const q = 'Please tell me if the gate is open while water is entering the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('El agua no dañó el suelo y está entrando en el enchufe.', () => {
      const q = 'El agua no dañó el suelo y está entrando en el enchufe.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it("L'eau n'a pas abîmé le sol et entre dans la prise.", () => {
      const q = "L'eau n'a pas abîmé le sol et entre dans la prise.";
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('Wasser hat den Boden nicht beschädigt und dringt in die Steckdose ein.', () => {
      const q = 'Wasser hat den Boden nicht beschädigt und dringt in die Steckdose ein.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
  });

  describe('12. Diagnostic architectural tests (analyzeWaterElectricalRelationships internals)', () => {
    it('12.1 wrong destination: "electrical panel" inside a relative clause is not the destination of "entered"', () => {
      const a = analyzeWaterElectricalRelationships('Water entered the bathroom where the electrical panel documentation is stored.');
      const validPositive = a.candidates.filter((c) => c.valid && c.polarity === 'positive');
      expect(validPositive.length).toBe(0);
    });

    it('12.2 two predicates, different polarity: proximity/negative + directional/positive aggregate correctly', () => {
      const a = analyzeWaterElectricalRelationships('Water is not near the first socket and is entering the second socket.');
      const proximity = a.candidates.find((c) => c.family === 'proximity');
      const directional = a.candidates.find((c) => c.family === 'directional');
      expect(proximity.polarity).toBe('negative');
      expect(directional.polarity).toBe('positive');
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(true);
    });

    it('12.3 shared subject via "but": wet_state candidate has exact subjectSpan="socket" and predicateSpan="wet"', () => {
      const a = analyzeWaterElectricalRelationships('The socket is not damaged but is wet from water.');
      const wetCand = a.candidates.find((c) => c.family === 'wet_state' && c.polarity === 'positive');
      expect(wetCand).toBeTruthy();
      expect(a.normalizedText.slice(wetCand.subjectSpan.start, wetCand.subjectSpan.end)).toBe('socket');
      expect(a.normalizedText.slice(wetCand.predicateSpan.start, wetCand.predicateSpan.end)).toBe('wet');
      expect(wetCand.polarity).toBe('positive');
      expect(wetCand.valid).toBe(true);
    });

    it('12.4 different temporality: "reached" is historical, "entering" is current, independently', () => {
      const a = analyzeWaterElectricalRelationships('Water reached the floor yesterday and is entering the socket.');
      const enteringCand = a.candidates.find((c) => a.normalizedText.slice(c.relationSpan.start, c.relationSpan.end) === 'entering');
      expect(enteringCand).toBeTruthy();
      expect(enteringCand.temporality).toBe('current');
      expect(enteringCand.polarity).toBe('positive');
    });

    it('12.5 unrelated hypothetical: "if the gate is open" does not make the water/socket candidate hypothetical', () => {
      const a = analyzeWaterElectricalRelationships('Please tell me if the gate is open while water is entering the socket.');
      const validCand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
      expect(validCand).toBeTruthy();
      expect(validCand.modality).toBe('actual');
      expect(validCand.temporality).toBe('current');
    });

    it('12.6 span integrity: electricalSpan text for a directional candidate matches the actual electrical mention text', () => {
      const q = 'Water reached the electrical socket.';
      const a = analyzeWaterElectricalRelationships(q);
      const cand = a.candidates.find((c) => c.valid && c.family === 'directional');
      expect(cand).toBeTruthy();
      const elecMention = a.mentions.find((m) => m.id === cand.electricalMentionId);
      const spanText = a.normalizedText.slice(cand.electricalSpan.start, cand.electricalSpan.end);
      expect(spanText).toBe(elecMention.text.toLowerCase());
    });
  });
});

describe('Phase 3A round-12 hardening — clause-scoped subject/object binding, raw-span integrity, disjoint negation/modality', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('15.1 No water/electrical relationship (8 cases)', () => {
    it('sentence boundary: water in one sentence, technician+panel in the next', () => {
      const q = 'Water is on the floor. The technician reached the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(false);
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(false);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('explicit foreign subject: "the technician", not water, reached the socket', () => {
      const q = 'Water remained outside while the technician reached the socket.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('wrong destination: bathroom, not the electrical panel, is the destination of "entered"', () => {
      const q = 'Water entered the bathroom before the electrical panel was inspected.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('separate clauses via comma+then: door reached, socket separately inspected', () => {
      const q = 'Water reached the door, then the socket was inspected.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('contact relation belongs to wall<->wiring-inspection, not water<->wiring', () => {
      const q = 'Water is in contact with the wall while the wiring is being inspected.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('containment: water is inside a sealed bottle, not the electrical panel', () => {
      const q = 'Water is inside a sealed bottle while the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('true containment container is "bottle", subject is "technician" (a person)', () => {
      const q = 'The technician next to the electrical panel has water in his bottle.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"water pump" head is non-hazard (a device), not liquid water', () => {
      const q = 'The water pump reached the socket during installation.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('15.2 Informational — possibility, hypothetical, or future (12 cases)', () => {
    it('EN capability modal "can reach"', () => {
      const q = 'Water can reach the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(false);
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('ES capability modal "puede entrar"', () => {
      const q = 'El agua puede entrar en el enchufe.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('FR capability modal "peut atteindre"', () => {
      const q = "L'eau peut atteindre la prise.";
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('DE capability modal "kann erreichen" (verb-final)', () => {
      const q = 'Wasser kann die Steckdose erreichen.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('EN future "will enter tomorrow"', () => {
      const q = 'Water will enter the socket tomorrow.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('ES future "entrará mañana"', () => {
      const q = 'El agua entrará en el enchufe mañana.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('FR future "entrera demain"', () => {
      const q = "L'eau entrera dans la prise demain.";
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('DE future "wird...morgen erreichen"', () => {
      const q = 'Wasser wird die Steckdose morgen erreichen.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('EN hypothetical "Suppose water enters"', () => {
      const q = 'Suppose water enters the socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('EN hypothetical "In case water enters"', () => {
      const q = 'In case water enters the socket, call security.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('EN question modal "Could water enter"', () => {
      const q = 'Could water enter the socket?';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('EN conditional gerund "Would water entering...be dangerous"', () => {
      const q = 'Would water entering the socket be dangerous?';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('15.3 Informational — historical incidents (4 cases)', () => {
    it('EN "two hours ago"', () => {
      const q = 'Water entered the socket two hours ago.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('EN "last night"', () => {
      const q = 'The socket was wet last night.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('ES "hace dos horas"', () => {
      const q = 'El agua entró en el enchufe hace dos horas.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('DE "vor zwei Stunden"', () => {
      const q = 'Wasser gelangte vor zwei Stunden in die Steckdose.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('15.4 Actively observed current incident (2 cases)', () => {
    it('EN evidential "can be seen entering...now"', () => {
      const q = 'Water can be seen entering the socket now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(true);
      expect(detectEmergency(q)).toBe(true);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(true);
    });
    it('ES evidential "puede verse entrando...ahora"', () => {
      const q = 'El agua puede verse entrando en el enchufe ahora.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(hasDangerousCombo(q)).toBe(true);
      expect(detectEmergency(q)).toBe(true);
    });
  });

  describe('14. Diagnostic architectural tests', () => {
    it('14.1 sentence boundary: no valid candidate crosses it', () => {
      const a = analyzeWaterElectricalRelationships('Water is on the floor. The technician reached the electrical panel.');
      expect(a.candidates.filter((c) => c.valid && c.polarity === 'positive').length).toBe(0);
    });

    it('14.2 explicit foreign subject: no water/electrical directional candidate', () => {
      const a = analyzeWaterElectricalRelationships('Water remained outside while the technician reached the socket.');
      expect(a.candidates.filter((c) => c.valid && c.polarity === 'positive' && c.family === 'directional').length).toBe(0);
    });

    it('14.3 wrong destination: electrical panel is not the destination of "entered"', () => {
      const a = analyzeWaterElectricalRelationships('Water entered the bathroom before the electrical panel was inspected.');
      expect(a.candidates.filter((c) => c.valid && c.polarity === 'positive').length).toBe(0);
    });

    it('14.4 true containment container is the person\'s bottle, not the panel', () => {
      const a = analyzeWaterElectricalRelationships('The technician next to the electrical panel has water in his bottle.');
      expect(a.candidates.filter((c) => c.valid && c.polarity === 'positive').length).toBe(0);
    });

    it('14.5 modality is not negation: "can reach" is positive polarity, non-actual modality', () => {
      const a = analyzeWaterElectricalRelationships('Water can reach the socket.');
      const cand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
      expect(cand).toBeTruthy();
      expect(cand.polarity).toBe('positive');
      expect(cand.modality).not.toBe('actual');
    });

    it('14.6 future temporality is recognized and does not count as current', () => {
      const a = analyzeWaterElectricalRelationships('Water will enter the socket tomorrow.');
      const cand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
      expect(cand).toBeTruthy();
      expect(cand.temporality).toBe('future');
      expect(a.anyCurrentRelationship).toBe(false);
    });

    it('14.7 historical temporality is recognized and does not count as current', () => {
      const a = analyzeWaterElectricalRelationships('Water entered the socket two hours ago.');
      const cand = a.candidates.find((c) => c.valid && c.polarity === 'positive');
      expect(cand).toBeTruthy();
      expect(cand.temporality).toBe('historical');
      expect(a.anyCurrentRelationship).toBe(false);
    });

    it('14.8 span integrity survives German ß->ss normalization', () => {
      const raw = 'Großes Wasser erreicht die Steckdose.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates[0];
      expect(cand).toBeTruthy();
      expect(raw.slice(cand.waterEvidenceSpan.start, cand.waterEvidenceSpan.end)).toBe('Wasser');
      expect(raw.slice(cand.electricalSpan.start, cand.electricalSpan.end)).toBe('Steckdose');
      expect(raw.slice(cand.relationSpan.start, cand.relationSpan.end)).toBe('erreicht');
      expect(raw.slice(cand.subjectSpan.start, cand.subjectSpan.end)).toBe('Wasser');
      expect(raw.slice(cand.objectOrDestinationSpan.start, cand.objectOrDestinationSpan.end)).toBe('Steckdose');
    });

    it('14.9 mention completeness: modal/water/relation/electrical/temporal kinds all present with valid candidate references', () => {
      const q = 'If water can reach the socket tomorrow, call security.';
      const a = analyzeWaterElectricalRelationships(q);
      const kinds = new Set(a.mentions.map((m) => m.kind));
      expect(kinds.has('water')).toBe(true);
      expect(kinds.has('electrical')).toBe(true);
      expect(kinds.has('relation')).toBe(true);
      expect(kinds.has('modal')).toBe(true);
      expect(kinds.has('temporal')).toBe(true);
      const cand = a.candidates.find((c) => c.valid);
      expect(cand).toBeTruthy();
      expect(a.mentions.some((m) => m.id === cand.waterMentionId)).toBe(true);
      expect(a.mentions.some((m) => m.id === cand.electricalMentionId)).toBe(true);
    });
  });
});

describe('Phase 3A round-13 hardening — genuine predicate-argument binding (containment water-object, participial/control-verb subjects, destination-vs-adjunct, reported/tested/imagined complements)', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('4.1 No water/electrical relationship (17 cases)', () => {
    it('containment without a water object: "contains a fuse"', () => {
      const q = 'The electrical panel contains a fuse.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(false);
    });
    it('containment without a water object: "contains dry insulation"', () => {
      const q = 'The electrical panel contains dry insulation.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('containment without a water object: "contains a water sensor" (device, not liquid)', () => {
      const q = 'The electrical panel contains a water sensor.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"water resistance" is a compound spec, not liquid water', () => {
      const q = 'The electrical panel has water resistance.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"water bottle" head is a container, not liquid water', () => {
      const q = 'The water bottle reached the electrical socket.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"water meter" head is a device, not liquid water', () => {
      const q = 'The water meter reached the electrical socket.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"carrying water" - water is the object of a participial modifier, not the clause subject', () => {
      const q = 'The technician carrying water reached the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"who carried water" - water is the object within a relative clause', () => {
      const q = 'The technician who carried water reached the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"prevented water reaching" - water is the object of a control verb', () => {
      const q = 'The technician prevented water reaching the electrical socket.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('colon boundary separates two independent statements', () => {
      const q = 'Water entered the bathroom: the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('em-dash boundary separates two independent statements', () => {
      const q = 'Water entered the bathroom — the electrical panel works normally.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"with the electrical panel" is an accompaniment adjunct, not the destination', () => {
      const q = 'Water entered the bathroom with the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"beside the electrical panel" modifies the technician, not the destination of "reached"', () => {
      const q = 'Water reached the technician beside the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('containment argument is "bottle", "beside the electrical panel" is a separate adjunct', () => {
      const q = 'Water is inside a sealed bottle beside the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('contact argument is "bracket", "beside the electrical panel" is a separate adjunct', () => {
      const q = 'Water is in contact with a metal bracket beside the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('proximity argument is "bathroom", "beside the electrical panel" is a separate adjunct', () => {
      const q = 'Water is near the bathroom beside the electrical panel.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('mixing argument is "paint", "beside the electrical panel" is a separate adjunct', () => {
      const q = 'The electrician beside the electrical panel is mixing water and paint.';
      expect(primaryFor(q)).not.toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('4.2 Actual current positive incidents (5 cases)', () => {
    it('"no doubt" is not a negation of the water/electrical predicate', () => {
      const q = 'No doubt water is entering the electrical socket now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('reported current observation ("says") is actual, not suppressed', () => {
      const q = 'A resident says water is entering the electrical socket now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('evidential "can see" is an actual current observation, not mere capability', () => {
      const q = 'I can see water entering the electrical socket now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('evidential "can hear" is an actual current observation, not mere capability', () => {
      const q = 'I can hear water dripping into the electrical panel now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
    it('prenominal participle "damaged" does not end the destination window', () => {
      const q = 'Water is entering the damaged electrical panel now.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(true);
    });
  });

  describe('4.3 Informational/hypothetical complements (2 cases)', () => {
    it('"tested whether" is an uncertain complement, not a current emergency', () => {
      const q = 'We tested whether water reached the electrical socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
      const a = analyzeWaterElectricalRelationships(q);
      expect(a.anyRelationshipAtAll).toBe(true);
      expect(a.anyCurrentRelationship).toBe(false);
    });
    it('"imagined" is a hypothetical complement, not a current emergency', () => {
      const q = 'I imagined water entering the electrical socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('5. Mandatory positive regression checks (must not be broken by the round-13 fixes)', () => {
    it('The electrical socket contains water.', () => {
      expect(primaryFor('The electrical socket contains water.')).toBe('ELE-05');
      expect(detectEmergency('The electrical socket contains water.')).toBe(true);
    });
    it('The socket has water in it.', () => {
      expect(primaryFor('The socket has water in it.')).toBe('ELE-05');
      expect(detectEmergency('The socket has water in it.')).toBe(true);
    });
    it('There is water inside the electrical panel.', () => {
      expect(primaryFor('There is water inside the electrical panel.')).toBe('ELE-05');
      expect(detectEmergency('There is water inside the electrical panel.')).toBe(true);
    });
    it('Water is in direct contact with the wiring.', () => {
      expect(primaryFor('Water is in direct contact with the wiring.')).toBe('ELE-05');
      expect(detectEmergency('Water is in direct contact with the wiring.')).toBe(true);
    });
    it('Water and electricity are mixing at the socket.', () => {
      expect(primaryFor('Water and electricity are mixing at the socket.')).toBe('ELE-05');
      expect(detectEmergency('Water and electricity are mixing at the socket.')).toBe(true);
    });
    it('Water is next to exposed wiring.', () => {
      expect(primaryFor('Water is next to exposed wiring.')).toBe('ELE-05');
      expect(detectEmergency('Water is next to exposed wiring.')).toBe(true);
    });
    it('Water entered the damaged electrical panel.', () => {
      expect(primaryFor('Water entered the damaged electrical panel.')).toBe('ELE-05');
      expect(detectEmergency('Water entered the damaged electrical panel.')).toBe(true);
    });
    it('A resident says that water is entering the socket now.', () => {
      expect(primaryFor('A resident says that water is entering the socket now.')).toBe('ELE-05');
      expect(detectEmergency('A resident says that water is entering the socket now.')).toBe(true);
    });
    it('Status update: water is entering the electrical socket now.', () => {
      expect(primaryFor('Status update: water is entering the electrical socket now.')).toBe('ELE-05');
      expect(detectEmergency('Status update: water is entering the electrical socket now.')).toBe(true);
    });
    it('The socket is getting wet from water running down the wall.', () => {
      expect(primaryFor('The socket is getting wet from water running down the wall.')).toBe('ELE-05');
      expect(detectEmergency('The socket is getting wet from water running down the wall.')).toBe(true);
    });
  });

  describe('6. Candidate diagnostic invariants', () => {
    it('containment candidate references a genuine liquid_water mention as its object', () => {
      const a = analyzeWaterElectricalRelationships('The electrical socket contains water.');
      const cand = a.candidates.find((c) => c.valid && c.family === 'containment');
      expect(cand).toBeTruthy();
      expect(cand.waterMentionId).not.toBeNull();
      const waterMention = a.mentions.find((m) => m.id === cand.waterMentionId);
      expect(waterMention.kind).toBe('water');
      expect(waterMention.entityType).toBe('liquid_water');
    });
    it('containment without a water object never becomes a valid candidate ("contains a fuse")', () => {
      const a = analyzeWaterElectricalRelationships('The electrical panel contains a fuse.');
      expect(a.candidates.filter((c) => c.valid && c.family === 'containment' && c.polarity === 'positive').length).toBe(0);
    });
    it('wet_state candidate has waterMentionId=null (implicit moisture evidence is valid for this family only)', () => {
      const a = analyzeWaterElectricalRelationships('The socket is wet.');
      const cand = a.candidates.find((c) => c.valid && c.family === 'wet_state');
      expect(cand).toBeTruthy();
      expect(cand.waterMentionId).toBeNull();
    });
    it('directional candidate references both a water and an electrical mention', () => {
      const a = analyzeWaterElectricalRelationships('Water reached the electrical socket.');
      const cand = a.candidates.find((c) => c.valid && c.family === 'directional');
      expect(cand).toBeTruthy();
      expect(cand.waterMentionId).not.toBeNull();
      expect(cand.electricalMentionId).not.toBeNull();
    });
    it('contact candidate endpoints are arguments of the same relation occurrence, not merely clause co-present', () => {
      const a = analyzeWaterElectricalRelationships('Water is in contact with a metal bracket beside the electrical panel.');
      expect(a.candidates.filter((c) => c.valid && c.family === 'contact' && c.polarity === 'positive').length).toBe(0);
    });
    it('relationSpan is the specific predicate phrase, not the whole clause', () => {
      const raw = 'There is water inside the electrical panel.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates.find((c) => c.valid && c.family === 'containment');
      expect(cand).toBeTruthy();
      expect(cand.relationSpan.end - cand.relationSpan.start).toBeLessThan(raw.length);
    });
    it('all candidate spans are valid raw-text offsets whose substrings match the declared evidence', () => {
      const raw = 'Water reached the electrical socket.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates.find((c) => c.valid);
      expect(cand).toBeTruthy();
      expect(raw.slice(cand.waterEvidenceSpan.start, cand.waterEvidenceSpan.end).toLowerCase()).toBe('water');
      expect(['electrical', 'socket']).toContain(raw.slice(cand.electricalSpan.start, cand.electricalSpan.end).toLowerCase());
    });
    it('a candidate never references a mention from a different sentence', () => {
      const a = analyzeWaterElectricalRelationships('Water is on the floor. The technician reached the electrical panel.');
      expect(a.candidates.filter((c) => c.valid && c.polarity === 'positive').length).toBe(0);
    });
    it('negation is bound to the specific predicate, represented as polarity=negative, not silently dropped', () => {
      const a = analyzeWaterElectricalRelationships('Water cannot reach the electrical socket.');
      const negCand = a.candidates.find((c) => c.family === 'directional');
      expect(negCand).toBeTruthy();
      expect(negCand.polarity).toBe('negative');
    });
    it('modality and temporality are bound per-candidate, not globally suppressed', () => {
      const a = analyzeWaterElectricalRelationships('Water reached the floor yesterday and is entering the socket.');
      const enteringCand = a.candidates.find((c) => a.normalizedText.slice(c.relationSpan.start, c.relationSpan.end) === 'entering');
      expect(enteringCand).toBeTruthy();
      expect(enteringCand.temporality).toBe('current');
    });
    it('a rejected pairing (mismatched relation arguments) does not silently promote to a positive candidate', () => {
      const a = analyzeWaterElectricalRelationships('Water is near the bathroom beside the electrical panel.');
      expect(a.anyRelationshipAtAll).toBe(false);
      expect(a.anyCurrentRelationship).toBe(false);
    });
  });
});

describe('Phase 3A round-14 hardening — expanded semantic-family vocabulary, matrix-predicate context (denial/evidence-absent/reported-perception), evidential scope narrowing, historical markers, relationSpan precision', () => {
  const entries = [
    { intent_code: 'ELE-05', category: 'Electricity', keywords: ['water through light', 'wet socket'], logic_json: { example_user_queries: [] } },
  ];
  function primaryFor(q) {
    const r = retrieveRelevantEntries(entries, q);
    return r.entries.length > 0 ? r.entries[0].intent_code : null;
  }

  describe('6.1/6.2 Actual current positive incidents — EN + ES/FR/DE (21 cases)', () => {
    const cases = [
      'Water is flowing into the electrical panel now.',
      'Water is pouring into the electrical socket now.',
      'Water is seeping into the wiring now.',
      'Water splashed onto the electrical panel.',
      'Water touched exposed wiring.',
      'Water has made contact with the wiring.',
      'There is water in the electrical socket.',
      'Moisture is inside the electrical panel.',
      'Rainwater reached the electrical socket.',
      'A resident reports seeing water enter the electrical socket now.',
      'I can clearly see water entering the electrical socket now.',
      'I can actually hear water dripping into the panel now.',
      'No question, water is entering the electrical socket now.',
      'Not only is water near the socket, it is entering it.',
      'Hay agua en el enchufe eléctrico.',
      'El agua fluye hacia el cuadro eléctrico ahora.',
      'Hay humedad dentro del cuadro eléctrico.',
      "L'eau s'infiltre dans le tableau électrique maintenant.",
      "Il y a de l'eau dans la prise électrique.",
      'Wasser fließt jetzt in die Steckdose.',
      'Feuchtigkeit ist im Schaltschrank.',
    ];
    for (const q of cases) {
      it(q, () => {
        expect(primaryFor(q)).toBe('ELE-05');
        expect(detectEmergency(q)).toBe(true);
      });
    }
  });

  describe('6.3 Informational/historical/denial complements (8 cases)', () => {
    it('"used to" is historical, not current', () => {
      const q = 'Water used to enter the electrical socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"previously" is historical, not current', () => {
      const q = 'Water entered the electrical socket previously.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"Last Monday" is historical, not current', () => {
      const q = 'Last Monday water entered the electrical socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('evidential scope does not leak into a nested possibility predicate ("according to what I can see")', () => {
      const q = 'Water could reach the socket according to what I can see.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('"can see X could reach" - the evidential governs perception, not the embedded possibility', () => {
      const q = 'I can see water could reach the electrical socket.';
      expect(primaryFor(q)).toBe('ELE-05');
      expect(detectEmergency(q)).toBe(false);
    });
    it('denied-that complement is not a current emergency', () => {
      const q = 'The resident denied that water was entering the electrical socket.';
      expect(detectEmergency(q)).toBe(false);
    });
    it('evidence-absent complement is not a current emergency', () => {
      const q = 'There is no evidence that water is entering the electrical socket.';
      expect(detectEmergency(q)).toBe(false);
    });
    it('doubted complement is not a current emergency', () => {
      const q = 'The resident doubted water was entering the electrical socket.';
      expect(detectEmergency(q)).toBe(false);
    });
  });

  describe('6.4 Negative binding cases (7 cases)', () => {
    const cases = [
      'The technician carrying water placed tools inside the electrical panel.',
      'The technician carrying water stored equipment inside the electrical panel.',
      'The technician carrying water observed a bracket in contact with the wiring.',
      'The plumber carrying water stood near the electrical panel.',
      'The worker inspected the electrical panel then mixed water and paint.',
      'The resident denied water reached the electrical socket.',
      'The barrier avoided water reaching the electrical socket.',
    ];
    for (const q of cases) {
      it(q, () => {
        expect(primaryFor(q)).not.toBe('ELE-05');
        expect(detectEmergency(q)).toBe(false);
      });
    }
  });

  describe('J. relationSpan precision for contact/proximity/mixing (must not be the whole clause)', () => {
    it('proximity relationSpan is "near", not the full sentence', () => {
      const raw = 'Water is near the electrical socket.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates.find((c) => c.valid && c.family === 'proximity');
      expect(cand).toBeTruthy();
      expect(raw.slice(cand.relationSpan.start, cand.relationSpan.end).toLowerCase()).toBe('near');
    });
    it('contact relationSpan is "in direct contact with", not the full sentence', () => {
      const raw = 'Water is in direct contact with the wiring.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates.find((c) => c.valid && c.family === 'contact');
      expect(cand).toBeTruthy();
      expect(raw.slice(cand.relationSpan.start, cand.relationSpan.end).toLowerCase()).toBe('in direct contact with');
    });
    it('mixing relationSpan is "mixing", not the full sentence', () => {
      const raw = 'Water and electricity are mixing at the socket.';
      const a = analyzeWaterElectricalRelationships(raw);
      const cand = a.candidates.find((c) => c.valid && c.family === 'mixing');
      expect(cand).toBeTruthy();
      expect(raw.slice(cand.relationSpan.start, cand.relationSpan.end).toLowerCase()).toBe('mixing');
    });
  });
});
