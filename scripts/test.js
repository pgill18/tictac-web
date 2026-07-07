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
const characters = require('../js/characters');
const tournament = require('../js/tournament');
const gami = require('../js/gamification');
const { masteryLevel, computeGym } = require('../js/gym');

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

  ok('an in-flight tournament board survives save/reload (defect #49)', () => {
    // The tab-switch data-loss bug was that the in-progress board was NOT part of
    // the persisted tournament state. Persisting tour.board must round-trip so a
    // reload (tab switch) can resume the exact position, not reset to empty.
    let s = store.load();
    store.ensureUser(s, 'tourist');
    const t = tournament.newTournament();
    t.board = ['X', null, null, null, 'O', null, null, null, null]; // mid-game vs scribble
    store.setTournament(s, 'tourist', t);
    store.save(s);
    // Simulate a tab switch: fresh load from the same backing store.
    s = store.load();
    const resumed = store.getTournament(s, 'tourist');
    assert.deepStrictEqual(resumed.board, ['X', null, null, null, 'O', null, null, null, null], 'in-flight board was lost on reload');
    assert.strictEqual(tournament.nextOpponent(resumed), 'scribble', 'resumed run should still be on the first opponent');
  });
})();

console.log('characters (Phase 4):');
ok('exactly 4 characters, each with name/blurb/full voice set', () => {
  assert.strictEqual(characters.CHARACTERS.length, 4);
  const ids = characters.CHARACTERS.map((c) => c.id).sort();
  assert.deepStrictEqual(ids, ['ace', 'brick', 'scribble', 'twist']);
  for (const c of characters.CHARACTERS) {
    assert.ok(c.name && c.blurb, `${c.id} missing name/blurb`);
    for (const k of ['intro', 'taunt', 'win', 'loss', 'draw']) {
      assert.ok(typeof c.voices[k] === 'string' && c.voices[k].length, `${c.id} missing voice.${k}`);
    }
  }
});
ok('blocker prioritizes blocking over its own immediate win', () => {
  // O could win at 5, but X threatens to win at 2 — the blocker must block.
  const b = ['X', 'X', null, 'O', 'O', null, null, null, null];
  assert.strictEqual(characters.blockerMove(b, 'O'), 2);
});
ok('trickster creates a fork when one is constructible', () => {
  // X at 0 and 4, O at 8: X can play a square that makes two threats at once.
  const b = ['X', null, null, null, 'X', null, null, null, 'O'];
  const move = characters.tricksterMove(b, 'X');
  b[move] = 'X';
  const threats = board.winningCells(b, 'X').length;
  assert.ok(threats >= 2, `trickster move ${move} made only ${threats} threat(s)`);
});
ok('trickster still takes an immediate win over merely forking', () => {
  const b = ['X', 'X', null, 'O', 'O', null, null, null, null]; // X wins at 2
  assert.strictEqual(characters.tricksterMove(b, 'X'), 2);
});

console.log('Master character stays unbeatable UNDER its wrapper — exhaustive:');
ok('moveFor("master") never loses across every human line', () => {
  // Identical exhaustive proof to the hard-AI test, but routed through the
  // character system (characters.moveFor) rather than ai.hardMove directly.
  let terminals = 0;
  function explore(b) {
    const st = board.status(b);
    if (st !== 'in_progress') {
      assert.notStrictEqual(st, 'x_win', `human beat Master on ${JSON.stringify(b)}`);
      terminals++;
      return;
    }
    const filled = b.filter((c) => c !== null).length;
    if (filled % 2 === 0) {
      for (const i of board.legalMoves(b)) { const nb = b.slice(); nb[i] = 'X'; explore(nb); }
    } else {
      const nb = b.slice();
      nb[characters.moveFor('ace', nb, 'O')] = 'O';
      explore(nb);
    }
  }
  explore(board.emptyBoard());
  assert.ok(terminals > 0);
  console.log(`      (explored ${terminals} terminal positions via moveFor, 0 losses)`);
});

