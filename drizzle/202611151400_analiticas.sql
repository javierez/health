-- 15-nov-2026: his blood tests, each value as a number with its range, so
-- they can be followed from one test to the next (Javier: «include analysis
-- data… just the analysis of blood… and track some things»). One row per
-- value per test; what was printed as words («Negativo», «<0,06») in `shown`.
create table if not exists lab_results (
  user_id text not null default nullif(current_setting('app.user_id', true), '')
    references auth_user (id) on delete cascade,
  id serial primary key,
  day text not null,
  lab text not null,
  panel text not null,
  marker text not null,
  value double precision,
  shown text,
  unit text,
  low double precision,
  high double precision,
  created_at timestamptz not null default now()
);
create unique index if not exists lab_results_marker_idx on lab_results (user_id, day, marker);

alter table lab_results enable row level security;
drop policy if exists own_rows on lab_results;
create policy own_rows on lab_results to pulso_user
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));
grant select, insert, update, delete on lab_results to pulso_user;
grant usage, select on sequence lab_results_id_seq to pulso_user;
