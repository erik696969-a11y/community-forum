-- Každý si môže vypnúť e-mailové notifikácie pre KONKRÉTNU skupinu samostatne
alter table interest_group_members add column notify_email boolean default true;

-- Aby si to vedel užívateľ zmeniť aj po tom, ako sa pripojil
create policy "Users can update own group notification preference" on interest_group_members
  for update using (user_id = auth.uid());
