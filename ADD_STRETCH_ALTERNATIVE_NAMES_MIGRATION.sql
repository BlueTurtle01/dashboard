alter table public.stretches
add column if not exists alternative_names text[] not null default '{}';

