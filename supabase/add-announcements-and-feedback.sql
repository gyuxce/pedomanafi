-- KORA: announcements for Agent home + persisted guide feedback.
-- Run this once in the Supabase SQL Editor on an existing database.

create table if not exists public.ekb_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null,
  tone text not null default 'info' check (tone in ('warning', 'success', 'info')),
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ekb_guide_feedback (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  guide_title text not null,
  product text not null default '',
  category text not null default '',
  subtype text not null default '',
  source_sheet text,
  source_row integer,
  helpful boolean not null,
  comment text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ekb_announcements_published_idx on public.ekb_announcements(published, created_at desc);
create index if not exists ekb_guide_feedback_guide_idx on public.ekb_guide_feedback(guide_id, created_at desc);
create index if not exists ekb_guide_feedback_helpful_idx on public.ekb_guide_feedback(helpful, created_at desc);

drop trigger if exists ekb_announcements_touch_updated_at on public.ekb_announcements;
create trigger ekb_announcements_touch_updated_at
before update on public.ekb_announcements
for each row execute function public.ekb_touch_updated_at();

alter table public.ekb_announcements enable row level security;
alter table public.ekb_guide_feedback enable row level security;

drop policy if exists "Agents can read published announcements" on public.ekb_announcements;
create policy "Agents can read published announcements"
on public.ekb_announcements for select to authenticated
using (
  published = true
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'quality')
);

drop policy if exists "Admins can manage announcements" on public.ekb_announcements;
create policy "Admins can manage announcements"
on public.ekb_announcements for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'quality'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'quality'));

drop policy if exists "Agents can submit guide feedback" on public.ekb_guide_feedback;
create policy "Agents can submit guide feedback"
on public.ekb_guide_feedback for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Admins can read guide feedback" on public.ekb_guide_feedback;
create policy "Admins can read guide feedback"
on public.ekb_guide_feedback for select to authenticated
using (
  created_by = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'quality')
);
