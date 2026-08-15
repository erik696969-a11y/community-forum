alter table profiles add column if not exists created_at timestamptz default now();
