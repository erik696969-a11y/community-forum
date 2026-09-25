-- ============================================================
-- Site Manager reporting (sm_*) — modul v Mi Hacienda
--
-- Replikuje Google Apps Script nástroj (Code.gs / App.html) 1:1:
--   Site Manager zapisuje  →  kontaktná osoba boardu číta a posiela  →  board dostáva e-mail.
--
-- Pravidlá, ktoré vynucuje DATABÁZA (nie aplikácia):
--   * Tabuľky modulu nemajú žiadne RLS pravidlá pre prihlásených používateľov. Čítať a zapisovať
--     sa dá IBA cez funkcie nižšie, ktoré overia rolu volajúceho. Board (vrátane autora systému
--     a prezidenta) k tabuľkám prístup nemá.
--   * Iba pridávanie: žiadna funkcia nemení ani nemaže záznamy. Stav (pozastavené, uzavreté)
--     je samostatná udalosť. Oprava = nový záznam.
--   * Čas a autora zapisuje databáza, nie telefón.
--   * Reťazec odtlačkov (sm_ledger): každý nový riadok nesie odtlačok celej doterajšej histórie.
--     Odtlačok ide do každého e-mailového reportu, takže dodatočná zmena je zistiteľná.
--   * Každé čítanie sa zapíše do sm_access_log (kto, kedy, čo).
--   * Role, ciele (X hodnoty) a deklarované konflikty záujmov mení iba správca databázy
--     (SQL, s odkazom na zápisnicu) a aj tieto zmeny idú do reťazca odtlačkov.
--
-- Modul je po nasadení „vypnutý“: kým nikto nemá rolu v sm_roles, nikto ho nevidí.
-- Migrácia je aditívna.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Role, ciele, konflikty záujmov
-- ---------------------------------------------------------------------------
create table public.sm_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('site_manager', 'point_of_contact')),
  active_from date not null default current_date,
  active_to date,
  minute_ref text,
  note text,
  created_at timestamptz not null default now()
);

create table public.sm_targets (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in (
    'urgent_within_hours', 'routine_within_days', 'stale_days', 'maintenance_target',
    'quotation_threshold', 'quotations_required'
  )),
  value numeric not null,
  effective_from date not null default current_date,
  minute_ref text,          -- zápisnica, ktorou board hodnotu stanovil (null = iba návrh)
  created_at timestamptz not null default now()
);

-- Deklarovaný vzťah člena boardu k držiteľovi funkcie Site Manager (napr. rodinný).
-- Kým je aktívny, daný člen neschvaľuje zákazky obstarané Site Managerom a nie je v jeho hodnotení.
-- Keď vzťah skončí, nastaví sa active_to a proces sa vráti do bežného stavu.
create table public.sm_conflicts (
  id uuid primary key default gen_random_uuid(),
  board_member_id uuid not null references public.profiles(id) on delete restrict,
  relation text not null,                   -- napr. 'family'
  description text,                         -- napr. 'father of the Site Manager'
  declared_on date not null default current_date,
  minute_ref text,
  active_from date not null default current_date,
  active_to date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Záznamy (log) a ich udalosti
-- ---------------------------------------------------------------------------
create table public.sm_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,            -- 'YYYY-NNNN'
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in ('incident', 'defect', 'maintenance')),
  location text not null,
  block text,
  description text not null check (length(description) between 1 and 2000),
  urgency text not null default 'low' check (urgency in ('low', 'medium', 'high')),
  photo_path text                            -- cesta v buckete „site“
);

create table public.sm_entry_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.sm_entries(id) on delete restrict,
  kind text not null check (kind in ('hold', 'resume', 'close')),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Obstarávanie (zákazky nad limit a ponuky)
-- ---------------------------------------------------------------------------
create table public.sm_works (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,            -- 'PYYYY-NNNN'
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  location text,
  description text not null check (length(description) between 1 and 2000),
  estimated_value numeric(12,2) not null check (estimated_value >= 0),
  recommended text,
  recommendation_reason text,
  approver_label text
);

create table public.sm_quotations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.sm_works(id) on delete restrict,
  position smallint not null check (position between 1 and 10),
  supplier text not null,
  amount numeric(12,2) not null check (amount >= 0),
  doc_path text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  unique (work_id, position)
);

