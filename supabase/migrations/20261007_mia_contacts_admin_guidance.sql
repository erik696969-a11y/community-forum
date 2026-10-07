-- 2026-10-07: align MIA contact routing with the Administrator's guidance (email of 7 Oct 2026)
--   * Gas emergencies: 112 is the general emergency number (no dedicated gas line).
--   * Contractors (gardening, pest control, pool maintenance) are NOT contacted directly by owners:
--     route to the Administrator ([MAINTENANCE_PHONE]) and, when urgent, the Gatehouse ([SECURITY_PHONE]).
-- Idempotent: each update only runs while the old placeholder is still present.

-- FIR-05 Gas smell / suspected gas leak -> 112
update public.ai_knowledge_base
set logic_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      replace(replace(replace(replace(logic_json::text,
        $a$Call the configured gas emergency service and/or 112 when there is significant or immediate danger.$a$,
        $b$Call 112 (the general emergency number, which also covers gas emergencies) when there is significant or immediate danger.$b$),
        $a$Llame al servicio de emergencia de gas configurado y/o al 112 cuando haya un peligro significativo o inmediato.$a$,
        $b$Llame al 112 (el número general de emergencias, que también cubre emergencias de gas) cuando haya un peligro significativo o inmediato.$b$),
        $a$Appelez le service d'urgence gaz configuré et/ou le 112 en cas de danger important ou immédiat.$a$,
        $b$Appelez le 112 (numéro d'urgence général, qui couvre aussi les urgences gaz) en cas de danger important ou immédiat.$b$),
        $a$Rufen Sie den eingerichteten Gas-Notdienst und/oder die 112 an, wenn eine erhebliche oder unmittelbare Gefahr besteht.$a$,
        $b$Rufen Sie die 112 an (allgemeine Notrufnummer, die auch Gasnotfälle abdeckt), wenn eine erhebliche oder unmittelbare Gefahr besteht.$b$)::jsonb,
      '{contact_route}',    '["112 (general emergency number, also for gas emergencies)", "Security/Maintenance"]'::jsonb),
      '{contact_route_es}', '["112 (número general de emergencias, también para emergencias de gas)", "Seguridad/Mantenimiento"]'::jsonb),
      '{contact_route_fr}', '["112 (numéro d''urgence général, également pour les urgences gaz)", "Sécurité/Maintenance"]'::jsonb),
      '{contact_route_de}', '["112 (allgemeine Notrufnummer, auch bei Gasnotfällen)", "Sicherheitsdienst/Hausverwaltung"]'::jsonb),
    content = replace(content,
      '[GAS_EMERGENCY_CONTACT] / 112 as appropriate.',
      '112 (the general emergency number, which also covers gas emergencies).'),
    version = version + 1, updated_at = now()
where intent_code = 'FIR-05' and logic_json::text like '%GAS_EMERGENCY_CONTACT%';

-- COM-01 Pool water contaminated -> Administrator / Gatehouse
update public.ai_knowledge_base
set logic_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      replace(logic_json::text, '[POOL_MAINTENANCE_CONTACT] / [SECURITY_PHONE]', '[MAINTENANCE_PHONE] / [SECURITY_PHONE]')::jsonb,
      '{contact_route}',    '["Maintenance/Security"]'::jsonb),
      '{contact_route_es}', '["Mantenimiento/Seguridad"]'::jsonb),
      '{contact_route_fr}', '["Maintenance/Sécurité"]'::jsonb),
      '{contact_route_de}', '["Hausverwaltung/Sicherheitsdienst"]'::jsonb),
    content = replace(content, '[POOL_MAINTENANCE_CONTACT] / [SECURITY_PHONE]', '[MAINTENANCE_PHONE] / [SECURITY_PHONE]'),
    version = version + 1, updated_at = now()
where intent_code = 'COM-01' and logic_json::text like '%POOL_MAINTENANCE_CONTACT%';

-- COM-02 Broken glass / sharp object at pool -> Gatehouse / Administrator
update public.ai_knowledge_base
set logic_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      replace(logic_json::text, '[SECURITY_PHONE] / [POOL_MAINTENANCE_CONTACT]', '[SECURITY_PHONE] / [MAINTENANCE_PHONE]')::jsonb,
      '{contact_route}',    '["Security/Maintenance"]'::jsonb),
      '{contact_route_es}', '["Seguridad/Mantenimiento"]'::jsonb),
      '{contact_route_fr}', '["Sécurité/Maintenance"]'::jsonb),
      '{contact_route_de}', '["Sicherheitsdienst/Hausverwaltung"]'::jsonb),
    content = replace(content, '[SECURITY_PHONE] / [POOL_MAINTENANCE_CONTACT]', '[SECURITY_PHONE] / [MAINTENANCE_PHONE]'),
    version = version + 1, updated_at = now()
where intent_code = 'COM-02' and logic_json::text like '%POOL_MAINTENANCE_CONTACT%';

-- COM-04 Fallen tree -> Administrator / Gatehouse (no direct gardening-company contact)
update public.ai_knowledge_base
set logic_json = replace(replace(replace(replace(replace(logic_json::text,
      '[GARDENING_CONTACT] / [MAINTENANCE_PHONE] / [SECURITY_PHONE]', '[MAINTENANCE_PHONE] / [SECURITY_PHONE]'),
      '"Gardening/Maintenance/Security"',          '"Maintenance/Security"'),
      '"Jardinería/Mantenimiento/Seguridad"',      '"Mantenimiento/Seguridad"'),
      '"Jardinage/Maintenance/Sécurité"',          '"Maintenance/Sécurité"'),
      '"Gartenpflege/Hausverwaltung/Sicherheitsdienst"', '"Hausverwaltung/Sicherheitsdienst"')::jsonb,
    content = replace(content, 'contact [GARDENING_CONTACT] / [MAINTENANCE_PHONE].', 'contact [MAINTENANCE_PHONE] / [SECURITY_PHONE].'),
    version = version + 1, updated_at = now()
where intent_code = 'COM-04' and logic_json::text like '%GARDENING_CONTACT%';

-- COM-05 Pests -> Administrator
update public.ai_knowledge_base
set logic_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
      replace(replace(replace(replace(logic_json::text,
        $a$notify [PEST_CONTROL_CONTACT] / administrator if a common area is affected$a$,
        $b$notify the administrator ([MAINTENANCE_PHONE]) if a common area is affected$b$),
        $a$notifique a [PEST_CONTROL_CONTACT] / al administrador si$a$,
        $b$notifique al administrador ([MAINTENANCE_PHONE]) si$b$),
        $a$prévenez [PEST_CONTROL_CONTACT] / l'administrateur si$a$,
        $b$prévenez l'administrateur ([MAINTENANCE_PHONE]) si$b$),
        $a$benachrichtigen Sie [PEST_CONTROL_CONTACT] / den Verwalter, falls$a$,
        $b$benachrichtigen Sie den Verwalter ([MAINTENANCE_PHONE]), falls$b$)::jsonb,
      '{contact_route}',    '["Administrator"]'::jsonb),
      '{contact_route_es}', '["Administrador"]'::jsonb),
      '{contact_route_fr}', '["Administrateur"]'::jsonb),
      '{contact_route_de}', '["Verwalter"]'::jsonb),
    content = replace(content, 'Report the exact location to [PEST_CONTROL_CONTACT] / the administrator.', 'Report the exact location to the administrator ([MAINTENANCE_PHONE]).'),
    version = version + 1, updated_at = now()
where intent_code = 'COM-05' and logic_json::text like '%PEST_CONTROL_CONTACT%';
