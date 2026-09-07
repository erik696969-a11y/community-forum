-- ============================================================
-- Zosuladenie repozitara s produkciou: tabulka contacts
--
-- Obe zmeny uz v produkcii EXISTUJU, ale nikdy neboli zapisane
-- ako migracia (pridane priamo cez SQL editor). Tento subor to
-- dobieha, aby sa databaza dala obnovit z migracii a aby druha
-- komunita dostala rovnaku strukturu.
--
-- 1) Prekladove stlpce role_label_{es,fr,de} a notes_{es,fr,de}
--    Cita ich app/dashboard/contacts/page.js cez
--    c[`role_label_${lang}`] || c.role_label  (fallback na EN).
--
-- 2) Unique constraint na role_label
--    Placeholder rezolucia (CONTACT_PLACEHOLDER_ROLES v
--    lib/aiAssistant.js) predpoklada prave jeden kontakt na rolu -
--    findContactByRole() vracia prvu zhodu, takze duplicitna rola
--    by znamenala nedeterministicke smerovanie rezidenta.
--
-- Vsetko idempotentne: opatovne spustenie proti produkcii nic
-- nezmeni ani nezlyha.
-- ============================================================

-- ---------- 1) Prekladove stlpce ----------
alter table contacts add column if not exists role_label_es text;
alter table contacts add column if not exists role_label_fr text;
alter table contacts add column if not exists role_label_de text;
alter table contacts add column if not exists notes_es text;
alter table contacts add column if not exists notes_fr text;
alter table contacts add column if not exists notes_de text;

-- ---------- 2) Unique constraint na role_label ----------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_role_label_key'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_role_label_key unique (role_label);
  end if;
end $$;
