// Curated puzzle bank — ported verbatim from the CLI's lib/puzzles.js. Same 14
// puzzles, 4 categories, positions, solutions and explanations. Dual export
// (Node module + browser `window.TTPuzzles`).
// Each puzzle: { id, category, label, board, toMove, correct (positions 1-9), explain }
// Categories: win1 (win now), win2 (forced win in two moves), block, fork.
//
// Every puzzle is validated by scripts/verify-puzzles.js against the property
// for its category (see validatePuzzle below), so the "correct" sets are proven.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./board'), require('./ai'));
  } else {
    root.TTPuzzles = factory(root.TTBoard, root.TTAi);
  }
})(typeof self !== 'undefined' ? self : this, function (board, ai) {
  'use strict';

  const CATEGORIES = {
    win1: 'Win in 1',
    win2: 'Win in 2',
    block: 'Block the threat',
    fork: 'Find the fork',
  };

  // Shorthand: build a board from index->mark maps.
  function b(xs, os) {
    const board = [null, null, null, null, null, null, null, null, null];
    for (const i of xs) board[i] = 'X';
    for (const i of os) board[i] = 'O';
    return board;
  }

  const PUZZLES = [
    // ---------------- win1 ----------------
    {
      id: 'win1-1', category: 'win1', label: 'Complete the top row',
      board: b([0, 1], [3, 4]), toMove: 'X', correct: [3],
      explain: 'Positions 1 and 2 are yours — playing 3 completes the top row and wins.',
    },
    {
      id: 'win1-2', category: 'win1', label: 'Finish the diagonal',
      board: b([0, 4], [1, 2]), toMove: 'X', correct: [9],
      explain: 'You own the 1–5 diagonal; playing 9 completes it for the win.',
    },
    {
      id: 'win1-3', category: 'win1', label: 'Take the right column',
      board: b([2, 5], [0, 4]), toMove: 'X', correct: [9],
      explain: 'The right column (3 and 6) is yours — 9 completes it.',
    },
    {
      id: 'win1-4', category: 'win1', label: 'Complete the middle row',
      board: b([3, 4], [0, 1]), toMove: 'X', correct: [6],
      explain: 'You have 4 and 5 — playing 6 finishes the middle row.',
    },

    // ---------------- block ----------------
    {
      id: 'block-1', category: 'block', label: 'Stop the top row',
      board: b([4, 8], [0, 1]), toMove: 'X', correct: [3],
      explain: 'O has 1 and 2 and threatens 3 — block by playing 3 yourself.',
    },
    {
      id: 'block-2', category: 'block', label: 'Stop the diagonal',
      board: b([1, 2], [0, 8]), toMove: 'X', correct: [5],
      explain: 'O threatens the 1–5–9 diagonal — take the center 5 to block it.',
    },
    {
      id: 'block-3', category: 'block', label: 'Stop the middle column',
      board: b([0, 2], [1, 4]), toMove: 'X', correct: [8],
      explain: 'O has 2 and 5 in the middle column — block at 8.',
    },
    {
      id: 'block-4', category: 'block', label: 'Stop the middle row',
      board: b([0, 8], [3, 5]), toMove: 'X', correct: [5],
      explain: 'O has 4 and 6 and threatens the middle row — take 5 to block.',
    },

    // ---------------- fork ----------------
    {
      id: 'fork-1', category: 'fork', label: 'Make a double threat',
      board: b([0, 4], [3, 5]), toMove: 'X', correct: [2, 3, 7, 8],
      explain: 'A fork makes two winning threats at once, so O can only block one and you win with the other. Several squares work here.',
    },
    {
      id: 'fork-2', category: 'fork', label: 'Fork from the corner',
      board: b([2, 4], [3, 7]), toMove: 'X', correct: [1, 2, 6, 9],
      explain: 'A fork is two threats from one move — O cannot block both. More than one square forks here.',
    },
    {
      id: 'fork-3', category: 'fork', label: 'Fork with the bottom corner',
      board: b([0, 4], [1, 7]), toMove: 'X', correct: [3, 4, 6, 7],
      explain: 'Two threats, one move — O can only stop one. Several squares create a fork here.',
    },

    // ---------------- win2 (forced win in two of your moves) ----------------
    {
      id: 'win2-1', category: 'win2', label: 'Punish the corner reply',
      board: b([0], [2]), toMove: 'X', correct: [4, 7, 9],
      explain: 'O answered your corner (1) with the opposite corner (3) instead of the center — a losing mistake. Take an empty corner (7 or 9) or edge 4: O must defend your new threat, and whatever O does you get a fork and win on your next move. (Note: the center 5 only draws here.)',
    },
    {
      id: 'win2-2', category: 'win2', label: 'Punish the edge reply',
      board: b([0], [1]), toMove: 'X', correct: [4, 5, 7],
      explain: 'O answered your corner with an edge — a mistake. Take the center 5 (or corner 4/7). O is forced to react, and you then create two threats at once, winning in two moves.',
    },
    {
      id: 'win2-3', category: 'win2', label: 'Punish the far-edge reply',
      board: b([0], [7]), toMove: 'X', correct: [3, 5, 7],
      explain: 'O replied to your corner with the far edge (8) — a losing move. Build a threat that forces O to defend, then fork for the win in two moves.',
    },
  ];

  // --- validation used by scripts/verify-puzzles.js ---

  function other(mark) { return mark === 'X' ? 'O' : 'X'; }

  // Returns { ok, reason } — proves the declared `correct` set matches the category.
  function validatePuzzle(p) {
    const me = p.toMove;
    const them = other(me);
    // parity sanity: X moves first.
    const cx = p.board.filter((c) => c === 'X').length;
    const co = p.board.filter((c) => c === 'O').length;
    const parityOk = me === 'X' ? cx === co : cx === co + 1;
    if (!parityOk) return { ok: false, reason: `bad parity (X=${cx} O=${co}, ${me} to move)` };
    if (!p.correct.length) return { ok: false, reason: 'no correct moves declared' };

    for (const pos of p.correct) {
      const idx = pos - 1;
      if (p.board[idx] !== null) return { ok: false, reason: `correct pos ${pos} is occupied` };
      const test = p.board.slice();
      test[idx] = me;

      if (p.category === 'win1') {
        if (board.winner(test) !== me) return { ok: false, reason: `pos ${pos} does not win immediately` };
      } else if (p.category === 'block') {
        // The opponent must have exactly one immediate threat and pos must cover it.
        const threats = board.winningCells(p.board, them);
        if (threats.length < 1) return { ok: false, reason: 'no opponent threat to block' };
        if (!threats.includes(idx)) return { ok: false, reason: `pos ${pos} does not block the threat` };
      } else if (p.category === 'fork') {
        if (board.winner(test) === me) return { ok: false, reason: `pos ${pos} wins immediately (not a fork)` };
        const threats = board.winningCells(test, me);
        if (threats.length < 2) return { ok: false, reason: `pos ${pos} makes ${threats.length} threat(s), need >=2` };
        // opponent must not be able to win immediately in reply
        if (board.winningCells(p.board, them).length > 0) return { ok: false, reason: 'opponent already has a winning threat' };
      } else if (p.category === 'win2') {
        if (board.winner(test) === me) return { ok: false, reason: `pos ${pos} wins immediately (that's win1, not win2)` };
        // With optimal opponent defense, `me` must have a forced win from `test`.
        const val = ai.minimax(test, them, me, 1);
        if (val <= 0) return { ok: false, reason: `pos ${pos} does not force a win (minimax=${val})` };
      } else {
        return { ok: false, reason: `unknown category ${p.category}` };
      }
    }

    // Completeness: `correct` must list EVERY square that satisfies the category,
    // not one hardcoded answer — otherwise a genuinely-correct alternative gets
    // marked wrong (TT-33: fork puzzles rejected a second, equally-valid fork).
    const full = allSolutions(p);
    const missing = full.filter((pos) => !p.correct.includes(pos));
    if (missing.length) {
      return { ok: false, reason: `incomplete set — also solved by ${missing.join(',')}` };
    }
    return { ok: true };
  }

  // Every square that solves puzzle `p` for its category (the ground-truth set).
  function allSolutions(p) {
    const me = p.toMove;
    const them = other(me);
    const out = [];
    const oppThreatened = board.winningCells(p.board, them).length > 0;
    for (const i of board.legalMoves(p.board)) {
      const test = p.board.slice();
      test[i] = me;
      const pos = i + 1;
      if (p.category === 'win1') {
        if (board.winner(test) === me) out.push(pos);
      } else if (p.category === 'block') {
        if (board.winningCells(p.board, them).includes(i)) out.push(pos);
      } else if (p.category === 'fork') {
        if (!oppThreatened && board.winner(test) !== me && board.winningCells(test, me).length >= 2) out.push(pos);
      } else if (p.category === 'win2') {
        if (board.winner(test) !== me && ai.minimax(test, them, me, 1) > 0) out.push(pos);
      }
    }
    return out;
  }

  // Compute, for a position, every move that leads to a forced win for `me`
  // (used to derive/verify win2 correct sets).
  function forcedWinningMoves(boardArr, me) {
    const them = other(me);
    const moves = board.legalMoves(boardArr);
    const winners = [];
    for (const i of moves) {
      const test = boardArr.slice();
      test[i] = me;
      if (board.winner(test) === me) continue; // immediate win = win1, exclude
      const val = ai.minimax(test, them, me, 1);
      if (val > 0) winners.push(i + 1);
    }
    return winners;
  }

  function byId(id) { return PUZZLES.find((p) => p.id === id); }
  function byCategory(cat) { return PUZZLES.filter((p) => p.category === cat); }

  return {
    CATEGORIES, PUZZLES, validatePuzzle, forcedWinningMoves, byId, byCategory,
  };
});
