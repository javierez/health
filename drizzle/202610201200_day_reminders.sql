-- 20-oct-2026, «que me fuera enviando notificaciones a lo largo del día
-- recordándome cosas… depende de si te contesto o no»: the morning note
-- plans the day's reminders. planned: one of those, not one he asked for.
-- item_key: the row of the day's list it is about, so it is not sent once
-- the row is done.
alter table reminders add column if not exists planned boolean not null default false;
alter table reminders add column if not exists item_key text;
