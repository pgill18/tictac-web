// Gym aggregation + mastery formula — ported from the CLI's lib/commands/gym.js.
// `masteryLevel` is byte-for-byte the CLI's formula. `computeGym` is a pure
// function of (store, user, puzzles, lessons) returning a structured report the
// UI renders (and Node tests assert on). Dual export (Node + `window.TTGym`).
//
// Mastery formula (documented, sensible — not scientific), max 8 points:
//   points = lessonsMastered (0..4)
//          + (any hard-AI game not lost ? 2 : 0)
//          + (puzzle solve rate >= .75 ? 2 : >= .5 ? 1 : 0)
//   Advanced     if points >= 7
//   Intermediate if points >= 3
//   Beginner     otherwise
(function (root, factory) {
  'use strict';
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.TTGym = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function masteryLevel(lessonsMastered, hardNotLost, solveRate, puzzleAttempts) {
    let pts = lessonsMastered;
    if (hardNotLost) pts += 2;
    if (puzzleAttempts > 0) {
      if (solveRate >= 0.75) pts += 2;
      else if (solveRate >= 0.5) pts += 1;
    }
    let level = 'Beginner';
    if (pts >= 7) level = 'Advanced';
    else if (pts >= 3) level = 'Intermediate';
    return { level, points: pts };
  }

  // Longest run of correct attempts ending at the most recent attempt.
  function currentStreak(attempts) {
    let streak = 0;
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i].correct) streak++;
      else break;
    }
    return streak;
  }

  function emptyAiStats() {
    return {
      easy: { win: 0, loss: 0, draw: 0 },
      medium: { win: 0, loss: 0, draw: 0 },
      hard: { win: 0, loss: 0, draw: 0 },
    };
  }

  // store: { users, puzzleAttempts, lessons }  (same shape as the CLI store,
  // minus the file-only games/matches/counters the gym never reads).
  function computeGym(store, user, puzzles, lessons) {
    const u = store.users && store.users[user]; // may be undefined for a new name
    const aiStats = (u && u.aiStats) || emptyAiStats();
    const matchStats = (u && u.matchStats) || { win: 0, loss: 0, draw: 0 };
    const hardNotLost = aiStats.hard.win + aiStats.hard.draw > 0;

    const attempts = (store.puzzleAttempts && store.puzzleAttempts[user]) || [];
    const cats = ['win1', 'win2', 'block', 'fork'];
    let totalSolved = 0;
    const puzzleCats = cats.map((c) => {
      const inCat = attempts.filter((a) => a.category === c);
      const solved = inCat.filter((a) => a.correct).length;
      totalSolved += solved;
      return { cat: c, label: puzzles.CATEGORIES[c], solved, attempts: inCat.length };
    });
    const solveRate = attempts.length ? totalSolved / attempts.length : 0;

    const prog = (store.lessons && store.lessons[user]) || {};
    let lessonsMastered = 0;
    const lessonRows = lessons.LESSONS.map((l) => {
      const p = prog[l.id];
      let status;
      if (!p || (p.step === 0 && !p.completed)) status = 'not started';
      else if (p.completed) { status = 'mastered'; lessonsMastered++; }
      else status = `in progress: step ${p.step + 1} of ${l.steps.length}`;
      return { id: l.id, title: l.title, status };
    });

    const { level, points } = masteryLevel(lessonsMastered, hardNotLost, solveRate, attempts.length);

    return {
      isNew: !u,
      aiStats,
      matchStats,
      hardNotLost,
      puzzleCats,
      totalSolved,
      totalAttempts: attempts.length,
      solveRate,
      streak: currentStreak(attempts),
      lessons: lessonRows,
      lessonsMastered,
      level,
      points,
    };
  }

  return { masteryLevel, currentStreak, computeGym, emptyAiStats };
});
