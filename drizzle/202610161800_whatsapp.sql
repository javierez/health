-- His own WhatsApp, read from the Evolution instance Vesta keeps for his
-- number. Read only: nothing here ever sends, marks read or types.
--
-- One row per message, raw first (the record as Evolution returned it, minus
-- thumbnails and waveforms). `chat` is the other person's number, digits only.
create table if not exists wa_messages (
  id          text primary key,
  chat        text not null,
  name        text,
  from_me     boolean not null,
  at          timestamptz not null,
  day         text not null,
  type        text not null,
  body        text,
  seconds     integer,
  raw         jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists wa_messages_day_idx on wa_messages (day);
create index if not exists wa_messages_chat_at_idx on wa_messages (chat, at);
alter table wa_messages enable row level security;

-- One read per finished day: who he talked with, about what, and how it may
-- have left him. Bump the prompt version to read the days again.
create table if not exists wa_days (
  day             text primary key,
  summary         text not null,
  chats           jsonb not null,
  messages        integer not null,
  model           text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now()
);
alter table wa_days enable row level security;
-- How the day may have left him, 1 (bad or very tense) to 5 (very good).
alter table wa_days add column if not exists mood integer;
