import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Work } from "~/lib/exercises";
import type { Food } from "~/lib/food";
import type { Feel, ToiletSymptom, ToiletTime } from "~/lib/toilet";

/**
 * 🚨 Whose row it is. Every table but the login's carries one since
 * 13-nov-2026, and Postgres only shows `pulso_user` the rows of
 * `app.user_id` (`drizzle/202611131800_multi_usuario.sql`, `~/db`). Never
 * set by hand: the database fills it from the same setting, so an insert
 * outside a user fails instead of landing in nobody's (or his) account.
 */
const owner = () =>
  text("user_id")
    .notNull()
    .default(sql`nullif(current_setting('app.user_id', true), '')`)
    .references(() => authUser.id, { onDelete: "cascade" });

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
    userId: owner(),
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
    /** `FACTS_VERSION` of the last facts pass. Null = not read for facts yet. */
    factsVersion: text("facts_version"),
    /** `TONES_VERSION` of the last tone pass (`~/server/classify/tones`). Null = not read yet. */
    tonesVersion: text("tones_version"),

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
    userId: owner(),
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
     * Which phone or video call of the recording this stretch belongs to, 1, 2,
     * 3 in order. One recording often holds several calls back to back, and one
     * call often spans several episodes when the subject changes: the calls a
     * week are the distinct (recording, call) pairs, never the episodes. Null
     * when it is not a call.
     */
    call: integer("call"),

    /**
     * A conversation only (counterpart not `solo`): how it went and what it was
     * about, the same lists as a WhatsApp chat, so both add up. Null until the
     * tone pass reads it.
     */
    tone: text("tone").$type<WaTone>(),
    theme: text("theme").$type<WaTopic>(),
    /** How it may have left him, only when it shows. */
    effect: text("effect"),

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
  userId: owner(),
  source: text("source").notNull(),
  lastSweptAt: timestamp("last_swept_at", { withTimezone: true }),
  /** `YYYY-MM-DD` handed to Pocket as `start_date` on the next sweep. */
  cursorDate: text("cursor_date"),
  lastError: text("last_error"),
}, (t) => [primaryKey({ columns: [t.userId, t.source] })]);

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
/** `profile` and `body` are one row each (`externalId = "me"`), with no day. */
/** `metric` is not WHOOP's: one Apple Health metric's points for a day (`server/edge/apple-health.ts`). */
export const WHOOP_KINDS = ["cycle", "sleep", "recovery", "workout", "profile", "body", "metric"] as const;
export type WhoopKind = (typeof WHOOP_KINDS)[number];

export const whoopRecords = pgTable(
  "whoop_records",
  {
    userId: owner(),
    /** `${kind}:${externalId}` — WHOOP ids only collide across kinds (and `profile:me` across people). */
    id: text("id").notNull(),
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
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("whoop_day_idx").on(t.day), index("whoop_kind_idx").on(t.kind)],
);

/**
 * Every distinct body posted to `/api/webhooks/edge`, untouched, so a day can
 * be read again from what the band said. Edge resends the last days on every
 * sync: `hash` (sha256 of the body) keeps one copy of each.
 */
export const edgePushes = pgTable("edge_pushes", {
  userId: owner(),
  id: serial("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  hash: text("hash").notNull(),
  body: jsonb("body").notNull(),
}, (t) => [unique("edge_pushes_user_hash_key").on(t.userId, t.hash)]);

/**
 * The OAuth grant. One row, `provider = 'whoop'`.
 *
 * 🚨 WHOOP refresh tokens ROTATE: every refresh returns a new one and retires
 * the old. Storing the response is not an optimisation, it is the difference
 * between a connection that survives the night and one that has to be
 * re-authorised by hand every two hours.
 */
export const oauthTokens = pgTable("oauth_tokens", {
  userId: owner(),
  provider: text("provider").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.provider] })]);

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
    userId: owner(),
    /** `sport:endurance`, `business:client-call`, `whoop:sleep`. */
    slug: text("slug").notNull(),
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
  (t) => [primaryKey({ columns: [t.userId, t.slug] }), index("scenes_created_idx").on(t.createdAt)],
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
    userId: owner(),
    /** `commit:owner/repo@sha` or `pr:owner/repo#123`. */
    id: text("id").notNull(),
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
    /** GitHub login: javierez · gonzalolopezgarcia. */
    author: text("author"),

    raw: jsonb("raw").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("code_day_idx").on(t.day), index("code_kind_idx").on(t.kind)],
);

