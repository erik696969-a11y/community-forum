-- ============================================================
-- Memoria — import faktúr od administrátora (Excel, CSV, text, PDF, foto)
--
-- memoria_imports: jeden záznam na každý import (súbor, formát, obdobie, počty),
-- aby bolo jasné, odkiaľ faktúra prišla, a import sa dal celý vrátiť späť.
-- memoria_invoices.import_id: väzba faktúry na import.
-- Migrácia je aditívna.
-- ============================================================

create table public.memoria_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  storage_path text,           -- kópia zdrojového súboru v buckete „memoria“ (imports/…)
  source_format text not null check (source_format in ('xlsx', 'csv', 'text', 'pdf', 'image')),
  period_from date,
  period_to date,
  rows_in_file integer,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  suppliers_created integer not null default 0,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create trigger memoria_imports_touch before insert or update on public.memoria_imports
  for each row execute function public.memoria_touch();
create trigger memoria_imports_activity after insert or update or delete on public.memoria_imports
  for each row execute function public.memoria_log_activity();

alter table public.memoria_imports enable row level security;
create policy board_select_memoria_imports on public.memoria_imports for select to authenticated using (public.is_approved_board_member());
create policy board_insert_memoria_imports on public.memoria_imports for insert to authenticated with check (public.is_approved_board_member());
create policy board_update_memoria_imports on public.memoria_imports for update to authenticated using (public.is_approved_board_member()) with check (public.is_approved_board_member());
create policy board_delete_memoria_imports on public.memoria_imports for delete to authenticated using (public.is_approved_board_member());

create index memoria_imports_created_by_idx on public.memoria_imports (created_by);
create index memoria_imports_updated_by_idx on public.memoria_imports (updated_by);
create index memoria_imports_created_at_idx on public.memoria_imports (created_at desc);

alter table public.memoria_invoices add column import_id uuid references public.memoria_imports(id) on delete set null;
create index memoria_invoices_import_idx on public.memoria_invoices (import_id);

-- Aktivita: čitateľný názov importu = názov súboru.
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
    left(coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'subject', v_row ->> 'person_name', v_row ->> 'invoice_number', v_row ->> 'file_name', v_row ->> 'description', v_row ->> 'note'), 200),
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

create or replace function public.memoria_purge_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
