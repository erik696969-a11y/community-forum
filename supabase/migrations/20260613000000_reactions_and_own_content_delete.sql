-- Emoji reakcie na príspevky
create table post_reactions (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

alter table post_reactions enable row level security;

create policy "Approved owners can view post reactions" on post_reactions
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can add own post reactions" on post_reactions
  for insert with check (user_id = auth.uid());

create policy "Users can update own post reactions" on post_reactions
  for update using (user_id = auth.uid());

create policy "Users can remove own post reactions" on post_reactions
  for delete using (user_id = auth.uid());

-- Emoji reakcie na komentáre
create table comment_reactions (
  id uuid default gen_random_uuid() primary key,
  comment_id uuid references comments(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (comment_id, user_id)
);

alter table comment_reactions enable row level security;

create policy "Approved owners can view comment reactions" on comment_reactions
  for select using (
    exists (select 1 from profiles where id = auth.uid() and status = 'approved')
  );

create policy "Users can add own comment reactions" on comment_reactions
  for insert with check (user_id = auth.uid());

create policy "Users can update own comment reactions" on comment_reactions
  for update using (user_id = auth.uid());

create policy "Users can remove own comment reactions" on comment_reactions
  for delete using (user_id = auth.uid());

-- Autor môže vymazať vlastný príspevok, pokiaľ na neho ešte nikto nereagoval
create policy "Author can delete own post without engagement" on posts
  for delete using (
    author_id = auth.uid()
    and not exists (select 1 from comments where comments.post_id = posts.id)
    and not exists (select 1 from post_reactions where post_reactions.post_id = posts.id)
  );

-- Autor môže vymazať vlastný komentár, pokiaľ na neho ešte nikto nereagoval
create policy "Author can delete own comment without reactions" on comments
  for delete using (
    author_id = auth.uid()
    and not exists (select 1 from comment_reactions where comment_reactions.comment_id = comments.id)
  );
