# CLAUDE.md

Health: a single-user app that ingests my Pocket recordings, classifies them and
lets me read them back. Not Vesta — separate repo, separate DB, separate Vercel
project. **Never import from Vesta and never point `DATABASE_URL` at it.**

## Non-negotiable

1. **`pnpm typecheck` and `pnpm lint` before saying it is done.** Baseline 0 on
   both, so any line of output is yours.
2. **Dry-run anything that writes.** `scripts/sync.ts --dry` exists for that.
3. **Raw first.** `recordings.raw` keeps the untouched payload. Do not add
   structured columns on a guess — see `docs/roadmap.md`.
4. **The unit is the EPISODE, not the recording.** One recording yields N
   episodes with real start/end offsets. Every rollup sums episode minutes and
   never counts recordings. Anything that reintroduces one-label-per-recording
   silently throws away most of the day.

## Layout

| | |
|---|---|
| `src/server/pocket/` | the Pocket API client and the sweep |
| `src/server/classify/` | `triage.ts` (free, deterministic) then `episodes.ts` (the Claude call). Bump `PROMPT_VERSION` / `TRIAGE_VERSION` on any change |
| `src/server/queries/` | Drizzle reads |
| `src/components/ui/` | shadcn, ported from Vesta. Use them, do not write a second one |
| `drizzle/` | SQL by hand, `YYYYMMDDHHMM_name.sql`. Never `db:generate` / `db:push` |

## Conventions

- `~/` for imports from `src/`. Always.
- `??`, not `||`.
- UI text in English. Palette is neutral + `amber`, `red-500` for destructive —
  no green, no purple, no blue. Entry animation: 8px, ~0.5s, 0.08s stagger.
- Server Components by default; `"use client"` only for real interactivity.
- Files under ~400 lines.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
