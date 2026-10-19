-- What he uses, takes, eats or drinks, one row each, saved from a photo in
-- the chat; with what the web says about it and its own 3D icon. Retired,
-- never deleted. Idempotent, like every file here.

-- It was born as «skin_products» (creams only) and never reached production.
do $$
begin
  if to_regclass('public.skin_products') is not null and to_regclass('public.products') is null then
    alter table skin_products rename to products;
  end if;
end $$;

create table if not exists products (
  id serial primary key,
  name text not null,
  brand text,
  category text not null,
  spf integer,
  ingredient text,
  moment text,
  photo_message_id integer references chat_messages(id) on delete set null,
  kind text not null,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

alter table products add column if not exists area text not null default 'piel';
alter table products add column if not exists info jsonb;
alter table products add column if not exists info_status text not null default 'pending';
alter table products add column if not exists info_attempts integer not null default 0;
alter table products add column if not exists info_updated_at timestamptz not null default now();

-- The days he used it: one row a day, however many times.
create table if not exists product_uses (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  day text not null,
  at timestamptz not null default now()
);
create unique index if not exists product_uses_product_day_idx on product_uses (product_id, day);

-- The photo an icon copies the shape from: his tube, his jar.
alter table kinds add column if not exists reference text;
alter table kinds add column if not exists reference_mime text;