console.log('tournament standings (Phase 4):');
ok('round-robin gauntlet tallies points (win 3 / draw 1 / loss 0) + placement', () => {
  let t = tournament.newTournament();
  assert.strictEqual(tournament.nextOpponent(t), 'scribble');
  assert.strictEqual(tournament.isComplete(t), false);
  tournament.recordOutcome(t, 'scribble', 'win');
  tournament.recordOutcome(t, 'brick', 'draw');
  tournament.recordOutcome(t, 'twist', 'win');
  tournament.recordOutcome(t, 'ace', 'loss');
  const s = tournament.standings(t);
  assert.strictEqual(s.points, 3 + 1 + 3 + 0);
  assert.strictEqual(s.win, 2); assert.strictEqual(s.draw, 1); assert.strictEqual(s.loss, 1);
  assert.strictEqual(s.complete, true);
  assert.strictEqual(tournament.nextOpponent(t), null);
  assert.ok(/Contender/.test(s.placement));
});
ok('sweeping the cast is Champion; outcome mapping respects the user mark', () => {
  let t = tournament.newTournament();
  for (const id of tournament.DEFAULT_CAST) tournament.recordOutcome(t, id, 'win');
  assert.ok(/Champion/.test(tournament.standings(t).placement));
  assert.strictEqual(tournament.outcomeFromStatus('x_win', 'X'), 'win');
  assert.strictEqual(tournament.outcomeFromStatus('o_win', 'X'), 'loss');
  assert.strictEqual(tournament.outcomeFromStatus('draw', 'X'), 'draw');
  assert.throws(() => tournament.recordOutcome(t, 'nobody', 'win'));
});

console.log('gym: Ace practice/tournament credits the "unbeatable AI survived" point (defect #42):');
ok('a draw vs Ace (characterStats.ace) sets hardNotLost even with no aiStats.hard game', () => {
  const store = {
    users: { u: { characterStats: { ace: { win: 0, loss: 0, draw: 1 } } } },
    puzzleAttempts: {}, lessons: {},
  };
  const g = computeGym(store, 'u', puzzles, lessons);
  assert.strictEqual(g.hardNotLost, true, 'a draw vs Ace should credit the point');
  assert.ok(g.points >= 2, 'hardNotLost is worth 2 mastery points');
});
ok('losing every Ace game does NOT grant the point', () => {
  const store = {
    users: { u: { characterStats: { ace: { win: 0, loss: 3, draw: 0 } } } },
    puzzleAttempts: {}, lessons: {},
  };
  assert.strictEqual(computeGym(store, 'u', puzzles, lessons).hardNotLost, false);
});

console.log('gamification registry (Phase 5):');
ok('registry: 5+ modules, each with id/name/description/default/on-hook', () => {
  assert.ok(gami.MODULES.length >= 5, `only ${gami.MODULES.length} modules`);
  const ids = new Set();
  for (const m of gami.MODULES) {
    assert.ok(m.id && m.name && m.description, `module missing fields: ${JSON.stringify(m)}`);
    assert.strictEqual(typeof m.default, 'boolean', `${m.id} default not boolean`);
    assert.strictEqual(typeof m.on, 'function', `${m.id} missing on() hook`);
    assert.ok(!ids.has(m.id), `duplicate module id ${m.id}`);
    ids.add(m.id);
  }
  // defaultSettings covers every module
  const ds = gami.defaultSettings();
  for (const m of gami.MODULES) assert.strictEqual(ds[m.id], m.default);
});
ok('xp/level, achievements, streaks, theme-unlock all fire on the right events', () => {
  const g = { settings: gami.defaultSettings(), state: {} };
  const a = gami.emit(g, 'game_end', { result: 'draw', opponent: 'ace', day: '2026-07-07' });
  assert.ok(a.some((n) => /Untouchable/.test(n.text)), 'draw vs Ace should earn Untouchable');
  for (let i = 0; i < 10; i++) gami.emit(g, 'game_end', { result: 'win', opponent: 'brick', day: '2026-07-07' });
  assert.strictEqual(g.state.xp.xp, 103, 'xp = 3 (draw) + 10*10 (wins)');
  assert.strictEqual(gami.levelForXp(g.state.xp.xp), 2);
  assert.ok(g.state.achievements.earned.includes('ten_wins'));
  assert.ok(g.state.themes.unlocked.includes('graphite'), 'level 2 unlocks graphite');
  // streak advances across consecutive days, not same day
  assert.strictEqual(g.state.streaks.current, 1);
  gami.emit(g, 'game_end', { result: 'win', opponent: 'brick', day: '2026-07-08' });
  assert.strictEqual(g.state.streaks.current, 2);
});
ok('a disabled module is truly inert (no state, no effect)', () => {
  const g = { settings: gami.defaultSettings(), state: {} };
  g.settings.xp = false;
  g.settings.achievements = false;
  gami.emit(g, 'game_end', { result: 'win', opponent: 'ace', day: '2026-07-07' });
  assert.strictEqual(g.state.xp, undefined, 'disabled xp module wrote no state');
  assert.strictEqual(g.state.achievements, undefined, 'disabled achievements module wrote no state');
});
ok('activeTheme respects the themes toggle (off => ink)', () => {
  const g = { settings: gami.defaultSettings(), state: { themes: { unlocked: ['ink', 'graphite'], selected: 'graphite' } } };
  assert.strictEqual(gami.activeTheme(g), 'graphite');
  g.settings.themes = false;
  assert.strictEqual(gami.activeTheme(g), 'ink', 'disabled themes module leaves no theme applied');
});

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
