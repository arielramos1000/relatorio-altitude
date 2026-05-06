create table if not exists slack_interaction_state (
  id         uuid primary key default gen_random_uuid(),
  slack_user_id text not null,
  payload    jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_slack_state_user_expires
  on slack_interaction_state (slack_user_id, expires_at desc);
