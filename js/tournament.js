// TOURNAMENT MODE (Phase 4). A round-robin gauntlet: the user (always X) plays
// one game against each character in the cast; standings tally points (win 3,
// draw 1, loss 0) and award a placement. Pure, deterministic state helpers with
// no I/O — the surface (webapp app.js / CLI) drives the actual games and calls
// recordOutcome, then persists the state. Dual export (Node + window.TTTournament).
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TTTournament = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POINTS = { win: 3, draw: 1, loss: 0 };

  // Default cast order (character ids from characters.js), easiest -> hardest.
  const DEFAULT_CAST = ['scribble', 'brick', 'twist', 'ace'];

  function newTournament(castIds) {
    const cast = (castIds && castIds.length ? castIds : DEFAULT_CAST).slice();
    const results = {};
    for (const id of cast) results[id] = null; // null = not yet played
    return { cast, results };
  }

  // The user is always X. Map a finished board status to the user's outcome.
  function outcomeFromStatus(status, userMark) {
    const mark = userMark || 'X';
    if (status === 'draw') return 'draw';
    const userWon = (status === 'x_win' && mark === 'X') || (status === 'o_win' && mark === 'O');
    return userWon ? 'win' : 'loss';
  }

  // First cast member the user hasn't played yet, or null if the gauntlet is done.
  function nextOpponent(t) {
    for (const id of t.cast) if (t.results[id] === null) return id;
    return null;
  }

  function isComplete(t) {
    return t.cast.every((id) => t.results[id] !== null);
  }

  // Record the user's outcome ('win'|'loss'|'draw') vs one character. Idempotent
  // per opponent within a tournament (won't double-count a replayed game).
  function recordOutcome(t, characterId, outcome) {
    if (!(characterId in t.results)) {
      throw new Error(`"${characterId}" is not in this tournament.`);
    }
    if (!(outcome in POINTS)) {
      throw new Error(`Invalid outcome "${outcome}".`);
    }
    t.results[characterId] = outcome;
    return t;
  }

  // Summary of the user's run: per-opponent rows plus totals and a placement.
  function standings(t) {
    let win = 0, loss = 0, draw = 0, points = 0, played = 0;
    const rows = t.cast.map((id) => {
      const outcome = t.results[id];
      if (outcome) {
        played++;
        points += POINTS[outcome];
        if (outcome === 'win') win++;
        else if (outcome === 'loss') loss++;
        else draw++;
      }
      return { id, outcome };
    });
    const complete = played === t.cast.length;
    return {
      rows,
      played,
      remaining: t.cast.length - played,
      win, loss, draw,
      points,
      maxPoints: t.cast.length * POINTS.win,
      complete,
      placement: complete ? placement(win, draw, loss, t.cast.length) : null,
    };
  }

  // A simple, documented placement label from a completed gauntlet.
  function placement(win, draw, loss, total) {
    if (win === total) return 'Champion — swept the entire cast!';
    if (loss === 0) return 'Undefeated — no losses across the cast.';
    if (win > loss) return 'Contender — a winning record.';
    if (win === loss) return 'Even — you traded blows with the cast.';
    return 'Challenger — the cast got the better of you this time.';
  }

  return {
    POINTS,
    DEFAULT_CAST,
    newTournament,
    outcomeFromStatus,
    nextOpponent,
    isComplete,
    recordOutcome,
    standings,
    placement,
  };
});
