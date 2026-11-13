-- The training routines he keeps, exercises in order; a training that did all
-- or part of one says so in facts.data.routineId. Idempotent.

create table if not exists training_routines (
  id serial primary key,
  name text not null,
  exercises jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
