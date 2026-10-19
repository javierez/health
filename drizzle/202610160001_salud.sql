-- Meals, training and medical facts detected in Pocket, the medical notes
-- typed by hand, and every message the assistant sent. Idempotent: the build
-- runs every file in this folder on each production deploy.

-- 🚨 The live database was filled with explicit ids, so `episodes_id_seq`
-- stayed at 1 and every insert hit `episodes_pkey` (Key (id)=(3) already
-- exists). Each failed sweep had already paid for the classification.
select setval(pg_get_serial_sequence('episodes', 'id'), coalesce((select max(id) from episodes), 0) + 1, false);

alter table recordings add column if not exists facts_version text;

create table if not exists facts (
  id            serial primary key,
  recording_id  text not null references recordings (id) on delete cascade,
  kind          text not null,
  at            timestamptz not null,
  day           text not null,
  summary       text not null,
  data          jsonb not null,
  evidence      text,
  confidence    real,
  model         text not null,
  prompt_version text not null,
  created_at    timestamptz not null default now()
);
create index if not exists facts_day_idx on facts (day);
create index if not exists facts_kind_idx on facts (kind);
create index if not exists facts_recording_idx on facts (recording_id);

create table if not exists medical (
  id          serial primary key,
  kind        text not null,
  title       text not null,
  details     text,
  on_day      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists assistant_messages (
  id           serial primary key,
  kind         text not null,
  day          text not null,
  body         text not null,
  status       text not null,
  error        text,
  wa_message_id text,
  created_at   timestamptz not null default now()
);
create unique index if not exists assistant_messages_kind_day_idx on assistant_messages (kind, day);

-- Nothing but the server reads these, same as the rest (RLS on, no policies).
alter table facts enable row level security;
alter table medical enable row level security;
alter table assistant_messages enable row level security;
