-- ============================================================
-- Session 13 — Evacuation & Emergency Plan obohatenie
--
-- Kľúčový princíp z tohto dokumentu: pri plošných katastrofách
-- (wildfire, zemetrasenie, veľká povodeň) AI nesmie sama
-- rozhodnúť EVACUATE vs SHELTER — to sa už rieši na úrovni
-- system promptu (AI_BEHAVIOR_RULES v route.js). Táto migrácia
-- dopĺňa konkrétne scenáre o presné kroky z dokumentu.
-- ============================================================

-- ---------- FIR-01: shelter-in-place vetva pre zadymené schodisko ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{immediate_actions}'::text[],
  (logic_json->'immediate_actions') || '["If the stairwell or corridor is filled with smoke, do NOT walk through it - seal yourself in a room with a window or terrace, close the door between you and the fire, block gaps to keep smoke out, call 112 and state your exact block and apartment number, and signal from the window/terrace."]'::jsonb
)
where intent_code = 'FIR-01';

update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{do_not}'::text[],
  (logic_json->'do_not') || '["Do not walk blindly through a smoke-filled stairwell or corridor."]'::jsonb
)
where intent_code = 'FIR-01';

-- ---------- WEA-01 (flash flood): "move up, not down" + nepribliehat sa automaticky ku Gatehouse ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{immediate_actions}'::text[],
  (logic_json->'immediate_actions') || '["Move to a higher floor or higher ground rather than heading toward the main gate/Gatehouse by default - low-lying areas and access roads can flood first."]'::jsonb
)
where intent_code = 'WEA-01';

-- ---------- WEA-04 (zemetrasenie): ochrana hlavy/krku, pevný nábytok ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{immediate_actions}'::text[],
  '[
    "During shaking: protect your head and neck, move away from windows/glass, and get near sturdy furniture or against an interior wall.",
    "Do not rush onto stairs or use an elevator during shaking.",
    "After shaking stops, check for injuries, fire, gas smell, water leaks and obvious structural damage.",
    "Move away from visibly damaged areas and follow official instructions.",
    "Use stairs, not elevators, if evacuation is required.",
    "Be prepared for aftershocks, and do not re-enter a visibly damaged building without an official safety clearance."
  ]'::jsonb
)
where intent_code = 'WEA-04';

-- ---------- Nový scenár: WEA-05 lesný požiar / urban-wildland fire ----------
insert into ai_knowledge_base (intent_code, title, category, urgency, keywords, content, active, version, logic_json)
values (
  'WEA-05',
  'Wildfire / forest fire visible or reported nearby',
  'Weather & Natural Hazards',
  'red',
  '{"wildfire","forest fire","bushfire","fire in the hills","smoke in the distance","evacuation order"}',
  'Do not evacuate automatically just because smoke or fire is visible in the distance - wait for an official instruction from 112/INFOCA/Policía. If evacuation is officially ordered, take only your phone, keys, essential medication and those with you; close windows/doors; turn off air conditioning; shut off gas if safe to do so; follow the route given by emergency services; avoid valleys/ravines and avoid heading uphill in the direction the fire is spreading. If instead told to shelter, stay inside, close windows/doors, lower blinds, turn off AC, shut off gas if safe, stay together in a safe part of the apartment and tell 112 your location.',
  true,
  1,
  '{
    "example_user_queries": [
      "There is a wildfire near the community.",
      "I can see smoke from a forest fire in the distance.",
      "Should we evacuate because of the fire in the hills?"
    ],
    "immediate_actions": [
      "Do not evacuate automatically just because smoke or fire is visible in the distance - wait for an official instruction from 112/INFOCA/Policía.",
      "If evacuation is officially ordered: take only your phone, keys, essential medication and those with you; close windows and doors; turn off air conditioning; shut off gas if it can be done safely.",
      "If evacuating, follow the exact route given by emergency services - avoid valleys/ravines (barrancos) and avoid heading uphill in the direction the fire is spreading.",
      "If instead told to shelter in place: stay inside, close windows/doors, lower blinds/shutters, turn off AC, shut off gas if safe, stay together in a safe interior part of the apartment, and tell 112 your location."
    ],
    "do_not": [
      "Do not decide to evacuate or shelter on your own for a fire that is still at a distance - wait for the official instruction.",
      "Do not drive through smoke or toward the fire front.",
      "Do not evacuate downhill into a valley/ravine if the fire is spreading that way - follow the officially designated route instead."
    ],
    "contact_route": ["112 / INFOCA / official instruction", "Security/24H community emergency for community-specific coordination"],
    "call_112_when": ["Any wildfire visible near the community, regardless of current distance, so authorities can assess and issue instructions."],
    "documentation": [],
    "follow_up": ["Once the situation is resolved, check community communications/[24H_COMMUNITY_EMERGENCY_PHONE] for an all-clear before resuming normal activity."],
    "followup_modules": [],
    "incident_flags": ["weather_or_natural_event", "wildfire"],
    "source_status_default": "external_or_unknown",
    "clarifying_questions": [],
    "post_incident_branching": [],
    "related_intents": ["WEA-01", "WEA-02", "SAF-06"]
  }'::jsonb
)
on conflict (intent_code) do update set
  title = excluded.title,
  category = excluded.category,
  urgency = excluded.urgency,
  keywords = excluded.keywords,
  content = excluded.content,
  logic_json = excluded.logic_json;

-- ---------- EVACUATION_MEETING_POINT: bezpečnostná spresnenie ----------
-- Dôležité: zhromaždisko obyvateľov by NEMALO byť priamo pred Gatehouse,
-- lebo prístupová cesta tam musí zostať voľná pre hasičov/ambulanciu/
-- políciu. Toto pole teda opisuje situáciu presnejšie, kým Committee
-- fyzicky neurčí presný bod zhromaždenia mimo prístupovej cesty.
update community_config
set value = 'Main Gatehouse is the primary emergency vehicle access and evacuation exit route out of the community. The exact resident assembly/gathering point should be an open area near the entrance but NOT blocking the access road (which must stay clear for fire engines/ambulances/police) - the precise spot is still to be physically confirmed by the Committee.'
where key = 'EVACUATION_MEETING_POINT';
