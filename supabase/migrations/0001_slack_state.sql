create table slack_interaction_state (
  id uuid primary key default gen_random_uuid(),
  slack_user_id text not null,
  payload jsonb not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz default now()
);
create index idx_slack_state_user on slack_interaction_state(slack_user_id);
