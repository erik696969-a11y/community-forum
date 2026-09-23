-- ============================================================
-- Memoria — Fáza 1a: jadro (board-only modul „elektronický mozog komunity“)
--
-- Návrh: projekt „MEMORIA inside MiHacienda“, dokument
-- claude/memoria-datovy-model.md (verzia 3, 23. 9. 2026).
--
-- Čo vytvára:
--   1) memoria_decisions          rozhodnutia (decision log) — kto, prečo, na základe čoho
--   2) memoria_decision_links     väzby rozhodnutia na dodávateľa / zákazku / zmluvu / faktúru
--   3) memoria_suppliers          dodávatelia (oddelené od komunitnej tabuľky public.suppliers,
--                                 ktorá slúži vlastníkom na odporúčania remeselníkov)
--   4) memoria_supplier_ratings   hodnotenie dodávateľa v čase
--   5) memoria_tenders            zákazky / výberové konania
--   6) memoria_quotes             ponuky k zákazke
--   7) memoria_contracts          zmluvy
--   8) memoria_invoices           faktúry a výdavky (vrátane urgentných výdavkov podľa čl. XXX stanov)
--   9) memoria_documents          prílohy naviazané na ľubovoľný záznam
--  10) memoria_activity           automatický záznam zmien = audit log + activity feed
--  11) storage bucket „memoria“   súkromné úložisko príloh
--
-- Prístup: všetko výhradne pre schválených členov boardu
-- (public.is_approved_board_member()). Vlastníci ani neprihlásení nevidia nič.
-- Záznamy do memoria_activity zapisuje iba trigger — nikto ich nemôže upraviť ani zmazať.
--
-- Migrácia je aditívna: nemení žiadnu existujúcu tabuľku.
-- ============================================================


-- ---------- Pomocné triggery ----------

-- Vyplní created_by pri vložení a updated_at / updated_by pri každej zmene.
create or replace function public.memoria_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    -- Autor sa nedá podvrhnúť: pri prihlásenom používateľovi je to vždy on.
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    -- Pôvodný autor a čas vytvorenia sa pri úprave nemenia.
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;


-- ---------- 1) Rozhodnutia (decision log) ----------
create table public.memoria_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  decided_on date not null,
  -- Ktorý orgán rozhodol (stanovy čl. XIX–XXX).
  body text not null check (body in (
    'general_meeting',        -- Junta General (zhromaždenie vlastníkov)
    'board',                  -- Junta Directiva
    'president',              -- prezident
    'president_administrator',-- prezident + administrátor (urgentný výdavok, čl. XXX)
    'administrator'           -- administrátor v rámci svojich právomocí
  )),
  authority_basis text,       -- napr. „Stanovy čl. XXII.4“, „Uznesenie AGM 23. 4. 2026, bod 5“
  context text,               -- problém / situácia
  alternatives text,          -- zvažované možnosti
  decision text not null,     -- čo sa rozhodlo
  rationale text,             -- prečo
  votes_for integer check (votes_for >= 0),
  votes_against integer check (votes_against >= 0),
  votes_abstain integer check (votes_abstain >= 0),
  status text not null default 'active' check (status in ('active', 'suspended', 'superseded', 'cancelled')),
  status_note text,           -- napr. dôvod pozastavenia prezidentom (čl. XXIII.e)
  outcome_review text,        -- spätné vyhodnotenie: ako sa rozhodnutie osvedčilo
  outcome_reviewed_on date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 3) Dodávatelia ----------
create table public.memoria_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,                -- NIF / CIF
  contact_person text,
  phone text,
  email text,
  website text,
  category text not null check (category in (
    'gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning',
    'security', 'lifts', 'it_telecom', 'insurance', 'legal', 'administration',
    'utilities', 'pest_control', 'other'
  )),
  status text not null default 'active' check (status in ('active', 'inactive', 'blacklisted')),
  status_reason text,         -- povinné pri „blacklisted“ (kontroluje constraint nižšie)
  first_engaged_on date,
  -- Uznesenie AGM 2026 bod 6g: dodávateľ nesmie byť vlastník, administrátor ani s nimi prepojená firma.
  conflict_of_interest_checked boolean not null default false,
  conflict_of_interest_note text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_suppliers_blacklist_reason check (status <> 'blacklisted' or nullif(trim(status_reason), '') is not null)
);
create unique index memoria_suppliers_tax_id_key on public.memoria_suppliers (upper(tax_id)) where tax_id is not null;


