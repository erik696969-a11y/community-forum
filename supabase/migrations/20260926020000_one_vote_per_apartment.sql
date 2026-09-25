-- 1 apartmán = 1 hlas + jednotný formát čísla apartmánu.
--
-- Formát (rovnaký ako lib/apartment.js): prízemie <blok>G<dvere> (1G1), inak <blok>.<poschodie>.<dvere> (1.2.1).
-- Kontrola beží pri registrácii a pri každej zmene čísla; existujúce staré zápisy neblokuje,
-- kým ich board neopraví.

create or replace function public.apartment_format_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.apartment_number := upper(regexp_replace(coalesce(new.apartment_number, ''), '\s', '', 'g'));
  if new.apartment_number !~ '^([1-9][0-9]?)(G([1-9][0-9]?)|\.([1-9])\.([1-9][0-9]?))$' then
    raise exception 'Invalid apartment number "%": use 1G1 (ground floor) or 1.2.1', new.apartment_number;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_apartment_format on public.profiles;
create trigger profiles_apartment_format
  before insert or update of apartment_number on public.profiles
  for each row execute function public.apartment_format_check();

-- Jednoznačná oprava starého zápisu (malé g).
update public.profiles set apartment_number = '14G2' where apartment_number = '14g2';

-- Hlas nesie apartmán, ktorý doplní databáza z profilu hlasujúceho (klient ho nemôže podvrhnúť).
alter table public.poll_votes add column if not exists apartment text;

create or replace function public.poll_vote_apartment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select upper(regexp_replace(coalesce(p.apartment_number, ''), '\s', '', 'g'))
      into new.apartment
      from public.profiles p where p.id = new.user_id;
    if coalesce(new.apartment, '') = '' then
      raise exception 'Your profile has no apartment number';
    end if;
  else
    new.apartment := old.apartment;
  end if;
  return new;
end;
$$;

drop trigger if exists poll_votes_apartment on public.poll_votes;
create trigger poll_votes_apartment
  before insert or update on public.poll_votes
  for each row execute function public.poll_vote_apartment();

create unique index if not exists poll_votes_one_per_apartment on public.poll_votes (poll_id, apartment);

-- Kto z domácnosti už hlasoval (meno a dátum, NIKDY nie za čo). Iba pre schváleného člena
-- a iba pre jeho vlastný apartmán.
create or replace function public.poll_household_vote(p_poll_id uuid)
returns table (voter_name text, voted_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(coalesce(vp.full_name, ''), ' ', 1), v.created_at, v.user_id = auth.uid()
  from public.poll_votes v
  join public.profiles me on me.id = auth.uid() and me.status = 'approved'
  left join public.profiles vp on vp.id = v.user_id
  where v.poll_id = p_poll_id
    and v.apartment = upper(regexp_replace(coalesce(me.apartment_number, ''), '\s', '', 'g'))
  limit 1;
$$;

revoke all on function public.poll_household_vote(uuid) from public, anon;
grant execute on function public.poll_household_vote(uuid) to authenticated;
revoke all on function public.poll_vote_apartment() from public, anon, authenticated;
revoke all on function public.apartment_format_check() from public, anon, authenticated;
