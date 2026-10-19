-- One recording often holds several phone calls back to back: he hangs up and
-- dials the next one. `call` numbers them within the recording; every episode
-- of the same call carries the same number, even when the subject changes.
-- Null when the stretch is not a call (in person, alone, media).
alter table episodes add column if not exists call integer;

-- Episodes split before the splitter knew about calls (episodes-v4): the best
-- available guess, consecutive client-call episodes are one call. A re-split
-- at episodes-v5 replaces these rows with the model's own numbering.
with runs as (
  select id, seq, kind, recording_id,
    case when lag(kind) over w = 'client-call' and lag(seq) over w = seq - 1 then 0 else 1 end as starts
  from episodes
  where is_current and prompt_version = 'episodes-v4'
  window w as (partition by recording_id order by seq)
),
numbered as (
  select id, kind, sum(starts) over (partition by recording_id order by seq) as n
  from runs
)
update episodes e
set call = numbered.n
from numbered
where e.id = numbered.id and numbered.kind = 'client-call' and e.call is null;