export type CodeRecord = typeof codeRecords.$inferSelect;

/**
 * What actually happened to the body, read out of the recordings: a meal, a
 * training session, something medical. One row per fact, on the real clock.
 *
 * 🚨 Detected, not typed. The wearer never logs anything by hand: if it was
 * said within earshot of the Pocket, it is here; if it was not, it is not.
 * `evidence` is the quote it came from, so a wrong row can be checked against
 * the transcript instead of argued about.
 */
/**
 * `other`: anything of his that is none of the rest (meditar, sauna, estiramientos).
 * `toilet`: each time he goes, from the chat only (`~/lib/toilet`).
 */
export const FACT_KINDS = ["meal", "training", "medical", "body", "toilet", "other"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export interface FactData {
  /** meal: breakfast · lunch · dinner · snack · drink */
  meal?: string;
  items?: string[];
  alcohol?: boolean;
  caffeine?: boolean;
  /** training: gym · run · other */
  training?: string;
  exercises?: { name: string; sets?: number; reps?: number; weightKg?: number; seconds?: number }[];
  /** training: the saved routine it was all or part of (`training_routines`). */
  routineId?: number;
  distanceKm?: number;
  /** medical: symptom · medication · diagnosis · appointment · instruction · test */
  medical?: string;
  /** meal: the water he drank with it or on its own (still or sparkling), in ml. What his water commitment adds up. */
  waterMl?: number;
  /** meal, from a photo: a rough estimate, never weighed. */
  kcal?: number;
  proteinG?: number;
  /** meal, food by food with its grams and nutrients (agent-v7 on): what the totals add up. */
  foods?: Food[];
  /** body: a scale reading or what he says he weighs. */
  weightKg?: number;
  bodyFatPct?: number;
  /** Its key in `kinds` when it is something new («yoga», «meditar»): the icon drawn for it. */
  kind?: string;
  /** other, and a training that is no gym or run: what it is as he says it, and (other) his category (`~/lib/trackers`). */
  name?: string;
  category?: string;
  /** other: a figure when said, «6» «/10», «2» «L»; and a few words of detail. */
  value?: number;
  unit?: string;
  tags?: string[];
  /** other: something that happens to him or how he is (a headache, his mood), not something he does: never a habit to compare. */
  state?: boolean;
  /** toilet: pee or poo, how it went, the Bristol type (poo), how long and what he felt. */
  toilet?: ToiletTime["toilet"];
  durationMin?: number;
  feel?: Feel;
  bristol?: number;
  symptoms?: ToiletSymptom[];
}

export const facts = pgTable(
  "facts",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    /** One of the two: the recording it was heard in, or the chat message it came in. */
    recordingId: text("recording_id").references(() => recordings.id, { onDelete: "cascade" }),
    chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FactKind>().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    day: text("day").notNull(),
    /** One Spanish line, what is shown. */
    summary: text("summary").notNull(),
    data: jsonb("data").$type<FactData>().notNull(),
    evidence: text("evidence"),
    confidence: real("confidence"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("facts_day_idx").on(t.day),
    index("facts_kind_idx").on(t.kind),
    index("facts_recording_idx").on(t.recordingId),
  ],
);

export type Fact = typeof facts.$inferSelect;

/**
 * The medical file and history: diagnoses, medication, every visit and test
 * with what the report said, and what is still to ask for. Typed by hand,
 * imported from his reports, or added by the assistant. It reads all of it on
 * every message.
 */
export const MEDICAL_KINDS = [
  "diagnosis",
  "medication",
  "procedure",
  "instruction",
  "note",
  "visit",
  "test",
  "pending",
] as const;
export type MedicalKind = (typeof MEDICAL_KINDS)[number];

export const medical = pgTable("medical", {
  userId: owner(),
  id: serial("id").primaryKey(),
  kind: text("kind").$type<MedicalKind>().notNull(),
  title: text("title").notNull(),
  details: text("details"),
  /** `YYYY-MM-DD`: the procedure date, the day a medication starts. */
  onDay: text("on_day"),
  /** What it is about, to read it as a history: "Cuello", "Orina", "Antecedentes". */
  topic: text("topic"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MedicalEntry = typeof medical.$inferSelect;

/**
 * Every message the assistant wrote, sent or not. `(kind, day)` is unique:
 * that is what stops a tick every ten minutes from sending the same bedtime
 * alert six times.
 */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    /** bedtime · morning · commitments · reading (the interpreter's, weekly; never sent) */
    kind: text("kind").notNull(),
    day: text("day").notNull(),
    body: text("body").notNull(),
    /** sent · failed · not-configured */
    status: text("status").notNull(),
    error: text("error"),
    waMessageId: text("wa_message_id"),
    /** morning: the day's list of things to do, shown at the top of the board. */
    items: jsonb("items").$type<Recommendation[]>(),
    /** morning: the minutes asleep it was written with; a longer night rewrites the list once. */
    nightMinutes: integer("night_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assistant_messages_kind_day_idx").on(t.userId, t.kind, t.day)],
);

export interface Recommendation {
  /** sleep · training · food · medical · work; the reading adds social */
  area: string;
  title: string;
  detail: string;
}

/**
 * The WhatsApp health chat: what he sends to the 621 (forwarded by Vesta) and
 * what the assistant answers. Photos and videos stay at Meta; `mediaId` is
 * enough to fetch them again for 30 days.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    waId: text("wa_id").unique(),
    /** in · out */
    direction: text("direction").notNull(),
    /** text · image · video · audio · document · template · other */
    type: text("type").notNull(),
    body: text("body"),
    mediaId: text("media_id"),
    /** out: sent · failed */
    status: text("status"),
    error: text("error"),
    raw: jsonb("raw"),
    /** whatsapp · web: one conversation, wherever he wrote it. */
    channel: text("channel").$type<Channel>().notNull().default("whatsapp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_created_idx").on(t.createdAt)],
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export const CHANNELS = ["whatsapp", "web"] as const;
export type Channel = (typeof CHANNELS)[number];

/** "Recuérdame a las 18:00 la pastilla": the agent writes it, the tick sends it. */
export const reminders = pgTable(
  "reminders",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelled: boolean("cancelled").notNull().default(false),
    chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    /** One of the day's, planned by the morning note: sent as written, and not an hour late. */
    planned: boolean("planned").notNull().default(false),
    /** The row of the day's list it is about, so it is not sent once the row is done. */
    itemKey: text("item_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reminders_due_idx").on(t.at).where(sql`sent_at is null and not cancelled`)],
);

