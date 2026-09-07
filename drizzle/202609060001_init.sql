-- Initial schema for the health app.
--
-- The unit of meaning is the EPISODE, not the recording: one 40-minute
-- recording is routinely a client call, then the kids' school, then a story.
-- Every rollup sums minutes of episodes.

CREATE TABLE IF NOT EXISTS recordings (
  id                text PRIMARY KEY,
  source            text NOT NULL DEFAULT 'pocket',
  title             text,
  duration_seconds  integer,
  recorded_at       timestamptz,
  language          text,
  state             text,
  transcript        text,
  summary_markdown  text,
  turns             jsonb,
  action_items      jsonb,
  tags              text[],
  raw               jsonb,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recordings_recorded_at_idx ON recordings (recorded_at);
CREATE INDEX IF NOT EXISTS recordings_state_idx       ON recordings (state);

CREATE TABLE IF NOT EXISTS episodes (
  id               serial PRIMARY KEY,
  recording_id     text NOT NULL REFERENCES recordings (id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  category         text NOT NULL,
  subcategory      text,
  confidence       real,
  one_liner        text,
  topics           text[],
  people           text[],
  start_seconds    integer,
  end_seconds      integer,
  duration_seconds integer,
  -- Denormalised: every screen groups by day, and date(recorded_at at time
  -- zone ...) cannot use an index.
  day              text,
  model            text NOT NULL,
  prompt_version   text NOT NULL,
  is_current       boolean NOT NULL DEFAULT true,
  reviewed         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS episodes_category_idx  ON episodes (category);
CREATE INDEX IF NOT EXISTS episodes_recording_idx ON episodes (recording_id);
CREATE INDEX IF NOT EXISTS episodes_day_idx       ON episodes (day);
-- One live set per recording: a re-run retires the whole previous SET.
CREATE UNIQUE INDEX IF NOT EXISTS episodes_seq_idx
  ON episodes (recording_id, seq) WHERE is_current;

CREATE TABLE IF NOT EXISTS sync_state (
  source        text PRIMARY KEY,
  last_swept_at timestamptz,
  cursor_date   text,
  last_error    text
);
