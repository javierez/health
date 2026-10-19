-- Each exercise or sport he does, learned once: what it works (researched on
-- the web when the catalog in src/lib/exercises.ts doesn't know it) and its
-- two poses, drawn side by side as the kind `mov-<key>`. Idempotent.

create table if not exists exercise_moves (
  key text primary key,
  name text not null,
  by_time boolean not null default false,
  info jsonb,
  status text not null default 'pending',
  error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