create table public.sm_work_events (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.sm_works(id) on delete restrict,
  kind text not null check (kind in ('approval_requested', 'sent_to_memoria', 'decision')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Odoslané reporty (zmrazená kópia čísel v čase odoslania)
-- ---------------------------------------------------------------------------
create table public.sm_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('weekly', 'fortnightly', 'monthly', 'summary')),
  period_from timestamptz not null,
  period_to timestamptz not null,
  maintenance_due int,
  maintenance_done int,
  inspections int,
  note text,
  metrics jsonb not null,
  sent_to text[] not null default '{}',
  fingerprint text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict
);

create table public.sm_committee_reports (
  id uuid primary key default gen_random_uuid(),
  period_from timestamptz not null,
  period_to timestamptz not null,
  days int not null,
  comment text,
  metrics jsonb not null,
  spot_check_refs text[] not null default '{}',
  recipients text[] not null default '{}',
  fingerprint text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Záznam o prístupoch a reťazec odtlačkov
-- ---------------------------------------------------------------------------
create table public.sm_access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null
);

create table public.sm_ledger (
  seq bigint generated always as identity primary key,
  at timestamptz not null default now(),
  table_name text not null,
  op text not null,
  row_id uuid,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null
);

-- Všetky tabuľky modulu: RLS zapnuté a pre prihlásených používateľov ŽIADNE pravidlá.
do $$
declare t text;
begin
  foreach t in array array[
    'sm_roles', 'sm_targets', 'sm_conflicts', 'sm_entries', 'sm_entry_events', 'sm_works',
    'sm_quotations', 'sm_work_events', 'sm_reports', 'sm_committee_reports', 'sm_access_log', 'sm_ledger'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

create index sm_entry_events_entry_idx on public.sm_entry_events (entry_id, created_at);
create index sm_quotations_work_idx on public.sm_quotations (work_id);
create index sm_work_events_work_idx on public.sm_work_events (work_id, created_at);
create index sm_access_log_at_idx on public.sm_access_log (at desc);

-- ---------------------------------------------------------------------------
-- Čas a autor: vždy zo servera
-- ---------------------------------------------------------------------------
create or replace function public.sm_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sm_entries', 'sm_entry_events', 'sm_works', 'sm_quotations', 'sm_work_events',
    'sm_reports', 'sm_committee_reports'
  ] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.sm_stamp()', t || '_stamp', t);
  end loop;
end;
$$;

-- Zákaz úprav a mazania v tabuľkách záznamov — platí pre každého vrátane aplikácie.
create or replace function public.sm_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Site reporting records are append-only (% on %). A correction is a new entry.', tg_op, tg_table_name;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sm_entries', 'sm_entry_events', 'sm_works', 'sm_quotations', 'sm_work_events',
    'sm_reports', 'sm_committee_reports', 'sm_access_log', 'sm_ledger'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.sm_append_only()', t || '_append_only', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reťazec odtlačkov
-- ---------------------------------------------------------------------------
create or replace function public.sm_hash(prev text, tbl text, op text, payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(prev || '|' || tbl || '|' || op || '|' || payload::text, 'sha256'), 'hex');
$$;

create or replace function public.sm_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev text;
  body jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('sm_ledger'));
  select l.hash into prev from public.sm_ledger l order by l.seq desc limit 1;
  prev := coalesce(prev, 'genesis');
  body := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.sm_ledger (table_name, op, row_id, payload, prev_hash, hash)
  values (tg_table_name, tg_op, (body ->> 'id')::uuid, body, prev, public.sm_hash(prev, tg_table_name, tg_op, body));
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sm_roles', 'sm_targets', 'sm_conflicts', 'sm_entries', 'sm_entry_events', 'sm_works',
    'sm_quotations', 'sm_work_events', 'sm_reports', 'sm_committee_reports'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.sm_chain()', t || '_chain', t);
  end loop;
end;
$$;

-- Kontrola celistvosti: prepočíta reťazec a porovná uložené riadky s ich odtlačkom.
create or replace function public.sm_verify_chain_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  prev text := 'genesis';
  n bigint := 0;
  current_row jsonb;
