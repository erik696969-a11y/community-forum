-- Podskupiny záujmových aktivít
create table interest_groups (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name_en text not null,
  name_es text not null,
  name_fr text not null,
  name_de text not null,
  icon text default '⭐',
  sort_order int default 0
);

alter table interest_groups enable row level security;

create policy "Approved owners can view groups" on interest_groups
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

-- Členstvo v skupinách
create table interest_group_members (
  group_id uuid references interest_groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

alter table interest_group_members enable row level security;

create policy "Approved owners can view group members" on interest_group_members
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can join groups" on interest_group_members
  for insert with check (user_id = auth.uid());

create policy "Users can leave groups" on interest_group_members
  for delete using (user_id = auth.uid());

-- Príspevky môžu byť priradené ku konkrétnej podskupine
alter table posts add column interest_group_id uuid references interest_groups(id) on delete set null;

-- Predvyplnené skupiny
insert into interest_groups (slug, name_en, name_es, name_fr, name_de, icon, sort_order) values
('golf', 'Golf', 'Golf', 'Golf', 'Golf', '⛳', 1),
('gym', 'Gym', 'Gimnasio', 'Gym', 'Fitness', '💪', 2),
('pilates', 'Pilates', 'Pilates', 'Pilates', 'Pilates', '🧘', 3),
('tennis', 'Tennis', 'Tenis', 'Tennis', 'Tennis', '🎾', 4),
('padel', 'Padel', 'Pádel', 'Padel', 'Padel', '🏓', 5),
('social', 'Social Activities', 'Actividades sociales', 'Activités sociales', 'Soziale Aktivitäten', '🎉', 6);
