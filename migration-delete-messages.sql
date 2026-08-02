-- Odosielateľ môže vymazať vlastnú odoslanú správu
create policy "Sender can delete own messages" on messages
  for delete using (sender_id = auth.uid());

-- Príjemca (alebo výbor pri hromadnej správe) môže vymazať prijatú správu
create policy "Recipient can delete messages addressed to them" on messages
  for delete using (
    recipient_id = auth.uid()
    or (recipient_id is null and public.is_approved_board_member())
  );
