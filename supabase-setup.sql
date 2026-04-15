-- TRUE FISH ONLINE SHARED CLOUD SETUP (DEMO / STARTER)
-- Run this inside your Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.workspace_state (
  workspace_code text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_users (
  id text primary key,
  workspace_code text not null,
  name text not null,
  username text not null,
  password text not null,
  role text not null check (role in ('admin','manager','clerk','viewer')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(workspace_code, username)
);

alter table public.workspace_state enable row level security;
alter table public.workspace_users enable row level security;

drop policy if exists "demo read workspace_state" on public.workspace_state;
drop policy if exists "demo write workspace_state" on public.workspace_state;
drop policy if exists "demo read workspace_users" on public.workspace_users;
drop policy if exists "demo write workspace_users" on public.workspace_users;

-- Demo-open policies so the static web app can work immediately with anon key.
-- IMPORTANT: tighten these policies before production go-live.
create policy "demo read workspace_state" on public.workspace_state for select using (true);
create policy "demo write workspace_state" on public.workspace_state for all using (true) with check (true);
create policy "demo read workspace_users" on public.workspace_users for select using (true);
create policy "demo write workspace_users" on public.workspace_users for all using (true) with check (true);

insert into public.workspace_state (workspace_code, payload)
values ('TRUEFISH-HQ', '{}'::jsonb)
on conflict (workspace_code) do nothing;

insert into public.workspace_users (id, workspace_code, name, username, password, role, active) values
('admin-truefish', 'TRUEFISH-HQ', 'System Admin', 'admin', 'admin123', 'admin', true),
('manager-truefish', 'TRUEFISH-HQ', 'Operations Manager', 'manager', 'manager123', 'manager', true),
('clerk-truefish', 'TRUEFISH-HQ', 'Fuel Clerk', 'clerk', 'clerk123', 'clerk', true),
('viewer-truefish', 'TRUEFISH-HQ', 'Read Only Viewer', 'viewer', 'viewer123', 'viewer', true)
on conflict (id) do nothing;
