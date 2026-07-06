// localStorage-backed store for the webapp, keyed by username — the same
// no-auth "who's playing?" convention as the CLI's --user flag. One JSON blob
// under a single key holds every user's progress so the gym can read it all at
// once. Shape mirrors the CLI store (minus file-only games/matches/counters):
//   { currentUser, users: { name: { created, aiStats, matchStats } },
//     puzzleAttempts: { name: [ {id,category,correct,pos,ts} ] },
//     lessons: { name: { lessonId: { step, completed } } } }
// Browser global `window.TTStore`.
(function (root) {
  'use strict';

  const KEY = 'tictac.web.v1';

  function emptyAiStats() {
    return {
      easy: { win: 0, loss: 0, draw: 0 },
      medium: { win: 0, loss: 0, draw: 0 },
      hard: { win: 0, loss: 0, draw: 0 },
    };
  }

  function emptyStore() {
    return { currentUser: null, users: {}, puzzleAttempts: {}, lessons: {}, recordedMatches: {} };
  }

  function load() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {
      data = null;
    }
    // Fill in any missing top-level keys for forward-compat / corrupted blobs.
    return Object.assign(emptyStore(), data || {});
  }

  function save(store) {
    localStorage.setItem(KEY, JSON.stringify(store));
  }

  function ensureUser(store, name) {
    if (!store.users[name]) {
      store.users[name] = {
        created: new Date().toISOString(),
        aiStats: emptyAiStats(),
        matchStats: { win: 0, loss: 0, draw: 0 },
      };
    }
    const u = store.users[name];
    if (!u.aiStats) u.aiStats = emptyAiStats();
    if (!u.matchStats) u.matchStats = { win: 0, loss: 0, draw: 0 };
    return u;
  }

  function userExists(store, name) {
    return Boolean(store.users[name]);
  }

  function listUsers(store) {
    return Object.keys(store.users).sort();
  }

  // --- recording helpers (mirror the CLI's stat side effects) ---

  function recordAiResult(store, user, difficulty, status) {
    const u = ensureUser(store, user);
    const bucket = u.aiStats[difficulty];
    if (status === 'x_win') bucket.win++;
    else if (status === 'o_win') bucket.loss++;
    else if (status === 'draw') bucket.draw++;
  }

  // Record a match result from the current user's perspective. `myMark` is the
  // side this user controlled ('X' or 'O'). Used by match-code async play (which
  // mirrors the CLI's online match, where each player records their own result).
  // `matchKey` (optional) makes recording idempotent: a finished match code that
  // is loaded/replayed more than once by the same user only counts once. Returns
  // true if it recorded, false if it was a duplicate that was skipped.
  function recordMatchResult(store, user, myMark, status, matchKey) {
    if (matchKey) {
      if (!store.recordedMatches) store.recordedMatches = {};
      if (!store.recordedMatches[user]) store.recordedMatches[user] = {};
      if (store.recordedMatches[user][matchKey]) return false;
      store.recordedMatches[user][matchKey] = true;
    }
    const u = ensureUser(store, user);
    const iWon = (status === 'x_win' && myMark === 'X') || (status === 'o_win' && myMark === 'O');
    const iLost = (status === 'x_win' && myMark === 'O') || (status === 'o_win' && myMark === 'X');
    if (status === 'draw') u.matchStats.draw++;
    else if (iWon) u.matchStats.win++;
    else if (iLost) u.matchStats.loss++;
    return true;
  }

  function recordPuzzleAttempt(store, user, puzzle, pos, correct) {
    ensureUser(store, user);
    if (!store.puzzleAttempts[user]) store.puzzleAttempts[user] = [];
    store.puzzleAttempts[user].push({
      id: puzzle.id, category: puzzle.category, correct, pos, ts: new Date().toISOString(),
    });
  }

  function getLessonProgress(store, user, lessonId) {
    if (!store.lessons[user]) store.lessons[user] = {};
    if (!store.lessons[user][lessonId]) store.lessons[user][lessonId] = { step: 0, completed: false };
    return store.lessons[user][lessonId];
  }

  root.TTStore = {
    KEY, emptyStore, load, save, ensureUser, userExists, listUsers,
    recordAiResult, recordMatchResult, recordPuzzleAttempt, getLessonProgress,
  };
})(typeof self !== 'undefined' ? self : this);
