-- Appka si pamätá, kedy si užívateľ naposledy pozrel danú kategóriu/skupinu
create table last_seen (
  user_id uuid references profiles(id) on delete cascade,
  scope text not null,
  last_seen_at timestamptz default now(),
  primary key (user_id, scope)
);

alter table last_seen enable row level security;

create policy "Users manage own last seen" on last_seen
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pomocné "views" — najnovší príspevok v každej kategórii / skupine
create view category_latest_post as
select category_id, max(created_at) as latest_at
from posts
group by category_id;

create view group_latest_post as
select interest_group_id, max(created_at) as latest_at
from posts
where interest_group_id is not null
group by interest_group_id;
