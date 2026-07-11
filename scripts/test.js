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

ok('TT-33: fork puzzles accept EVERY fork square, not one hardcoded answer', () => {
  for (const p of puzzles.byCategory('fork')) {
    for (let idx = 0; idx < 9; idx++) {
      if (p.board[idx] !== null) continue;
      const nb = p.board.slice();
      nb[idx] = p.toMove;
      if (board.winner(nb) !== p.toMove && board.winningCells(nb, p.toMove).length >= 2) {
        assert.ok(p.correct.includes(idx + 1),
          `${p.id}: ${idx + 1} is a fork but is rejected`);
      }
    }
  }
  // The specific report (fork-1 shares the reported board): must accept 2 as well as 3.
  const f1 = puzzles.byId('fork-1');
  assert.ok(f1.correct.includes(2) && f1.correct.includes(3),
    'fork-1 must accept both 2 and 3');
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

ok('TT-32: fork lessons accept EVERY fork square, not one hardcoded answer', () => {
  const forks = lessons.LESSONS.find((l) => l.id === 'forks');
  for (let i = 0; i < forks.steps.length; i++) {
    const step = forks.steps[i];
    // Every empty square that yields 2+ winning threats must be in `correct`...
    for (let idx = 0; idx < 9; idx++) {
      if (step.board[idx] !== null) continue;
      const nb = step.board.slice();
      nb[idx] = step.toMove;
      if (board.winningCells(nb, step.toMove).length >= 2) {
        assert.ok(step.correct.includes(idx + 1),
          `forks step ${i + 1}: ${idx + 1} is a fork but is rejected`);
      }
    }
    // ...and every declared answer must actually be a fork.
    for (const pos of step.correct) {
      const nb = step.board.slice();
      nb[pos - 1] = step.toMove;
      assert.ok(board.winningCells(nb, step.toMove).length >= 2,
        `forks step ${i + 1}: declared ${pos} is not a fork`);
    }
  }
  // The specific report: step 1 must accept position 2 (as well as 3).
  const s1 = forks.steps[0];
  assert.ok(s1.correct.includes(2) && s1.correct.includes(3),
    'forks step 1 must accept both 2 and 3');
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

  ok('a report is persisted before send and never lost on failure/degrade (#86)', () => {
    // Mirrors widget.submit anti-loss: add an "unsent" record first, then either
    // update to "filed" (success) or leave it "unsent" (send failed / file:// degrade).
    let s = store.load();
    store.addSupportReport(s, { clientReportId: 'lose1', source: 'local', number: null, key: null, type: 'enhancement', title: 'x', workState: 'unsent', bundle: null });
    store.save(s);
    // success path → update to filed with a real number
    s = store.load();
    store.updateSupportReport(s, 'lose1', { source: 'local', number: 9, key: 'k', workState: 'filed' });
    store.save(s);
    assert.strictEqual(store.findSupportReport(store.load(), 'lose1').workState, 'filed');
    // degrade path → stays unsent with a copyable bundle, still present (never lost)
    s = store.load();
    store.addSupportReport(s, { clientReportId: 'lose2', source: 'local', number: null, key: null, type: 'bug', title: 'y', workState: 'unsent', bundle: null });
    store.updateSupportReport(s, 'lose2', { bundle: 'BUNDLE-TEXT' });
    store.save(s);
    const r2 = store.findSupportReport(store.load(), 'lose2');
    assert.strictEqual(r2.workState, 'unsent', 'degraded report stays unsent, not silently dropped');
    assert.strictEqual(r2.bundle, 'BUNDLE-TEXT', 'bundle saved so the user can still copy/send it');
  });
  ok('supportReports is browser-global + round-trips; profile name stays local (S1 #78)', () => {
    let s = store.load();
    store.addSupportReport(s, { clientReportId: 'crid1', source: 'local', number: 7, key: 'k', type: 'bug', title: 'x', user: 'alice', workState: 'filed' });
    store.save(s);
    s = store.load();
    const r = store.findSupportReport(s, 'crid1');
    assert.ok(r && r.number === 7, 'report survives reload');
    assert.strictEqual(r.user, 'alice', 'profile name kept LOCALLY on the report (never transmitted)');
    assert.ok(Array.isArray(s.supportReports), 'supportReports is a top-level (browser-global) array, not per-user');
    store.updateSupportReport(s, 'crid1', { workState: 'fix-ready', needsReply: true });
    store.save(s);
    assert.strictEqual(store.findSupportReport(store.load(), 'crid1').workState, 'fix-ready', 'update persists');
  });
  ok('tournament resumes the in-flight board across a simulated tab switch (regression #84/#49)', () => {
    // Mirrors app.js tourPlay→persist and renderTour→resume, minus the DOM: a move
    // persists tour.board; a tab switch (tour/tourGame nulled, board DOM cleared — DOM
    // only, never the store) must resume the exact position, not reset to 0/12.
    let s = store.load();
    store.ensureUser(s, 'trep');
    let tour = tournament.newTournament(); tour.board = null;
    store.setTournament(s, 'trep', tour); store.save(s);
    // a move lands (X + O), game still in progress → persist tour.board
    const mid = ['O', null, null, null, 'X', null, null, null, null];
    tour.board = mid.slice();
    store.setTournament(s, 'trep', tour); store.save(s);
    // TAB SWITCH: forget the in-memory tour/tourGame; the store is untouched
    tour = null;
    // switch back → loadTour + reconstruct
    s = store.load();
    tour = store.getTournament(s, 'trep');
    const nextId = tournament.nextOpponent(tour);
    const resumed = tour.board && tour.board.length === 9 ? tour.board.slice() : board.emptyBoard();
    assert.deepStrictEqual(resumed, mid, 'in-flight board resumed, not reset');
    assert.strictEqual(nextId, 'scribble', 'still on the first opponent');
    assert.strictEqual(tournament.standings(tour).points, 0, 'points 0/12 is correct pre-completion, not a reset');
  });
  ok('puzzle + lesson progress are isolated per user; a brand-new account is a clean slate (#23)', () => {
    let s = store.load();
    store.ensureUser(s, 'pg');
    store.getLessonProgress(s, 'pg', 'basics'); // creates pg's lesson entry
    // Reporter's exact repro (#23 reopen): pg solves EVERY puzzle...
    for (const p of puzzles.PUZZLES) store.recordPuzzleAttempt(s, 'pg', p, p.correct[0], true);
    store.save(s);
    // ...then a BRAND-NEW account is created and must show ZERO solved.
    s = store.load();
    store.ensureUser(s, 'xg');
    store.save(s);
    s = store.load();
    const solvedFor = (u) => new Set(((s.puzzleAttempts[u]) || []).filter((a) => a.correct).map((a) => a.id));
    assert.strictEqual(solvedFor('pg').size, puzzles.PUZZLES.length, 'pg has all puzzles solved');
    assert.strictEqual(solvedFor('xg').size, 0, 'a brand-new account (xg) has 0 solved — no bleed');
    assert.deepStrictEqual(Object.keys(s.puzzleAttempts).sort(), ['pg'], 'only pg holds any attempts');
    assert.ok(s.lessons.pg && s.lessons.pg.basics, 'pg has lesson progress');
    assert.ok(!(s.lessons.xg && Object.keys(s.lessons.xg).length), 'xg has no lesson history');
  });
  ok('app-level settings namespace persists, distinct from per-user gami (support pre-work #73)', () => {
    let s = store.load();
    assert.strictEqual(store.getAppSetting(s, 'showSupportButton', false), false, 'defaults to the given default');
    store.setAppSetting(s, 'showSupportButton', true);
    store.save(s);
    s = store.load();
    assert.strictEqual(store.getAppSetting(s, 'showSupportButton', false), true, 'app setting survives reload');
    // app-level, NOT under any user profile
    assert.ok(s.appSettings && s.appSettings.showSupportButton === true);
    assert.ok(!s.users || Object.keys(s.users).every((n) => !s.users[n].appSettings), 'not stored per-user');
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
ok('contributor badges: idempotent, confirmed-keyed, inert when off (support pre-work #74)', () => {
  const g = { settings: gami.defaultSettings(), state: {} };
  gami.emit(g, 'report_filed', {}); gami.emit(g, 'report_filed', {});
  assert.deepStrictEqual(g.state.contributor.earned, ['first_report'], 'first_report fires once, not per filing');
  assert.strictEqual(g.state.contributor.filings, 2);
  for (let i = 0; i < 8; i++) gami.emit(g, 'report_filed', {}); // 10 total
  assert.ok(g.state.contributor.earned.includes('regular'), '10 filings earns Regular');
  // confirmed-only tier
  assert.ok(!g.state.contributor.earned.includes('confirmed_fix'), 'confirmed tier is NOT keyed on filings');
  gami.emit(g, 'report_confirmed', {});
  assert.ok(g.state.contributor.earned.includes('confirmed_fix'), 'first confirmed earns Confirmed Fix');
  gami.emit(g, 'report_confirmed', {}); gami.emit(g, 'report_confirmed', {}); // 3 confirmed
  assert.ok(g.state.contributor.earned.includes('sharp_eye'), '3 confirmed earns Sharp Eye');
  // off = inert
  const off = { settings: gami.defaultSettings(), state: {} };
  off.settings.contributor = false;
  gami.emit(off, 'report_filed', {});
  assert.strictEqual(off.state.contributor, undefined, 'disabled contributor writes no state');
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

console.log('support transport binding (S2 relay switch):');
(function () {
  const t = require('../js/support/transport');
  const save = { location: global.location, fetch: global.fetch, window: global.window };
  const set = (o) => {
    global.location = { protocol: o.protocol || 'https:' };
    global.window = { TTSupportConfig: 'config' in o ? o.config : null };
    global.fetch = o.fetch || null;
    t._resetBinding();
  };
  const restore = () => { global.location = save.location; global.window = save.window; global.fetch = save.fetch; t._resetBinding(); };

  ok('relayBase parses a valid https config (trims trailing slash); rejects junk/empty', () => {
    set({ config: { relayBase: 'https://x.vercel.app/api/' } });
    assert.strictEqual(t.relayBase(), 'https://x.vercel.app/api');
    set({ config: { relayBase: 'ftp://nope' } });
    assert.strictEqual(t.relayBase(), null);
    set({ config: { relayBase: null } });
    assert.strictEqual(t.relayBase(), null);
  });
  ok('detectBinding priority (sync): file->copy, config->relay, else->inbox', () => {
    set({ protocol: 'file:' });
    assert.strictEqual(t.detectBinding(), 'copy');
    set({ protocol: 'https:', config: { relayBase: 'https://x.vercel.app/api' } });
    assert.strictEqual(t.detectBinding(), 'relay');
    set({ protocol: 'http:', config: null });
    assert.strictEqual(t.detectBinding(), 'inbox');
  });
  restore();
})();

// Async transport tests (the inbox probe + URL routing) run last, then print the summary.
(async () => {
  const t = require('../js/support/transport');
  const save = { location: global.location, fetch: global.fetch, window: global.window };
  const set = (o) => {
    global.location = { protocol: o.protocol || 'https:' };
    global.window = { TTSupportConfig: 'config' in o ? o.config : null };
    global.fetch = o.fetch;
    t._resetBinding();
  };
  const restore = () => { global.location = save.location; global.window = save.window; global.fetch = save.fetch; t._resetBinding(); };
  async function okA(name, fn) { await fn(); passed++; console.log(`  ok  ${name}`); }

  await okA('resolveBinding: a configured relay WINS and the inbox is never probed (§6)', async () => {
    let probed = false;
    set({ config: { relayBase: 'https://r.vercel.app/api' }, fetch: async () => { probed = true; return { ok: true, json: async () => ({}) }; } });
    assert.strictEqual(await t.resolveBinding(), 'relay');
    assert.strictEqual(probed, false, 'must not probe the inbox when a relay is configured');
  });
  await okA('resolveBinding: no config -> inbox when it answers, copy when refused', async () => {
    set({ config: null, fetch: async () => ({ ok: true, json: async () => ({ results: [] }) }) });
    assert.strictEqual(await t.resolveBinding(), 'inbox');
    set({ config: null, fetch: async () => { throw new Error('connection refused'); } });
    assert.strictEqual(await t.resolveBinding(), 'copy');
  });
  await okA('file() posts to <relayBase>/tictac/issues carrying clientReportId (relay binding)', async () => {
    let seen = null;
    set({ config: { relayBase: 'https://r.vercel.app/api' }, fetch: async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ source: 'github', number: 5, key: 'k' }) }; } });
    const res = await t.file({ clientReportId: 'crid', reportType: 'bug', title: 'x', body: 'b', screenshot: 'data:image/png;base64,AAAA' });
    assert.strictEqual(res.number, 5);
    assert.strictEqual(seen.url, 'https://r.vercel.app/api/tictac/issues');
    assert.strictEqual(JSON.parse(seen.opts.body).clientReportId, 'crid');
  });
  await okA('thread() puts the capability key in the X-Support-Key header, NEVER the URL (§3)', async () => {
    let seen = null;
    set({ config: { relayBase: 'https://r.vercel.app/api' }, fetch: async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ number: 5 }) }; } });
    await t.thread({ source: 'github', number: 5, key: 'SECRETKEY' });
    assert.strictEqual(seen.url, 'https://r.vercel.app/api/tictac/issues/5');
    assert.strictEqual(seen.opts.headers['X-Support-Key'], 'SECRETKEY');
    assert.ok(!seen.url.includes('SECRETKEY'), 'key must never appear in the URL/query');
  });
  await okA('file:// degrades to a copy bundle with no network call', async () => {
    let called = false;
    set({ protocol: 'file:', config: null, fetch: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
    const res = await t.file({ clientReportId: 'c', reportType: 'bug', title: 'x', body: 'b' });
    assert.ok(res.copy && res.copy.includes('tictac support report'), 'copy bundle returned');
    assert.strictEqual(called, false, 'no network on the file:// degrade path');
  });
  restore();
  console.log(`\nAll ${passed} tests passed.`);
})().catch((e) => { console.error((e && e.stack) || e); process.exit(1); });
