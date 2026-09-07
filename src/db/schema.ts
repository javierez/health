import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * v0 is deliberately raw-first.
 *
 * `recordings` is a faithful mirror of what Pocket hands us — including the
 * untouched payload in `raw` — and `episodes` is the only opinionated layer on
 * top.
 *
 * 🚨 **The unit of meaning is the episode, not the recording.** A single
 * 40-minute recording is routinely a client call, then a stretch about the kids'
 * school, then someone telling a story. Filing that whole recording under
 * `business` throws away two thirds of the day, and it is the day we are trying
 * to reconstruct. So one recording yields N episodes, each with its own
 * category and its own slice of the clock, and every rollup — day, week, month,
 * year — sums minutes of episodes, never counts recordings.
 */

/** The six the model chooses between. `noise` is never one of its options. */
export const MODEL_CATEGORIES = [
  "business",
  "health",
  "sport",
  "personal",
  "social",
  "learning",
  /**
   * The recorder was on while a TV, a video or music played. Measured on the
   * first full pass: this was 46 of the 46 minutes filed as `other` on a single
   * day — Spider-Man, an art documentary, bodybuilding clips. It is not an
   * activity, so it must not count as one, but it is not silence either, so
   * `noise` would be a lie in the other direction.
   */
  "ambient",
  "other",
] as const;

/**
 * Everything a recording can end up in. `noise` is decided deterministically by
 * `server/classify/triage.ts` before Claude is called — a third of the corpus
 * is a misfire and paying to have it read would be silly.
 */
export const CATEGORIES = [...MODEL_CATEGORIES, "noise"] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];
export type Category = (typeof CATEGORIES)[number];

export const recordings = pgTable(
  "recordings",
  {
    /** Pocket's own recording id. Natural key — dedupes the sweep for free. */
    id: text("id").primaryKey(),
    source: text("source").notNull().default("pocket"),

    title: text("title"),
    durationSeconds: integer("duration_seconds"),
    /** When it was recorded, not when Pocket finished processing it. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    /** ISO 639-1 ("es"/"en"), already mapped off Pocket's 639-3. */
    language: text("language"),
    /** Pocket's processing state. Only `completed` carries a transcript. */
    state: text("state"),

    transcript: text("transcript"),
    summaryMarkdown: text("summary_markdown"),
    /** `[{ speaker, text, startSeconds }]` — speakers are `SPEAKER_00`. */
    turns: jsonb("turns").$type<
      { speaker: string; text: string; startSeconds: number | null }[]
    >(),
    /** Pocket's own suggested actions. A hint, not our source of truth. */
    actionItems: jsonb("action_items").$type<
      { label: string | null; context: string | null; dueDate: string | null; priority: string | null }[]
    >(),
    tags: text("tags").array(),

    /** The whole untouched detail payload, so nothing is lost to a schema bet. */
    raw: jsonb("raw"),

    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recordings_recorded_at_idx").on(t.recordedAt),
    index("recordings_state_idx").on(t.state),
  ],
);

export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    /** Order within the recording, 0-based. Keeps the narrative readable. */
    seq: integer("seq").notNull(),

    category: text("category").$type<Category>().notNull(),
    /**
     * 🚨 The two controlled fields. See `~/lib/taxonomy` for the closed lists
     * and the criteria that decide each value.
     *
     * `kind` is what the activity was, valid only within its category.
     * `counterpart` is who else was there, and it is the one that makes
     * "how many business calls this week" answerable at all: it is business
     * episodes whose counterpart is not `solo`.
     *
     * Nullable because an off-list answer is nulled rather than stored — a
     * value nothing can group by is the free-text problem all over again.
     */
    kind: text("kind"),
    counterpart: text("counterpart"),
    /** Free-text DETAIL the kind does not already carry. Shown, never summed. */
    subcategory: text("subcategory"),
    confidence: real("confidence"),
    /** One English line: what happened in THIS stretch, not the whole call. */
    oneLiner: text("one_liner"),
    topics: text("topics").array(),
    people: text("people").array(),

    /**
     * Offsets into the recording, in seconds. The transcript arrives with
     * per-turn timestamps, so these are real boundaries rather than a share the
     * model guessed. `durationSeconds` is stored rather than derived because a
     * day rollup sums it a few thousand times.
     */
    startSeconds: integer("start_seconds"),
    endSeconds: integer("end_seconds"),
    durationSeconds: integer("duration_seconds"),

    /**
     * The day this episode counts towards, `YYYY-MM-DD` in local time.
     * Denormalised on write: grouping by `date(recorded_at at time zone ...)`
     * cannot use an index, and every screen in this app groups by day.
     */
    day: text("day"),

    model: text("model").notNull(),
    /** Bump on any prompt change, so two passes stay comparable. */
    promptVersion: text("prompt_version").notNull(),
    /** A re-run retires the whole previous SET for a recording, not one row. */
    isCurrent: boolean("is_current").notNull().default(true),
    reviewed: boolean("reviewed").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("episodes_category_idx").on(t.category),
    index("episodes_kind_idx").on(t.kind),
    index("episodes_counterpart_idx").on(t.counterpart),
    index("episodes_recording_idx").on(t.recordingId),
    index("episodes_day_idx").on(t.day),
    uniqueIndex("episodes_seq_idx")
      .on(t.recordingId, t.seq)
      .where(sql`is_current`),
  ],
);

/** One row, id = 'pocket'. Where the sweep left off. */
export const syncState = pgTable("sync_state", {
  source: text("source").primaryKey(),
  lastSweptAt: timestamp("last_swept_at", { withTimezone: true }),
  /** `YYYY-MM-DD` handed to Pocket as `start_date` on the next sweep. */
  cursorDate: text("cursor_date"),
  lastError: text("last_error"),
});