-- ---------- 4) Hodnotenia dodávateľa ----------
create table public.memoria_supplier_ratings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.memoria_suppliers(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  rated_on date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 5) Zákazky / výberové konania ----------
create table public.memoria_tenders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  opened_on date,
  status text not null default 'collecting' check (status in ('collecting', 'decided', 'cancelled')),
  approved_budget numeric(12,2) check (approved_budget >= 0), -- schválený limit sumy
  currency char(3) not null default 'EUR',
  selected_supplier_id uuid references public.memoria_suppliers(id) on delete set null,
  selection_reason text,
  approved_by_decision_id uuid references public.memoria_decisions(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 6) Ponuky ----------
create table public.memoria_quotes (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.memoria_tenders(id) on delete cascade,
  supplier_id uuid not null references public.memoria_suppliers(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  vat_included boolean not null default false,
  currency char(3) not null default 'EUR',
  submitted_on date,
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 7) Zmluvy ----------
create table public.memoria_contracts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.memoria_suppliers(id) on delete restrict,
  tender_id uuid references public.memoria_tenders(id) on delete set null,
  subject text not null,
  signed_on date,
  starts_on date,
  ends_on date,
  auto_renew boolean not null default false,
  notice_period_days integer check (notice_period_days >= 0),
  amount numeric(12,2) check (amount >= 0),
  currency char(3) not null default 'EUR',
  payment_frequency text check (payment_frequency in ('one_off', 'monthly', 'quarterly', 'yearly', 'other')),
  status text not null default 'active' check (status in ('negotiating', 'active', 'ended', 'disputed')),
  signed_by text,             -- podľa stanov zmluvy o údržbe a dodávkach podpisuje administrátor
  approved_by_decision_id uuid references public.memoria_decisions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_contracts_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);


-- ---------- 8) Faktúry a výdavky ----------
create table public.memoria_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.memoria_suppliers(id) on delete restrict,
  tender_id uuid references public.memoria_tenders(id) on delete set null,
  contract_id uuid references public.memoria_contracts(id) on delete set null,
  invoice_number text,
  invoice_date date,
  due_date date,
  paid_on date,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'overdue', 'disputed')),
  net_amount numeric(12,2),
  vat_amount numeric(12,2),
  total_amount numeric(12,2) not null,
  currency char(3) not null default 'EUR',
  description text,
  category text not null default 'other' check (category in (
    'maintenance', 'repair', 'insurance', 'utilities', 'staff_cleaning', 'gardening',
    'pools', 'security', 'administration', 'legal', 'improvement', 'other'
  )),
  funding_source text not null default 'ordinary_budget' check (funding_source in ('ordinary_budget', 'reserve_fund', 'extraordinary_levy')),
  period_year smallint check (period_year between 2000 and 2100),
  period_month smallint check (period_month between 1 and 12),
  -- Urgentný nerozpočtovaný výdavok (stanovy čl. XXX): schvaľuje prezident + administrátor,
  -- následne ho musí ratifikovať Junta Directiva.
  is_urgent_unbudgeted boolean not null default false,
  urgency_reason text,
  ratified_by_decision_id uuid references public.memoria_decisions(id) on delete set null,
  external_ref text,          -- referencia z exportu administrátora
  import_source text,         -- 'manual' / 'admin_export' / …
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_invoices_urgent_reason check (not is_urgent_unbudgeted or nullif(trim(urgency_reason), '') is not null)
);
create unique index memoria_invoices_supplier_number_key
  on public.memoria_invoices (supplier_id, invoice_number)
  where supplier_id is not null and invoice_number is not null;


-- ---------- 2) Väzby rozhodnutí na ostatné záznamy ----------
create table public.memoria_decision_links (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.memoria_decisions(id) on delete cascade,
  entity_type text not null check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision')),
  entity_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (decision_id, entity_type, entity_id)
);


-- ---------- 9) Dokumenty / prílohy ----------
create table public.memoria_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  doc_type text not null check (doc_type in (
    'invoice', 'contract', 'quote', 'minutes', 'statutes', 'rules', 'insurance_policy',
    'inspection_report', 'audit_report', 'correspondence', 'photo', 'other'
  )),
  storage_path text,          -- cesta v buckete „memoria“
  external_url text,          -- alebo odkaz mimo aplikácie
  document_date date,
  -- Voliteľná väzba na záznam (polymorfná).
  entity_type text check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision')),
  entity_id uuid,
  retain_until date,          -- napr. dokumenty zo zhromaždení minimálne 5 rokov
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_documents_location check (storage_path is not null or external_url is not null),
  constraint memoria_documents_entity_pair check ((entity_type is null) = (entity_id is null))
);


-- ---------- 10) Aktivita (audit log + activity feed) ----------
create table public.memoria_activity (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  label text,                 -- čitateľný názov záznamu (názov, predmet, číslo faktúry…)
  changed_fields text[]       -- pri úprave: ktoré polia sa zmenili
);

