-- RSVP na akcie (Going / Maybe / Can't come)
create table event_rsvps (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'cant_come')),
  created_at timestamptz default now(),
  unique (event_id, user_id)
);

alter table event_rsvps enable row level security;

create policy "Approved owners can view rsvps" on event_rsvps
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can set own rsvp" on event_rsvps
  for insert with check (user_id = auth.uid());

create policy "Users can update own rsvp" on event_rsvps
  for update using (user_id = auth.uid());

create policy "Users can delete own rsvp" on event_rsvps
  for delete using (user_id = auth.uid());

-- Community Directory: dobrovoľné, opt-in zobrazenie v adresári
alter table profiles add column directory_visible boolean default false;
alter table profiles add column spoken_languages text[] default '{}';
