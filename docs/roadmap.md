# What is not wired yet

## Whoop

Ready to build. v2 REST API, OAuth2, self-serve at
[developer.whoop.com](https://developer.whoop.com/docs/introduction/):
`/recovery`, `/sleep`, `/workout`, `/cycle`, plus webhooks. v2 identifies
resources by UUID, not the integer ids v1 used — anything written against v1
examples needs checking.

Lands as its own table, not as `recordings`. A night of sleep is not a
conversation and forcing both into one row would cost us both.

## Garmin

**Blocked, not by us.** The Garmin Connect Developer Program is on hold: no new
developer accounts, and the Health API was never self-serve — it needs partner
approval, historically 1–4 weeks once open. Checked 2026-09-06.

So the plan is: design the schema so a backfill drops in later, and do not build
against an API we cannot get a key for. Re-check before assuming it is still
shut.

## Measured on the corpus (2026-09-06)

First full pass, 94 recordings stored, 92 classified, 383 episodes:

| | |
|---|---|
| reach the model | 59 of 94 — the rest are free triage |
| transcript volume | 810,684 chars across 9,041 speaker turns |
| boundary defects after `normalise` | 0 overlaps, 0 inversions, 0 over-runs |
| minutes recovered by gap-filling | 251, largest single hole 32 min |
| recordings lost to schema strictness | 2 — now coerced, see `episodeSchema` |

Both of those last two were silent. The gaps produced totals that were simply
low, and the schema failures produced recordings with no episodes at all — a
whole day missing from the rollup because a tags field came back as a string.
Anything added here should be checked the same way: query the invariant, do not
eyeball the screen.

## Structure on top of the raw layer

Deliberately deferred. `subcategory` is free text so the finer taxonomy can
emerge from real recordings — once a subcategory shows up thirty times it has
earned a column. Same for routines, people and the cross-links between a
training session and the recovery score of the night after it.
