// AI CHARACTER SYSTEM (Phase 4). Four named opponents, each a self-contained
// local policy over the existing engine (js/board.js + js/ai.js). NO ML, NO
// network — every move is computed from the board alone. Three policies (brick,
// twist, ace) are fully deterministic; scribble is intentionally random (chaos
// is its whole character). Voice lines are static pre-written strings. Dual
// export (Node module + browser `window.TTCharacters`) so the Master's
// unbeatability can be re-proven under Node against this file.
//
// Placeholder names/personas ship now so iris can design against real UI; she
// owns the final visual identity/naming (PHASE4-2), this file owns the mechanics.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./board'), require('./ai'));
  } else {
    root.TTCharacters = factory(root.TTBoard, root.TTAi);
  }
})(typeof self !== 'undefined' ? self : this, function (board, ai) {
  'use strict';

  function opponent(mark) {
    return mark === 'X' ? 'O' : 'X';
  }

  // A "fork" is a move after which `me` has two or more immediate winning
  // threats at once (the opponent can only block one). Returns the first legal
  // move that creates a fork, or null if none exists.
  function findForkMove(b, me) {
    for (const i of board.legalMoves(b)) {
      b[i] = me;
      const threats = board.winningCells(b, me).length;
      b[i] = null;
      if (threats >= 2) return i;
    }
    return null;
  }

  // A move that creates at least one new winning threat (two-in-a-row with an
  // open third), preferring central/corner squares — used to keep pressure on.
  function threatMove(b, me) {
    const prefs = [4, 0, 2, 6, 8, 1, 3, 5, 7];
    for (const i of prefs) {
      if (b[i] !== null) continue;
      b[i] = me;
      const threats = board.winningCells(b, me).length;
      b[i] = null;
      if (threats >= 1) return i;
    }
    return null;
  }

  function positional(b) {
    const prefs = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // center, corners, edges
    for (const i of prefs) if (b[i] === null) return i;
    return board.legalMoves(b)[0];
  }

  // --- the four character policies (each returns a 0..8 board index) ---

  // Chaotic: pure random legal move (the existing easy tier).
  function chaoticMove(b) {
    return ai.easyMove(b);
  }

  // Defensive Blocker: deliberately weighted toward blocking OVER winning — it
  // shuts down your threats before it takes its own, which makes it stubborn
  // and safe but beatable (it passes up wins to defend).
  function blockerMove(b, me) {
    const them = opponent(me);
    const blocks = board.winningCells(b, them); // block first
    if (blocks.length) return blocks[0];
    const wins = board.winningCells(b, me); // only then take a win
    if (wins.length) return wins[0];
    return positional(b);
  }

  // Fork-Hunting Trickster: actively seeks and creates forks. Wins/blocks when
  // forced, otherwise builds a double-threat, then keeps applying pressure.
  function tricksterMove(b, me) {
    const them = opponent(me);
    const wins = board.winningCells(b, me);
    if (wins.length) return wins[0]; // take a win
    const blocks = board.winningCells(b, them);
    if (blocks.length) return blocks[0]; // don't lose on the spot
    const fork = findForkMove(b, me); // create a double threat
    if (fork !== null) return fork;
    const threat = threatMove(b, me); // else build toward one
    if (threat !== null) return threat;
    return positional(b);
  }

  // Unbeatable Master: the existing minimax (hard tier) — never loses.
  function masterMove(b, me) {
    return ai.hardMove(b, me);
  }

  const CHARACTERS = [
    {
      id: 'scribble',
      name: 'Scribble',
      archetype: 'chaotic',
      archetypeLabel: 'Chaotic',
      blurb: 'No plan, all heart. Scribble plays wherever the pencil lands — wildly unpredictable, and honestly not very good.',
      voices: {
        intro: 'No plan, all heart. I play wherever the pencil lands.',
        taunt: "Ooh, what does THIS button do?",
        win: 'I WON?! I have no idea how, but I WON!',
        loss: 'Wait, that counts against me? Bummer.',
        draw: 'A tie! We are equally chaotic. I respect it.',
      },
    },
    {
      id: 'brick',
      name: 'Brick',
      archetype: 'defensive-blocker',
      archetypeLabel: 'Defensive Blocker',
      blurb: 'A stone-faced defender who lives to shut you down. Brick blocks your threat before it takes its own win — nothing gets through, but it rarely presses the advantage.',
      voices: {
        intro: 'You shall not pass. To three in a row, anyway.',
        taunt: 'Blocked. Try again.',
        win: 'You left a gap. I do not leave gaps.',
        loss: 'Impossible... you got through the wall.',
        draw: 'Nothing got through. A stalemate is a kind of victory.',
      },
    },
    {
      id: 'twist',
      name: 'Twist',
      archetype: 'fork-hunting-trickster',
      archetypeLabel: 'Fork-Hunting Trickster',
      blurb: 'A grinning schemer who sets traps. Twist hunts for forks — two threats at once — so that whichever one you block, the other wins.',
      voices: {
        intro: 'Two traps, one grin. Pick your poison.',
        taunt: 'Block that one and... oh no, look at the OTHER one.',
        win: 'Two threats, one of you. The math was never in your favor.',
        loss: 'Clever. You saw the trap coming. This time.',
        draw: 'A draw? You spoiled a perfectly good trap. Well played.',
      },
    },
    {
      id: 'ace',
      name: 'Ace',
      archetype: 'unbeatable-master',
      archetypeLabel: 'Unbeatable Master',
      blurb: 'A calm, all-seeing tactician who has already read every line to the end. Ace cannot be beaten — the very best you can do is force a draw.',
      voices: {
        intro: 'I draw or I win. Never lose. Good luck.',
        taunt: 'That line leads nowhere. But please, continue.',
        win: 'As foreseen.',
        loss: 'This should not be possible. Report this — genuinely.',
        draw: 'A draw. You played perfectly. Few ever do.',
      },
    },
  ];

  const POLICIES = {
    scribble: chaoticMove,
    brick: blockerMove,
    twist: tricksterMove,
    ace: masterMove,
  };

  function byId(id) {
    return CHARACTERS.find((c) => c.id === id) || null;
  }

  // Choose a move for character `id` playing mark `me` on board `b`.
  function moveFor(id, b, me) {
    const policy = POLICIES[id];
    if (!policy) throw new Error(`Unknown character "${id}".`);
    return policy(b, me);
  }

  return {
    CHARACTERS,
    byId,
    moveFor,
    // exported for tests / reuse
    chaoticMove,
    blockerMove,
    tricksterMove,
    masterMove,
    findForkMove,
  };
});
