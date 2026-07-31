-- Jazyk rozhrania pre každého uživateľa
alter table profiles add column language text default 'es' check (language in ('en','es','fr','de'));

-- Preklady pre príspevky
alter table posts add column original_lang text;
alter table posts add column title_translations jsonb default '{}'::jsonb;
alter table posts add column content_translations jsonb default '{}'::jsonb;

-- Preklady pre komentáre
alter table comments add column original_lang text;
alter table comments add column content_translations jsonb default '{}'::jsonb;

-- Preložené názvy a popisy kategórií
alter table categories add column name_en text;
alter table categories add column name_es text;
alter table categories add column name_fr text;
alter table categories add column name_de text;
alter table categories add column description_en text;
alter table categories add column description_es text;
alter table categories add column description_fr text;
alter table categories add column description_de text;

update categories set
  name_en = 'Announcements',
  name_es = 'Anuncios',
  name_fr = 'Annonces',
  name_de = 'Ankündigungen',
  description_en = 'Important information from the board',
  description_es = 'Información importante de la junta',
  description_fr = 'Informations importantes du conseil',
  description_de = 'Wichtige Informationen des Vorstands'
where slug = 'oznamy';

update categories set
  name_en = 'Report an Issue',
  name_es = 'Reportar un problema',
  name_fr = 'Signaler un problème',
  name_de = 'Problem melden',
  description_en = 'Parking, garden, technical issues...',
  description_es = 'Aparcamiento, jardín, problemas técnicos...',
  description_fr = 'Stationnement, jardin, problèmes techniques...',
  description_de = 'Parken, Garten, technische Probleme...'
where slug = 'problemy';

update categories set
  name_en = 'Ideas & Suggestions',
  name_es = 'Ideas y sugerencias',
  name_fr = 'Idées et suggestions',
  name_de = 'Ideen und Vorschläge',
  description_en = 'Suggestions to improve the community',
  description_es = 'Sugerencias para mejorar la comunidad',
  description_fr = 'Suggestions pour améliorer la communauté',
  description_de = 'Vorschläge zur Verbesserung der Gemeinschaft'
where slug = 'napady';

update categories set
  name_en = 'Interest Groups',
  name_es = 'Grupos de interés',
  name_fr = 'Groupes d''intérêt',
  name_de = 'Interessengruppen',
  description_en = 'Sports and social activities',
  description_es = 'Deportes y actividades sociales',
  description_fr = 'Sports et activités sociales',
  description_de = 'Sport und soziale Aktivitäten'
where slug = 'aktivity';

update categories set
  name_en = 'General Discussion',
  name_es = 'Discusión general',
  name_fr = 'Discussion générale',
  name_de = 'Allgemeine Diskussion',
  description_en = 'Free communication',
  description_es = 'Comunicación libre',
  description_fr = 'Communication libre',
  description_de = 'Freie Kommunikation'
where slug = 'diskusia';
