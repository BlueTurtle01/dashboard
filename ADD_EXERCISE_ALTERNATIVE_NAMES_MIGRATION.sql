alter table public.exercises
add column if not exists alternative_names text[] not null default '{}';