export type Reminder = typeof reminders.$inferSelect;

/**
 * What he corrected in how the assistant talks or reads his data («no me
 * cuentes rachas», «la banda empieza a contar tarde»), saved by the chat and
 * read by every message after it, the chat's and the ones it sends on its own.
 * Each one used to wait for a prompt change (26-oct-2026: «more intelligent,
 * like Instinct»). Forgotten = `active` false.
 */
export const lessons = pgTable("lessons", {
  userId: owner(),
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssistantMessage = typeof assistantMessages.$inferSelect;

/**
 * What he commits to: "4 de gimnasio a la semana", "40 km corriendo o en
 * bici", "la pastilla cada día, con foto". Only the promise lives here; how far he is goes unstored and is read
 * from WHOOP and the facts by `~/server/commitments/standing`.
 */
/** `sleep` only goes with `bedtime`: WHOOP's nights, never a session. `water` only with `liters`: what he says he drank. */
export const ACTIVITIES = ["gym", "run", "bike", "sleep", "water"] as const;
export type Activity = (typeof ACTIVITIES)[number];
/** `bedtime`: the target is the latest clock time, in minutes after midnight (01:00 = 60). */
export const METRICS = ["sessions", "km", "minutes", "bedtime", "liters"] as const;
export type Metric = (typeof METRICS)[number];
export const PERIODS = ["week", "day"] as const;
export type Period = (typeof PERIODS)[number];
/** auto: WHOOP, the chat, the Pocket · check: he ticks it · photo: a photo in the chat. */
export const PROOFS = ["auto", "check", "photo"] as const;
export type Proof = (typeof PROOFS)[number];

export const commitments = pgTable("commitments", {
  userId: owner(),
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** What counts automatically. Empty for a habit ("la pastilla cada día"). */
  activities: text("activities").array().$type<Activity[]>().notNull().default(sql`'{}'`),
  metric: text("metric").$type<Metric>().notNull(),
  target: real("target").notNull(),
  period: text("period").$type<Period>().notNull(),
  proof: text("proof").$type<Proof>().notNull().default("auto"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What he ticked off: a row of «Hoy» or a commitment, from the panel or the
 * chat. Unique per day and key, so ticking twice is unticking.
 */
export const checks = pgTable(
  "checks",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    day: text("day").notNull(),
    /** `bed` · `procedure` · `item-<hash>` · `commitment-<id>` */
    key: text("key").notNull(),
    commitmentId: integer("commitment_id").references(() => commitments.id, { onDelete: "cascade" }),
    chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    /** panel · chat */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("checks_day_key_idx").on(t.userId, t.day, t.key), index("checks_commitment_idx").on(t.commitmentId)],
);

/**
 * His own WhatsApp, read from the Evolution instance Vesta keeps for his
 * number (`~/server/evolution`). Read only. `chat` is the other person's
 * number, digits only; `body` is the text, the caption, or a voice note's
 * transcript once it has one.
 */
export const waMessages = pgTable(
  "wa_messages",
  {
    userId: owner(),
    /** WhatsApp's own message id: the same if the instance is ever recreated (and on both ends of a chat). */
    id: text("id").notNull(),
    chat: text("chat").notNull(),
    /** The name the other person gave themselves, on what they sent. */
    name: text("name"),
    fromMe: boolean("from_me").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    day: text("day").notNull(),
    /** Evolution's messageType: conversation · extendedTextMessage · audioMessage · imageMessage… */
    type: text("type").notNull(),
    body: text("body"),
    /** A voice note's length. */
    seconds: integer("seconds"),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("wa_messages_day_idx").on(t.day), index("wa_messages_chat_at_idx").on(t.chat, t.at)],
);

export type WaMessage = typeof waMessages.$inferSelect;

export const WA_TONES = ["buena", "neutra", "tensa", "mala"] as const;
export type WaTone = (typeof WA_TONES)[number];

/** What a chat was about, from a fixed list so the weeks can be compared. */
export const WA_TOPICS = ["Clientes", "Socio", "Equipo", "Familia", "Pareja", "Amigos", "Dinero", "Salud", "Otros"] as const;
export type WaTopic = (typeof WA_TOPICS)[number];

export interface WaChat {
  chat: string;
  name: string;
  messages: number;
  /** What it was about, one line. */
  line: string;
  tone: WaTone;
  /** Since wa-day-v3; the days read before have none. */
  topic?: WaTopic | null;
  /** How it may have left him, only when it shows. */
  effect: string | null;
}

/** One read per finished day of WhatsApp. */
export const waDays = pgTable("wa_days", {
  userId: owner(),
  day: text("day").notNull(),
  /** One line: the day on WhatsApp and how it may have left him. */
  summary: text("summary").notNull(),
  chats: jsonb("chats").$type<WaChat[]>().notNull(),
  /** How the day may have left him, 1 (bad or very tense) to 5 (very good). */
  mood: integer("mood"),
  messages: integer("messages").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

export type WaDay = typeof waDays.$inferSelect;

/**
 * better-auth, set up like Vesta's: email and password, Google when its keys
 * are there. No `owner()` here: these are read before anyone is known (`adminDb`). The column names are better-auth's own.
 */
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * «¿Olvidaste tu contraseña?», as in Vesta (`password_reset_tokens` there): a
 * 6-digit code by SMS, stored hashed, valid 5 minutes and once. Unlike
 * Vesta's, a code takes 5 wrong tries and dies (`~/server/auth/reset`).
 */
export const authResetCodes = pgTable("auth_reset_codes", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Kinds of thing he invents by talking («yoga», «natación», «meditar»), each
 * with its own icon, drawn once by an image model in the style of the baked
 * renders (`~/server/kinds`). A name the baked renders cover never lands here.
 */
export const kinds = pgTable("kinds", {
  userId: owner(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  /** The icon, base64 webp with transparency. Null until drawn. */
  icon: text("icon"),
  /** A photo of the real thing, base64, for the drawing to copy its shape. */
  reference: text("reference"),
  referenceMime: text("reference_mime"),
  /** pending · drawing · ready · failed */
  status: text("status").notNull().default("pending"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })]);

export type Kind = typeof kinds.$inferSelect;

export const SKIN_CATEGORIES = ["solar", "retinol", "hidratante", "limpiador", "otro"] as const;
export type SkinCategory = (typeof SKIN_CATEGORIES)[number];
/**
 * Its routine (`~/lib/routines`): a solar in the morning, a retinol at night, the collagen before training.
 * `ayunas` and `media mañana` are his supplement protocol (21-oct-2026), apart from the creams.
 * `mañana y noche` is in both face routines: the cleanser he uses twice a day (22-oct-2026).
 */
export const MOMENTS = ["mañana", "noche", "entreno", "ayunas", "media mañana", "mañana y noche"] as const;
export type Moment = (typeof MOMENTS)[number];

/** Where a product goes: his skin, a supplement or pill, something he eats, something he drinks. */
/** Only what goes on his skin or a supplement: what he eats or drinks is a meal (18-oct-2026). */
export const PRODUCT_AREAS = ["piel", "suplemento"] as const;
export type ProductArea = (typeof PRODUCT_AREAS)[number];

/** What the web says about a product (`~/server/products/lookup`). */
export interface ProductInfo {
  /** One line: what it is and what it is for. */
  summary: string;
  /** What is in it that does something, and what. */
  actives: { name: string; does: string }[];
  /** The full list, as on the box, when it is published. */
  ingredients: string[];
  /** What to watch: irritants, interactions, too much caffeine. */
  cautions: string[];
  /** How and when, in one line. */
  use: string;
  /** A supplement only: whether it does what he takes it for, from reviews and trials (product-info-v2). */
  evidence?: SupplementEvidence | null;
  sources: { title: string; url: string }[];
}

export const VERDICTS = ["funciona", "a medias", "sin pruebas"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface SupplementEvidence {
  verdict: Verdict;
  /** What the studies say, in one or two sentences, with the best one named. */
  line: string;
  /** The dose that was studied, and how his compares when he said his. */
  dose: string;
}

/**
 * What he uses, takes, eats or drinks, one row each, saved from a photo in
 * the chat (the agent's `producto`). Retired, not deleted, when he stops.
 * A cream's routine is the habit of the same name («Crema solar»): see
 * `~/lib/skin`. Born as `skin_products`.
 */
export const products = pgTable("products", {
  userId: owner(),
  id: serial("id").primaryKey(),
  /** As on the label, short: «Fusion Water SPF 50». */
  name: text("name").notNull(),
  brand: text("brand"),
  area: text("area").$type<ProductArea>().notNull().default("piel"),
  /** A cream's kind; «otro» for everything else. */
  category: text("category").$type<SkinCategory>().notNull(),
  spf: integer("spf"),
  /** The active and its strength, as on the label: «Retinol 0,3 %», «Magnesio 300 mg». */
  ingredient: text("ingredient"),
  moment: text("moment").$type<Moment>(),
  /** The chat message with its photo. WhatsApp keeps the picture 30 days. */
  photoMessageId: integer("photo_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  /** Its own icon (`~/server/kinds`), drawn from his photo. */
  kind: text("kind").notNull(),
  info: jsonb("info").$type<ProductInfo>(),
  /** pending · searching · ready · failed */
  infoStatus: text("info_status").notNull().default("pending"),
  infoAttempts: integer("info_attempts").notNull().default(0),
  infoUpdatedAt: timestamp("info_updated_at", { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;

/** The days he used one: one row a day, however many times. */
export const productUses = pgTable(
  "product_uses",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_uses_product_day_idx").on(t.productId, t.day)],
);

/**
 * What the AI proposes to compare, once a week (`~/server/insights/propose`):
 * a spec over the day's measures and words, tested by the same free engine as
 * the hand-written ones. It never decides what is true; the numbers do.
 */
export const hypotheses = pgTable("hypotheses", {
  userId: owner(),
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  why: text("why").notNull(),
  /** `~/server/insights/hypotheses` `Spec`. */
  spec: jsonb("spec").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

/**
 * Two weeks of alternate days doing (or avoiding) one thing, to settle what
 * the data alone cannot. Its days are a row of «Hoy», ticked as `exp-<id>`.
 */
export const experiments = pgTable("experiments", {
  userId: owner(),
  id: serial("id").primaryKey(),
  /** The finding it tests, `Finding.key`, and on which outcome. */
  findingKey: text("finding_key").notNull(),
  outcome: text("outcome").notNull(),
  title: text("title").notNull(),
  verb: text("verb").$type<"haz" | "evita">().notNull(),
  action: text("action").notNull(),
  startDay: text("start_day").notNull(),
  days: integer("days").notNull().default(14),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
});

export type Experiment = typeof experiments.$inferSelect;

/** What the web says an exercise or sport works, and its two poses for the drawing. */
export interface MoveInfo {
  /** One line: how it is done. */
  how: string;
  /** Sets each muscle gets from one set, or from 30 minutes when `byTime`. */
  work: Work;
  start: string;
  end: string;
  sources: { title: string; url: string }[];
}

/**
 * Each exercise or sport he does, learned once (`~/server/training/learn`).
 * The catalog's muscles win over `info.work`; the web fills the ones it lacks.
 * The drawing lives in `kinds` as `mov-<key>`: both poses, side by side.
 */
export const exerciseMoves = pgTable("exercise_moves", {
  userId: owner(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  /** A sport, counted by time, rather than an exercise counted by sets. */
  byTime: boolean("by_time").notNull().default(false),
  info: jsonb("info").$type<MoveInfo>(),
  /** pending · searching · drawing · ready · failed */
  status: text("status").notNull().default("pending"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })]);

export type ExerciseMove = typeof exerciseMoves.$inferSelect;

/** One exercise of a routine as it is prescribed: «3×12 por pierna», «3×30 s». */
export interface RoutineExercise {
  name: string;
  sets?: number;
  reps?: number;
  /** A hold: how long, instead of reps. */
  seconds?: number;
  weightKg?: number;
  /** «por pierna», «con banda», «descanso 60 s». */
  note?: string;
}

/**
 * The training routines he keeps («Rutina de pierna» that someone gave him),
 * exercises in order (Javier, 22-oct-2026: «guardar tanto ejercicios como
 * rutinas… y luego hacer partes de rutinas»). A training that did all or part
 * of one points at it with `FactData.routineId`. Not the products' «Rutina de
 * mañana», which lives in `products.moment`.
 */
export const trainingRoutines = pgTable("training_routines", {
  userId: owner(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  exercises: jsonb("exercises").$type<RoutineExercise[]>().notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TrainingRoutine = typeof trainingRoutines.$inferSelect;

/**
 * Every photo he sends, by WhatsApp or the panel, as a 640 px JPEG in
 * base64 (like `kinds.icon`). Meta keeps its copy 30 days; this one stays.
 * Photos sent together are one turn: they share `turnId`, the message the
 * agent answered, which is the `chatMessageId` of the facts it wrote.
 */
export const photos = pgTable(
  "photos",
  {
    userId: owner(),
    id: serial("id").primaryKey(),
    chatMessageId: integer("chat_message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    turnId: integer("turn_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    jpeg: text("jpeg").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("photos_message_position_idx").on(t.chatMessageId, t.position), index("photos_turn_idx").on(t.turnId)],
);
