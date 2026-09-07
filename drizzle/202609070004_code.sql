-- GitHub, mirrored the same way WHOOP is: one row per object, raw kept.
-- `day` is denormalised local YYYY-MM-DD so it joins episodes.day and
-- whoop_records.day without date arithmetic in three places.
create table if not exists code_records (
  id             text primary key,
  kind           text not null,          -- 'commit' | 'pr'
  repo           text not null,          -- 'javierez/vesta'
  external_id    text not null,          -- sha, or the PR number
  title          text,
  at             timestamptz,
  day            text,
  additions      integer,
  deletions      integer,
  changed_files  integer,
  merged         boolean,
  url            text,
  raw            jsonb not null,
  fetched_at     timestamptz not null default now()
);
create index if not exists code_day_idx on code_records (day);
create index if not exists code_kind_idx on code_records (kind);
