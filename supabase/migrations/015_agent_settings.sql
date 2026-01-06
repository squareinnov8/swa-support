-- Agent Settings
-- Key-value store for agent configuration

create table if not exists agent_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now(),
  updated_by text
);

-- Default settings
insert into agent_settings (key, value) values
  ('auto_send_enabled', 'false'::jsonb),
  ('auto_send_confidence_threshold', '0.85'::jsonb),
  ('require_verification_for_send', 'true'::jsonb)
on conflict (key) do nothing;

comment on table agent_settings is 'Runtime configuration for agent behavior';
