create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_preapproved boolean;
begin
  is_preapproved := new.email in (
    'marcelo.haciendacifuentes@gmail.com',
    'stargeris@outlook.com',
    'juanpuertocabeza@gmail.com',
    'johanna@autolack-vimmerby.se'
  );

  insert into public.profiles (id, full_name, apartment_number, role, status)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'apartment_number',
    case when is_preapproved then 'board' else 'owner' end,
    case when is_preapproved then 'approved' else 'pending' end
  );
  return new;
end;
$$ language plpgsql security definer;
