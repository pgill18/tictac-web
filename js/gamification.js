// GAMIFICATION MODULE REGISTRY (Phase 5). One central registry: every reward
// feature is a self-contained MODULE { id, name, description, default, on(ev, api) }.
// Core game code fires events (emit); enabled modules react and mutate their own
// slice of per-user state. The Settings UI is GENERATED from MODULES — a new module
// added here appears in Settings automatically with zero UI code changes. A disabled
// module is truly inert: emit() skips it, so it never runs a hook or writes state.
//
// No external calls, no build step. Dual export (Node + window.TTGami) so the
// registry + every module's logic is unit-testable under Node.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTGami = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- XP curve (shared by xp + themes + leaderboard) ----
  // Cumulative XP required to REACH each level (index 0 => level 1).
  const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 520, 730, 1000];
  function levelForXp(xp) {
    let lvl = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if ((xp || 0) >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
    return lvl;
  }
  function xpForNextLevel(xp) {
    const lvl = levelForXp(xp);
    return LEVEL_THRESHOLDS[lvl] != null ? LEVEL_THRESHOLDS[lvl] : null; // null = max level
  }

  const XP_AWARD = { win: 10, draw: 3, loss: 1, puzzle: 5, lesson: 15, tournament: 25 };
  function xpEventKey(ev) {
    if (ev.type === 'game_end') return ev.result; // win|draw|loss
    if (ev.type === 'puzzle_solved') return ev.correct ? 'puzzle' : null;
    if (ev.type === 'lesson_completed') return 'lesson';
    if (ev.type === 'tournament_completed') return 'tournament';
    return null;
  }

  // ---- achievement catalogue (data; the module just tracks progress against it) ----
  const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Blood', description: 'Win your first game.' },
    { id: 'ten_wins', name: 'Old Hand', description: 'Win 10 games.' },
    { id: 'survive_ace', name: 'Untouchable', description: 'Draw or beat Ace, the unbeatable master.' },
    { id: 'first_puzzle', name: 'Warmed Up', description: 'Solve your first puzzle.' },
    { id: 'ten_puzzles', name: 'Puzzler', description: 'Solve 10 puzzles.' },
    { id: 'all_lessons', name: 'Star Pupil', description: 'Master all 4 lessons.' },
    { id: 'tournament_done', name: 'Contender', description: 'Finish a tournament.' },
    { id: 'champion', name: 'Champion', description: 'Sweep an entire tournament.' },
  ];
  const ACH_BY_ID = {};
  ACHIEVEMENTS.forEach((a) => { ACH_BY_ID[a.id] = a; });

  // ---- contributor badges (in-app-support reward loop, §5). Earned via support
  // events, not gameplay; the meaningful tier is keyed on resolution:confirmed. ----
  const CONTRIB_BADGES = [
    { id: 'first_report', name: 'First Report', description: 'File your first report.' },
    { id: 'regular', name: 'Regular', description: 'File 10 reports.' },
    { id: 'confirmed_fix', name: 'Confirmed Fix', description: 'A fix from your report was confirmed.' },
    { id: 'sharp_eye', name: 'Sharp Eye', description: 'Three of your reports led to confirmed fixes.' },
  ];
  const CONTRIB_BY_ID = {};
  CONTRIB_BADGES.forEach((b) => { CONTRIB_BY_ID[b.id] = b; });

  // ---- board themes (visual variants; iris owns the CSS recolors) ----
  const THEMES = [
    { id: 'ink', name: 'Ink', unlock: 'Default — always available.' },
    { id: 'graphite', name: 'Graphite', unlock: 'Reach level 2.' },
    { id: 'blueprint', name: 'Blueprint', unlock: 'Reach level 4.' },
    { id: 'chalk', name: 'Chalk', unlock: 'Earn 5 achievements.' },
  ];

  // =====================================================================
  // THE REGISTRY — each module self-contained. on(ev, api):
  //   api.state  = this module's persisted state slice (mutate freely)
  //   api.all    = every module's state (read others, e.g. themes reads xp)
  //   api.note(text, kind) = surface a notification (levelup/achievement/celebrate/...)
  // =====================================================================
  const MODULES = [
    {
      id: 'xp', name: 'XP & Levels', default: true,
      description: 'Earn experience points for wins, puzzles, and lessons, and climb levels.',
      on(ev, api) {
        const key = xpEventKey(ev);
        const pts = key && XP_AWARD[key];
        if (!pts) return;
        const before = levelForXp(api.state.xp || 0);
        api.state.xp = (api.state.xp || 0) + pts;
        const after = levelForXp(api.state.xp);
        if (after > before) api.note(`Level up! You reached level ${after}.`, 'levelup');
      },
    },
    {
      id: 'achievements', name: 'Achievements', default: true,
      description: 'Unlock badges for milestones like beating Ace or sweeping a tournament.',
      on(ev, api) {
        const st = api.state;
        st.earned = st.earned || [];
        const earn = (id) => {
          if (!st.earned.includes(id)) { st.earned.push(id); api.note(`Achievement unlocked: ${ACH_BY_ID[id].name}`, 'achievement'); }
        };
        if (ev.type === 'game_end') {
          if (ev.result === 'win') { st.wins = (st.wins || 0) + 1; earn('first_win'); if (st.wins >= 10) earn('ten_wins'); }
          if (ev.opponent === 'ace' && (ev.result === 'win' || ev.result === 'draw')) earn('survive_ace');
        } else if (ev.type === 'puzzle_solved' && ev.correct) {
          st.puzzles = (st.puzzles || 0) + 1; earn('first_puzzle'); if (st.puzzles >= 10) earn('ten_puzzles');
        } else if (ev.type === 'lesson_completed') {
          st.lessons = (st.lessons || 0) + 1; if (st.lessons >= 4) earn('all_lessons');
        } else if (ev.type === 'tournament_completed') {
          earn('tournament_done'); if (ev.placement && /Champion/.test(ev.placement)) earn('champion');
        }
      },
    },
    {
      id: 'streaks', name: 'Daily Streak', default: true,
      description: 'Track how many days in a row you show up to play.',
      on(ev, api) {
        if (!ev.day) return; // only day-stamped play events count
        const st = api.state;
        if (st.lastDay === ev.day) return; // already counted today
        st.current = st.lastDay && isConsecutive(st.lastDay, ev.day) ? (st.current || 0) + 1 : 1;
        st.lastDay = ev.day;
        st.longest = Math.max(st.longest || 0, st.current);
        if (st.current > 1) api.note(`${st.current}-day streak!`, 'streak');
      },
    },
    {
      id: 'mastery', name: 'Mastery Stars', default: true,
      description: 'Collect stars as you master lessons and puzzle categories.',
      on(ev, api) {
        const st = api.state;
        st.cats = st.cats || {}; // category -> solve count
        st.lessons = st.lessons || 0;
        if (ev.type === 'puzzle_solved' && ev.correct && ev.category) st.cats[ev.category] = (st.cats[ev.category] || 0) + 1;
        if (ev.type === 'lesson_completed') st.lessons += 1;
        const stars = masteryStars(st);
        if (stars > (st.stars || 0)) api.note(`You earned a mastery star (${stars} total).`, 'star');
        st.stars = stars;
      },
    },
    {
      id: 'celebration', name: 'Celebration Moments', default: true,
      description: 'Ink-confetti bursts when you win or hit a milestone.',
      // Presentation-only: notes a celebrate cue; the UI renders ink-confetti only
      // when this module is enabled (so OFF is truly inert — no animation at all).
      on(ev, api) {
        if (ev.type === 'game_end' && ev.result === 'win') api.note('win', 'celebrate');
        else if (ev.type === 'tournament_completed') api.note('tournament', 'celebrate');
      },
    },
    {
      id: 'themes', name: 'Unlockable Board Themes', default: true,
      description: 'Unlock and switch board looks (Graphite, Blueprint, Chalk) as you progress.',
      on(ev, api) {
        const st = api.state;
        st.unlocked = st.unlocked || ['ink'];
        st.selected = st.selected || 'ink';
        const level = levelForXp((api.all.xp && api.all.xp.xp) || 0);
        const achCount = ((api.all.achievements && api.all.achievements.earned) || []).length;
        const unlock = (id, cond) => {
          if (cond && !st.unlocked.includes(id)) { st.unlocked.push(id); api.note(`Board theme unlocked: ${themeName(id)}.`, 'unlock'); }
        };
        unlock('graphite', level >= 2);
        unlock('blueprint', level >= 4);
        unlock('chalk', achCount >= 5);
      },
    },
    {
      id: 'leaderboard', name: 'Local Leaderboard', default: true,
      description: 'Rank everyone who plays in this browser by level and XP.',
      // Read-only/derived (ranks all users by their xp state); no per-event state.
      on() {},
    },
    {
      id: 'contributor', name: 'Contributor', default: true,
      description: 'Thanks and badges for reporting bugs and suggestions.',
      // The reward loop for in-app support (inapp-support-plan.md §5). Reacts to
      // support events — 'report_filed' (any filing) and 'report_confirmed' (keyed
      // ONLY on resolution:confirmed). No live trigger exists yet (the filing UI is
      // gated until S2), so today it only fires via direct emit() calls in tests;
      // the registry entry + idempotent badge logic is the deliverable (#74).
      on(ev, api) {
        const st = api.state;
        st.earned = st.earned || [];
        const earn = (id) => {
          if (!st.earned.includes(id)) { st.earned.push(id); api.note(`Contributor badge: ${CONTRIB_BY_ID[id].name}`, 'contributor'); }
        };
        if (ev.type === 'report_filed') {
          st.filings = (st.filings || 0) + 1;
          earn('first_report');                       // any filing, once
          if (st.filings >= 10) earn('regular');       // 10 filings, once (capped)
        } else if (ev.type === 'report_confirmed') {
          // Keyed ONLY on resolution:confirmed — the meaningful, inflation-proof tier.
          st.confirmed = (st.confirmed || 0) + 1;
          earn('confirmed_fix');                       // first confirmed fix
          if (st.confirmed >= 3) earn('sharp_eye');    // 3 confirmed fixes
        }
      },
    },
  ];

  const MOD_BY_ID = {};
  MODULES.forEach((m) => { MOD_BY_ID[m.id] = m; });

  // ---- helpers exposed for modules/UI ----
  function isConsecutive(prevDay, day) {
    const a = new Date(prevDay + 'T00:00:00Z').getTime();
    const b = new Date(day + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86400000) === 1;
  }
  function masteryStars(st) {
    let stars = st.lessons || 0;
    for (const c in st.cats) if (st.cats[c] >= 3) stars += 1;
    return stars;
  }
  function themeName(id) { const t = THEMES.find((x) => x.id === id); return t ? t.name : id; }

  // ---- registry / settings API ----
  function byId(id) { return MOD_BY_ID[id] || null; }
  function defaultSettings() {
    const s = {};
    MODULES.forEach((m) => { s[m.id] = m.default; });
    return s;
  }
  function isEnabled(settings, id) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, id)) return !!settings[id];
    const m = MOD_BY_ID[id];
    return m ? !!m.default : false;
  }

  // Fire an event to every ENABLED module. gami = { settings, state } (mutated in
  // place). Returns the notifications collected this emit (for celebration/toasts).
  function emit(gami, type, ctx) {
    if (!gami.settings) gami.settings = defaultSettings();
    if (!gami.state) gami.state = {};
    const ev = Object.assign({ type: type }, ctx || {});
    const notes = [];
    for (const mod of MODULES) {
      if (!isEnabled(gami.settings, mod.id)) continue;
      if (!gami.state[mod.id]) gami.state[mod.id] = {};
      const api = {
        state: gami.state[mod.id],
        all: gami.state,
        settings: gami.settings,
        note: (text, kind) => notes.push({ module: mod.id, text: text, kind: kind || 'info' }),
      };
      if (typeof mod.on === 'function') mod.on(ev, api);
    }
    return notes;
  }

  // Active board theme for a user (respects the themes module being enabled).
  function activeTheme(gami) {
    if (!isEnabled(gami.settings, 'themes')) return 'ink';
    const st = (gami.state && gami.state.themes) || {};
    return st.selected || 'ink';
  }

  return {
    MODULES, ACHIEVEMENTS, THEMES, CONTRIB_BADGES, LEVEL_THRESHOLDS, XP_AWARD,
    byId, defaultSettings, isEnabled, emit,
    levelForXp, xpForNextLevel, masteryStars, activeTheme, themeName,
    achievementById: (id) => ACH_BY_ID[id] || null,
    contributorBadgeById: (id) => CONTRIB_BY_ID[id] || null,
  };
});
