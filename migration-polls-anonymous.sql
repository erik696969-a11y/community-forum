-- Zrušíme predošlé pravidlo, ktoré umožňovalo vidieť VŠETKY hlasy (nie anonymné)
drop policy if exists "Approved owners can view poll votes" on poll_votes;

-- Každý vidí LEN svoj vlastný hlas (aby appka vedela zobraziť "hlasoval(a) si za...")
create policy "Users can view own vote" on poll_votes
  for select using (user_id = auth.uid());

-- Bezpečná funkcia: vráti len ANONYMNÉ súčty za jedno hlasovanie (bez toho, kto hlasoval za čo)
create or replace function public.get_poll_results(target_poll_id uuid)
returns table (option_id uuid, vote_count bigint)
language sql
security definer
stable
as $$
  select option_id, count(*) as vote_count
  from poll_votes
  where poll_id = target_poll_id
  group by option_id;
$$;

-- Bezpečná funkcia: vráti celkový počet hlasov pre všetky hlasovania naraz (pre zoznam)
create or replace function public.get_all_poll_totals()
returns table (poll_id uuid, total_votes bigint)
language sql
security definer
stable
as $$
  select poll_id, count(*) as total_votes
  from poll_votes
  group by poll_id;
$$;
