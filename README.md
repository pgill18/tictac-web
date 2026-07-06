# tictac — static web app

A pure static, client-side port of the `tictac` CLI. Same five features
(vs-AI, two-player, puzzles, lessons, gym), no backend, no build step, no
dependencies. Everything runs in the browser; progress is stored in the
browser's `localStorage`.

## Run it

**Option A — just open the file.** Double-click `webapp/index.html`, or drag it
into your browser. It works from `file://` — no server needed.

**Option B — serve the folder** (recommended if you want two people on the same
machine to keep separate `localStorage`, or to host it):

```
npx serve webapp/          # or: python -m http.server (run inside webapp/)
```

Then open the printed URL. To publish, push the `webapp/` folder as-is to any
static host (e.g. GitHub Pages) — no install or build required.

### Published on GitHub Pages

This site is published from the **`tictac-web`** repo, whose root **is** these
`webapp/` files (index.html at the repo root). GitHub Pages is served from the
**root of the `main` branch** — chosen over `/docs` so the site lives at the
repo root with a clean URL and the repo contains only the static site (no CLI
source, test data, or screenshots from the larger dev workspace). A `.nojekyll`
marker disables Jekyll so every file is served verbatim.

## Who's playing?

There are no accounts. Type a name in **Playing as** at the top and press
**Play as this name** — the same no-login `--user` convention as the CLI. Your
AI/puzzle/lesson/match progress is saved under that name in this browser. Switch
users any time with the dropdown; add a new name to start fresh.

> `localStorage` is shared across all users of the same browser profile, so the
> name switcher is how you keep progress separate — it is not a security
> boundary.

## Features

- **Play AI** — you are X and move first; choose easy / medium / hard. Hard is
  the same minimax as the CLI and is **provably unbeatable**.
- **Two-player**
  - *Hot-seat* — pass one device back and forth (local practice; does not affect
    your ranked match record).
  - *Match code* — asynchronous play with no server: make a move, copy the short
    **match code**, send it to your opponent; they paste it, move, and send a new
    code back. Match-code results count toward your Gym match record.
- **Puzzles** — the same 14 puzzles across 4 categories, instant feedback.
- **Lessons** — the same 4 lessons × 3 steps; progress persists across reloads.
- **Gym** — your stats and an overall mastery level, from the same documented
  8-point formula as the CLI (see below).

## Board numbering

Positions are 1–9, left-to-right, top-to-bottom (empty cells show their number):

```
1 | 2 | 3
4 | 5 | 6
7 | 8 | 9
```

## Mastery level (used by the Gym)

Same formula as the CLI (max 8 points):

```
points = lessonsMastered (0..4)
       + (any hard-AI game not lost ? 2 : 0)
       + (puzzle solve rate >= 75% ? 2 : >= 50% ? 1 : 0)

Advanced      if points >= 7
Intermediate  if points >= 3
Beginner      otherwise
```

## Verification (Node — no browser needed)

The gameplay logic lives in `js/*.js` and dual-exports for Node, so the exact
proofs from the CLI run against the same files the browser loads:

- `npm test` (or `node scripts/test.js`) — full suite, incl. the **exhaustive
  proof that the hard AI never loses across every possible human line** (569
  terminal positions, 0 losses) and a match-code encode/decode round-trip.
- `npm run verify-puzzles` — proves every puzzle's declared solution.
- `npm run verify-lessons` — proves every lesson step's answer.

Requires Node.js 18+ (only for the proofs — not to use the app).
