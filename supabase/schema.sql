-- AFI Knowledge Base: initial Supabase schema
-- Run this file once in Supabase SQL Editor.
-- It is intentionally safe to re-run for policies and indexes.

create extension if not exists pgcrypto;

create table if not exists public.ekb_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source_rows integer not null default 0,
  scenario_count integer not null default 0,
  outcome_count integer not null default 0,
  review_count integer not null default 0,
  duplicate_count integer not null default 0,
  status text not null default 'staged' check (status in ('staged', 'reviewing', 'published', 'rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ekb_scenarios (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.ekb_imports(id) on delete set null,
  product_id text,
  product text not null,
  category text not null,
  ticket_subtype text not null,
  title text not null,
  condition text not null default '',
  investigation jsonb not null default '[]'::jsonb,
  script_livechat text not null default '',
  script_callcenter text,
  warning text,
  status text not null default 'Draft' check (status in ('Published', 'Draft', 'Perlu diperiksa')),
  important boolean not null default false,
  source_sheet text,
  source_row integer,
  source_variant text,
  source_type text,
  duplicate_count integer not null default 1,
  needs_review boolean not null default false,
  review_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ekb_outcomes (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.ekb_scenarios(id) on delete cascade,
  type text not null check (type in ('tier_1', 'tier_2_3', 'transfer_asi', 'reference')),
  decision text not null default '',
  agent_steps jsonb not null default '[]'::jsonb,
  ticket_status text not null default '',
  crm_process text not null default '',
  escalation_team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, type)
);

create table if not exists public.ekb_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ekb_scenarios_product_idx on public.ekb_scenarios(product_id, category, ticket_subtype);
create index if not exists ekb_scenarios_status_idx on public.ekb_scenarios(status, needs_review);
create index if not exists ekb_scenarios_search_idx on public.ekb_scenarios using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(condition, '') || ' ' || coalesce(script_livechat, '')));
create index if not exists ekb_outcomes_scenario_idx on public.ekb_outcomes(scenario_id, type);

create or replace function public.ekb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ekb_scenarios_touch_updated_at on public.ekb_scenarios;
create trigger ekb_scenarios_touch_updated_at
before update on public.ekb_scenarios
for each row execute function public.ekb_touch_updated_at();

drop trigger if exists ekb_outcomes_touch_updated_at on public.ekb_outcomes;
create trigger ekb_outcomes_touch_updated_at
before update on public.ekb_outcomes
for each row execute function public.ekb_touch_updated_at();

alter table public.ekb_imports enable row level security;
alter table public.ekb_scenarios enable row level security;
alter table public.ekb_outcomes enable row level security;
alter table public.ekb_audit_log enable row level security;

drop policy if exists "Authenticated users can read imports" on public.ekb_imports;
create policy "Authenticated users can read imports"
on public.ekb_imports for select to authenticated
using (true);

drop policy if exists "Admins can manage imports" on public.ekb_imports;
create policy "Admins can manage imports"
on public.ekb_imports for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'));

drop policy if exists "Agents can read published scenarios" on public.ekb_scenarios;
create policy "Agents can read published scenarios"
on public.ekb_scenarios for select to authenticated
using (
  status = 'Published'
  or (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality')
);

drop policy if exists "Admins can manage scenarios" on public.ekb_scenarios;
create policy "Admins can manage scenarios"
on public.ekb_scenarios for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'));

drop policy if exists "Agents can read outcomes for visible scenarios" on public.ekb_outcomes;
create policy "Agents can read outcomes for visible scenarios"
on public.ekb_outcomes for select to authenticated
using (
  exists (
    select 1 from public.ekb_scenarios scenario
    where scenario.id = public.ekb_outcomes.scenario_id
      and (
        scenario.status = 'Published'
        or (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality')
      )
  )
);

drop policy if exists "Admins can manage outcomes" on public.ekb_outcomes;
create policy "Admins can manage outcomes"
on public.ekb_outcomes for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'));

drop policy if exists "Admins can read audit log" on public.ekb_audit_log;
create policy "Admins can read audit log"
on public.ekb_audit_log for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'quality'));

drop policy if exists "Authenticated users can create audit entries" on public.ekb_audit_log;
create policy "Authenticated users can create audit entries"
on public.ekb_audit_log for insert to authenticated
with check (actor_id = auth.uid());
