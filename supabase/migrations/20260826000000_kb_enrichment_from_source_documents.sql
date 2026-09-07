-- ============================================================
-- Session 11 — obohatenie V2 knowledge base o realne data
-- z "Useful Information" (Paul Markland) + Community Statutes
--
-- Toto NEnahradza scenare, len ich presne doplna o overene fakty,
-- ktore predtym chybali (a boli identifikovane ako gap):
--   - pravo pristupu na opravu do cudzieho bytu (Statutes Art. XIV.d)
--   - nudzovy pristup Administratora do prazdneho bytu (Art. XIV.e)
--   - presny mando/kluc postup (Powermatic, Cerrajero Juan Marbella)
--   - presne renovation hodiny + depozit
--   - existencia community insurance pre spolocne casti (Art. XXXIV)
--
-- POZNAMKA: tato migracia uz bola spustena v produkcii priamo cez
-- SQL editor, ale subor chybal v repozitari. Vsetky prikazy su
-- idempotentne (append operacie maju @> guard), takze opatovne
-- spustenie proti produkcii nic nezduplikuje ani nezmeni.
-- ============================================================

-- ---------- Novy reusable modul: pravo pristupu na opravu ----------
insert into ai_response_modules (module_code, title, content_json, active, version) values (
  'NEIGHBOR_ACCESS_FOR_REPAIRS',
  'Right of access for necessary repairs',
  '{
    "trigger": "A repair affecting another private apartment (e.g. the source of a leak) requires physical access to that apartment.",
    "actions": [
      "The occupant of the apartment where access is needed must allow entry for necessary repairs, even where the repair addresses damage occurring elsewhere (Community Statutes, Art. XIV.d).",
      "The owner granting access has a right to compensation for any damage caused to their property during that repair access.",
      "If the occupant is unreachable or uncooperative, coordinate access through the Administrator rather than attempting entry yourself."
    ],
    "do_not": [
      "Do not force entry into another apartment without the Administrator being involved."
    ]
  }'::jsonb,
  true,
  1
)
on conflict (module_code) do update set
  title = excluded.title,
  content_json = excluded.content_json;

-- ---------- WAT-01: pridat pravny zaklad pristupu na opravu ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{follow_up}'::text[],
  (logic_json->'follow_up') || '["If access to the apartment above is needed to stop or repair the leak, the Community Statutes (Art. XIV.d) require the occupant to allow access for necessary repairs, with a right to compensation for any damage caused during that access."]'::jsonb
)
where intent_code = 'WAT-01'
  and not (logic_json->'follow_up' @> '["If access to the apartment above is needed to stop or repair the leak, the Community Statutes (Art. XIV.d) require the occupant to allow access for necessary repairs, with a right to compensation for any damage caused during that access."]'::jsonb);

update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{followup_modules}'::text[],
  (logic_json->'followup_modules') || '["NEIGHBOR_ACCESS_FOR_REPAIRS"]'::jsonb
)
where intent_code = 'WAT-01'
  and not (logic_json->'followup_modules' ? 'NEIGHBOR_ACCESS_FOR_REPAIRS');

-- ---------- BLD-08: nudzovy pristup Administratora - realny pravny zaklad ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{follow_up}'::text[],
  '["Per the Community Statutes (Art. XIV.e), the Administrator has legal authority to access a private apartment in an emergency or during a prolonged owner absence, following appropriate prior notification."]'::jsonb
)
where intent_code = 'BLD-08';

-- ---------- BLD-05: presny mando/kluc postup namiesto vseobecnej frazy ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  jsonb_set(
    logic_json,
    '{immediate_actions}'::text[],
    '[
      "For a lost community access fob/remote (mando): notify [ADMINISTRATOR_EMAIL] with your apartment number so it can be deactivated and a replacement authorised. Each apartment is allowed up to 4 mandos in total; replacements are supplied by Powermatic once Ammex authorises it.",
      "For a lost stairwell-to-garage key: request authorisation from [ADMINISTRATOR_EMAIL] (each apartment is allowed up to 4 keys total). Once authorised, the key is cut and paid for directly at the community locksmith, [LOCKSMITH_CONTACT] (around EUR 14 each).",
      "For a lost private apartment door key: contact your own property manager or a locksmith of your choice; consider a cylinder change if the key could identify your apartment."
    ]'::jsonb
  ),
  '{short_response_template}'::text[],
  '"For a lost mando or garage key, contact [ADMINISTRATOR_EMAIL] with your apartment number to get it deactivated and a replacement authorised (max 4 per apartment). For a private apartment key, contact your own locksmith or [LOCKSMITH_CONTACT]."'::jsonb
)
where intent_code = 'BLD-05';

-- ---------- ADM-04: presne hodiny + depozit namiesto placeholder-only ----------
update ai_knowledge_base
set logic_json = jsonb_set(
  logic_json,
  '{immediate_actions}'::text[],
  '[
    "Before starting, contact [ADMINISTRATOR_EMAIL] to confirm required approvals, technical documentation and community rules.",
    "Noisy building work is only permitted Monday-Friday, 09:00-17:30.",
    "A refundable deposit (around EUR 1,000) is required for major works to cover any damage to community infrastructure - it is returned afterwards if there is no damage.",
    "Confirm contractor access, waste removal, elevator/common-area protection and any additional insurance requirements."
  ]'::jsonb
)
where intent_code = 'ADM-04';

-- ---------- INSURANCE_GENERAL modul: potvrdit existenciu community poistenia ----------
update ai_response_modules
set content_json = jsonb_set(
  content_json,
  '{actions}'::text[],
  (content_json->'actions') || '["Communal elements of the community (fire, weather/act-of-god damage, injury to people and other risks) are covered by a Community insurance policy per the Community Statutes, Art. XXXIV - for claims involving communal elements, this is coordinated via the Administrator, not by an individual owner."]'::jsonb
)
where module_code = 'INSURANCE_GENERAL'
  and not (content_json->'actions' @> '["Communal elements of the community (fire, weather/act-of-god damage, injury to people and other risks) are covered by a Community insurance policy per the Community Statutes, Art. XXXIV - for claims involving communal elements, this is coordinated via the Administrator, not by an individual owner."]'::jsonb);
