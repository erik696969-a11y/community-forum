-- ============================================================
-- Session 5 — Dávka A: DB hardening
--
-- 1) api_rate_limit tabuľka nikdy nemala CREATE TABLE v repozitári
--    (potvrdené — funkcia check_and_increment_rate_limit ju len
--    používala). Bez nej repozitár nevie znova vytvoriť funkčnú DB.
-- 2) check_and_increment_rate_limit je dnes volateľná ktorýmkoľvek
--    authenticated userom priamo cez Supabase RPC s ľubovoľným
--    p_user_id — zamyká sa výhradne pre service_role (jediné, čo ju
--    má reálne volať, z app/api/ask-ai/route.js a app/api/translate/route.js).
-- 3) search_path hardening pre staršie funkcie: 'public' -> '' + plne
--    kvalifikované názvy objektov (Supabase odporúčaný vzor).
-- ============================================================

-- ---------- 1) api_rate_limit ----------
create table if not exists api_rate_limit (
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  window_start date not null,
  request_count int not null default 0,
  primary key (user_id, endpoint, window_start)
);

alter table api_rate_limit enable row level security;
-- Zámerne žiadne SELECT/INSERT/UPDATE policy pre bežných používateľov —
-- prístup ide výhradne cez SECURITY DEFINER funkciu nižšie, volanú
-- server-side cez service_role, ktorý aj tak RLS obchádza.

-- ---------- 2) zamknúť check_and_increment_rate_limit ----------
revoke execute on function public.check_and_increment_rate_limit(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.check_and_increment_rate_limit(uuid, text, integer)
  to service_role;

-- ---------- 3) search_path = '' hardening ----------
create or replace function public.is_approved_member()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.get_poll_results(target_poll_id uuid)
returns table (option_id uuid, vote_count bigint)
language sql
security definer
stable
set search_path = ''
as $$
  select option_id, count(*) as vote_count
  from public.poll_votes
  where poll_id = target_poll_id
    and public.is_approved_member()
  group by option_id;
$$;

create or replace function public.get_all_poll_totals()
returns table (poll_id uuid, total_votes bigint)
language sql
security definer
stable
set search_path = ''
as $$
  select poll_id, count(*) as total_votes
  from public.poll_votes
  where public.is_approved_member()
  group by poll_id;
$$;

create or replace function public.update_own_preferences(
  p_language text default null,
  p_notifications_enabled boolean default null,
  p_directory_visible boolean default null,
  p_spoken_languages text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set
    language = coalesce(p_language, language),
    notifications_enabled = coalesce(p_notifications_enabled, notifications_enabled),
    directory_visible = coalesce(p_directory_visible, directory_visible),
    spoken_languages = coalesce(p_spoken_languages, spoken_languages)
  where id = auth.uid();
end;
$$;

grant execute on function public.update_own_preferences to authenticated;
