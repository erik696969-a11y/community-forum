-- ============================================================
-- Memoria — Fáza 1b: správa komunity (príprava na prezentáciu boardu)
--
-- Čo pridáva:
--   1) memoria_tasks              plnenie uznesení (kto, kontrolór, termín, stav) — stanovy čl. XXII.4.f
--   2) memoria_task_updates       priebežné poznámky k úlohe (história postupu)
--   3) memoria_obligations        kalendár povinností (revízie, poistky, lehoty…)
--   4) memoria_obligation_logs    záznam o splnení povinnosti (doklad, zistenia)
--   5) memoria_meetings           zasadnutia Junta Directiva a Junta General
--   6) memoria_meeting_items      program zasadnutia a výsledok každého bodu
--   7) is_demo na všetkých tabuľkách Memorie + funkcia memoria_purge_demo()
--      (ukážkové dáta na prezentáciu sú vždy označené a dajú sa naraz vymazať)
--
-- Prístup rovnaký ako vo Fáze 1a: iba schválení členovia boardu.
-- Migrácia je aditívna.
-- ============================================================


-- ---------- 1) Plnenie uznesení ----------
create table public.memoria_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  -- Kto úlohu vykonáva (stanovy: uznesenia vykonáva administrátor, čl. XXVII).
  executor_role text not null default 'administrator' check (executor_role in (
    'administrator', 'president', 'vice_president', 'board_member', 'site_manager', 'supplier', 'other'
  )),
  executor_name text,          -- meno osoby alebo firmy
  supervisor_name text,        -- člen boardu, ktorý plnenie kontroluje
  due_date date,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done', 'blocked', 'cancelled')),
  blocked_reason text,
  completed_on date,
  tender_id uuid references public.memoria_tenders(id) on delete set null,
  contract_id uuid references public.memoria_contracts(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_tasks_blocked_reason check (status <> 'blocked' or nullif(trim(blocked_reason), '') is not null)
);

create table public.memoria_task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.memoria_tasks(id) on delete cascade,
  note text not null,
  new_status text check (new_status in ('not_started', 'in_progress', 'done', 'blocked', 'cancelled')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 3) Kalendár povinností ----------
create table public.memoria_obligations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in (
    'inspection', 'pool_hygiene', 'insurance', 'contract', 'general_meeting', 'board_meeting',
    'budget', 'legal_deadline', 'gdpr', 'fees', 'other'
  )),
  legal_basis text,            -- napr. „Stanovy čl. XVII“, „RD 742/2013 (bazény)“
  recurrence text not null default 'annual' check (recurrence in (
    'once', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'five_yearly'
  )),
  next_due_on date not null,
  remind_days integer not null default 30 check (remind_days between 0 and 365),
  responsible_name text,       -- zodpovedný člen boardu / administrátor
  supplier_id uuid references public.memoria_suppliers(id) on delete set null,
  contract_id uuid references public.memoria_contracts(id) on delete set null,
  asset_note text,             -- zariadenie / miesto (bazén 2, brána Altura…)
  notes text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.memoria_obligation_logs (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.memoria_obligations(id) on delete cascade,
  due_on date,                 -- termín, ktorý sa týmto splnil
  done_on date not null,
  evidence text,               -- číslo protokolu, certifikátu…
  issues_found text,           -- zistené nedostatky
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- 5) Zasadnutia ----------
create table public.memoria_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null check (body in ('board', 'general_ordinary', 'general_extraordinary')),
  meeting_on date not null,
  meeting_time text,
  location text,
  convened_by text,            -- prezident / polovica+1 členov / 25 % vlastníkov…
  invitation_sent_on date,     -- kontrola 8 dní (board) / 15 dní (zhromaždenie)
  status text not null default 'planned' check (status in ('planned', 'held', 'cancelled')),
  attendees text,
  quorum_reached boolean,
  minutes_closed_on date,      -- zhromaždenie: zápisnica do 10 dní (LPH čl. 19)
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.memoria_meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.memoria_meetings(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  item_type text not null default 'decision' check (item_type in ('information', 'decision', 'review')),
  -- Odkiaľ bod prišiel (návrh programu z otvorených vecí).
  source_type text check (source_type in ('task', 'obligation', 'contract', 'tender', 'invoice', 'decision', 'manual')),
  source_id uuid,
  outcome text,                -- zápis výsledku
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);


