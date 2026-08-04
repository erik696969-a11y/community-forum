-- Pripnuté príspevky (dôležité info zostane navrchu kategórie)
alter table posts add column pinned boolean default false;

-- Možnosť vypnúť e-mailové notifikácie pre jednotlivca
alter table profiles add column notifications_enabled boolean default true;

-- Rozšírenie kategórií dokumentov o Poistenie a Údržbu
alter table documents drop constraint if exists documents_category_check;
alter table documents add constraint documents_category_check
  check (category in ('statutes', 'minutes', 'insurance', 'maintenance'));
