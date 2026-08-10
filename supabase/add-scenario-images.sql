-- KORA: add screenshot metadata to existing databases.
-- Run this once in the Supabase SQL Editor before importing the workbook again.

alter table public.ekb_scenarios
  add column if not exists images jsonb not null default '[]'::jsonb;
