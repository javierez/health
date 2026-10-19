-- «Cómo te afecta», layers 4 and 5 (18-oct-2026).
-- hypotheses: what the AI proposes to compare once a week; the free engine tests them like the rest.
-- experiments: two weeks of alternate days doing (or avoiding) one thing, to settle a «por aclarar».
create table if not exists hypotheses (
  id serial primary key,
  title text not null,
  why text not null,
  spec jsonb not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists experiments (
  id serial primary key,
  finding_key text not null,
  outcome text not null,
  title text not null,
  verb text not null,
  action text not null,
  start_day text not null,
  days integer not null default 14,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
