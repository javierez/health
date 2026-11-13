-- 13-nov-2026: Pulso is for more than one person. Every table but the
-- login's says whose row it is, and Postgres, not the code, keeps each person
-- to their own: the app runs every query as `pulso_user` with `app.user_id`
-- set (`~/db`), and that role only ever sees the rows of that id. A query
-- that forgets its user gets nothing, never someone else's medical file.
--
-- Everything there is today is his (the first account). Idempotent, like
-- every file here: `scripts/migrate.ts` runs them all on every build.

-- 1. The role the app becomes for each query. `postgres` stays above the rule
--    (BYPASSRLS): the login, the migrations and finding the owner use it.
do $$
begin
  if not exists (select from pg_roles where rolname = 'pulso_user') then
    create role pulso_user nologin;
  end if;
end $$;
grant pulso_user to postgres with inherit false, set true;
grant usage on schema public to pulso_user;
grant usage, select on all sequences in schema public to pulso_user;
alter default privileges in schema public grant usage, select on sequences to pulso_user;

-- 2. Whose row: his for every row there is, then whoever the query runs for.
do $$
declare
  t text;
  his text := (select id from auth_user order by created_at limit 1);
begin
  foreach t in array array[
    'recordings', 'episodes', 'sync_state', 'whoop_records', 'edge_pushes', 'oauth_tokens',
    'scenes', 'code_records', 'facts', 'medical', 'assistant_messages', 'chat_messages',
    'reminders', 'lessons', 'commitments', 'checks', 'wa_messages', 'wa_days', 'kinds',
    'products', 'product_uses', 'hypotheses', 'experiments', 'exercise_moves',
    'training_routines', 'photos'
  ] loop
    if not exists (
      select from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
    ) then
      -- With a constant default the column is added without rewriting the table.
      if his is null then
        execute format('alter table %I add column user_id text not null', t);
      else
        execute format('alter table %I add column user_id text not null default %L', t, his);
      end if;
      execute format(
        'alter table %I alter column user_id set default nullif(current_setting(''app.user_id'', true), '''')', t);
      execute format(
        'alter table %I add constraint %I foreign key (user_id) references auth_user (id) on delete cascade',
        t, t || '_user_id_fkey');
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format(
      'create policy own_rows on %I to pulso_user '
      'using (user_id = current_setting(''app.user_id'', true)) '
      'with check (user_id = current_setting(''app.user_id'', true))', t);
    execute format('grant select, insert, update, delete on %I to pulso_user', t);
  end loop;
end $$;

-- 3. The keys two people can share become per person: WHOOP's `profile:me`,
--    the same commit of a shared repo, the same day, the same WhatsApp message.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('sync_state', 'source'), ('whoop_records', 'id'), ('oauth_tokens', 'provider'),
      ('scenes', 'slug'), ('code_records', 'id'), ('wa_messages', 'id'), ('wa_days', 'day'),
      ('kinds', 'key'), ('exercise_moves', 'key')
    ) as k (tbl, col)
  loop
    if not exists (
      select from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.conrelid = r.tbl::regclass and c.contype = 'p' and a.attname = 'user_id'
    ) then
      execute format('alter table %I drop constraint %I', r.tbl, r.tbl || '_pkey');
      execute format('alter table %I add primary key (user_id, %I)', r.tbl, r.col);
    end if;
  end loop;

  if exists (select from pg_constraint where conname = 'edge_pushes_hash_key') then
    alter table edge_pushes drop constraint edge_pushes_hash_key;
  end if;
  if not exists (select from pg_constraint where conname = 'edge_pushes_user_hash_key') then
    alter table edge_pushes add constraint edge_pushes_user_hash_key unique (user_id, hash);
  end if;

  if not exists (select from pg_indexes where indexname = 'checks_day_key_idx' and indexdef like '%(user_id, day, key)%') then
    drop index if exists checks_day_key_idx;
    create unique index checks_day_key_idx on checks (user_id, day, key);
  end if;
  if not exists (
    select from pg_indexes where indexname = 'assistant_messages_kind_day_idx' and indexdef like '%(user_id, kind, day)%'
  ) then
    drop index if exists assistant_messages_kind_day_idx;
    create unique index assistant_messages_kind_day_idx on assistant_messages (user_id, kind, day);
  end if;
end $$;

-- 4. The login's tables: only `postgres` reads them. RLS with no policy also
--    shuts Supabase's public API out of them, as it already was of the rest.
alter table auth_user enable row level security;
alter table auth_session enable row level security;
alter table auth_account enable row level security;
alter table auth_verification enable row level security;
alter table auth_reset_codes enable row level security;
