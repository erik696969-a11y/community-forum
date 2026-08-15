-- Bezpečná funkcia na aktualizáciu VLASTNÝCH preferencií (jazyk, notifikácie,
-- viditeľnosť v adresári, jazyky). Nedovoľuje meniť role/status/badges/muted —
-- tie zostávajú chránené a menia sa len cez samostatné, výborom kontrolované cesty.
create or replace function public.update_own_preferences(
  p_language text default null,
  p_notifications_enabled boolean default null,
  p_directory_visible boolean default null,
  p_spoken_languages text[] default null
)
returns void
language plpgsql
security definer
as $$
begin
  update profiles set
    language = coalesce(p_language, language),
    notifications_enabled = coalesce(p_notifications_enabled, notifications_enabled),
    directory_visible = coalesce(p_directory_visible, directory_visible),
    spoken_languages = coalesce(p_spoken_languages, spoken_languages)
  where id = auth.uid();
end;
$$;

grant execute on function public.update_own_preferences to authenticated;
