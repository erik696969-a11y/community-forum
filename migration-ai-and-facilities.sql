-- ==========================================
-- AI asistent na pravidlá komunity
-- ==========================================
create table ai_knowledge_base (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz default now()
);

alter table ai_knowledge_base enable row level security;

create policy "Board can view knowledge base" on ai_knowledge_base
  for select using (public.is_approved_board_member());

create policy "Board can insert knowledge base" on ai_knowledge_base
  for insert with check (public.is_approved_board_member());

create policy "Board can update knowledge base" on ai_knowledge_base
  for update using (public.is_approved_board_member());

create policy "Board can delete knowledge base" on ai_knowledge_base
  for delete using (public.is_approved_board_member());

-- ==========================================
-- Rezervácia komunitných priestorov (Facilities)
-- ==========================================
create table facilities (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table facilities enable row level security;

create policy "Approved owners can view facilities" on facilities
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert facilities" on facilities
  for insert with check (public.is_approved_board_member());

create policy "Board can update facilities" on facilities
  for update using (public.is_approved_board_member());

create policy "Board can delete facilities" on facilities
  for delete using (public.is_approved_board_member());

create table facility_bookings (
  id uuid default gen_random_uuid() primary key,
  facility_id uuid references facilities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_at timestamptz default now()
);

alter table facility_bookings enable row level security;

create policy "Approved owners can view bookings" on facility_bookings
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Approved owners can create own booking" on facility_bookings
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
    and user_id = auth.uid()
  );

create policy "Owner or board can delete booking" on facility_bookings
  for delete using (user_id = auth.uid() or public.is_approved_board_member());
