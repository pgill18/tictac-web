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
    if (activeMode === 'ai') { if (!aiGame && currentUser) newAiGame(); else renderAi(); }
    else if (activeMode === 'puzzles') renderPuzzleList();
    else if (activeMode === 'lessons') renderLessonList();
    else if (activeMode === 'gym') renderGym();
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
        cell.textContent = String(i + 1);
      }
      const canPlay = opts.interactive && !mark && opts.onCell;
      if (canPlay) {
        cell.classList.add('playable');
        cell.addEventListener('click', () => opts.onCell(i));
      } else if (opts.interactive) {
        cell.classList.add('disabled');
      }
      container.appendChild(cell);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // =======================================================================
  // AI MODE
  // =======================================================================
  let aiGame = null; // { board, difficulty, status }

  function newAiGame() {
    if (!requireUser($('ai-status'))) return;
    aiGame = { board: board.emptyBoard(), difficulty: $('ai-difficulty').value, status: 'in_progress' };
    renderAi();
  }

  function aiPlay(i) {
    if (!aiGame || aiGame.status !== 'in_progress') return;
    aiGame.board[i] = 'X';
    aiGame.status = board.status(aiGame.board);
    if (aiGame.status === 'in_progress') {
      const aiIdx = ai.chooseMove(aiGame.board, 'O', aiGame.difficulty);
      aiGame.board[aiIdx] = 'O';
      aiGame.status = board.status(aiGame.board);
    }
    if (aiGame.status !== 'in_progress') {
      reload();
      store.recordAiResult(s, currentUser, aiGame.difficulty, aiGame.status);
      persist();
    }
    renderAi();
  }

  function renderAi() {
    if (!aiGame) { $('ai-board').classList.add('empty'); $('ai-status').textContent = ''; return; }
    const live = aiGame.status === 'in_progress';
    renderBoard($('ai-board'), aiGame.board, { interactive: true, onCell: live ? aiPlay : null });
    $('ai-status').innerHTML = aiStatusText(aiGame.status);
  }

  function aiStatusText(st) {
    if (st === 'x_win') return '<span class="win">You win! 🎉</span>';
    if (st === 'o_win') return `<span class="lose">The ${escapeHtml(aiGame.difficulty)} AI wins.</span>`;
    if (st === 'draw') return 'Draw.';
    return 'Your move (<span class="turn-x">X</span>).';
  }

  $('ai-new').addEventListener('click', newAiGame);

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

  function renderPuzzleCats() {
    const cats = [{ k: null, label: 'All' }].concat(
      Object.keys(puzzlesMod.CATEGORIES).map((k) => ({ k, label: puzzlesMod.CATEGORIES[k] }))
    );
    $('puzzle-cats').innerHTML = cats.map((c) =>
      `<button type="button" data-cat="${c.k === null ? '' : c.k}"${c.k === puzzleCat ? ' class="active"' : ''}>${escapeHtml(c.label)}</button>`
    ).join('');
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
    store.recordPuzzleAttempt(s, currentUser, p, pos, correct);
    persist();
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

  // ---------- init ----------
  refreshUserBar();
  renderPuzzleCats();
  newAiGame(); // starts a game if a user is set, else shows the prompt-for-user message
})();
