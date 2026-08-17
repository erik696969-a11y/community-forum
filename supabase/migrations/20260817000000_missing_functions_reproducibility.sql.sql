-- ============================================================
-- Session 1 — databázová reprodukovateľnosť
--
-- Tieto veci už bežia naživo v Supabase, ale nikde v repozitári.
-- Tento skript ich zapisuje do repozitára presne v takom znení,
-- v akom naozaj bežia (vytiahnuté priamo z produkčnej DB),
-- takže spustenie tohto skriptu na produkcii je NEŠKODNÉ
-- ("create or replace" / "if not exists") — len dopĺňa chýbajúcu
-- dokumentáciu, nič nemení funkčne, okrem 2 malých opráv nižšie
-- označených POZNÁMKA.
-- ============================================================


-- ---------- is_board_member ----------
create or replace function public.is_board_member()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'board' and status = 'approved'
  );
$function$;


-- ---------- is_approved_board_member ----------
-- POZNÁMKA: naživo tejto funkcii chýbal search_path a používala
-- neplne-kvalifikovaný "profiles" — dopĺňam obe veci, bez zmeny logiky.
create or replace function public.is_approved_board_member()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'board' and status = 'approved'
  );
$function$;


-- ---------- check_and_increment_rate_limit ----------
-- POZNÁMKA: naživo tejto funkcii chýbal search_path — dopĺňam.
create or replace function public.check_and_increment_rate_limit(p_user_id uuid, p_endpoint text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_count int;
begin
  insert into api_rate_limit (user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, current_date, 1)
  on conflict (user_id, endpoint, window_start)
  do update set request_count = api_rate_limit.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$function$;


-- ---------- get_author_profiles ----------
create or replace function public.get_author_profiles(p_ids uuid[])
returns table(id uuid, full_name text, apartment_number text, badges text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.full_name, p.apartment_number, p.badges
  from public.profiles p
  where p.status = 'approved'
    and p.id = any(p_ids)
    and public.is_approved_member();
$function$;


-- ---------- get_board_members ----------
create or replace function public.get_board_members()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.full_name
  from public.profiles p
  where p.status = 'approved'
    and p.role = 'board'
    and public.is_approved_member();
$function$;


-- ---------- get_directory_members ----------
create or replace function public.get_directory_members()
returns table(id uuid, full_name text, apartment_number text, badges text[], spoken_languages text[], role text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.full_name, p.apartment_number, p.badges, p.spoken_languages, p.role
  from public.profiles p
  where p.status = 'approved'
    and p.directory_visible = true
    and public.is_approved_member();
$function$;


-- ---------- mark_message_read ----------
create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient_id uuid;
begin
  select recipient_id into v_recipient_id from messages where id = p_message_id;

  if v_recipient_id is null then
    -- Hromadná správa pre výbor (recipient_id je NULL) - smie označiť
    -- ktokoľvek z výboru.
    if not public.is_board_member() then
      raise exception 'Not authorized to mark this message as read';
    end if;
  else
    if v_recipient_id != auth.uid() then
      raise exception 'Not authorized to mark this message as read';
    end if;
  end if;

  update messages set is_read = true where id = p_message_id;
end;
$function$;


-- ---------- set_post_locked ----------
create or replace function public.set_post_locked(p_post_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_board_member() then
    raise exception 'Only board members can lock/unlock discussions';
  end if;

  update posts set locked = p_locked where id = p_post_id;
end;
$function$;


-- ---------- set_post_pinned ----------
create or replace function public.set_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_board_member() then
    raise exception 'Only board members can pin/unpin posts';
  end if;

  update posts set pinned = p_pinned where id = p_post_id;
end;
$function$;


-- ---------- email_reply_tokens (chýbajúca tabuľka) ----------
-- Zostavené podľa stĺpcov potvrdených priamo v produkčnej DB
-- (token text PK, post_id uuid, user_id uuid, created_at timestamptz).
-- "if not exists" = neškodné, ak tabuľka už existuje, nič sa nestane.
create table if not exists public.email_reply_tokens (
  token text primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.email_reply_tokens enable row level security;

-- Táto tabuľka sa používa len server-side (cez service role v
-- lib/emailReplyToken.js), takže bežní používatelia k nej nemajú
-- priamy prístup cez API — žiadna verejná policy nie je potrebná.
