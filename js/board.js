// Board utilities shared by every game mode — ported verbatim from the CLI's
// lib/board.js. Dual export: as a Node module (for the unbeatability proof and
// puzzle/lesson verifiers) and as a browser global `window.TTBoard`.
//
// Board is an array of 9 cells, index 0..8, values 'X' | 'O' | null.
// User-facing positions are 1..9, mapped left-to-right, top-to-bottom:
//   1 | 2 | 3
//   4 | 5 | 6
//   7 | 8 | 9
(function (root, factory) {
  'use strict';
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.TTBoard = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6],            // diagonals
  ];

  function emptyBoard() {
    return [null, null, null, null, null, null, null, null, null];
  }

  // Returns 'X', 'O', or null.
  function winner(board) {
    for (const [a, b, c] of LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  function isFull(board) {
    return board.every((c) => c !== null);
  }

  function legalMoves(board) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (board[i] === null) moves.push(i);
    return moves;
  }

  // status codes used consistently across features
  function status(board) {
    const w = winner(board);
    if (w === 'X') return 'x_win';
    if (w === 'O') return 'o_win';
    if (isFull(board)) return 'draw';
    return 'in_progress';
  }

  function isGameOver(board) {
    return status(board) !== 'in_progress';
  }

  // Convert a 1..9 position to a 0..8 index, validating range and emptiness.
  // Throws with a user-friendly message on bad input.
  function posToIndex(board, posRaw, occupiedContext) {
    const pos = Number(posRaw);
    if (!Number.isInteger(pos) || pos < 1 || pos > 9) {
      throw new Error(`Position must be a number 1-9 (got "${posRaw}").`);
    }
    const idx = pos - 1;
    if (board[idx] !== null) {
      const where = occupiedContext ? ` ${occupiedContext}` : '';
      throw new Error(`Position ${pos} is already taken${where}.`);
    }
    return idx;
  }

  // Count how many lines are an immediate winning threat for `mark`
  // (two of `mark` and one empty). Returns the list of empty cells that
  // would complete a line — used for win/block/fork logic.
  function winningCells(board, mark) {
    const cells = new Set();
    for (const [a, b, c] of LINES) {
      const line = [board[a], board[b], board[c]];
      const marks = line.filter((v) => v === mark).length;
      const empties = line.filter((v) => v === null).length;
      if (marks === 2 && empties === 1) {
        const empty = [a, b, c].find((i) => board[i] === null);
        cells.add(empty);
      }
    }
    return [...cells];
  }

  // Text render (kept for parity with the CLI + Node tests). The browser UI
  // draws its own clickable grid instead of using this.
  function render(board) {
    const cell = (i) => (board[i] ? ` ${board[i]} ` : ` ${i + 1} `);
    const row = (r) => `${cell(r)}|${cell(r + 1)}|${cell(r + 2)}`;
    const sep = '---+---+---';
    return [row(0), sep, row(3), sep, row(6)].join('\n');
  }

  return {
    LINES,
    emptyBoard,
    winner,
    isFull,
    legalMoves,
    status,
    isGameOver,
    posToIndex,
    winningCells,
    render,
  };
});
