// localStorage-backed store for the webapp, keyed by username — the same
// no-auth "who's playing?" convention as the CLI's --user flag. One JSON blob
// under a single key holds every user's progress so the gym can read it all at
// once. Shape mirrors the CLI store (minus file-only games/matches/counters):
//   { currentUser, users: { name: { created, aiStats, matchStats } },
//     puzzleAttempts: { name: [ {id,category,correct,pos,ts} ] },
//     lessons: { name: { lessonId: { step, completed } } } }
// Browser global `window.TTStore`.
//
// CONCURRENCY (task #9). The webapp's concurrency profile is much milder than the
// CLI's file store, so it needs no lock:
//   - localStorage.setItem writes the whole blob in one synchronous call — it is
//     atomic, so a reader never sees a torn/half-written value (the CLI needed
//     temp+rename to get this; localStorage gives it for free).
//   - Within a tab, JS is single-threaded and load()->mutate->save() runs as one
//     uninterrupted synchronous task (no await between), so a tab can't race
//     itself. app.js also reload()s immediately before every persist(), so each
//     write is built on the freshest state — the tightest possible window.
//   - The only residual race is two TABS/devices writing under different users
//     at the same instant (last-writer-wins on the shared key). That's inherent
//     to localStorage and low-impact here: the product model is one player per
//     browser/tab (the "who's playing?" switcher), not concurrent shared writers
//     like the CLI's async matches. So we accept last-writer-wins rather than
//     add cross-tab coordination that this toy store doesn't warrant.
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
    return { currentUser: null, users: {}, puzzleAttempts: {}, lessons: {}, recordedMatches: {}, tournaments: {} };
  }

  function emptyTournamentStats() {
    return { played: 0, win: 0, loss: 0, draw: 0, completed: 0 };
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
    if (!u.characterStats) u.characterStats = {}; // charId -> {win,loss,draw}
    if (!u.tournamentStats) u.tournamentStats = emptyTournamentStats();
    // Phase 5 gamification: per-user { settings: {moduleId->bool overrides}, state: {moduleId->{...}} }.
    // settings only holds explicit user choices; registry defaults fill the rest.
    if (!u.gami) u.gami = { settings: {}, state: {} };
    if (!u.gami.settings) u.gami.settings = {};
    if (!u.gami.state) u.gami.state = {};
    return u;
  }

  function getGami(store, user) {
    return ensureUser(store, user).gami;
  }
  // Toggle a gamification module on/off for a user (explicit override).
  function setGamiSetting(store, user, moduleId, on) {
    ensureUser(store, user).gami.settings[moduleId] = !!on;
  }

  // Record a practice game vs a character, from the user's (X) perspective.
  function recordCharacterResult(store, user, characterId, status) {
    const u = ensureUser(store, user);
    if (!u.characterStats[characterId]) u.characterStats[characterId] = { win: 0, loss: 0, draw: 0 };
    const bucket = u.characterStats[characterId];
    if (status === 'x_win') bucket.win++;
    else if (status === 'o_win') bucket.loss++;
    else if (status === 'draw') bucket.draw++;
  }

  // Fold a completed tournament's standings into the user's tournamentStats.
  function recordTournamentResult(store, user, s) {
    const u = ensureUser(store, user);
    u.tournamentStats.played += s.win + s.loss + s.draw;
    u.tournamentStats.win += s.win;
    u.tournamentStats.loss += s.loss;
    u.tournamentStats.draw += s.draw;
    u.tournamentStats.completed += 1;
  }

  // Persisted active-tournament state (so a run survives page reloads).
  function getTournament(store, user) {
    return (store.tournaments && store.tournaments[user]) || null;
  }
  function setTournament(store, user, t) {
    if (!store.tournaments) store.tournaments = {};
    store.tournaments[user] = t;
  }
  function clearTournament(store, user) {
    if (store.tournaments) delete store.tournaments[user];
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
    recordCharacterResult, recordTournamentResult,
    getTournament, setTournament, clearTournament, emptyTournamentStats,
    getGami, setGamiSetting,
  };
})(typeof self !== 'undefined' ? self : this);
