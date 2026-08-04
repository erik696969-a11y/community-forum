-- Official Announcements: len výbor môže do tejto kategórie prispievať,
-- príspevky sa automaticky pripnú a pošlú e-mailom VŠETKÝM (nie len skupine)
alter table categories add column board_only boolean default false;
update categories set board_only = true where slug = 'oznamy';

-- Reputačné odznaky (udeľuje výbor manuálne)
alter table profiles add column badges text[] default '{}';