begin
  for r in select * from public.sm_ledger order by seq loop
    n := n + 1;
    if r.prev_hash <> prev or r.hash <> public.sm_hash(prev, r.table_name, r.op, r.payload) then
      return jsonb_build_object('ok', false, 'broken_at', r.seq, 'reason', 'chain', 'count', n);
    end if;
    prev := r.hash;
  end loop;

  -- Riadky, ktoré sa nesmú meniť, musia byť presne také, aké boli pri zápise.
  for r in
    select l.table_name, l.row_id, l.payload, l.seq from public.sm_ledger l
    where l.op = 'INSERT' and l.table_name in ('sm_entries', 'sm_entry_events', 'sm_works', 'sm_quotations', 'sm_work_events', 'sm_reports', 'sm_committee_reports')
  loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.table_name) into current_row using r.row_id;
    if current_row is null or current_row <> r.payload then
      return jsonb_build_object('ok', false, 'broken_at', r.seq, 'reason', 'row', 'count', n);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'count', n, 'head', prev, 'fingerprint', left(prev, 12));
end;
$$;

-- ---------------------------------------------------------------------------
-- Role volajúceho
-- ---------------------------------------------------------------------------
create or replace function public.sm_has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sm_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role = p_role
      and r.active_from <= current_date
      and (r.active_to is null or r.active_to >= current_date)
      and p.status = 'approved'
  );
$$;

create or replace function public.sm_log(p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sm_access_log (user_id, action) values (auth.uid(), p_action);
$$;

create or replace function public.sm_targets_now()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.key, jsonb_build_object('value', t.value, 'minute_ref', t.minute_ref, 'effective_from', t.effective_from)), '{}'::jsonb)
  from (
    select distinct on (key) key, value, minute_ref, effective_from
    from public.sm_targets
    where effective_from <= current_date
    order by key, effective_from desc, created_at desc
  ) t;
$$;

-- Kto som v module a kto má ktoré funkcie (mená, nie údaje).
create or replace function public.sm_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  is_sm boolean := public.sm_has_role('site_manager');
  is_poc boolean := public.sm_has_role('point_of_contact');
