-- ============================================================
-- Session 15 — OPRAVA chyby zo Session 13
--
-- Migrácia 20260828000000 omylom vytvorila/prepísala WEA-05 s
-- obsahom o lesnom požiari, ale WEA-05 už existovalo ako
-- "Tsunami / coastal evacuation alert" (z pôvodného V2 importu
-- v Session 7). Keďže mala ON CONFLICT (intent_code) DO UPDATE,
-- reálne PREPÍSALA tsunami scenár. Táto migrácia:
--   1) obnoví WEA-05 presne na pôvodný tsunami obsah
--   2) presunie wildfire-špecifické vylepšenia (nerozhodovať
--      EVACUATE/SHELTER sám, vyhýbať sa roklinám/kopcu) do
--      WEA-03, kde mali byť od začiatku
-- ============================================================

-- ---------- 1) Obnoviť WEA-05 na pôvodný Tsunami obsah ----------
update ai_knowledge_base
set
  title = 'Tsunami / coastal evacuation alert',
  category = 'Weather & Natural Hazards',
  urgency = 'red',
  keywords = '{"tsunami","maremoto","coastal evacuation","sea warning"}',
  content = 'Treat an official tsunami/coastal evacuation alert as urgent. Move away from the coast and low-lying areas by the instructed route and do not go to the beach to observe conditions. Do not return until authorities declare it safe.',
  logic_json = '{
    "example_user_queries": [
      "There is a tsunami warning.",
      "We received a coastal evacuation alert.",
      "Should we go to the beach to see what is happening?"
    ],
    "immediate_actions": [
      "Follow official emergency/Civil Protection evacuation instructions immediately.",
      "Move away from the coast and low-lying areas using the designated or instructed route.",
      "Take essential medication, phone, identification and keys if immediately available.",
      "Do not return until authorities say it is safe."
    ],
    "do_not": [
      "Do not go to the coast to observe the sea.",
      "Do not delay evacuation to collect non-essential belongings."
    ],
    "contact_route": ["112 / official authorities", "Community emergency contact"],
    "call_112_when": ["Use 112 if immediate assistance is needed; otherwise follow the official alert/evacuation system."],
    "documentation": [],
    "follow_up": [],
    "followup_modules": ["INCIDENT_RECORD", "WEATHER_DAMAGE_CLAIM", "INSURANCE_GENERAL"],
    "incident_flags": ["weather_or_natural_event", "property_damage_possible", "common_area_possible"],
    "source_status_default": "external_or_unknown",
    "clarifying_questions": [],
    "post_incident_branching": [],
    "related_intents": []
  }'::jsonb
where intent_code = 'WEA-05';

-- ---------- 2) Presunúť wildfire vylepšenia do WEA-03 (kde mali ísť) ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{immediate_actions}'::text[],
  (logic_json->'immediate_actions') || '["Do not decide to evacuate on your own just because smoke or fire is visible in the distance - the immediate_actions above already tell you to follow official instructions; wait for that instruction before acting.", "If evacuation is officially ordered, avoid routes toward valleys/ravines (barrancos) and avoid heading uphill in the direction the fire is spreading."]'::jsonb
)
where intent_code = 'WEA-03';

update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{do_not}'::text[],
  (logic_json->'do_not') || '["Do not evacuate downhill into a valley/ravine if the fire is spreading that way - follow the officially designated route instead."]'::jsonb
)
where intent_code = 'WEA-03';

update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{related_intents}'::text[],
  '["WEA-01", "WEA-02", "SAF-06"]'::jsonb
)
where intent_code = 'WEA-03';
