-- Štruktúrované nahlásenia obsahu (namiesto len súkromnej správy)
create table reports (
  id uuid default gen_random_uuid() primary key,
  target_type text not null check (target_type in ('post', 'comment')),
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  reporter_id uuid references profiles(id) on delete set null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table reports enable row level security;

create policy "Users can create reports" on reports
  for insert with check (reporter_id = auth.uid());

create policy "Board can view reports" on reports
  for select using (public.is_approved_board_member());

create policy "Board can update reports" on reports
  for update using (public.is_approved_board_member());

-- Mute (nemôže prispievať, ale vidí obsah) a Lock (zamknutá diskusia)
alter table profiles add column muted boolean default false;
alter table posts add column locked boolean default false;

-- Suspend: dočasné zablokovanie prístupu (na rozdiel od trvalého "rejected")
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

-- Audit log — záznam o krokoch výboru
create table admin_audit_log (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  details text,
  created_at timestamptz default now()
);

alter table admin_audit_log enable row level security;

create policy "Board can view audit log" on admin_audit_log
  for select using (public.is_approved_board_member());

create policy "Board can insert audit log" on admin_audit_log
  for insert with check (public.is_approved_board_member());