begin
  return jsonb_build_object(
    'site_manager', is_sm,
    'point_of_contact', is_poc,
    'site_manager_name', (
      select p.full_name from public.sm_roles r join public.profiles p on p.id = r.user_id
      where r.role = 'site_manager' and r.active_from <= current_date and (r.active_to is null or r.active_to >= current_date)
      order by r.active_from desc limit 1),
    'contact_name', (
      select p.full_name from public.sm_roles r join public.profiles p on p.id = r.user_id
      where r.role = 'point_of_contact' and r.active_from <= current_date and (r.active_to is null or r.active_to >= current_date)
      order by r.active_from desc limit 1),
    'targets', case when is_sm or is_poc then public.sm_targets_now() else '{}'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Zápis: iba Site Manager
-- ---------------------------------------------------------------------------
create or replace function public.sm_add_entry(
  p_type text, p_location text, p_block text, p_description text, p_urgency text, p_photo_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yr int := extract(year from now() at time zone 'Europe/Madrid');
  n int;
  ref text;
begin
  if not public.sm_has_role('site_manager') then
    raise exception 'Read-only access: entries are made by the Site Manager.';
  end if;
  if coalesce(trim(p_description), '') = '' or coalesce(trim(p_location), '') = '' then
    raise exception 'Type, location and description are required.';
  end if;
  if p_photo_path is not null and p_photo_path not like 'entries/%' then
    raise exception 'Invalid photo path.';
  end if;
  perform pg_advisory_xact_lock(hashtext('sm_entries_ref'));
  select count(*) + 1 into n from public.sm_entries where reference like yr || '-%';
  ref := yr || '-' || lpad(n::text, 4, '0');
  insert into public.sm_entries (reference, created_by, type, location, block, description, urgency, photo_path)
  values (ref, auth.uid(), p_type, trim(p_location), nullif(trim(p_block), ''), trim(p_description), coalesce(p_urgency, 'low'), p_photo_path);
  return ref;
end;
$$;

create or replace function public.sm_entry_state(p_entry_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case e.kind when 'hold' then 'on_hold' when 'resume' then 'open' else 'closed' end
    from public.sm_entry_events e where e.entry_id = p_entry_id
    order by e.created_at desc, e.id desc limit 1
  ), 'open');
$$;

create or replace function public.sm_add_event(p_reference text, p_kind text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
  st text;
begin
  if not public.sm_has_role('site_manager') then
    raise exception 'Read-only access: entries are made by the Site Manager.';
  end if;
  select id into eid from public.sm_entries where reference = p_reference;
  if eid is null then raise exception 'Reference not found.'; end if;
  perform pg_advisory_xact_lock(hashtext('sm_entry_' || eid::text));
  st := public.sm_entry_state(eid);
  if st = 'closed' then raise exception 'Already closed.'; end if;
  if p_kind = 'hold' and st = 'on_hold' then raise exception 'Already on hold.'; end if;
  if p_kind = 'resume' and st <> 'on_hold' then raise exception 'Not on hold.'; end if;
  if p_kind = 'hold' and coalesce(trim(p_reason), '') = '' then raise exception 'Say what the item is waiting on.'; end if;
  insert into public.sm_entry_events (entry_id, kind, reason, created_by)
  values (eid, p_kind, nullif(trim(p_reason), ''), auth.uid());
  return p_reference;
end;
$$;

-- p_quotations = [{"supplier": "...", "amount": 123.45, "doc_path": "quotes/..."}]
create or replace function public.sm_add_work(
  p_location text, p_description text, p_estimate numeric, p_recommended text, p_reason text,
  p_approver_label text, p_quotations jsonb, p_request_approval boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yr int := extract(year from now() at time zone 'Europe/Madrid');
  n int;
  ref text;
  wid uuid;
  q jsonb;
  pos int := 0;
begin
  if not public.sm_has_role('site_manager') then
    raise exception 'Read-only access: entries are made by the Site Manager.';
  end if;
  if coalesce(trim(p_description), '') = '' or p_estimate is null then
    raise exception 'Description and estimated value are required.';
  end if;
  perform pg_advisory_xact_lock(hashtext('sm_works_ref'));
  select count(*) + 1 into n from public.sm_works where reference like 'P' || yr || '-%';
  ref := 'P' || yr || '-' || lpad(n::text, 4, '0');
  insert into public.sm_works (reference, created_by, location, description, estimated_value, recommended, recommendation_reason, approver_label)
  values (ref, auth.uid(), nullif(trim(p_location), ''), trim(p_description), p_estimate,
          nullif(trim(p_recommended), ''), nullif(trim(p_reason), ''), nullif(trim(p_approver_label), ''))
  returning id into wid;

  for q in select * from jsonb_array_elements(coalesce(p_quotations, '[]'::jsonb)) loop
    if coalesce(trim(q ->> 'supplier'), '') <> '' then
      if (q ->> 'doc_path') is not null and (q ->> 'doc_path') not like 'quotes/%' then
        raise exception 'Invalid quotation path.';
      end if;
      pos := pos + 1;
      insert into public.sm_quotations (work_id, position, supplier, amount, doc_path, created_by)
      values (wid, pos, trim(q ->> 'supplier'), coalesce(nullif(q ->> 'amount', '')::numeric, 0), q ->> 'doc_path', auth.uid());
    end if;
  end loop;

  if p_request_approval then
    insert into public.sm_work_events (work_id, kind, created_by) values (wid, 'approval_requested', auth.uid());
  end if;
  return ref;
end;
$$;

-- ---------------------------------------------------------------------------
-- Čítanie: Site Manager (svoje záznamy) a kontaktná osoba (všetko, iba čítanie)
-- ---------------------------------------------------------------------------
create or replace function public.sm_read(p_scope text default 'log')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_sm boolean := public.sm_has_role('site_manager');
  is_poc boolean := public.sm_has_role('point_of_contact');
  result jsonb;
begin
  if not (is_sm or is_poc) then
    raise exception 'No access to site reporting.';
  end if;
  perform public.sm_log('read:' || coalesce(p_scope, 'log'));

  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'reference', e.reference, 'created_at', e.created_at, 'type', e.type,
        'location', e.location, 'block', e.block, 'description', e.description, 'urgency', e.urgency,
        'photo_path', e.photo_path, 'mine', e.created_by = auth.uid(),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object('kind', v.kind, 'reason', v.reason, 'created_at', v.created_at) order by v.created_at, v.id)
          from public.sm_entry_events v where v.entry_id = e.id), '[]'::jsonb)
      ) order by e.created_at)
      from public.sm_entries e
      where is_poc or e.created_by = auth.uid()), '[]'::jsonb),
    'works', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'reference', w.reference, 'created_at', w.created_at, 'location', w.location,
        'description', w.description, 'estimated_value', w.estimated_value, 'recommended', w.recommended,
        'recommendation_reason', w.recommendation_reason, 'approver_label', w.approver_label,
        'quotations', coalesce((
          select jsonb_agg(jsonb_build_object('position', q.position, 'supplier', q.supplier, 'amount', q.amount, 'doc_path', q.doc_path) order by q.position)
          from public.sm_quotations q where q.work_id = w.id), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object('kind', v.kind, 'data', v.data, 'created_at', v.created_at) order by v.created_at, v.id)
          from public.sm_work_events v where v.work_id = w.id), '[]'::jsonb),
        'memoria', (
          select jsonb_build_object(
            'tender_id', t.id, 'status', t.status, 'selection_reason', t.selection_reason,
            'selected_supplier', (select s.name from public.memoria_suppliers s where s.id = t.selected_supplier_id),
            'updated_at', t.updated_at)
          from public.memoria_tenders t where t.sm_work_id = w.id limit 1)
      ) order by w.created_at)
      from public.sm_works w
      where is_poc or w.created_by = auth.uid()), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'period_from', r.period_from, 'period_to', r.period_to,
        'maintenance_due', r.maintenance_due, 'maintenance_done', r.maintenance_done,
        'inspections', r.inspections, 'note', r.note, 'metrics', r.metrics,
        'fingerprint', r.fingerprint, 'created_at', r.created_at) order by r.created_at)
      from public.sm_reports r
      where is_poc or r.created_by = auth.uid()), '[]'::jsonb),
    'committee_reports', case when is_poc then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'period_from', c.period_from, 'period_to', c.period_to, 'days', c.days,
        'comment', c.comment, 'recipients', c.recipients, 'fingerprint', c.fingerprint,
        'created_at', c.created_at) order by c.created_at)
      from public.sm_committee_reports c), '[]'::jsonb) else '[]'::jsonb end,
    'targets', public.sm_targets_now(),
    'integrity', public.sm_verify_chain_internal()
  ) into result;

  return result;
