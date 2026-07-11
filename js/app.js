'use strict';
// UI controller for the tictac webapp. All game logic lives in the ported,
// Node-provable modules (TTBoard/TTAi/TTPuzzles/TTLessons/TTGym/TTMatchCode);
// this file only wires them to the DOM and to the localStorage store (TTStore).
(function () {
  const board = window.TTBoard;
  const ai = window.TTAi;
  const puzzlesMod = window.TTPuzzles;
  const lessonsMod = window.TTLessons;
  const gymMod = window.TTGym;
  const matchcode = window.TTMatchCode;
  const characters = window.TTCharacters;
  const tournamentMod = window.TTTournament;
  const gamiMod = window.TTGami;
  const store = window.TTStore;

  const $ = (id) => document.getElementById(id);

  // ---------- current user ----------
  let s = store.load();
  let currentUser = s.currentUser || null;

  function reload() { s = store.load(); }
  function persist() { store.save(s); }

  function requireUser(container) {
    if (currentUser) return true;
    if (container) {
      container.innerHTML = '<p class="muted">Enter a name up top (“Play as this name”) to start — your progress is saved under that name.</p>';
    }
    return false;
  }

  function refreshUserBar() {
    $('current-user').textContent = currentUser || '— nobody yet —';
    const sel = $('user-select');
    const names = store.listUsers(s);
    sel.innerHTML = '<option value="">— switch user —</option>' +
      names.map((n) => `<option value="${escapeHtml(n)}"${n === currentUser ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
    sel.style.display = names.length ? '' : 'none';
  }

  function setUser(name) {
    name = (name || '').trim();
    if (!name) return;
    reload();
    store.ensureUser(s, name);
    s.currentUser = name;
    currentUser = name;
    persist();
    refreshUserBar();
    applyTheme(); // board theme is per-user
    // #23: a fresh user gets a clean slate — the lists/cats already re-read per-user below, but
    // the puzzle/lesson DETAIL panes and their selection are module state that would otherwise
    // keep showing the PREVIOUS user's open puzzle (with its "Correct" feedback + solved board)
    // or lesson step. Clear both so no prior-user progress lingers in the view.
    selectedPuzzle = null;
    selectedLesson = null;
    $('puzzle-detail').innerHTML = '<p class="muted">Pick a puzzle from the list.</p>';
    $('lesson-detail').innerHTML = '<p class="muted">Pick a lesson from the list.</p>';
    // re-render whatever mode is visible
    rerenderActiveMode();
  }

  $('user-set').addEventListener('click', () => {
    setUser($('user-input').value);
    $('user-input').value = '';
  });
  $('user-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('user-set').click(); });
  $('user-select').addEventListener('change', (e) => { if (e.target.value) setUser(e.target.value); });

  // ---------- nav ----------
  let activeMode = 'ai';
  $('mode-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    activeMode = btn.dataset.mode;
    for (const b of $('mode-nav').querySelectorAll('button')) b.classList.toggle('active', b === btn);
    for (const sec of document.querySelectorAll('.mode')) sec.classList.toggle('hidden', sec.id !== `mode-${activeMode}`);
    rerenderActiveMode();
  });

  function rerenderActiveMode() {
    // Never leave a persona card (name/blurb/decorative pips) sitting in an
    // inactive section's DOM — it would surface as a stray node (e.g. the AI
    // tab's default "●○○○" pips appearing before the Tournament heading). Clear
    // the persona of every non-active mode; the active mode repopulates its own.
    // Also clear the previous mode's BOARD markup, not just toggle its section's
    // CSS — a leftover empty-cell (e.g. AI cell "1") was surfacing in the a11y tree
    // after AI→Settings→Help (#65). The active mode re-renders its board from state.
    if (activeMode !== 'ai') { $('ai-persona').innerHTML = ''; clearBoardEl($('ai-board')); }
    if (activeMode !== 'tournament') { $('tour-persona').innerHTML = ''; clearBoardEl($('tour-board')); }
    if (activeMode === 'ai') { if (!aiGame && currentUser) newAiGame(); else renderAi(); }
    else if (activeMode === 'tournament') { tour = null; tourGame = null; renderTour(); }
    else if (activeMode === 'puzzles') renderPuzzleList();
    else if (activeMode === 'lessons') renderLessonList();
    else if (activeMode === 'gym') renderGym();
    else if (activeMode === 'settings') renderSettings();
    else if (activeMode === 'help') renderWhatsNew();
  }

  // ---------- board rendering ----------
  // opts: { onCell(i), interactive:boolean, marks:{X,O} classes handled }
  function renderBoard(container, b, opts) {
    opts = opts || {};
    container.innerHTML = '';
    container.classList.remove('empty');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      const mark = b[i];
      if (mark) {
        cell.className = `cell mark-${mark}`;
        cell.textContent = mark;
      } else {
        cell.className = 'cell empty';
        cell.textContent = String(i + 1); // visible position hint
      }
      const canPlay = opts.interactive && !mark && opts.onCell;
      if (canPlay) {
        cell.classList.add('playable');
        // a11y (#87): label the cell so a screen reader reads its meaning, not the raw
        // digit ("1"). The visible number stays for sighted users; aria-label overrides it.
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `Play position ${i + 1}`);
        cell.addEventListener('click', () => opts.onCell(i));
      } else if (opts.interactive) {
        cell.classList.add('disabled');
      }
      // An empty, non-playable cell's position digit is purely decorative — hide it from
      // the a11y tree so it isn't read out as a bare "1".."9" (#87/#65-class).
      if (!mark && !canPlay) cell.setAttribute('aria-hidden', 'true');
      container.appendChild(cell);
    }
  }

  // Empty a board element (remove its cells) and mark it .empty (display:none). Used
  // to tear down an inactive mode's board so stale cells can't linger in the DOM/a11y
  // tree (#65). The active mode re-renders its board from state when it becomes active.
  function clearBoardEl(el) {
    if (!el) return;
    el.innerHTML = '';
    el.classList.add('empty');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Render DECORATIVE glyph text (stars/pips/badges) a11y-safely (task #66): the
  // visible glyphs are aria-hidden so a screen reader never reads "black star black
  // star…"; the meaning is carried by aria-label on a role="img" wrapper. Needs no
  // CSS (glyphs stay visible). Use this for ANY decorative glyph string in markup —
  // scripts/check-a11y-glyphs.js flags bare glyphs in templates that skip it.
  function decorativeGlyph(glyphs, label) {
    return `<span role="img" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${glyphs}</span></span>`;
  }

  // =======================================================================
  // AI MODE — play a chosen character (Phase 4)
  // =======================================================================
  let aiGame = null; // { board, characterId, status }

  // Populate the character dropdown once.
  function fillCharacterSelect(sel) {
    // Just the name — the persona card carries the archetype/identity. (Full
    // "Name — archetype" wrapped/truncated in the native select on small screens.)
    sel.innerHTML = characters.CHARACTERS
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
  }

  // Persona card: name, blurb, and a contextual voice line (placeholder markup —
  // iris owns the final look; this is a working skeleton she can design against).
  function personaHtml(charId, voiceKey) {
    const c = characters.byId(charId);
    if (!c) return '';
    const line = c.voices[voiceKey || 'intro'];
    // .persona-avatar and .persona-pips are empty hooks iris paints via CSS;
    // .persona-arch shows the human-readable archetype label (not the raw slug).
    return `<div class="persona-card" data-character="${charSlug(charId)}">
      <span class="persona-avatar" aria-hidden="true"></span>
      <div class="persona-name">${escapeHtml(c.name)} <span class="persona-arch">${escapeHtml(c.archetypeLabel)}</span></div>
      <div class="persona-blurb">${escapeHtml(c.blurb)}</div>
      <span class="persona-pips" aria-hidden="true"></span>
      <div class="persona-voice">“${escapeHtml(line)}”</div>
    </div>`;
  }

  // Stable per-character slug (scribble|brick|twist|ace) for iris's accent
  // theming — set as data-character on the active board section / standings rows.
  function charSlug(id) {
    const c = characters.byId(id);
    return c ? c.name.toLowerCase() : '';
  }

  function voiceKeyForStatus(st) {
    if (st === 'x_win') return 'loss';   // the character lost
    if (st === 'o_win') return 'win';    // the character won
    if (st === 'draw') return 'draw';
    return 'taunt';                      // mid-game
  }

  function newAiGame() {
    if (!requireUser($('ai-status'))) return;
    aiGame = { board: board.emptyBoard(), characterId: $('ai-character').value, status: 'in_progress' };
    renderAi();
  }

  function aiPlay(i) {
    if (!aiGame || aiGame.status !== 'in_progress') return;
    aiGame.board[i] = 'X';
    aiGame.status = board.status(aiGame.board);
    if (aiGame.status === 'in_progress') {
      const aiIdx = characters.moveFor(aiGame.characterId, aiGame.board, 'O');
      aiGame.board[aiIdx] = 'O';
      aiGame.status = board.status(aiGame.board);
    }
    if (aiGame.status !== 'in_progress') {
      reload();
      store.recordCharacterResult(s, currentUser, aiGame.characterId, aiGame.status);
      persist();
      gamiEmit('game_end', { result: outcomeOf(aiGame.status), opponent: aiGame.characterId });
    }
    renderAi();
  }

  // Map a finished game status to the human's (X) outcome for gamification.
  function outcomeOf(status) {
    return status === 'x_win' ? 'win' : status === 'o_win' ? 'loss' : 'draw';
  }

  function renderAi() {
    if (!aiGame) {
      $('ai-board').classList.add('empty');
      $('ai-status').textContent = '';
      $('mode-ai').setAttribute('data-character', currentUser ? charSlug($('ai-character').value) : '');
      $('ai-persona').innerHTML = currentUser ? personaHtml($('ai-character').value, 'intro') : '';
      return;
    }
    $('mode-ai').setAttribute('data-character', charSlug(aiGame.characterId));
    const live = aiGame.status === 'in_progress';
    $('ai-persona').innerHTML = personaHtml(aiGame.characterId, live ? 'intro' : voiceKeyForStatus(aiGame.status));
    renderBoard($('ai-board'), aiGame.board, { interactive: true, onCell: live ? aiPlay : null });
    $('ai-status').innerHTML = aiStatusText(aiGame.status, aiGame.characterId);
  }

  function aiStatusText(st, charId) {
    const name = charId ? escapeHtml(characters.byId(charId).name) : 'The AI';
    if (st === 'x_win') return '<span class="win">You win! 🎉</span>';
    if (st === 'o_win') return `<span class="lose">${name} wins.</span>`;
    if (st === 'draw') return 'Draw.';
    return 'Your move (<span class="turn-x">X</span>).';
  }

  $('ai-new').addEventListener('click', newAiGame);
  $('ai-character').addEventListener('change', () => {
    // Preview the newly-selected persona when no game is in flight.
    if (!aiGame || aiGame.status !== 'in_progress') {
      $('mode-ai').setAttribute('data-character', currentUser ? charSlug($('ai-character').value) : '');
      $('ai-persona').innerHTML = currentUser ? personaHtml($('ai-character').value, 'intro') : '';
    }
  });

  // =======================================================================
  // TOURNAMENT MODE — round-robin gauntlet vs the whole cast (Phase 4)
  // =======================================================================
  let tour = null;      // persisted { cast, results }
  let tourGame = null;  // active game { board, characterId, status } or null

  function loadTour() {
    reload();
    tour = store.getTournament(s, currentUser);
  }

  function newTour() {
    if (!requireUser($('tour-status'))) return;
    tour = tournamentMod.newTournament();
    tour.board = null; // no in-flight game yet
    tourGame = null;
    reload();
    store.setTournament(s, currentUser, tour);
    persist();
    renderTour();
  }

  function tourPlay(i) {
    if (!tourGame || tourGame.status !== 'in_progress') return;
    tourGame.board[i] = 'X';
    tourGame.status = board.status(tourGame.board);
    if (tourGame.status === 'in_progress') {
      const aiIdx = characters.moveFor(tourGame.characterId, tourGame.board, 'O');
      tourGame.board[aiIdx] = 'O';
      tourGame.status = board.status(tourGame.board);
    }
    reload(); // fresh store, then a single persist() commits everything below
    if (tourGame.status === 'in_progress') {
      // Persist the in-flight board so the game survives a tab switch / reload —
      // it belongs to nextOpponent(tour), which renderTour resumes from.
      tour.board = tourGame.board.slice();
      store.setTournament(s, currentUser, tour);
      persist();
    } else {
      const outcome = tournamentMod.outcomeFromStatus(tourGame.status, 'X');
      tournamentMod.recordOutcome(tour, tourGame.characterId, outcome);
      tour.board = null; // game finished — no in-flight board to resume
      store.recordCharacterResult(s, currentUser, tourGame.characterId, tourGame.status);
      store.setTournament(s, currentUser, tour);
      // On completion, fold the run into the gym once.
      const done = tournamentMod.isComplete(tour);
      const standings = done ? tournamentMod.standings(tour) : null;
      if (done) store.recordTournamentResult(s, currentUser, standings);
      persist();
      // Gamification: each tournament game counts as a game_end; the whole run as a tournament_completed.
      gamiEmit('game_end', { result: outcome, opponent: tourGame.characterId });
      if (done) gamiEmit('tournament_completed', { placement: standings.placement, points: standings.points });
    }
    renderTour();
  }

  function renderTour() {
    if (!currentUser) { $('tour-standings').innerHTML = ''; $('tour-board').classList.add('empty'); $('tour-status').innerHTML = ''; $('tour-persona').innerHTML = '<p class="muted">Enter a name up top to play.</p>'; return; }
    if (!tour) loadTour();
    if (!tour) {
      $('tour-standings').innerHTML = '<p class="muted">No tournament yet — press “Start tournament”.</p>';
      $('tour-board').classList.add('empty'); $('tour-status').innerHTML = ''; $('tour-persona').innerHTML = '';
      return;
    }
    const s2 = tournamentMod.standings(tour);
    $('tour-standings').innerHTML = standingsHtml(s2);

    // A just-finished game (win/loss/draw) must be SHOWN with its final board for a beat before
    // we advance to the next opponent (TT-31 #31). Otherwise renderTour immediately reconstructs
    // the next opponent's EMPTY board (tourGame.characterId !== nextId, and tour.board was nulled
    // on finish), so the player's winning pieces appear to VANISH the instant they win — even
    // though the win is recorded (the standings/green result still reference them). Render the
    // in-memory finished board, hold, then advance.
    if (tourGame && tourGame.status && tourGame.status !== 'in_progress') {
      $('mode-tournament').setAttribute('data-character', charSlug(tourGame.characterId));
      $('tour-persona').innerHTML = personaHtml(tourGame.characterId, voiceKeyForStatus(tourGame.status));
      renderBoard($('tour-board'), tourGame.board, { interactive: false });
      $('tour-status').innerHTML = `${aiStatusText(tourGame.status, tourGame.characterId)} — advancing…`;
      tourGame = null;
      setTimeout(renderTour, 1100);
      return;
    }

    const nextId = tournamentMod.nextOpponent(tour);
    if (!nextId) {
      // Complete.
      tourGame = null;
      $('tour-persona').innerHTML = '';
      $('tour-board').classList.add('empty');
      $('tour-status').innerHTML = `<span class="win">Tournament complete — ${escapeHtml(s2.placement)}</span> (${s2.points}/${s2.maxPoints} pts). Press “Start / restart” to play again.`;
      return;
    }
    // Resume the in-flight game vs the next opponent. If a board was persisted
    // (mid-game, survived a tab switch/reload), continue from it; else start fresh.
    if (!tourGame || tourGame.characterId !== nextId) {
      const savedBoard = tour.board && tour.board.length === 9 ? tour.board.slice() : board.emptyBoard();
      tourGame = { board: savedBoard, characterId: nextId, status: board.status(savedBoard) };
    }
    const live = tourGame.status === 'in_progress';
    $('mode-tournament').setAttribute('data-character', charSlug(nextId));
    $('tour-persona').innerHTML = personaHtml(nextId, live ? 'intro' : voiceKeyForStatus(tourGame.status));
    renderBoard($('tour-board'), tourGame.board, { interactive: true, onCell: live ? tourPlay : null });
    const c = characters.byId(nextId);
    $('tour-status').innerHTML = live
      ? `Now facing <strong>${escapeHtml(c.name)}</strong> — your move (<span class="turn-x">X</span>).`
      : `${aiStatusText(tourGame.status, nextId)} — advancing…`;
    // If the game just finished, auto-advance the board to the next opponent on next render tick.
    if (!live) { tourGame = null; setTimeout(renderTour, 900); }
  }

  function standingsHtml(s2) {
    const rows = s2.rows.map((r) => {
      const c = characters.byId(r.id);
      const res = r.outcome ? r.outcome.toUpperCase() : '—';
      const cls = r.outcome === 'win' ? 'win' : r.outcome === 'loss' ? 'lose' : '';
      return `<tr data-character="${charSlug(r.id)}"><td>${escapeHtml(c.name)}</td><td class="${cls}">${res}</td></tr>`;
    }).join('');
    return `<table class="tour-table"><thead><tr><th>Opponent</th><th>Result</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Points</td><td>${s2.points}/${s2.maxPoints}</td></tr></tfoot></table>`;
  }

  $('tour-new').addEventListener('click', newTour);

  // =======================================================================
  // TWO-PLAYER: sub-tabs
  // =======================================================================
  document.querySelector('#mode-twoplayer .subtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sub]');
    if (!btn) return;
    for (const b of document.querySelectorAll('#mode-twoplayer .subtabs button')) b.classList.toggle('active', b === btn);
    $('sub-hotseat').classList.toggle('hidden', btn.dataset.sub !== 'hotseat');
    $('sub-code').classList.toggle('hidden', btn.dataset.sub !== 'code');
  });

  // ----- hot-seat -----
  let hsGame = null; // { board, status }

  function newHotseat() {
    hsGame = { board: board.emptyBoard(), status: 'in_progress' };
    renderHotseat();
  }
  function hsPlay(i) {
    if (!hsGame || hsGame.status !== 'in_progress') return;
    const mark = matchcode.turnMark(hsGame.board);
    hsGame.board[i] = mark;
    hsGame.status = board.status(hsGame.board);
    renderHotseat();
  }
  function renderHotseat() {
    if (!hsGame) { $('hs-board').classList.add('empty'); $('hs-status').textContent = ''; return; }
    const live = hsGame.status === 'in_progress';
    renderBoard($('hs-board'), hsGame.board, { interactive: true, onCell: live ? hsPlay : null });
    if (hsGame.status === 'x_win') $('hs-status').innerHTML = '<span class="win">X wins! 🎉</span>';
    else if (hsGame.status === 'o_win') $('hs-status').innerHTML = '<span class="win">O wins! 🎉</span>';
    else if (hsGame.status === 'draw') $('hs-status').textContent = 'Draw.';
    else {
      const t = matchcode.turnMark(hsGame.board);
      $('hs-status').innerHTML = `Turn: <span class="turn-${t.toLowerCase()}">${t}</span>`;
    }
  }
  $('hs-new').addEventListener('click', newHotseat);

  // ----- match code (async) -----
  let mc = null; // { board, myMark }

  function mcRender(shareCode, note) {
    if (!mc) { $('mc-board').classList.add('empty'); $('mc-status').textContent = ''; $('mc-share').classList.add('hidden'); return; }
    const st = board.status(mc.board);
    const yourTurn = st === 'in_progress' && matchcode.turnMark(mc.board) === mc.myMark;
    renderBoard($('mc-board'), mc.board, { interactive: true, onCell: yourTurn ? mcPlay : null });
    $('mc-status').innerHTML = mcStatusText(st, yourTurn, note);
    if (shareCode) {
      $('mc-output').value = shareCode;
      $('mc-share').classList.remove('hidden');
    } else {
      $('mc-share').classList.add('hidden');
    }
  }

  function mcStatusText(st, yourTurn, note) {
    const you = mc.myMark;
    let base;
    if (st === 'x_win') base = you === 'X' ? '<span class="win">You (X) win! 🎉</span>' : '<span class="lose">You (O) lost — X wins.</span>';
    else if (st === 'o_win') base = you === 'O' ? '<span class="win">You (O) win! 🎉</span>' : '<span class="lose">You (X) lost — O wins.</span>';
    else if (st === 'draw') base = 'Draw.';
    else if (yourTurn) base = `You are <span class="turn-${you.toLowerCase()}">${you}</span> — your move.`;
    else base = `Waiting for your opponent. Send them the code below.`;
    return note ? `${base} <span class="muted">${escapeHtml(note)}</span>` : base;
  }

  function mcStartNew() {
    mc = { board: board.emptyBoard(), myMark: 'X' };
    mcRender(null, 'You are X. Make your move, then send the code.');
  }

  function mcLoad() {
    const raw = $('mc-input').value;
    if (!raw.trim()) return;
    let decoded;
    try {
      decoded = matchcode.decode(raw);
    } catch (err) {
      $('mc-status').innerHTML = `<span class="lose">${escapeHtml(err.message)}</span>`;
      return;
    }
    // You received this code, so it's your turn: you play the side to move.
    mc = { board: decoded.board, myMark: decoded.turn };
    $('mc-input').value = '';
    const st = board.status(mc.board);
    if (st !== 'in_progress') {
      // A finished game was sent to you — the side to move (you) is the loser/drawer.
      recordMatchIfFinished(st);
      mcRender(null);
    } else {
      mcRender(null);
    }
  }

  function mcPlay(i) {
    if (!mc) return;
    const st0 = board.status(mc.board);
    if (st0 !== 'in_progress' || matchcode.turnMark(mc.board) !== mc.myMark) return;
    mc.board[i] = mc.myMark;
    const st = board.status(mc.board);
    if (st !== 'in_progress') {
      recordMatchIfFinished(st);
      mcRender(matchcode.encode(mc.board), 'Game over — you can send this final code so they see the result.');
    } else {
      mcRender(matchcode.encode(mc.board), 'Copy this and send it to your opponent.');
    }
  }

  function recordMatchIfFinished(st) {
    if (!currentUser) return; // match-code play works without a saved user; only record if one is set
    reload();
    // Key on the final board so replaying/reloading the same finished code doesn't
    // double-record for this user (idempotent per match, per user).
    store.recordMatchResult(s, currentUser, mc.myMark, st, matchcode.encode(mc.board));
    persist();
  }

  $('mc-new').addEventListener('click', mcStartNew);
  $('mc-load').addEventListener('click', mcLoad);
  $('mc-copy').addEventListener('click', () => {
    const out = $('mc-output');
    out.select();
    try { navigator.clipboard.writeText(out.value); } catch (e) { document.execCommand('copy'); }
    $('mc-copy').textContent = 'Copied!';
    setTimeout(() => { $('mc-copy').textContent = 'Copy code'; }, 1200);
  });

  // =======================================================================
  // PUZZLES
  // =======================================================================
  let puzzleCat = null; // null = all
  let selectedPuzzle = null;

  // Distinct-solved count for a category (null = All). "Solved" = a puzzle id with any correct
  // attempt for the current user (same semantics as priorSolved / the gym). TT-11 (#11).
  function puzzleProgress(catKey) {
    const attempts = (s && s.puzzleAttempts && s.puzzleAttempts[currentUser]) || [];
    const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.id));
    const items = catKey ? puzzlesMod.byCategory(catKey) : puzzlesMod.PUZZLES;
    return { done: items.filter((p) => solved.has(p.id)).length, total: items.length };
  }

  function renderPuzzleCats() {
    const cats = [{ k: null, label: 'All' }].concat(
      Object.keys(puzzlesMod.CATEGORIES).map((k) => ({ k, label: puzzlesMod.CATEGORIES[k] }))
    );
    $('puzzle-cats').innerHTML = cats.map((c) => {
      const { done, total } = puzzleProgress(c.k);
      const active = c.k === puzzleCat ? ' active' : '';
      const complete = total > 0 && done === total ? ' complete' : '';
      // Count is in an aria-hidden span (decorative); the button's aria-label carries it in words.
      return `<button type="button" data-cat="${c.k === null ? '' : c.k}" class="cat-chip${active}${complete}" aria-label="${escapeHtml(c.label)}, ${done} of ${total} solved">${escapeHtml(c.label)} <span class="cat-count" aria-hidden="true">${done}/${total}</span></button>`;
    }).join('');
  }

  function renderPuzzleList() {
    renderPuzzleCats();
    const items = puzzleCat ? puzzlesMod.byCategory(puzzleCat) : puzzlesMod.PUZZLES;
    $('puzzle-list').innerHTML = items.map((p) =>
      `<li data-id="${p.id}"${p.id === selectedPuzzle ? ' class="selected"' : ''}>
         <div>${escapeHtml(p.label)}</div>
         <div class="sub">${escapeHtml(p.id)} · ${escapeHtml(puzzlesMod.CATEGORIES[p.category])}</div>
       </li>`
    ).join('');
    if (selectedPuzzle && !items.find((p) => p.id === selectedPuzzle)) {
      selectedPuzzle = null;
      $('puzzle-detail').innerHTML = '<p class="muted">Pick a puzzle from the list.</p>';
    }
  }

  $('puzzle-cats').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]');
    if (!btn) return;
    puzzleCat = btn.dataset.cat || null;
    renderPuzzleList();
  });

  $('puzzle-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    selectedPuzzle = li.dataset.id;
    renderPuzzleList();
    renderPuzzleDetail();
  });

  const GOAL = {
    win1: 'find the winning move',
    win2: 'find the move that forces a win in two',
    block: "block O's threat",
    fork: 'find the move that makes two threats at once',
  };

  function renderPuzzleDetail(feedback, displayBoard) {
    const p = puzzlesMod.byId(selectedPuzzle);
    if (!p) return;
    const detail = $('puzzle-detail');
    detail.innerHTML = `
      <h3>${escapeHtml(p.label)}</h3>
      <p class="muted">${escapeHtml(p.toMove)} to move — ${escapeHtml(GOAL[p.category])}.</p>
      <div class="board" id="puzzle-board"></div>
      <div id="puzzle-feedback"></div>`;
    renderBoard($('puzzle-board'), displayBoard || p.board, {
      interactive: true,
      onCell: (i) => solvePuzzle(p, i + 1),
    });
    if (feedback) $('puzzle-feedback').innerHTML = feedback;
  }

  function solvePuzzle(p, pos) {
    if (!requireUser($('puzzle-feedback'))) return;
    const correct = p.correct.includes(pos);
    reload();
    // Gamification counts DISTINCT solved puzzles: only fire the event on the FIRST
    // correct solve of this puzzle id (repeated practice solves still get recorded for
    // the gym's solve-rate, but must not farm XP/achievements/stars). rex #56.
    const priorSolved = ((s.puzzleAttempts[currentUser]) || []).some((a) => a.id === p.id && a.correct);
    store.recordPuzzleAttempt(s, currentUser, p, pos, correct);
    persist();
    if (correct && !priorSolved) renderPuzzleCats(); // refresh the category (n/total) counts live (TT-11)
    if (correct && !priorSolved) gamiEmit('puzzle_solved', { correct: true, category: p.category, id: p.id });
    let html;
    let displayBoard;
    if (correct) {
      html = `<div class="feedback correct"><span class="tag">Correct.</span> ${escapeHtml(p.explain)}</div>`;
      // Show the winning move played on the board so the user sees the position they found.
      displayBoard = p.board.slice();
      displayBoard[pos - 1] = p.toMove;
    } else {
      const acc = p.correct.length === 1
        ? `The correct move is ${p.correct[0]}.`
        : `Correct moves are ${p.correct.join(' or ')}.`;
      html = `<div class="feedback incorrect"><span class="tag">Not quite.</span> ${escapeHtml(acc)}<br>${escapeHtml(p.explain)}</div>`;
    }
    renderPuzzleDetail(html, displayBoard);
  }

  // =======================================================================
  // LESSONS
  // =======================================================================
  let selectedLesson = null;

  function renderLessonList() {
    reload();
    const prog = (currentUser && s.lessons && s.lessons[currentUser]) || {};
    $('lesson-list').innerHTML = lessonsMod.LESSONS.map((l) => {
      const p = prog[l.id];
      let badge = '';
      if (p && p.completed) badge = '<span class="badge mastered">mastered</span>';
      else if (p && p.step > 0) badge = `<span class="badge progress">step ${p.step + 1}/${l.steps.length}</span>`;
      return `<li data-id="${l.id}"${l.id === selectedLesson ? ' class="selected"' : ''}>
                <div>${escapeHtml(l.title)}${badge}</div>
                <div class="sub">${l.steps.length} steps</div>
              </li>`;
    }).join('');
  }

  $('lesson-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    selectedLesson = li.dataset.id;
    renderLessonList();
    renderLessonDetail();
  });

  function renderLessonDetail(feedback) {
    const l = lessonsMod.byId(selectedLesson);
    if (!l) return;
    const detail = $('lesson-detail');
    if (!requireUser(detail)) return;
    reload();
    const prog = store.getLessonProgress(s, currentUser, l.id);
    persist();

    if (prog.completed) {
      detail.innerHTML = `<h3>${escapeHtml(l.title)}</h3>
        <div class="feedback correct"><span class="tag">Lesson complete.</span> You’ve mastered this one. 🎓</div>`;
      renderLessonList();
      return;
    }
    const step = l.steps[prog.step];
    detail.innerHTML = `
      <h3>${escapeHtml(l.title)}</h3>
      <p class="muted">Step ${prog.step + 1} of ${l.steps.length}</p>
      <p>${escapeHtml(step.prompt)}</p>
      <div class="board" id="lesson-board"></div>
      <div id="lesson-feedback"></div>`;
    renderBoard($('lesson-board'), step.board, {
      interactive: true,
      onCell: (i) => answerLesson(l, i + 1),
    });
    if (feedback) $('lesson-feedback').innerHTML = feedback;
  }

  function answerLesson(l, pos) {
    reload();
    const prog = store.getLessonProgress(s, currentUser, l.id);
    if (prog.completed) { renderLessonDetail(); return; }
    const step = l.steps[prog.step];
    if (!step.correct.includes(pos)) {
      persist(); // keep the user record; no progress change
      renderLessonDetail(`<div class="feedback incorrect"><span class="tag">Not quite.</span> ${escapeHtml(step.hint)}</div>`);
      return;
    }
    // Correct → advance.
    const okMsg = `<div class="feedback correct"><span class="tag">Correct.</span> ${escapeHtml(step.explainOk)}</div>`;
    prog.step += 1;
    if (prog.step >= l.steps.length) {
      prog.completed = true;
      prog.step = l.steps.length;
      persist();
      gamiEmit('lesson_completed', { lessonId: l.id });
      $('lesson-detail').innerHTML = `<h3>${escapeHtml(l.title)}</h3>${okMsg}
        <div class="feedback correct"><span class="tag">Lesson complete!</span> You’ve mastered this one. 🎓</div>`;
      renderLessonList();
      return;
    }
    persist();
    renderLessonDetail(okMsg);
  }

  // =======================================================================
  // GYM
  // =======================================================================
  function renderGym() {
    const el = $('gym-report');
    if (!requireUser(el)) return;
    reload();
    const g = gymMod.computeGym(s, currentUser, puzzlesMod, lessonsMod);
    const wld = (r) => `${r.win}W / ${r.loss}L / ${r.draw}D`;
    const pct = g.totalAttempts ? Math.round(g.solveRate * 100) + '%' : 'n/a';

    el.innerHTML = `
      ${g.isNew ? '<p class="muted">(brand-new user — no history yet)</p>' : ''}
      <div class="card">
        <h3>Overall mastery</h3>
        <div class="level">${escapeHtml(g.level)} <span class="muted" style="font-size:1rem">(${g.points}/8 points)</span></div>
        <div class="meter"><span style="width:${(g.points / 8) * 100}%"></span></div>
        <p class="muted">${g.lessonsMastered}/4 lessons mastered · hard-AI ${g.hardNotLost ? 'survived' : 'not yet beaten/drawn'} · puzzle solve rate ${pct}</p>
      </div>
      <div class="card">
        <h3>AI games (by difficulty)</h3>
        <table>
          <tr><td class="k">easy</td><td>${wld(g.aiStats.easy)}</td></tr>
          <tr><td class="k">medium</td><td>${wld(g.aiStats.medium)}</td></tr>
          <tr><td class="k">hard</td><td>${wld(g.aiStats.hard)}</td></tr>
        </table>
      </div>
      <div class="card">
        <h3>Online matches (match code)</h3>
        <p>${wld(g.matchStats)}</p>
      </div>
      <div class="card">
        <h3>Characters (all games)</h3>
        <table>
          ${characters.CHARACTERS.map((c) => { const cs = g.characterStats[c.id] || { win: 0, loss: 0, draw: 0 }; return `<tr><td class="k">${escapeHtml(c.name)}</td><td>${wld(cs)}</td></tr>`; }).join('')}
        </table>
      </div>
      <div class="card">
        <h3>Tournaments</h3>
        <p>${g.tournamentStats.completed} completed · ${g.tournamentStats.win}W / ${g.tournamentStats.loss}L / ${g.tournamentStats.draw}D across ${g.tournamentStats.played} games</p>
      </div>
      <div class="card">
        <h3>Puzzles</h3>
        <table>
          ${g.puzzleCats.map((c) => `<tr><td class="k">${escapeHtml(c.label)}</td><td>${c.solved}/${c.attempts} solved</td></tr>`).join('')}
        </table>
        <p class="muted">Overall solve rate: ${pct} (${g.totalSolved}/${g.totalAttempts}) · current correct streak: ${g.streak}</p>
      </div>
      <div class="card">
        <h3>Lessons</h3>
        <table>
          ${g.lessons.map((l) => `<tr><td class="k">${escapeHtml(l.title)}</td><td>${escapeHtml(l.status)}</td></tr>`).join('')}
        </table>
      </div>`;
  }
  $('gym-refresh').addEventListener('click', renderGym);

  // =======================================================================
  // GAMIFICATION (Phase 5) — registry-driven Settings + reward renders
  // =======================================================================
  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Fire a game event through the registry for the current user, persist, and
  // surface any notifications (toasts + celebration). No-op with no user set.
  function gamiEmit(type, ctx) {
    if (!currentUser) return;
    reload();
    const gami = store.getGami(s, currentUser);
    const notes = gamiMod.emit(gami, type, Object.assign({ day: today() }, ctx || {}));
    persist();
    handleGamiNotes(notes, gami);
    // A settings/gym view open in the background should reflect new progress.
    if (activeMode === 'settings') renderSettings();
  }

  function handleGamiNotes(notes, gami) {
    if (!notes || !notes.length) return;
    const celebrateOn = gamiMod.isEnabled(gami.settings, 'celebration');
    const worthCelebrating = notes.some((n) => ['celebrate', 'levelup', 'achievement', 'unlock'].includes(n.kind));
    if (celebrateOn && worthCelebrating) burstConfetti();
    const toasts = notes.filter((n) => n.kind !== 'celebrate'); // raw celebrate cues aren't text
    if (toasts.length) showToasts(toasts);
    applyTheme();
  }

  // Apply the current user's selected board theme to the page (ink if no user or
  // the themes module is off — so a disabled module leaves no lingering theme).
  function applyTheme() {
    let theme = 'ink';
    if (currentUser) { reload(); theme = gamiMod.activeTheme(store.getGami(s, currentUser)); }
    document.body.setAttribute('data-board-theme', theme);
  }

  function burstConfetti() {
    const layer = $('celebration-layer');
    if (!layer) return;
    const marks = ['X', 'O', '#', '★'];
    for (let i = 0; i < 14; i++) {
      const m = document.createElement('span');
      m.className = 'confetti-mark';
      m.textContent = marks[i % marks.length];
      m.style.left = (8 + Math.floor((i / 14) * 84)) + '%';
      m.style.animationDelay = (i * 40) + 'ms';
      layer.appendChild(m);
      setTimeout(() => m.remove(), 1700);
    }
  }

  function showToasts(toasts) {
    let host = document.getElementById('toast-host');
    if (!host) { host = document.createElement('div'); host.id = 'toast-host'; document.body.appendChild(host); }
    toasts.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('data-kind', t.kind);
      el.textContent = t.text;
      host.appendChild(el);
      setTimeout(() => el.remove(), 3200 + i * 250);
    });
  }

  // ---- Settings page (generated from the registry) ----
  function renderSettings() {
    // App-level settings (Show support button + Report a problem) are app-WIDE, not
    // per-profile — render them FIRST, before the per-user gate, so they show even with
    // no username selected (support #4: the toggle was missing entirely for users who
    // hadn't picked a name, because this function returned early below).
    renderAppSettings();
    if (!requireUser($('gamification-modules'))) { $('gami-themes').innerHTML = ''; $('gami-rewards').innerHTML = ''; return; }
    reload();
    const gami = store.getGami(s, currentUser);
    $('gamification-modules').innerHTML = gamiMod.MODULES.map((m) => {
      const on = gamiMod.isEnabled(gami.settings, m.id);
      return `<div class="gami-module" data-module-id="${m.id}">
        <div class="gami-module-text">
          <div class="gami-module-name">${escapeHtml(m.name)}</div>
          <div class="gami-module-desc">${escapeHtml(m.description)}</div>
        </div>
        <label class="gami-toggle">
          <input type="checkbox" data-module-toggle="${m.id}" ${on ? 'checked' : ''} aria-label="Toggle ${escapeHtml(m.name)}">
          <span class="gami-pill" aria-hidden="true"></span>
        </label>
      </div>`;
    }).join('');
    renderThemes(gami);
    renderRewards(gami);
  }

  // App-level (not per-profile) toggles, persisted in the appSettings namespace.
  // "Show support button" now shows/hides the real support FAB (S1, #78) via
  // TTSupportWidget.applyVisibility() in the change handler below.
  function renderAppSettings() {
    reload();
    const on = store.getAppSetting(s, 'showSupportButton', false);
    $('app-settings').innerHTML = `<div class="gami-module" data-app-setting="showSupportButton">
      <div class="gami-module-text">
        <div class="gami-module-name">Show support button</div>
        <div class="gami-module-desc">Show a “Report a problem” button in the corner of the app.</div>
      </div>
      <label class="gami-toggle">
        <input type="checkbox" data-app-toggle="showSupportButton" ${on ? 'checked' : ''} aria-label="Toggle Show support button">
        <span class="gami-pill" aria-hidden="true"></span>
      </label>
    </div>
    <button id="app-report-problem" type="button" class="support-btn">Report a problem</button>
    <p class="muted" style="font-size:.82rem">You can always report a problem here, even with the button above turned off.</p>`;
  }

  $('app-settings').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-app-toggle]');
    if (!cb) return;
    reload();
    store.setAppSetting(s, cb.dataset.appToggle, cb.checked);
    persist();
    renderAppSettings();
    // Show/hide the support FAB to match the toggle.
    if (cb.dataset.appToggle === 'showSupportButton' && window.TTSupportWidget) window.TTSupportWidget.applyVisibility();
  });
  // "Report a problem" opens the support panel directly — always available even when
  // the FAB is hidden (§10 / support #4 discoverability).
  $('app-settings').addEventListener('click', (e) => {
    if (e.target.closest('#app-report-problem') && window.TTSupportWidget) window.TTSupportWidget.open();
  });

  function renderThemes(gami) {
    if (!gamiMod.isEnabled(gami.settings, 'themes')) {
      $('gami-themes').innerHTML = '<p class="muted">Enable “Unlockable Board Themes” above to switch board looks.</p>';
      return;
    }
    const st = gami.state.themes || { unlocked: ['ink'], selected: 'ink' };
    const unlocked = st.unlocked || ['ink'];
    const selected = st.selected || 'ink';
    $('gami-themes').innerHTML = gamiMod.THEMES.map((t) => {
      const isUnlocked = unlocked.includes(t.id);
      const sel = t.id === selected;
      return `<button type="button" class="gami-theme" data-board-theme="${t.id}" data-locked="${!isUnlocked}" data-selected="${sel}"
        ${isUnlocked ? `data-select-theme="${t.id}"` : 'disabled'}>
        <span class="gami-theme-name">${escapeHtml(t.name)}</span>
        <span class="gami-theme-unlock">${isUnlocked ? (sel ? 'Selected' : 'Select') : escapeHtml(t.unlock)}</span>
      </button>`;
    }).join('');
  }

  function renderRewards(gami) {
    const en = (id) => gamiMod.isEnabled(gami.settings, id);
    const parts = [];
    if (en('xp')) {
      const xp = (gami.state.xp && gami.state.xp.xp) || 0;
      const lvl = gamiMod.levelForXp(xp);
      const next = gamiMod.xpForNextLevel(xp);
      parts.push(`<div class="reward-block" data-reward="level"><h4>Level</h4>
        <div class="level-badge" data-level="${lvl}">Level ${lvl}</div>
        <div class="muted">${xp} XP${next != null ? ` · ${next - xp} to next level` : ' · max level'}</div></div>`);
    }
    if (en('achievements')) {
      const earned = (gami.state.achievements && gami.state.achievements.earned) || [];
      const badges = gamiMod.ACHIEVEMENTS.map((a) => {
        const got = earned.includes(a.id);
        return `<div class="badge" data-earned="${got}" data-badge-id="${a.id}" title="${escapeHtml(a.description)}">
          <span class="badge-name">${escapeHtml(a.name)}</span></div>`;
      }).join('');
      parts.push(`<div class="reward-block" data-reward="achievements"><h4>Achievements (${earned.length}/${gamiMod.ACHIEVEMENTS.length})</h4>
        <div id="badge-grid" class="badge-grid">${badges}</div></div>`);
    }
    if (en('mastery')) {
      const stars = (gami.state.mastery && gami.state.mastery.stars) || 0;
      parts.push(`<div class="reward-block" data-reward="mastery"><h4>Mastery stars</h4>
        <div id="mastery-stars" class="mastery-stars" data-stars="${stars}">${decorativeGlyph(stars ? '★'.repeat(stars) : '—', stars + ' mastery ' + (stars === 1 ? 'star' : 'stars'))}</div></div>`);
    }
    if (en('streaks')) {
      const stk = gami.state.streaks || {};
      parts.push(`<div class="reward-block" data-reward="streak"><h4>Daily streak</h4>
        <div id="streak-count" class="streak-count" data-streak="${stk.current || 0}">${stk.current || 0} day(s)</div>
        <div class="muted">Best: ${stk.longest || 0}</div></div>`);
    }
    if (en('leaderboard')) {
      parts.push(`<div class="reward-block" data-reward="leaderboard"><h4>Local leaderboard</h4>
        <ol id="leaderboard-list" class="leaderboard">${leaderboardRows()}</ol></div>`);
    }
    if (en('contributor')) {
      const earned = (gami.state.contributor && gami.state.contributor.earned) || [];
      const badges = gamiMod.CONTRIB_BADGES.map((b) => {
        const got = earned.includes(b.id);
        return `<div class="badge" data-earned="${got}" data-badge-id="${b.id}" title="${escapeHtml(b.description)}">
          <span class="badge-name">${escapeHtml(b.name)}</span></div>`;
      }).join('');
      parts.push(`<div class="reward-block" data-reward="contributor"><h4>Contributor badges (${earned.length}/${gamiMod.CONTRIB_BADGES.length})</h4>
        <div id="contributor-grid" class="badge-grid">${badges}</div></div>`);
    }
    $('gami-rewards').innerHTML = parts.join('') || '<p class="muted">All reward modules are off.</p>';
  }

  function leaderboardRows() {
    const ranked = store.listUsers(s).map((n) => {
      const g = (s.users[n] && s.users[n].gami) || { state: {} };
      const xp = (g.state && g.state.xp && g.state.xp.xp) || 0;
      return { n, xp, lvl: gamiMod.levelForXp(xp) };
    }).sort((a, b) => b.xp - a.xp).slice(0, 10);
    return ranked.map((r) => `<li data-user="${escapeHtml(r.n)}"${r.n === currentUser ? ' data-me="true"' : ''}>
      <span class="lb-name">${escapeHtml(r.n)}</span> <span class="lb-lvl">L${r.lvl}</span> <span class="lb-xp">${r.xp} XP</span></li>`).join('');
  }

  // Toggle a module (delegated — works for any registry-generated row).
  $('gamification-modules').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-module-toggle]');
    if (!cb) return;
    reload();
    store.setGamiSetting(s, currentUser, cb.dataset.moduleToggle, cb.checked);
    persist();
    renderSettings();
    applyTheme();
  });
  // Select an unlocked board theme.
  $('gami-themes').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-select-theme]');
    if (!btn) return;
    reload();
    const gami = store.getGami(s, currentUser);
    gami.state.themes = gami.state.themes || { unlocked: ['ink'], selected: 'ink' };
    gami.state.themes.selected = btn.dataset.selectTheme;
    persist();
    renderSettings();
    applyTheme();
  });

  // =======================================================================
  // HELP ▸ WHAT'S NEW (in-app-support S1 pre-work #75) — renders fixes.json.
  // The ONLY network I/O here is fetching the same-origin static fixes.json (not
  // the relay, which doesn't exist yet). Fetched no-store + an hour-bucket query
  // param (bounded, CDN-proof — NOT the release cache-buster). Copy in the empty/
  // error states is placeholder text owned by walt (task #75).
  // =======================================================================
  function hourBucket() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
  }

  function renderWhatsNew() {
    const wrap = $('whatsnew');
    const empty = $('whatsnew-empty');
    const list = $('whatsnew-list');
    wrap.setAttribute('aria-busy', 'true');
    empty.textContent = 'Loading…';
    empty.classList.remove('hidden');
    list.innerHTML = '';
    fetch(`fixes.json?t=${hourBucket()}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then((fixes) => {
        wrap.setAttribute('aria-busy', 'false');
        if (!Array.isArray(fixes) || fixes.length === 0) {
          empty.textContent = 'Nothing new to report yet. Check back after the next update.';
          empty.classList.remove('hidden');
          return;
        }
        empty.classList.add('hidden');
        // Newest first (ISO date strings sort lexicographically).
        const items = fixes.slice().sort((a, b) => String(b.fixedAt || '').localeCompare(String(a.fixedAt || '')));
        list.innerHTML = items.map((f) => `<li class="whatsnew-entry">
          <div class="whatsnew-note">${escapeHtml(f.note || '')}</div>
          <div class="whatsnew-meta muted">${escapeHtml(f.fixedIn || '')}${f.fixedAt ? ' · ' + escapeHtml(f.fixedAt) : ''}</div>
        </li>`).join('');
      })
      .catch(() => {
        wrap.setAttribute('aria-busy', 'false');
        empty.textContent = "Couldn't load updates — try again later.";
        empty.classList.remove('hidden');
        list.innerHTML = '';
      });
  }

  // ---------- in-app support widget (S1) ----------
  // Host hooks: the widget owns its UI/transport; app.js supplies current user/view, the
  // context allowlist inputs, a persist bridge, and routes report events to the Contributor
  // module (the thanks moment). The profile name is passed ONLY to the widget's client-side
  // attribution — never into the context payload (context.js excludes it).
  if (window.TTSupportWidget) {
    window.TTSupportWidget.init({
      currentUser: () => currentUser,
      currentView: () => activeMode,
      settingsSnapshot: () => {
        reload();
        const gami = store.getGami(s, currentUser || '');
        return {
          boardTheme: gamiMod.activeTheme(gami),
          showSupportButton: store.getAppSetting(s, 'showSupportButton', false),
          gami: gami.settings,
        };
      },
      onReportEvent: (type, ctx) => {
        if (!currentUser) return; // badge attribution needs a profile
        reload();
        gamiMod.emit(store.getGami(s, currentUser), type, ctx);
        persist();
      },
      persist: (fn) => { reload(); fn(s); persist(); },
    });
    window.TTSupportWidget.applyVisibility();
  }

  // ---------- init ----------
  // Footer version (#20): show the loaded APP_VERSION so a user can tell at a glance whether a
  // fresh fix is live or a hard-reload is needed (a stale cache shows the old number).
  const av = $('app-version');
  if (av) av.textContent = 'v' + (window.APP_VERSION || '?');
  refreshUserBar();
  fillCharacterSelect($('ai-character'));
  renderPuzzleCats();
  applyTheme();
  newAiGame(); // starts a game if a user is set, else shows the prompt-for-user message
})();
