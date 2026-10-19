-- The chat is one conversation whether he writes from WhatsApp or from the
-- panel: same table, same history, and `channel` says where it happened.
alter table chat_messages add column if not exists channel text not null default 'whatsapp';

-- "Recuérdame a las 18:00 la pastilla": the agent writes it, the tick sends it.
create table if not exists reminders (
  id               serial primary key,
  at               timestamptz not null,
  body             text not null,
  sent_at          timestamptz,
  cancelled        boolean not null default false,
  chat_message_id  integer references chat_messages (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists reminders_due_idx on reminders (at) where sent_at is null and not cancelled;
alter table reminders enable row level security;
