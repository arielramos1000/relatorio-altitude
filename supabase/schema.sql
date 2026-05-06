create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slack_user_id text unique,
  email text not null unique,
  access_token text not null unique,
  reports_daily boolean default false,
  receives_reports boolean default true,
  created_at timestamptz default now()
);

create table planned_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  person_id uuid references people(id) on delete cascade,
  raw_text text not null,
  source text not null check (source in ('manual', 'sheet_sync')),
  created_at timestamptz default now()
);
create index idx_planned_items_date on planned_items(date);
create index idx_planned_items_person on planned_items(person_id);

create table executions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  person_id uuid references people(id) on delete cascade,
  planned_item_id uuid references planned_items(id) on delete set null,
  status text not null check (status in ('feito', 'parcial', 'nao_feito', 'extra')),
  notes text,
  created_at timestamptz default now()
);
create index idx_executions_date on executions(date);
create index idx_executions_person on executions(person_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('em_andamento', 'atrasado', 'concluido', 'pausado')),
  target_end_date date,
  created_at timestamptz default now()
);
create index idx_projects_status on projects(status);
create index idx_projects_target_end_date on projects(target_end_date);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('boletim_manha', 'fechamento_dia')),
  content_html text,
  sent_to_slack boolean default false,
  sent_to_email boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique(date, kind)
);

insert into people (name, email, access_token, reports_daily, receives_reports) values
  ('Adolfo', 'adolfo@barninvest.com.br', 'adolfo-demo-token-trocar-em-prod', true, true),
  ('Sergio', 'sergio@barninvest.com.br', 'sergio-recebe-token-trocar', false, true),
  ('Ariel', 'ariel@barninvest.com.br', 'ariel-recebe-token-trocar', false, true);
