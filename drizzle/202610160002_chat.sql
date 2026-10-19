-- The WhatsApp health chat (his messages to the 621, forwarded by Vesta), the
-- facts it reads from photos and videos, Gonzalo's commits next to Javier's,
-- and the day's recommendations. Idempotent, like every file here.

create table if not exists chat_messages (
  id          serial primary key,
  -- Meta's `wamid`. Unique: Meta retries a webhook it thinks failed.
  wa_id       text unique,
  direction   text not null,          -- in · out
  type        text not null,          -- text · image · video · audio · document · template · other
  body        text,
  media_id    text,
  status      text,                   -- out: sent · failed
  error       text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on chat_messages (created_at);
alter table chat_messages enable row level security;

-- A fact now comes from a recording OR from a chat message.
alter table facts alter column recording_id drop not null;
alter table facts add column if not exists chat_message_id integer references chat_messages (id) on delete cascade;

-- Whose commit. Every row before this one is Javier's.
alter table code_records add column if not exists author text;
update code_records set author = 'javierez' where author is null;
create index if not exists code_records_author_day_idx on code_records (author, day);

-- The morning's list of things to do, next to the WhatsApp text.
alter table assistant_messages add column if not exists items jsonb;
