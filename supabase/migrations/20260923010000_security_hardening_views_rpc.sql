-- ============================================================
-- Bezpečnostné upratovanie (podľa auditu Supabase, 23. 9. 2026)
--
-- 1) Pohľady category_latest_post a group_latest_post bežali s právami
--    tvorcu (SECURITY DEFINER), teda obchádzali RLS tabuľky posts, a mohol
--    ich čítať aj neprihlásený používateľ (anon). Obsahujú len ID kategórie /
--    skupiny a čas posledného príspevku, ale nemajú byť verejné.
--    -> security_invoker = true (platia pravidlá posts: len schválení členovia)
--    -> anon nemá žiadny prístup, authenticated len SELECT.
--
-- 2) RPC funkcie, ktoré má zmysel volať iba prihlásený používateľ, boli
--    spustiteľné aj pre anon. Každá si sama overovala volajúceho, takže to
--    nebolo zneužiteľné — ide o druhú vrstvu ochrany.
--    Zámerne NEMENÍME is_approved_member / is_approved_board_member /
--    is_board_member / is_approved_user: používajú ich RLS pravidlá a pre
--    anon musia ostať spustiteľné (vrátia false), inak by dotazy
--    neprihláseného používateľa skončili chybou namiesto prázdneho výsledku.
-- ============================================================

-- ---------- 1) Pohľady ----------
alter view public.category_latest_post set (security_invoker = true);
alter view public.group_latest_post set (security_invoker = true);

revoke all on public.category_latest_post from anon, public;
revoke all on public.group_latest_post from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.category_latest_post from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.group_latest_post from authenticated;
grant select on public.category_latest_post to authenticated;
grant select on public.group_latest_post to authenticated;

-- ---------- 2) RPC funkcie len pre prihlásených ----------
revoke execute on function public.set_post_locked(uuid, boolean) from public, anon;
revoke execute on function public.set_post_pinned(uuid, boolean) from public, anon;
revoke execute on function public.update_own_preferences(text, boolean, boolean, text[]) from public, anon;
grant execute on function public.set_post_locked(uuid, boolean) to authenticated;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;
grant execute on function public.update_own_preferences(text, boolean, boolean, text[]) to authenticated;

-- handle_new_user je trigger na auth.users (vytvorenie profilu pri registrácii).
-- Nikto ho nemá volať priamo; trigger funguje bez EXECUTE práva pre tieto roly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
