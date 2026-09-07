# Health

Everything I record, in one place, sorted into tabs.

Separate app from Vesta on purpose: separate repo, separate database, separate
Vercel project, single user. Nothing here imports from Vesta and nothing here
touches Vesta's production database.

## What it does today

1. **Ingest.** Sweeps [Pocket](https://heypocket.com)'s public API and stores
   every recording raw — transcript, speaker turns, Pocket's own summary and
   action items, plus the untouched payload in `recordings.raw`.
2. **Triage.** A deterministic pass bins the misfires first — about a third of
   the corpus is silence, a hang-up or the single word "Meta", and paying a
   model to read those was putting 8 of every 14 recordings in `other`.
3. **Split into episodes.** 🚨 **The unit is the episode, not the recording.**
   One 40-minute recording is routinely a client call, then the kids' school,
   then someone telling a story. Claude is handed the transcript as timestamped
   turns and asked where the subject actually changes, so each episode carries a
   real start and end — `business`, `health`, `sport`, `personal`, `social`,
   `learning` or `other`, with a confidence and a one-line description.
4. **Roll up.** Days, weeks and months are sums of episode MINUTES, never counts
   of recordings. That is the whole reason for step 3: filing a 40-minute call
   under `business` throws away two thirds of the day, and the day is what we
   are reconstructing.
5. **Read.** A `Recordings` view with the transcript and its episodes laid over
   it as a timeline. Filtering is by "has an episode in this category", so a
   call that was mostly business but spent ten minutes on the kids appears in
   BOTH tabs.

`Noise` is a tab of its own and sits outside `All` — reachable, because that is
where a broken microphone would show up, but not in the way. It contributes
**zero** minutes to every rollup: a pocket-dial did happen, but counting it as
two seconds of anything would be a lie in every total.

Ingest and classification are two passes. A bad Anthropic minute never loses a
transcript — the row is already down, and the next sweep picks up exactly the
ones still missing a classification.

## Setup

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb health
cp .env.example .env.local          # fill in the four values
psql -d health -f drizzle/202609060001_init.sql
pnpm install
pnpm dev                            # http://localhost:3100
```

The Pocket key is personal, from **app.heypocket.com → Settings → API keys**.
It starts with `pk_`.

## Commands

```bash
pnpm dev                                                   # port 3100
pnpm typecheck                                             # baseline 0
pnpm lint
set -a && source .env.local && set +a && pnpm tsx scripts/sync.ts --dry
set -a && source .env.local && set +a && pnpm tsx scripts/sync.ts
pnpm test                                                  # tsx scripts, no framework
```

Three read-only probes that touch no database, for checking the model against
real recordings before anything is written:

```bash
SKIP_ENV_VALIDATION=1 pnpm tsx scripts/probe-classify.ts --n 20
SKIP_ENV_VALIDATION=1 pnpm tsx scripts/probe-corpus-shape.ts
SKIP_ENV_VALIDATION=1 pnpm tsx scripts/probe-short-transcripts.ts
SKIP_ENV_VALIDATION=1 pnpm tsx scripts/probe-model-bakeoff.ts --n 8
```

`probe-model-bakeoff.ts` re-runs a second model over recordings already in the
database and diffs the segmentation. It reads no Pocket data, so it can be run
repeatedly without spending the rate limit.

`--dry` lists what Pocket has without writing a row. Run it first.

## Syncing

| Path | When |
|---|---|
| `POST /api/sync` | the **Sync Pocket** button, and a cron with `Authorization: Bearer $SYNC_SECRET` |
| `POST /api/webhooks/pocket/<SYNC_SECRET>` | Pocket's own notification — seconds instead of an hour |

The webhook is a doorbell: only a recording id is read from the body, the
content is fetched back over the API. Pocket documents its events but not its
payload shape. Delivery is at-least-once with three retries and then it gives
up, so the webhook never replaces the sweep — it just makes the common case
fast. Register it from the Pocket app; personal accounts have no REST endpoint
for it (every `/public/webhook*` path 404s).

## Not wired yet

See `docs/roadmap.md`.
