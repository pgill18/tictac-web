# tictac — design direction

**The brief, honestly.** A tic-tac-toe *learning* game that must feel inviting to a nervous
beginner, satisfying to a competitor, and delightful to a kid — all at once. The world it lives
in is the oldest paper-and-pencil game there is: a hand-drawn `#`, two rival marks, a notebook
margin, the little slash you strike through three-in-a-row. That world — not a UI kit — is where
every choice below comes from.

**What I'm rejecting.** The current build is template default #2: near-black canvas, one blue
accent, flat bordered boxes. I'm also refusing cream-and-serif and broadsheet-columns. None of
those know anything about tic-tac-toe.

## Concept: "Worksheet"
A single warm-paper column that reads like a page torn from a well-made activity book. Bold
printed masthead, tabbed dividers for modes, content on soft cards with a *hard-edged* offset
shadow (a deliberate riso-style mis-registration, not a blurry drop shadow) so everything feels
physically printed and tactile. Quiet and disciplined everywhere — except the board.

## Color — "grape & marigold" (the X vs O rivalry is the palette)
The two players own the two hues. They are genuine opposites with personality, and nothing else
competes with them.
- `--paper`   `#f3f0fb`  — cool lilac-tinted paper (not white, not cream)
- `--ink`     `#241d3d`  — near-black ink-violet; all body text and grid strokes
- `--grape`   `#6338d6`  — X's color and the primary/interactive hue
- `--marigold``#f5a300`  — O's color; warm counterweight
- `--mint`    `#12a67a`  — success / "correct" / wins
- `--rose`    `#e23d63`  — error / "not quite" / losses
Support: `--line` `#ddd4f2` (soft rule), `--card` `#fbfaff` (raised paper).

## Type — three roles, three real stacks
- **Display** (masthead, section titles, the X/O marks, big numbers): a heavy *rounded* system
  stack — `ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`, weight 800, tight
  tracking. Friendly and confident; carries the playful, kid-facing energy.
- **Body** (prose, buttons, labels): humanist sans — `system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif`. Calm, legible for the nervous reader.
- **Utility / mono** (match codes, cell numbers 1–9, puzzle ids, gym stats): `ui-monospace,
  "Cascadia Code", Consolas, monospace`. Mono is *meaningful* here — it marks coordinate/machine
  content (a code you paste, a position you tap, a number you're scored on) as distinct from prose.

## Layout
Centered ~760px worksheet on a full-bleed paper field. Sticky masthead with the wordmark set as a
drawn logo. Mode nav = a row of tactile pill "tabs". Each mode is a titled worksheet section; the
board is always the visual hero, centered and large. On phones the column goes full-width, the
board scales down, the two-pane puzzle/lesson layout stacks list-over-detail.

## Signature element — the continuous inked grid
Every tic-tac-toe UI draws nine separate boxes. This one doesn't. The board paints **one hand-inked
`#`** — two vertical and two horizontal soft, slightly-rounded strokes — and the nine cells share
that single lattice with no borders of their own. Empty cells show their position number as a quiet
mono ghost (an invitation to tap). When a mark lands it **draws itself on**: a quick scale-and-fade
"pop" as if pressed onto the paper (grape X, marigold O), and the cell you can play lifts on hover.
This is the one orchestrated motion moment; everything else holds still. Fully disabled under
`prefers-reduced-motion`.

## Discipline
Boldness is spent only on the board. Cards, tabs, lists, and the gym stay quiet: flat paper, one
rule weight, one shadow treatment. Before shipping I remove one accessory rather than add.
Accessibility floor: visible grape focus ring on every control, WCAG-AA text contrast in all
states, motion gated on `prefers-reduced-motion`, works down to 320px.
