-- The criteria layer: a closed vocabulary next to the free-text detail.
-- Measured before this: 195 business episodes carried 140 distinct
-- subcategories, so nothing above a single episode could be grouped.
alter table episodes add column if not exists kind text;
alter table episodes add column if not exists counterpart text;
create index if not exists episodes_kind_idx on episodes (kind);
create index if not exists episodes_counterpart_idx on episodes (counterpart);
