-- Memoria — používanie nástroja: návštevy a čas členov boardu (pre vyhodnotenie skúšobného obdobia).
-- Transparentné: každý člen boardu vidí údaje všetkých; nikto ich nemôže meniť ani mazať.
-- Čas sa meria na serveri (trigger nastaví last_seen_at = now()), klient ho nevie nafúknuť.

create table if not exists public.memoria_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  tabs text[] not null default '{}'
);
create index if not exists memoria_usage_sessions_user_idx on public.memoria_usage_sessions (user_id, started_at);
create index if not exists memoria_usage_sessions_started_idx on public.memoria_usage_sessions (started_at);

alter table public.memoria_usage_sessions enable row level security;

drop policy if exists memoria_usage_select on public.memoria_usage_sessions;
create policy memoria_usage_select on public.memoria_usage_sessions
  for select using (public.is_approved_board_member());

drop policy if exists memoria_usage_insert on public.memoria_usage_sessions;
create policy memoria_usage_insert on public.memoria_usage_sessions
  for insert with check (public.is_approved_board_member() and user_id = auth.uid());

drop policy if exists memoria_usage_update on public.memoria_usage_sessions;
create policy memoria_usage_update on public.memoria_usage_sessions
  for update using (public.is_approved_board_member() and user_id = auth.uid())
  with check (user_id = auth.uid());
-- Žiadna politika na delete: záznamy o používaní sa nedajú zmazať z aplikácie.

create or replace function public.memoria_usage_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.started_at := now();
    new.last_seen_at := now();
    new.tabs := coalesce(new.tabs, '{}');
  else
    -- Mení sa iba čas poslednej aktivity (vždy serverový) a zoznam navštívených kariet.
    new.id := old.id;
    new.user_id := old.user_id;
    new.started_at := old.started_at;
    new.last_seen_at := greatest(old.last_seen_at, now());
    new.tabs := (select coalesce(array_agg(distinct t order by t), '{}') from unnest(coalesce(old.tabs, '{}') || coalesce(new.tabs, '{}')) t where t is not null and length(t) <= 30);
  end if;
  return new;
end;
$$;

drop trigger if exists memoria_usage_guard on public.memoria_usage_sessions;
create trigger memoria_usage_guard before insert or update on public.memoria_usage_sessions
  for each row execute function public.memoria_usage_guard();

-- Súhrn za obdobie pre každého člena boardu (aj bývalého, ak v období niečo robil).
-- Čas = súčet trvania návštev; návšteva končí po 10 min nečinnosti (rieši klient novou návštevou).
create or replace function public.memoria_usage_summary(p_from date, p_to date)
returns table (
  user_id uuid,
  full_name text,
  is_board boolean,
  visits bigint,
  active_days bigint,
  minutes numeric,
  first_visit timestamptz,
  last_visit timestamptz,
  added bigint,
  updated bigint,
  deleted bigint,
  ai_requests bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_board_member() then
    raise exception 'Forbidden';
  end if;
  return query
  with s as (
    select us.user_id, count(*) as visits,
           count(distinct (us.started_at at time zone 'Europe/Madrid')::date) as active_days,
           round(sum(extract(epoch from (us.last_seen_at - us.started_at)) / 60.0)::numeric, 1) as minutes,
           min(us.started_at) as first_visit, max(us.last_seen_at) as last_visit
    from memoria_usage_sessions us
    where us.started_at >= p_from and us.started_at < p_to + 1
    group by us.user_id
  ), a as (
    select ma.actor_id as user_id,
           count(*) filter (where ma.action = 'insert') as added,
           count(*) filter (where ma.action = 'update') as updated,
           count(*) filter (where ma.action = 'delete') as deleted
    from memoria_activity ma
    where ma.occurred_at >= p_from and ma.occurred_at < p_to + 1 and not coalesce(ma.is_demo, false) and ma.actor_id is not null
    group by ma.actor_id
  ), r as (
    select rl.user_id, sum(rl.request_count)::bigint as ai_requests
    from api_rate_limit rl
    where rl.endpoint like 'memoria-%' and rl.window_start between p_from and p_to
    group by rl.user_id
  ), people as (
    select p.id as user_id from profiles p where p.role = 'board' and p.status = 'approved'
    union select s.user_id from s union select a.user_id from a union select r.user_id from r
  )
  select pe.user_id, pr.full_name, (pr.role = 'board' and pr.status = 'approved') as is_board,
         coalesce(s.visits, 0), coalesce(s.active_days, 0), coalesce(s.minutes, 0),
         s.first_visit, s.last_visit,
         coalesce(a.added, 0), coalesce(a.updated, 0), coalesce(a.deleted, 0), coalesce(r.ai_requests, 0)
  from people pe
  left join profiles pr on pr.id = pe.user_id
  left join s on s.user_id = pe.user_id
  left join a on a.user_id = pe.user_id
  left join r on r.user_id = pe.user_id
  order by coalesce(s.minutes, 0) desc, pr.full_name;
end;
$$;

revoke all on function public.memoria_usage_summary(date, date) from public, anon;
grant execute on function public.memoria_usage_summary(date, date) to authenticated;
