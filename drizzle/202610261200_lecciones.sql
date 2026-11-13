-- 26-oct-2026, «make it more intelligent, like Instinct»: what he corrects in
-- how the assistant talks or reads his data is kept and read by every message
-- after it, instead of waiting for a prompt change. Forgotten = active false.
create table if not exists lessons (
  id serial primary key,
  body text not null,
  chat_message_id integer references chat_messages(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
