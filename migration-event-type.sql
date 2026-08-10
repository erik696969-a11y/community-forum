alter table events add column event_type text not null default 'social' check (event_type in ('social', 'agm', 'egm'));
