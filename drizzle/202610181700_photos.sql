-- Every photo he sends, at 640 px (18-oct-2026). Meta drops its copy after 30 days and the panel's
-- never existed: this is what the chat, «Comida» and a meal's detail show.
-- turn_id: the message whose turn read it. Photos sent together share the last one's.
create table if not exists photos (
  id serial primary key,
  chat_message_id integer not null references chat_messages(id) on delete cascade,
  turn_id integer not null references chat_messages(id) on delete cascade,
  position integer not null default 0,
  jpeg text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists photos_message_position_idx on photos (chat_message_id, position);
create index if not exists photos_turn_idx on photos (turn_id);
