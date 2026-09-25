-- ============================================================
-- Memoria — poistné udalosti, spory, reklamácie a právne veci
--
-- memoria_cases         jedna vec (typ, protistrana, suma, stav, ďalší krok a termín)
-- memoria_case_updates  priebeh (čo sa kedy stalo)
-- Pri dlžníkoch sa neukladajú mená vlastníkov (iba celkové sumy).
-- Migrácia je aditívna.
-- ============================================================

create table public.memoria_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null check (case_type in ('insurance_claim', 'dispute', 'warranty', 'legal')),
  title text not null,
  description text,
  counterparty text,
  supplier_id uuid references public.memoria_suppliers(id) on delete set null,
  reference text,
  opened_on date not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'settled', 'won', 'lost', 'closed')),
  amount_claimed numeric(12,2),
  amount_recovered numeric(12,2),
  next_step text,
  next_step_due date,
  responsible text,
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  closed_on date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.memoria_case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.memoria_cases(id) on delete cascade,
  happened_on date not null default current_date,
  note text not null,
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
  foreach t in array array['memoria_cases', 'memoria_case_updates'] loop
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

create index memoria_cases_supplier_idx on public.memoria_cases (supplier_id);
create index memoria_cases_decision_idx on public.memoria_cases (decision_id);
create index memoria_cases_due_idx on public.memoria_cases (next_step_due) where status in ('open', 'in_progress', 'waiting');
create index memoria_case_updates_case_idx on public.memoria_case_updates (case_id, happened_on desc);

alter table public.memoria_documents drop constraint memoria_documents_entity_type_check;
alter table public.memoria_documents add constraint memoria_documents_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting', 'mandate', 'case'));
alter table public.memoria_decision_links drop constraint memoria_decision_links_entity_type_check;
alter table public.memoria_decision_links add constraint memoria_decision_links_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting', 'mandate', 'case'));

create or replace function public.memoria_purge_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.memoria_case_updates where is_demo;
  delete from public.memoria_cases where is_demo;
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
