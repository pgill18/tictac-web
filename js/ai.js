// AI opponents — ported verbatim from the CLI's lib/ai.js. The AI always plays
// as `me` (the mark passed in). Dual export (Node module + browser `window.TTAi`).
// easy   : random legal move.
// medium : take a win, else block a loss, else prefer center > corner > edge.
// hard   : minimax — provably optimal, never loses.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./board'));
  } else {
    root.TTAi = factory(root.TTBoard);
  }
})(typeof self !== 'undefined' ? self : this, function (board) {
  'use strict';

  function opponent(mark) {
    return mark === 'X' ? 'O' : 'X';
  }

  // Random choice from a list (used by the easy difficulty).
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function easyMove(b) {
    return pick(board.legalMoves(b));
  }

  function mediumMove(b, me) {
    const them = opponent(me);
    // 1. Win now if possible.
    const wins = board.winningCells(b, me);
    if (wins.length) return wins[0];
    // 2. Block an immediate opponent win.
    const blocks = board.winningCells(b, them);
    if (blocks.length) return blocks[0];
    // 3. Positional preference.
    const prefs = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // center, corners, edges
    for (const i of prefs) if (b[i] === null) return i;
    return board.legalMoves(b)[0];
  }

  // Minimax scored from `me`'s perspective. Depth is used so the AI prefers
  // faster wins and slower losses, which keeps play crisp and unbeatable.
  function minimax(b, toMove, me, depth) {
    const st = board.status(b);
    if (st === 'x_win' || st === 'o_win') {
      const winnerMark = st === 'x_win' ? 'X' : 'O';
      if (winnerMark === me) return 10 - depth;
      return depth - 10;
    }
    if (st === 'draw') return 0;

    const moves = board.legalMoves(b);
    const maximizing = toMove === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const i of moves) {
      b[i] = toMove;
      const score = minimax(b, opponent(toMove), me, depth + 1);
      b[i] = null;
      if (maximizing) {
        if (score > best) best = score;
      } else if (score < best) best = score;
    }
    return best;
  }

  function hardMove(b, me) {
    const moves = board.legalMoves(b);
    let bestScore = -Infinity;
    let bestMove = moves[0];
    for (const i of moves) {
      b[i] = me;
      const score = minimax(b, opponent(me), me, 1);
      b[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    return bestMove;
  }

  function chooseMove(b, me, difficulty) {
    switch (difficulty) {
      case 'easy':
        return easyMove(b);
      case 'medium':
        return mediumMove(b, me);
      case 'hard':
        return hardMove(b, me);
      default:
        throw new Error(`Unknown difficulty "${difficulty}" (use easy|medium|hard).`);
    }
  }

  return { chooseMove, easyMove, mediumMove, hardMove, minimax };
});