create or replace function public.memoria_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_changed text[];
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_row) as k
    where k not in ('updated_at', 'updated_by')
      and v_row -> k is distinct from v_old -> k;
    -- Úprava, ktorá nič nezmenila, sa nezapisuje.
    if v_changed is null then
      return new;
    end if;
  end if;

  insert into public.memoria_activity (actor_id, table_name, record_id, action, label, changed_fields)
  values (
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    left(coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'subject', v_row ->> 'invoice_number', v_row ->> 'description'), 200),
    v_changed
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.memoria_log_activity() from public, anon, authenticated;


-- ---------- Triggery, indexy a RLS pre všetky tabuľky ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'memoria_decisions', 'memoria_decision_links', 'memoria_suppliers', 'memoria_supplier_ratings',
    'memoria_tenders', 'memoria_quotes', 'memoria_contracts', 'memoria_invoices', 'memoria_documents'
  ] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.memoria_touch()', t || '_touch', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.memoria_log_activity()', t || '_activity', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_approved_board_member())', 'board_select_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_approved_board_member())', 'board_insert_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_approved_board_member()) with check (public.is_approved_board_member())', 'board_update_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_approved_board_member())', 'board_delete_' || t, t);
  end loop;
end;
$$;

alter table public.memoria_activity enable row level security;
create policy board_select_memoria_activity on public.memoria_activity
  for select to authenticated using (public.is_approved_board_member());
-- Zámerne žiadne INSERT/UPDATE/DELETE policy: zapisuje iba trigger memoria_log_activity().

-- Indexy pre cudzie kľúče a časté filtre.
create index memoria_decisions_decided_on_idx on public.memoria_decisions (decided_on desc);
create index memoria_decision_links_entity_idx on public.memoria_decision_links (entity_type, entity_id);
create index memoria_supplier_ratings_supplier_idx on public.memoria_supplier_ratings (supplier_id, rated_on desc);
create index memoria_tenders_selected_supplier_idx on public.memoria_tenders (selected_supplier_id);
create index memoria_tenders_decision_idx on public.memoria_tenders (approved_by_decision_id);
create index memoria_quotes_tender_idx on public.memoria_quotes (tender_id);
create index memoria_quotes_supplier_idx on public.memoria_quotes (supplier_id);
create index memoria_contracts_supplier_idx on public.memoria_contracts (supplier_id);
create index memoria_contracts_tender_idx on public.memoria_contracts (tender_id);
create index memoria_contracts_decision_idx on public.memoria_contracts (approved_by_decision_id);
create index memoria_contracts_ends_on_idx on public.memoria_contracts (ends_on) where status = 'active';
create index memoria_invoices_supplier_idx on public.memoria_invoices (supplier_id, invoice_date desc);
create index memoria_invoices_tender_idx on public.memoria_invoices (tender_id);
create index memoria_invoices_contract_idx on public.memoria_invoices (contract_id);
create index memoria_invoices_decision_idx on public.memoria_invoices (ratified_by_decision_id);
create index memoria_invoices_period_idx on public.memoria_invoices (period_year, period_month);
create index memoria_invoices_unratified_idx on public.memoria_invoices (invoice_date) where is_urgent_unbudgeted and ratified_by_decision_id is null;
create index memoria_documents_entity_idx on public.memoria_documents (entity_type, entity_id);
create index memoria_activity_occurred_idx on public.memoria_activity (occurred_at desc);
create index memoria_activity_record_idx on public.memoria_activity (table_name, record_id);
create index memoria_activity_actor_idx on public.memoria_activity (actor_id);

-- Indexy pre stĺpce created_by / updated_by (odkazy na profiles).
do $$
declare
  t text;
begin
  foreach t in array array[
    'memoria_decisions', 'memoria_decision_links', 'memoria_suppliers', 'memoria_supplier_ratings',
    'memoria_tenders', 'memoria_quotes', 'memoria_contracts', 'memoria_invoices', 'memoria_documents'
  ] loop
    execute format('create index %I on public.%I (created_by)', t || '_created_by_idx', t);
    execute format('create index %I on public.%I (updated_by)', t || '_updated_by_idx', t);
  end loop;
end;
$$;


-- ---------- 11) Súkromné úložisko príloh ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memoria', 'memoria', false, 26214400, -- 25 MB
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword', 'application/vnd.ms-excel', 'text/csv', 'text/plain'
  ]
)
on conflict (id) do nothing;

create policy "memoria_board_select" on storage.objects
  for select to authenticated using (bucket_id = 'memoria' and public.is_approved_board_member());
create policy "memoria_board_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'memoria' and public.is_approved_board_member());
create policy "memoria_board_update" on storage.objects
  for update to authenticated using (bucket_id = 'memoria' and public.is_approved_board_member())
  with check (bucket_id = 'memoria' and public.is_approved_board_member());
create policy "memoria_board_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'memoria' and public.is_approved_board_member());
