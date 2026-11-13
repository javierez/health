-- 25-oct-2026: every distinct body Edge or Health Auto Export posts, as it
-- came, so a day can be read again from what the band said and not only from
-- what ingest made of it. Edge resends the last days on every sync: the hash
-- keeps one copy of each body. Idempotent.
create table if not exists edge_pushes (
  id serial primary key,
  received_at timestamptz not null default now(),
  hash text not null unique,
  body jsonb not null
);

-- The hours asleep the morning note was written with, so the day's list is
-- rewritten once if the night turns out longer (22-oct: «3 h 11» at 05:20,
-- the night ran to 08:40).
alter table assistant_messages add column if not exists night_minutes integer;
