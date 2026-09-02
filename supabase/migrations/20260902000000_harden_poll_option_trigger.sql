-- Preserve and harden the poll option integrity trigger.
-- Ensures that option_id always belongs to the selected poll_id.

begin;

create or replace function public.check_poll_option_belongs_to_poll()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.poll_options
    where id = new.option_id
      and poll_id = new.poll_id
  ) then
    raise exception 'option_id does not belong to poll_id';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_check_poll_option on public.poll_votes;

create trigger trg_check_poll_option
  before insert or update on public.poll_votes
  for each row
  execute function public.check_poll_option_belongs_to_poll();

commit;