end;
$$;

-- Záznam o prístupoch: vidí ho kontaktná osoba aj board (kto a kedy, nie obsah).
create or replace function public.sm_read_access_log(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.sm_has_role('point_of_contact') or public.is_approved_board_member()) then
    raise exception 'No access.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', a.at, 'who', p.full_name, 'action', a.action) order by a.at desc)
    from (select * from public.sm_access_log order by at desc limit least(greatest(p_limit, 1), 500)) a
    left join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end;
$$;

-- Kontrola celistvosti pre kontaktnú osobu aj board.
create or replace function public.sm_verify_chain()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.sm_has_role('point_of_contact') or public.sm_has_role('site_manager') or public.is_approved_board_member()) then
    raise exception 'No access.';
  end if;
  return public.sm_verify_chain_internal();
end;
$$;

-- ---------------------------------------------------------------------------
-- Kontaktná osoba: presun zákazky do Memorie a zápis rozhodnutia
-- ---------------------------------------------------------------------------
alter table public.memoria_tenders add column sm_work_id uuid unique references public.sm_works(id) on delete restrict;
alter table public.memoria_tenders add column sm_reference text;

create or replace function public.sm_push_to_memoria(p_work_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.sm_works;
  tid uuid;
  sid uuid;
  q public.sm_quotations;
  qid uuid;
  quotes jsonb := '[]'::jsonb;
  desc_text text;
begin
  if not public.sm_has_role('point_of_contact') then
    raise exception 'Only the point of contact can send a work to Memoria.';
  end if;
  if not public.is_approved_board_member() then
    raise exception 'Memoria is for approved board members only.';
  end if;
  select * into w from public.sm_works where id = p_work_id;
  if w.id is null then raise exception 'Work not found.'; end if;
  if exists (select 1 from public.memoria_tenders where sm_work_id = w.id) then
    raise exception 'Already in Memoria.';
  end if;

  desc_text := w.description
    || case when w.location is not null then E'\nLocation: ' || w.location else '' end
    || case when w.recommended is not null then E'\nRecommended by the Site Manager: ' || w.recommended else '' end
    || case when w.recommendation_reason is not null then E'\nReason: ' || w.recommendation_reason else '' end;

  insert into public.memoria_tenders (title, description, category, opened_on, status, sm_work_id, sm_reference)
  values (left(w.description, 200), desc_text, 'other', (w.created_at at time zone 'Europe/Madrid')::date, 'collecting', w.id, w.reference)
  returning id into tid;

  for q in select * from public.sm_quotations where work_id = w.id order by position loop
    select id into sid from public.memoria_suppliers where lower(trim(name)) = lower(trim(q.supplier)) limit 1;
    if sid is null then
      insert into public.memoria_suppliers (name, category, notes)
      values (q.supplier, 'other', 'Added from a Site Manager quotation (' || w.reference || ').')
      returning id into sid;
    end if;
    insert into public.memoria_quotes (tender_id, supplier_id, amount, vat_included, submitted_on, notes)
    values (tid, sid, q.amount, false, (q.created_at at time zone 'Europe/Madrid')::date,
            'Site Manager quotation ' || q.position || ' · ' || w.reference)
    returning id into qid;
    quotes := quotes || jsonb_build_object('quote_id', qid, 'doc_path', q.doc_path, 'supplier', q.supplier);
  end loop;

  insert into public.sm_work_events (work_id, kind, data, created_by)
  values (w.id, 'sent_to_memoria', jsonb_build_object('tender_id', tid), auth.uid());

  return jsonb_build_object('tender_id', tid, 'quotes', quotes, 'reference', w.reference);
end;
$$;

-- Rozhodnutie mimo Memorie (napr. odpoveď e-mailom) — zapíše ho kontaktná osoba.
create or replace function public.sm_record_decision(p_reference text, p_decision text, p_decided_by text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare wid uuid;
begin
  if not public.sm_has_role('point_of_contact') then
    raise exception 'Only the point of contact records decisions.';
  end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Unknown decision.'; end if;
  select id into wid from public.sm_works where reference = p_reference;
  if wid is null then raise exception 'Reference not found.'; end if;
  insert into public.sm_work_events (work_id, kind, data, created_by)
  values (wid, 'decision', jsonb_build_object('decision', p_decision, 'decided_by', nullif(trim(p_decided_by), '')), auth.uid());
  return p_reference;
end;
$$;

-- Aktívne konflikty záujmov voči Site Managerovi (mená a dôvod) — pre banner v Memorii.
create or replace function public.sm_active_conflicts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_approved_board_member() or public.sm_has_role('point_of_contact') or public.sm_has_role('site_manager') then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'board_member_id', c.board_member_id, 'name', p.full_name, 'relation', c.relation,
        'description', c.description, 'minute_ref', c.minute_ref, 'declared_on', c.declared_on))
      from public.sm_conflicts c join public.profiles p on p.id = c.board_member_id
      where c.active_from <= current_date and (c.active_to is null or c.active_to >= current_date)), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

