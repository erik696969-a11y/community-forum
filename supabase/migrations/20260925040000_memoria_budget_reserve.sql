-- ============================================================
-- Memoria — rozpočet po kategóriách a rezervný fond
--
-- memoria_budgets            ročný riadny rozpočet (celková suma, uznesenie, minimum rezervy)
-- memoria_budget_lines       rozpis rozpočtu po kategóriách faktúr
-- memoria_reserve_movements  pohyby rezervného fondu bez faktúry (počiatočný stav, príspevky,
--                            úroky, výbery). Faktúry s funding_source = 'reserve_fund' sa
--                            od zostatku odpočítajú automaticky.
-- Migrácia je aditívna.
-- ============================================================

create table public.memoria_budgets (
  id uuid primary key default gen_random_uuid(),
  year smallint not null check (year between 2000 and 2100),
  title text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  approved_on date,
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  reserve_min_percent numeric(5,2) not null default 10 check (reserve_min_percent between 0 and 100),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_budgets_year_key unique (year)
);

create table public.memoria_budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.memoria_budgets(id) on delete cascade,
  category text not null check (category in (
    'maintenance', 'repair', 'insurance', 'utilities', 'staff_cleaning', 'gardening',
    'pools', 'security', 'administration', 'legal', 'improvement', 'other'
  )),
  amount numeric(12,2) not null check (amount >= 0),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_budget_lines_unique unique (budget_id, category)
);

create table public.memoria_reserve_movements (
  id uuid primary key default gen_random_uuid(),
  moved_on date not null,
  kind text not null check (kind in ('opening_balance', 'contribution', 'interest', 'withdrawal')),
  amount numeric(12,2) not null check (amount >= 0),
  description text,
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

do $$
declare
  t text;
begin
  foreach t in array array['memoria_budgets', 'memoria_budget_lines', 'memoria_reserve_movements'] loop
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

create index memoria_budgets_decision_idx on public.memoria_budgets (decision_id);
create index memoria_budget_lines_budget_idx on public.memoria_budget_lines (budget_id);
create index memoria_reserve_movements_date_idx on public.memoria_reserve_movements (moved_on);
create index memoria_reserve_movements_decision_idx on public.memoria_reserve_movements (decision_id);

create or replace function public.memoria_purge_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.memoria_reserve_movements where is_demo;
  delete from public.memoria_budget_lines where is_demo;
  delete from public.memoria_budgets where is_demo;
  delete from public.memoria_mandates where is_demo;
  delete from public.memoria_meeting_items where is_demo;
  delete from public.memoria_meetings where is_demo;
  delete from public.memoria_obligation_logs where is_demo;
  delete from public.memoria_obligations where is_demo;
  delete from public.memoria_task_updates where is_demo;
  delete from public.memoria_tasks where is_demo;
  delete from public.memoria_decision_links where is_demo;
  delete from public.memoria_documents where is_demo;
  delete from public.memoria_invoices where is_demo;
  delete from public.memoria_imports where is_demo;
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
