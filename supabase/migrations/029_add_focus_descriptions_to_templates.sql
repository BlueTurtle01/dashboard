alter table program_templates
  add column if not exists focus_descriptions jsonb;
