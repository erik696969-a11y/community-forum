create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_preapproved_board boolean;
  is_preapproved_owner boolean;
begin
  is_preapproved_board := new.email in (
    'marcelo.haciendacifuentes@gmail.com',
    'stargeris@outlook.com',
    'juanpuertocabeza@gmail.com',
    'johanna@autolack-vimmerby.se'
  );

  is_preapproved_owner := new.email in (
    'cloefa82@gmail.com',
    'markland26@gmail.com',
    'annikanassar@gmail.com'
  );

  insert into public.profiles (id, full_name, apartment_number, role, status)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'apartment_number',
    case when is_preapproved_board then 'board' else 'owner' end,
    case when is_preapproved_board or is_preapproved_owner then 'approved' else 'pending' end
  );
  return new;
end;
$$ language plpgsql security definer;
