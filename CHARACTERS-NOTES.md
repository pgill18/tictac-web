# tictac — character identities & tournament UI (Phase 4)

Extends the **Worksheet** system (see DESIGN-NOTES.md). Same rules: the inked board +
win-strike stays the ONE bold thing; characters extend that hand-inked ink language
(emblems, bracket connectors drawn as strokes) rather than inventing a new grammar.

## The rivalry is sacred
On the board the marks stay **X = grape / O = marigold** for every opponent — that's the
signature hugo signed off on. A character's identity lives on its **avatar token, card,
badge, and bracket seed**, never by recoloring the O. So each character gets an accent that
is *distinct from grape* (grape belongs to the human player, X).

## The cast — four inked opponents
Each is a hand-inked round **avatar token** (a bold emblem on a paper chip, one accent, one
glyph) + a one-word name + a dry one-liner. Difficulty is shown as a row of inked **pips
(1–4)** — structure encoding the true ordering, not decoration.

| # | Name | Archetype (dana's policy) | Accent | Emblem | Pips |
|---|------|---------------------------|--------|--------|------|
| 1 | **Scribble** | Chaotic / random | marigold `#e08a00` | a loose tangled scribble-loop (an O that got away) | ●○○○ |
| 2 | **Brick** | Defensive blocker | slate-teal `#1f7a75` | a shield / stacked-brick wall | ●●○○ |
| 3 | **Twist** | Fork-hunting trickster | plum-magenta `#b23f86` | a two-pronged fork | ●●●○ |
| 4 | **Ace** | Unbeatable master (minimax) | deep indigo-ink `#33296f` | a crown / keystone + a small "never loses" seal | ●●●● |

Voice (dana owns the strings; these are the register to write in — dry, warm, no emoji):
- **Scribble** — "No plan, all heart. I play wherever the pencil lands."  win: "Wait, I won?"  loss: "Worth it."
- **Brick** — "You shall not pass. To three in a row, anyway."  win: "The wall holds."  draw: "Nobody gets through. Good."
- **Twist** — "Two traps, one grin. Pick your poison."  win: "Forked you."  loss: "...how."
- **Ace** — "I draw or I win. Never lose. Good luck."  win: "As expected."  draw: "A draw is a compliment."

Accents are flat inked fills — one per token, everything around them quiet paper. Across a
4-up roster the color does the recognizing, the emblem confirms it. No gradients, no glow.

## Practice — "choose your opponent"
Replaces the difficulty dropdown in the AI tab. A worksheet **roster**: 2×2 card grid on
desktop, single column on phones. Each card = avatar token, name, one-liner, difficulty pips,
and a play affordance. The selected card lifts on its printed offset shadow and reveals its
accent as a left-edge rule (same treatment as the selected list-row elsewhere). Empty state
invites: "Pick an opponent to train against."

## Tournament — the "tournament sheet"
A worksheet scoresheet, not a sports-broadcast bracket:
- **Standings table** — mono columns (P · W · L · D · Pts) like the gym scoresheet, each row
  seeded by the character's avatar token + accent. Leader row carries an inked rosette.
- **Bracket / schedule** — match pairings connected by **hand-inked connector strokes** (the
  board's ink language), the winner of each carried forward with a struck advance-line echoing
  the win-strike. Round-robin standings are the primary view; a bracket is the flourish.
- Results persist to the gym scoresheet per user (dana's plumbing) — I only dress it.

## Hooks I need from dana (styling only, no logic change)
- A stable `data-character="scribble|brick|twist|ace"` attribute on the active-opponent
  container(s) so I can theme cards/screens by accent without guessing.
- The DOM shape of the practice roster + tournament views (container ids/classes) so I design
  against real hooks, exactly like the redesign respected app.js's contract.

## Discipline
Four accents is the most color this system has carried — so everything else gets quieter to
compensate: flat tokens, one rule weight, one shadow. Before shipping, remove one accessory.
Accessibility floor unchanged: AA contrast for every accent on paper, visible focus on every
card, motion gated on prefers-reduced-motion, works to 320px.
