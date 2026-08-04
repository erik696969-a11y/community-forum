alter table polls add column closes_at timestamptz;

-- Umožní ktorémukoľvek schválenému členovi "automaticky uzavrieť" hlasovanie,
-- ale LEN presne v prípade: bolo otvorené, má nastavený dátum ukončenia,
-- ten už uplynul, a výsledkom zmeny môže byť iba prechod do stavu 'closed'.
-- Nič iné sa takto zmeniť nedá (nie je to všeobecné právo upravovať hlasovania).
create policy "Approved members can auto-close expired polls" on polls
  for update using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
    and status = 'open'
    and closes_at is not null
    and closes_at <= now()
  )
  with check (
    status = 'closed'
  );
