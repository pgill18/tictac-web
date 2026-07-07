# tictac — Settings + Gamification design (Phase 5)

Extends the **Worksheet** system (DESIGN-NOTES.md) and the Phase-4 character work
(CHARACTERS-NOTES.md). Same rules: warm lilac paper, grape=X / marigold=O, three type roles
(rounded display / humanist body / mono for data), hand-inked signature, printed cards, spend
boldness in ONE place and keep the rest quiet. Visual/UX layer only — dana owns the registry,
module logic, and event-hook wiring; I dress what her registry renders.

## The organizing metaphor: the reward chart / merit stamps
A learning workbook rewards you with **stamps, stars, and stickers** pressed onto the page. That
is exactly this product's world, and it serves all three audiences at once — a kid collecting
stickers, a competitor chasing badges and the leaderboard, a nervous beginner getting gentle
"good work" marks. So every gamification reward shares ONE vocabulary: a **hand-inked stamp**
pressed on paper (same ink language as the board strokes, win-strike, and character emblems).
- **Earned** = a solid inked stamp in its accent.
- **Locked** = a faint embossed outline (ghost) — visible as "a slot to fill," an invitation.
This keeps gamification feeling authored into the worksheet, not a generic game-UI layer bolted on.

## Signature element (Phase 5): ink-confetti celebration
Celebration moments don't use default confetti. On a win/milestone, a brief shower of tiny **inked
marks from this product's own alphabet** — little X's, O's, #'s, stars, checks — flutters down in
the palette, then settles. One orchestrated moment, `prefers-reduced-motion` disables it entirely
(falls back to a single stamped "nice!" seal). This is where the boldness is spent; everything
else stays quiet.

## Settings page (new surface)
A worksheet "settings sheet," reached from a new nav tab (⚙ Settings). Sections stacked as titled
cards. The **Gamification** section is registry-generated: one row per module —
`[ icon ] Module name — short description ............... [ toggle ]`.
- Toggle = a tactile inked pill switch (grape fill + knob when on, muted paper when off), not a
  default OS switch; clear on/off with a text state for a11y ("On"/"Off"), real focus ring.
- Each row shows the module's little inked glyph so the list reads as a menu of collectibles.
- Off modules read as calm/greyed, not hidden — you can see what you're missing.
Rows come straight from the registry, so a new module appears with zero per-module UI work (I
style the row shell + the `[data-module-id]` accent, dana supplies the data).

## Per-module visual identity (all in the stamp/ink vocabulary)
- **XP / levels** — a slim inked progress rule that fills toward the next level; level as a big
  display number with a small mono "XP" label. (Reuses the gym meter grammar.)
- **Achievements / badges** — the sticker chart: a grid of inked stamps, earned=colored,
  locked=ghost outline, each with a name + one-line "how to earn." Hover/focus reveals the how.
- **Streaks** — NOT a flame (rejecting the template streak-fire). A stamped **attendance strip**:
  consecutive days as inked check-stamps in a row, current count in mono. Calm, honest.
- **Daily challenge** — a **tear-off "today's page"** card (dashed tear edge), today's date in
  mono, one puzzle/goal, a stamp when done.
- **Quests** — a worksheet **checklist**: multi-step goals as inked tick-boxes that fill as you
  progress; complete = the whole card gets a stamp.
- **Mastery stars** — hand-inked **drawn stars** (stroke stars, not glossy emoji), 1–3 filled per
  skill, shown on lessons/puzzles/characters where mastery is earned.
- **Leaderboard** — reuse the tournament **scoresheet** grammar (`.tour-table` language): ranked
  rows across browser profiles, mono stats, leader row carries an inked rosette. Consistency over
  novelty.
- **Celebration moments** — the ink-confetti signature above.

## Unlockable board themes (I own the approved variant set)
The board is the signature element, so theme variants must stay coherent recolors of the inked `#`
— same lattice + marks, different "paper + ink." A curated set (default always free):
1. **Ink** (default) — grape/marigold on lilac paper. Always unlocked.
2. **Graphite** — pencil-grey strokes on white notebook paper; marks in soft graphite + a red
   pencil accent. (Earned early.)
3. **Blueprint** — cyan strokes on draughtsman blue; marks in white/amber. (Mid.)
4. **Chalk** — white chalk strokes on dark slate; marks in chalk-pastel. (The one dark theme; a
   classroom nod, earned later.)
Each is a `[data-board-theme="ink|graphite|blueprint|chalk"]` recolor (CSS custom-prop swap only —
grid ink, mark colors, paper). No logic; dana's unlock/select module sets the attribute. Keep to
~4 — a tight, high-quality set beats a sprawling one; contrast/focus floors hold in every theme.

## Hooks I'll need from dana (styling only, no logic change)
1. The DOM shape of the registry-generated Settings section: the row container id, the per-row
   markup, and a `data-module-id` on each row so I can accent/iconify by module.
2. The toggle control's markup (checkbox input vs button) so I can style it as the inked pill
   without changing its behavior/state hooks.
3. A `data-board-theme` attribute on a stable container (body or the board's section) that the
   theme module sets — I supply the 4 theme recolors as CSS.
4. Wherever badges/stars/streaks/leaderboard render: stable container ids + a `data-*` for state
   (earned/locked, star count) so pure CSS can theme without walking the DOM.
Ship the rough skeleton early (placeholder copy fine) and I'll dress it against real structure.

## Discipline
This phase adds the most surface yet, so restraint matters more: ONE reward vocabulary (the
stamp), ONE bold motion moment (ink-confetti), everything else quiet paper and one rule weight.
Accessibility floor unchanged — AA contrast in every theme, visible focus on every toggle, motion
gated, works to 320px. Before shipping each round: remove one accessory.
