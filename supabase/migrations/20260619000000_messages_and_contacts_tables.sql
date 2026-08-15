-- Súkromné správy pre výbor
create table messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id) on delete cascade,
  recipient_id uuid references profiles(id) on delete cascade, -- NULL = správa pre celý výbor
  subject text,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table messages enable row level security;

create policy "Users can send messages" on messages
  for insert with check (sender_id = auth.uid());

create policy "Users can view own sent messages" on messages
  for select using (sender_id = auth.uid());

create policy "Board can view messages addressed to them" on messages
  for select using (
    public.is_approved_board_member()
    and (recipient_id = auth.uid() or recipient_id is null)
  );

create policy "Recipients can mark messages as read" on messages
  for update using (
    recipient_id = auth.uid()
    or (recipient_id is null and public.is_approved_board_member())
  );

-- Dôležité kontakty (správca, security, prezident, tiesňové linky...)
create table contacts (
  id uuid default gen_random_uuid() primary key,
  role_label text not null,
  name text,
  phone text,
  email text,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table contacts enable row level security;

create policy "Approved owners can view contacts" on contacts
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert contacts" on contacts
  for insert with check (public.is_approved_board_member());

create policy "Board can update contacts" on contacts
  for update using (public.is_approved_board_member());

create policy "Board can delete contacts" on contacts
  for delete using (public.is_approved_board_member());
