-- Log prichádzajúcich e-mailových odpovedí (na diagnostiku, ak niečo nesadne)
create table inbound_email_log (
  id uuid default gen_random_uuid() primary key,
  resend_email_id text unique,
  post_id uuid references posts(id) on delete set null,
  sender_email text,
  status text,
  created_at timestamptz default now()
);

alter table inbound_email_log enable row level security;

create policy "Board can view inbound email log" on inbound_email_log
  for select using (public.is_approved_board_member());
