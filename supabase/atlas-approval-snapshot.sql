-- ATLAS: approve the existing workbook snapshot once.
-- Run this after the initial schema has already been created.
-- The workbook was reviewed by the knowledge owner, so completeness notes
-- remain informational and must not block Agent access.

with latest_import as (
  select id
  from public.ekb_imports
  order by created_at desc
  limit 1
)
update public.ekb_scenarios as scenario
set status = 'Published',
    needs_review = false
where scenario.import_id = (select id from latest_import)
  and scenario.status = 'Perlu diperiksa';

update public.ekb_imports as import_row
set status = 'published'
where import_row.id = (
  select id
  from public.ekb_imports
  order by created_at desc
  limit 1
);
