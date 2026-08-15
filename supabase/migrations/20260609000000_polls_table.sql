-- Prieskumné (nezáväzné) hlasovania pred AGM/EGM
create table polls (
  id uuid default gen_random_uuid() primary key,
  question text not null,
  description text,
  status text default 'open' check (status in ('open', 'closed')),
  created_by uuid references profiles(id) on delete set null,
  original_lang text,
  question_translations jsonb default '{}'::jsonb,
  description_translations jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table polls enable row level security;

create policy "Approved owners can view polls" on polls
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert polls" on polls
  for insert with check (public.is_approved_board_member());

create policy "Board can update polls" on polls
  for update using (public.is_approved_board_member());

create policy "Board can delete polls" on polls
  for delete using (public.is_approved_board_member());

-- Možnosti hlasovania
create table poll_options (
  id uuid default gen_random_uuid() primary key,
  poll_id uuid references polls(id) on delete cascade,
  label text not null,
  label_translations jsonb default '{}'::jsonb,
  sort_order int default 0
);

alter table poll_options enable row level security;

create policy "Approved owners can view poll options" on poll_options
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert poll options" on poll_options
  for insert with check (public.is_approved_board_member());

create policy "Board can delete poll options" on poll_options
  for delete using (public.is_approved_board_member());

-- Hlasy (jeden hlas na osobu na hlasovanie, dá sa zmeniť)
create table poll_votes (
  poll_id uuid references polls(id) on delete cascade,
  option_id uuid references poll_options(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (poll_id, user_id)
);

alter table poll_votes enable row level security;

create policy "Approved owners can view poll votes" on poll_votes
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can cast own vote" on poll_votes
  for insert with check (user_id = auth.uid());

create policy "Users can change own vote" on poll_votes
  for update using (user_id = auth.uid());

create policy "Users can retract own vote" on poll_votes
  for delete using (user_id = auth.uid());
