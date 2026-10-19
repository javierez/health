-- better-auth, set up like Vesta's, in place of the single APP_PASSWORD cookie.
-- One user, created by scripts/crear-usuario.ts. Idempotent, like every file here.

create table if not exists auth_user (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_session (
  id text primary key,
  token text not null unique,
  user_id text not null references auth_user(id) on delete cascade,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_account (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references auth_user(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_verification (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_session_user_idx on auth_session (user_id);
create index if not exists auth_account_user_idx on auth_account (user_id);
