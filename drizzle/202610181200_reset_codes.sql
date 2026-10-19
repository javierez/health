-- «¿Olvidaste tu contraseña?»: one row per SMS code, hashed. Used once, 5
-- minutes, 5 tries. Idempotent, like every file here.

create table if not exists auth_reset_codes (
  id serial primary key,
  user_id text not null references auth_user(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists auth_reset_codes_user_created on auth_reset_codes (user_id, created_at desc);
