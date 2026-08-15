-- Bezpečná funkcia: je prihlásený užívateľ schválený člen? (bez rekurzie)
create or replace function public.is_approved_member()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and status = 'approved'
  );
$$;

-- OPRAVA: doteraz videl mená autorov príspevkov/komentárov len výbor.
-- Teraz to vidia všetci schválení členovia (potrebné pre bežné fungovanie fóra).
create policy "Approved owners can view all profiles" on profiles
  for select using (public.is_approved_member());

-- Súkromné správy: teraz môže KTOKOĽVEK vidieť správy adresované jemu,
-- nielen výbor (doteraz to bolo obmedzené len na výbor).
create policy "Recipients can view messages addressed to them" on messages
  for select using (recipient_id = auth.uid());
