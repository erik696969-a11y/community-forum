-- Komunitné dokumenty (stanovy, zápisnice z AGM/EGM)
create table documents (
  id uuid default gen_random_uuid() primary key,
  category text not null check (category in ('statutes', 'minutes')),
  title text not null,
  file_url text not null,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Approved owners can view documents" on documents
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Board can insert documents" on documents
  for insert with check (public.is_approved_board_member());

create policy "Board can delete documents" on documents
  for delete using (public.is_approved_board_member());