-- ---------- Triggery a RLS pre nové tabuľky ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'memoria_tasks', 'memoria_task_updates', 'memoria_obligations', 'memoria_obligation_logs',
    'memoria_meetings', 'memoria_meeting_items'
  ] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.memoria_touch()', t || '_touch', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.memoria_log_activity()', t || '_activity', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_approved_board_member())', 'board_select_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_approved_board_member())', 'board_insert_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_approved_board_member()) with check (public.is_approved_board_member())', 'board_update_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_approved_board_member())', 'board_delete_' || t, t);
    execute format('create index %I on public.%I (created_by)', t || '_created_by_idx', t);
    execute format('create index %I on public.%I (updated_by)', t || '_updated_by_idx', t);
  end loop;
end;
$$;

create index memoria_tasks_decision_idx on public.memoria_tasks (decision_id);
create index memoria_tasks_due_idx on public.memoria_tasks (due_date) where status in ('not_started', 'in_progress', 'blocked');
create index memoria_tasks_tender_idx on public.memoria_tasks (tender_id);
create index memoria_tasks_contract_idx on public.memoria_tasks (contract_id);
create index memoria_task_updates_task_idx on public.memoria_task_updates (task_id, created_at desc);
create index memoria_obligations_due_idx on public.memoria_obligations (next_due_on) where active;
create index memoria_obligations_supplier_idx on public.memoria_obligations (supplier_id);
create index memoria_obligations_contract_idx on public.memoria_obligations (contract_id);
create index memoria_obligation_logs_obligation_idx on public.memoria_obligation_logs (obligation_id, done_on desc);
create index memoria_meetings_date_idx on public.memoria_meetings (meeting_on desc);
create index memoria_meeting_items_meeting_idx on public.memoria_meeting_items (meeting_id, position);
create index memoria_meeting_items_decision_idx on public.memoria_meeting_items (decision_id);


-- ---------- Nové typy väzieb pre prílohy a rozhodnutia ----------
alter table public.memoria_documents drop constraint memoria_documents_entity_type_check;
alter table public.memoria_documents add constraint memoria_documents_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting'));
alter table public.memoria_decision_links drop constraint memoria_decision_links_entity_type_check;
alter table public.memoria_decision_links add constraint memoria_decision_links_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting'));


-- ---------- 7) Ukážkové dáta (DEMO) ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'memoria_decisions', 'memoria_decision_links', 'memoria_suppliers', 'memoria_supplier_ratings',
    'memoria_tenders', 'memoria_quotes', 'memoria_contracts', 'memoria_invoices', 'memoria_documents'
  ] loop
    execute format('alter table public.%I add column is_demo boolean not null default false', t);
  end loop;
end;
$$;

alter table public.memoria_activity add column is_demo boolean not null default false;

-- Aktivita preberá príznak DEMO zo záznamu, aby sa dala vyčistiť spolu s ním.
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
    if v_changed is null then
      return new;
    end if;
  end if;

  insert into public.memoria_activity (actor_id, table_name, record_id, action, label, changed_fields, is_demo)
  values (
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    left(coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'subject', v_row ->> 'invoice_number', v_row ->> 'description', v_row ->> 'note'), 200),
    v_changed,
    coalesce((v_row ->> 'is_demo')::boolean, false)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.memoria_log_activity() from public, anon, authenticated;

-- Vymaže všetky ukážkové dáta naraz (pred ostrým spustením).
-- Spúšťa iba správca databázy — z aplikácie sa zavolať nedá.
create or replace function public.memoria_purge_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.memoria_meeting_items where is_demo;
  delete from public.memoria_meetings where is_demo;
  delete from public.memoria_obligation_logs where is_demo;
  delete from public.memoria_obligations where is_demo;
  delete from public.memoria_task_updates where is_demo;
  delete from public.memoria_tasks where is_demo;
  delete from public.memoria_decision_links where is_demo;
  delete from public.memoria_documents where is_demo;
  delete from public.memoria_invoices where is_demo;
  delete from public.memoria_contracts where is_demo;
  delete from public.memoria_quotes where is_demo;
  update public.memoria_tenders set selected_supplier_id = null where is_demo;
  delete from public.memoria_tenders where is_demo;
  delete from public.memoria_supplier_ratings where is_demo;
  delete from public.memoria_suppliers where is_demo;
  delete from public.memoria_decisions where is_demo;
  delete from public.memoria_activity where is_demo;
end;
$$;

revoke execute on function public.memoria_purge_demo() from public, anon, authenticated;
