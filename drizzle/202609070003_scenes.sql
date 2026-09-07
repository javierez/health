-- Model-generated Three.js scenes, cached by slug so each is paid for once.
create table if not exists scenes (
  slug           text primary key,
  brief          text not null,
  code           text not null,
  caption        text,
  model          text not null,
  prompt_version text not null,
  created_at     timestamptz not null default now()
);
create index if not exists scenes_created_idx on scenes (created_at);