export type Recording = typeof recordings.$inferSelect;
export type Episode = typeof episodes.$inferSelect;

/**
 * WHOOP — the second source, and the first one that is not audio.
 *
 * 🚨 One row per WHOOP object, stored raw. WHOOP's own numbers (recovery %,
 * strain, sleep performance) are already derived from data we will never see,
 * so there is nothing to re-derive and nothing to classify: the honest move is
 * to mirror them and read the columns we actually plot.
 *
 * `kind` is WHOOP's own object model. `day` is denormalised the same way
 * `episodes.day` is, so a day view can join the two without date arithmetic in
 * three places.
 */
export const WHOOP_KINDS = ["cycle", "sleep", "recovery", "workout"] as const;
export type WhoopKind = (typeof WHOOP_KINDS)[number];

export const whoopRecords = pgTable(
  "whoop_records",
  {
    /** `${kind}:${externalId}` — WHOOP ids only collide across kinds. */
    id: text("id").primaryKey(),
    kind: text("kind").$type<WhoopKind>().notNull(),
    /** WHOOP's own id. A uuid for sleep and workout, an integer for cycles. */
    externalId: text("external_id").notNull(),

    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    /** `YYYY-MM-DD` local, from `startAt`. Matches `episodes.day`. */
    day: text("day"),

    /**
     * The one number worth having in a column per kind, so the board does not
     * dig through jsonb: recovery %, sleep performance %, strain, or the
     * workout's strain. Null when WHOOP has not scored the object yet
     * (`score_state` is `PENDING_SCORE` for a while after an activity ends).
     */
    score: real("score"),
    /** WHOOP's `sport_name` on a workout, its `score_state` otherwise. */
    label: text("label"),
    durationSeconds: integer("duration_seconds"),

    /** Untouched payload. Everything else on this row is derived from it. */
    raw: jsonb("raw").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whoop_day_idx").on(t.day), index("whoop_kind_idx").on(t.kind)],
);

/**
 * The OAuth grant. One row, `provider = 'whoop'`.
 *
 * 🚨 WHOOP refresh tokens ROTATE: every refresh returns a new one and retires
 * the old. Storing the response is not an optimisation, it is the difference
 * between a connection that survives the night and one that has to be
 * re-authorised by hand every two hours.
 */
export const oauthTokens = pgTable("oauth_tokens", {
  provider: text("provider").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhoopRecord = typeof whoopRecords.$inferSelect;

/**
 * Generated Three.js scenes — one per thing worth watching (a kind, a category,
 * a whole day).
 *
 * 🚨 The code column holds JavaScript written by a model and executed in the
 * browser. That is only acceptable because this is a single-user app running on
 * the owner's own machine against the owner's own API key — there is no other
 * user to attack and no untrusted input reaching the prompt. It must never be
 * served to anyone else, and `SceneStage` runs it inside a function scope with
 * only `THREE` and a canvas handed in, never with page or network access.
 *
 * Generation is expensive and deterministic-enough, so a scene is generated
 * ONCE per `slug` and read from here forever after. That is the whole point of
 * storing it: the animation for `sport:endurance` is made the first time it is
 * asked for and is free every time after.
 */
export const scenes = pgTable(
  "scenes",
  {
    /** `sport:endurance`, `business:client-call`, `whoop:sleep`. */
    slug: text("slug").primaryKey(),
    /** What was asked for, in English. Kept so a bad scene can be re-prompted. */
    brief: text("brief").notNull(),
    /**
     * The body of a function called as `fn(THREE, canvas)`. It must return
     * `{ update(elapsedSeconds), dispose() }`. No imports, no fetch, no DOM
     * beyond the canvas it is handed.
     */
    code: text("code").notNull(),
    /** One line describing what the viewer is looking at. Shown under it. */
    caption: text("caption"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scenes_created_idx").on(t.createdAt)],
);

export type Scene = typeof scenes.$inferSelect;

/**
 * GitHub — the third source, and the first one that measures OUTPUT rather than
 * state. Pocket says what the day sounded like, WHOOP what the body did, this
 * says what actually shipped.
 *
 * 🚨 Two kinds in one table on purpose. A commit carries the lines and a PR
 * carries the unit of work, and they overlap: a merged PR's additions are the
 * SAME lines as its commits'. So the day rollup sums lines from `commit` only
 * and counts `pr` rows separately — summing both would double every number.
 */
export const CODE_KINDS = ["commit", "pr"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

export const codeRecords = pgTable(
  "code_records",
  {
    /** `commit:owner/repo@sha` or `pr:owner/repo#123`. */
    id: text("id").primaryKey(),
    kind: text("kind").$type<CodeKind>().notNull(),
    repo: text("repo").notNull(),
    externalId: text("external_id").notNull(),

    title: text("title"),
    /** Authored time for a commit, created time for a PR. */
    at: timestamp("at", { withTimezone: true }),
    /** `YYYY-MM-DD` local. Matches `episodes.day` and `whoop_records.day`. */
    day: text("day"),

    additions: integer("additions"),
    deletions: integer("deletions"),
    changedFiles: integer("changed_files"),
    /** PRs only. Null on a commit. */
    merged: boolean("merged"),
    url: text("url"),

    raw: jsonb("raw").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("code_day_idx").on(t.day), index("code_kind_idx").on(t.kind)],
);

export type CodeRecord = typeof codeRecords.$inferSelect;
