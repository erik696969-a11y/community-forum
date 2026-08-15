-- Autor príspevku alebo výbor môže príspevok upraviť (napr. zmena stavu problému)
create policy "Author or board can update posts" on posts
  for update using (
    author_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'board' and status = 'approved')
  );

-- Výbor môže mazať príspevky a komentáre (moderovanie)
create policy "Board can delete posts" on posts
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'board' and status = 'approved')
  );

create policy "Board can delete comments" on comments
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'board' and status = 'approved')
  );
