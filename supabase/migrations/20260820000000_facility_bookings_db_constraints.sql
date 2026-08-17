-- ============================================================
-- Session 4 — DB ochrana proti dvojitej rezervácii facility
-- (opravená, idempotentná verzia)
--
-- Tieto constrainty už reálne bežia v produkčnej Supabase databáze
-- (potvrdené cez pg_constraint), ale neboli zdokumentované v repozitári.
-- Tento skript ich zapisuje tak, aby bol repozitár reprodukovateľný,
-- a je bezpečné ho spustiť opakovane — každý krok si najprv overí,
-- či daný constraint/extension už existuje.
-- ============================================================

create extension if not exists btree_gist;

-- Koniec rezervácie musí byť po jej začiatku.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'facility_bookings_end_after_start'
      and conrelid = 'public.facility_bookings'::regclass
  ) then
    alter table facility_bookings
      add constraint facility_bookings_end_after_start
      check (ends_at > starts_at);
  end if;
end $$;

-- Žiadne dve rezervácie tej istej facility sa nesmú časovo prekrývať.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'facility_bookings_no_overlap'
      and conrelid = 'public.facility_bookings'::regclass
  ) then
    alter table facility_bookings
      add constraint facility_bookings_no_overlap
      exclude using gist (
        facility_id with =,
        tstzrange(starts_at, ends_at) with &&
      );
  end if;
end $$;
