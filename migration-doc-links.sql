alter table documents add column doc_type text not null default 'file' check (doc_type in ('file', 'link'));
alter table documents alter column file_url drop not null;
alter table documents add column external_url text;