-- Prístup k funkciám: iba prihlásení používatelia; interné funkcie nikto zvonka.
revoke execute on function public.sm_verify_chain_internal() from public, anon, authenticated;
revoke execute on function public.sm_chain() from public, anon, authenticated;
revoke execute on function public.sm_log(text) from public, anon, authenticated;
revoke execute on function public.sm_targets_now() from public, anon, authenticated;
revoke execute on function public.sm_entry_state(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'sm_me()', 'sm_add_entry(text, text, text, text, text, text)', 'sm_add_event(text, text, text)',
    'sm_add_work(text, text, numeric, text, text, text, jsonb, boolean)', 'sm_read(text)',
    'sm_read_access_log(int)', 'sm_verify_chain()', 'sm_push_to_memoria(uuid)',
    'sm_record_decision(text, text, text)', 'sm_active_conflicts()', 'sm_has_role(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Súkromné úložisko fotiek a ponúk („site“)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "site_sm_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site' and public.sm_has_role('site_manager')
              and (name like 'entries/%' or name like 'quotes/%'));
create policy "site_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site' and (public.sm_has_role('site_manager') or public.sm_has_role('point_of_contact')));
-- Žiadne update/delete pravidlo: fotky a ponuky sa nedajú prepísať ani zmazať.

-- ---------------------------------------------------------------------------
-- Návrh cieľov (X hodnoty) — bez zápisnice, kým ich board neschváli
-- ---------------------------------------------------------------------------
insert into public.sm_targets (key, value) values
  ('urgent_within_hours', 24),
  ('routine_within_days', 10),
  ('stale_days', 30),
  ('maintenance_target', 90),
  ('quotation_threshold', 1000),
  ('quotations_required', 3);
