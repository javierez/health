-- WHOOP: raw mirror + the rotating OAuth grant.
create table if not exists whoop_records (
  id               text primary key,
  kind             text not null,
  external_id      text not null,
  start_at         timestamptz,
  end_at           timestamptz,
  day              text,
  score            real,
  label            text,
  duration_seconds integer,
  raw              jsonb not null,
  fetched_at       timestamptz not null default now()
);
create index if not exists whoop_day_idx on whoop_records (day);
create index if not exists whoop_kind_idx on whoop_records (kind);

create table if not exists oauth_tokens (
  provider      text primary key,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  scope         text,
  updated_at    timestamptz not null default now()
);
