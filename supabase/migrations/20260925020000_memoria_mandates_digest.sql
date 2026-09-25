-- ============================================================
-- Memoria — mandáty boardu, e-mailové pripomienky, stav dát
--
-- 1) memoria_mandates: kto zastáva akú funkciu, od kedy do kedy, kto ho zvolil,
--    kedy dostal a kedy mu bol odobratý prístup do Memorie (kontinuita pri výmene boardu).
-- 2) profiles.memoria_email: člen boardu môže vypnúť e-mailové pripomienky Memorie.
-- 3) 'mandate' ako typ záznamu pre prílohy a väzby na rozhodnutia.
-- 4) Aktivita číta aj person_name; memoria_purge_demo() maže aj demo mandáty.
-- Migrácia je aditívna.
-- ============================================================

create table public.memoria_mandates (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  position text not null check (position in ('president', 'vice_president', 'board_member', 'administrator', 'other')),
  starts_on date not null,
  ends_on date,                -- plánovaný koniec (stanovy: mandát na 1 rok)
  ended_on date,               -- skutočný koniec (odstúpenie, odvolanie)
  appointed_by text,           -- napr. „Riadne VZ 23/04/2026“
  decision_id uuid references public.memoria_decisions(id) on delete set null,
  access_granted_on date,
  access_removed_on date,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint memoria_mandates_dates check (ends_on is null or ends_on >= starts_on),
  constraint memoria_mandates_ended check (ended_on is null or ended_on >= starts_on)
);

create trigger memoria_mandates_touch before insert or update on public.memoria_mandates
  for each row execute function public.memoria_touch();
create trigger memoria_mandates_activity after insert or update or delete on public.memoria_mandates
  for each row execute function public.memoria_log_activity();

alter table public.memoria_mandates enable row level security;
create policy board_select_memoria_mandates on public.memoria_mandates for select to authenticated using (public.is_approved_board_member());
create policy board_insert_memoria_mandates on public.memoria_mandates for insert to authenticated with check (public.is_approved_board_member());
create policy board_update_memoria_mandates on public.memoria_mandates for update to authenticated using (public.is_approved_board_member()) with check (public.is_approved_board_member());
create policy board_delete_memoria_mandates on public.memoria_mandates for delete to authenticated using (public.is_approved_board_member());

create index memoria_mandates_profile_idx on public.memoria_mandates (profile_id);
create index memoria_mandates_decision_idx on public.memoria_mandates (decision_id);
create index memoria_mandates_created_by_idx on public.memoria_mandates (created_by);
create index memoria_mandates_updated_by_idx on public.memoria_mandates (updated_by);
create index memoria_mandates_ends_idx on public.memoria_mandates (ends_on);


-- ---------- 2) E-mailové pripomienky ----------
alter table public.profiles add column if not exists memoria_email boolean not null default true;


-- ---------- 3) Nový typ záznamu ----------
alter table public.memoria_documents drop constraint memoria_documents_entity_type_check;
alter table public.memoria_documents add constraint memoria_documents_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting', 'mandate'));
alter table public.memoria_decision_links drop constraint memoria_decision_links_entity_type_check;
alter table public.memoria_decision_links add constraint memoria_decision_links_entity_type_check
  check (entity_type in ('supplier', 'tender', 'quote', 'contract', 'invoice', 'decision', 'task', 'obligation', 'meeting', 'mandate'));


-- ---------- 4) Aktivita a mazanie demo dát ----------
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
    left(coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'subject', v_row ->> 'person_name', v_row ->> 'invoice_number', v_row ->> 'description', v_row ->> 'note'), 200),
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
