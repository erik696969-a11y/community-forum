-- Odporúčaní dodávatelia/služby (elektrikár, instalatér, taxík...)
create table suppliers (
  id uuid default gen_random_uuid() primary key,
  category text not null,
  name text not null,
  phone text,
  notes text,
  recommended_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table suppliers enable row level security;

create policy "Approved owners can view suppliers" on suppliers
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Approved owners can add suppliers" on suppliers
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
    and recommended_by = auth.uid()
  );

create policy "Recommender or board can delete supplier" on suppliers
  for delete using (
    recommended_by = auth.uid() or public.is_approved_board_member()
  );

-- Hlasovanie 👍 / 👎 (jeden hlas na osobu na dodávateľa, dá sa zmeniť)
create table supplier_votes (
  supplier_id uuid references suppliers(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  vote text not null check (vote in ('up', 'down')),
  created_at timestamptz default now(),
  primary key (supplier_id, user_id)
);

alter table supplier_votes enable row level security;

create policy "Approved owners can view supplier votes" on supplier_votes
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can cast own supplier vote" on supplier_votes
  for insert with check (user_id = auth.uid());

create policy "Users can change own supplier vote" on supplier_votes
  for update using (user_id = auth.uid());

create policy "Users can remove own supplier vote" on supplier_votes
  for delete using (user_id = auth.uid());
