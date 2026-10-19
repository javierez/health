-- Kinds he invents by talking, each with an icon drawn once in the style of
-- the baked renders. Idempotent, like every file here.

create table if not exists kinds (
  key text primary key,
  name text not null,
  icon text,
  status text not null default 'pending',
  error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
