-- What he commits to: "4 de gimnasio a la semana", "40 km corriendo o en
-- bici", "la pastilla cada día, con foto". Progress is not stored: it is read
-- from WHOOP, the training facts and the checks every time
-- (`~/server/commitments/standing`). Idempotent, like every file here.

create table if not exists commitments (
  id          serial primary key,
  title       text not null,
  -- What counts automatically: gym · run · bike · sleep. Empty for a habit.
  activities  text[] not null default '{}',
  -- sessions · km · minutes · bedtime (target = latest clock time, minutes
  -- after midnight: 01:00 = 60)
  metric      text not null,
  target      real not null,
  -- day · week
  period      text not null,
  -- How it is proven: auto (WHOOP, the chat, the Pocket) · check (he ticks
  -- it) · photo (a photo in the chat).
  proof       text not null default 'auto',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table commitments add column if not exists proof text not null default 'auto';
alter table commitments alter column activities set default '{}';
alter table commitments enable row level security;

-- What he ticked off, in the panel or by saying it in the chat: a row of
-- «Hoy» (`key` = `bed`, `item-…`) or a commitment (`commitment-<id>`).
-- One per day and key: ticking twice is unticking.
create table if not exists checks (
  id               serial primary key,
  day              text not null,
  key              text not null,
  commitment_id    integer references commitments (id) on delete cascade,
  -- The photo that proves it, when it came in the chat.
  chat_message_id  integer references chat_messages (id) on delete set null,
  -- panel · chat
  source           text not null,
  created_at       timestamptz not null default now()
);
create unique index if not exists checks_day_key_idx on checks (day, key);
create index if not exists checks_commitment_idx on checks (commitment_id);
alter table checks enable row level security;
