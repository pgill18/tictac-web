'use strict';
// Automated tests for the WEBAPP's ported logic. Run: node scripts/test.js
// These run against the exact same files the browser loads (../js/*.js), which
// dual-export for Node — so the hard-AI unbeatability proof, puzzle/lesson
// validity, and match-code round-trip are all provable without a browser.
const assert = require('assert');
const board = require('../js/board');
const ai = require('../js/ai');
const puzzles = require('../js/puzzles');
const lessons = require('../js/lessons');
const matchcode = require('../js/matchcode');
const { masteryLevel } = require('../js/gym');

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log('board:');
ok('winner detects rows/cols/diags', () => {
  assert.strictEqual(board.winner(['X', 'X', 'X', null, null, null, null, null, null]), 'X');
  assert.strictEqual(board.winner(['O', null, null, 'O', null, null, 'O', null, null]), 'O');
  assert.strictEqual(board.winner(['X', null, null, null, 'X', null, null, null, 'X']), 'X');
  assert.strictEqual(board.winner(board.emptyBoard()), null);
});
ok('status codes', () => {
  assert.strictEqual(board.status(board.emptyBoard()), 'in_progress');
  assert.strictEqual(board.status(['X', 'X', 'X', 'O', 'O', null, null, null, null]), 'x_win');
  assert.strictEqual(board.status(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
});
ok('posToIndex validates', () => {
  const b = board.emptyBoard();
  assert.strictEqual(board.posToIndex(b, '5'), 4);
  assert.throws(() => board.posToIndex(b, '0'));
  assert.throws(() => board.posToIndex(b, '10'));
  b[4] = 'X';
  assert.throws(() => board.posToIndex(b, '5'));
});

console.log('ai (hard) is unbeatable — exhaustive over all human lines:');
ok('hard AI never loses regardless of human play', () => {
  // Human is X (moves first). AI is O (hard). Explore EVERY human move at
  // every X turn; AI replies deterministically. Assert no line ends in x_win.
  let terminals = 0;
  function explore(b) {
    const st = board.status(b);
    if (st !== 'in_progress') {
      assert.notStrictEqual(st, 'x_win', `human won on board ${JSON.stringify(b)}`);
      terminals++;
      return;
    }
    const filled = b.filter((c) => c !== null).length;
    if (filled % 2 === 0) {
      for (const i of board.legalMoves(b)) {
        const nb = b.slice();
        nb[i] = 'X';
        explore(nb);
      }
    } else {
      const nb = b.slice();
      nb[ai.hardMove(b, 'O')] = 'O';
      explore(nb);
    }
  }
  explore(board.emptyBoard());
  assert.ok(terminals > 0);
  console.log(`      (explored ${terminals} terminal positions, 0 losses)`);
});

ok('hard AI also unbeatable when it moves first (as X)', () => {
  // Symmetry check: AI as X vs every human O line.
  function explore(b) {
    const st = board.status(b);
    if (st !== 'in_progress') {
      assert.notStrictEqual(st, 'o_win');
      return;
    }
    const filled = b.filter((c) => c !== null).length;
    if (filled % 2 === 0) {
      const nb = b.slice();
      nb[ai.hardMove(b, 'X')] = 'X';
      explore(nb);
    } else {
      for (const i of board.legalMoves(b)) {
        const nb = b.slice();
        nb[i] = 'O';
        explore(nb);
      }
    }
  }
  explore(board.emptyBoard());
});

console.log('ai (medium) sanity:');
ok('medium takes an immediate win', () => {
  const b = ['X', 'X', null, 'O', 'O', null, null, null, null];
  assert.strictEqual(ai.mediumMove(b, 'X'), 2);
});
ok('medium blocks an immediate loss', () => {
  const b = [null, null, null, 'O', 'O', null, null, null, null];
  assert.strictEqual(ai.mediumMove(b, 'X'), 5);
});

console.log('puzzles:');
ok('12+ puzzles across 4 categories, all valid', () => {
  assert.ok(puzzles.PUZZLES.length >= 12, `only ${puzzles.PUZZLES.length} puzzles`);
  for (const c of ['win1', 'win2', 'block', 'fork']) {
    assert.ok(puzzles.byCategory(c).length >= 3, `category ${c} has <3`);
  }
  for (const p of puzzles.PUZZLES) {
    const r = puzzles.validatePuzzle(p);
    assert.ok(r.ok, `${p.id}: ${r.reason}`);
  }
});

console.log('lessons:');
const { validateAll } = require('./verify-lessons');
ok('4+ lessons, each 3+ steps; every step validated', () => {
  assert.ok(lessons.LESSONS.length >= 4);
  for (const l of lessons.LESSONS) {
    assert.ok(l.steps.length >= 3, `${l.id} has <3 steps`);
  }
  const { problems } = validateAll();
  assert.strictEqual(problems.length, 0, `lesson problems: ${problems.join('; ')}`);
});

console.log('match-code codec round-trip:');
ok('encode -> decode restores the exact board (empty, mid-game, finished)', () => {
  const cases = [
    board.emptyBoard(),
    ['X', null, null, null, 'O', null, null, null, null],
    ['X', 'O', 'X', 'O', 'X', 'O', null, null, null],
    ['X', 'X', 'X', 'O', 'O', null, null, null, null], // finished (x_win)
  ];
  for (const b of cases) {
    const code = matchcode.encode(b);
    const { board: back, turn, status } = matchcode.decode(code);
    assert.deepStrictEqual(back, b, `round-trip mismatch for ${JSON.stringify(b)}`);
    assert.strictEqual(status, board.status(b));
    const filled = b.filter((c) => c !== null).length;
    assert.strictEqual(turn, filled % 2 === 0 ? 'X' : 'O');
  }
});
ok('a move re-encodes to a new valid code (async play chain)', () => {
  // X opens center, encodes; O decodes, plays a corner, re-encodes; X decodes.
  let b = board.emptyBoard();
  b[4] = 'X';
  const c1 = matchcode.encode(b);
  const r1 = matchcode.decode(c1);
  assert.strictEqual(r1.turn, 'O');
  r1.board[0] = 'O';
  const c2 = matchcode.encode(r1.board);
  const r2 = matchcode.decode(c2);
  assert.strictEqual(r2.turn, 'X');
  assert.deepStrictEqual(r2.board, ['O', null, null, null, 'X', null, null, null, null]);
});
ok('decode rejects garbage and impossible positions', () => {
  assert.throws(() => matchcode.decode('not-base64!!!'));
  assert.throws(() => matchcode.decode(matchcode.encode(['O', 'O', null, null, null, null, null, null, null]))); // O>X parity
});

console.log('store: match-code result recording is idempotent per (user, final board):');
// store.js is browser code (localStorage-backed) but has no runtime browser deps
// beyond localStorage — shim it so the #15A dedup guard is provable under Node,
// independent of any browser caching. Mirrors app.js recordMatchIfFinished: the
// dedup key is encode(final board), a pure function of board content.
(function () {
  const mem = {};
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
  };
  const { TTStore: store } = require('../js/store');
  const finalBoard = ['X', 'X', 'X', 'O', 'O', null, null, null, null]; // x_win
  const key = matchcode.encode(finalBoard);

  ok('same finished code recorded once by one user, regardless of reloads/side', () => {
    let s = store.load();
    store.ensureUser(s, 'fixcheck');
    // Winner records their side via the play path.
    assert.strictEqual(store.recordMatchResult(s, 'fixcheck', 'X', 'x_win', key), true);
    store.save(s);
    // Reload the identical finished code twice (loader assigns the to-move side = O).
    for (let i = 0; i < 2; i++) {
      s = store.load();
      assert.strictEqual(store.recordMatchResult(s, 'fixcheck', 'O', 'x_win', key), false, 'reload should dedup');
      store.save(s);
    }
    s = store.load();
    assert.deepStrictEqual(s.users.fixcheck.matchStats, { win: 1, loss: 0, draw: 0 });
  });

  ok('a distinct opponent still records their own side once', () => {
    let s = store.load();
    store.ensureUser(s, 'opp');
    assert.strictEqual(store.recordMatchResult(s, 'opp', 'O', 'x_win', key), true);
    store.save(s);
    // opp reloading the same code dedups too.
    s = store.load();
    assert.strictEqual(store.recordMatchResult(s, 'opp', 'O', 'x_win', key), false);
    store.save(s);
    s = store.load();
    assert.deepStrictEqual(s.users.opp.matchStats, { win: 0, loss: 1, draw: 0 });
  });
})();

console.log('gym mastery formula:');
ok('brand-new user is Beginner', () => {
  assert.strictEqual(masteryLevel(0, false, 0, 0).level, 'Beginner');
});
ok('full progress is Advanced', () => {
  assert.strictEqual(masteryLevel(4, true, 0.9, 20).level, 'Advanced');
});
ok('mid progress is Intermediate', () => {
  assert.strictEqual(masteryLevel(2, false, 0.6, 10).level, 'Intermediate');
});

console.log(`\nAll ${passed} tests passed.`);
