-- Komunitné akcie (garden party, Halloween, Veľká noc...)
create table events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  event_date date,
  location text,
  created_by uuid references profiles(id) on delete set null,
  original_lang text,
  title_translations jsonb default '{}'::jsonb,
  description_translations jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table events enable row level security;

create policy "Approved owners can view events" on events
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert events" on events
  for insert with check (public.is_approved_board_member());

create policy "Board can update events" on events
  for update using (public.is_approved_board_member());

create policy "Board can delete events" on events
  for delete using (public.is_approved_board_member());

-- Fotky z akcií
create table event_photos (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references events(id) on delete cascade,
  uploaded_by uuid references profiles(id) on delete set null,
  image_url text not null,
  created_at timestamptz default now()
);

alter table event_photos enable row level security;

create policy "Approved owners can view event photos" on event_photos
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Approved owners can upload event photos" on event_photos
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
    and uploaded_by = auth.uid()
  );

create policy "Uploader or board can delete event photos" on event_photos
  for delete using (
    uploaded_by = auth.uid() or public.is_approved_board_member()
  );
