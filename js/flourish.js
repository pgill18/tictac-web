'use strict';
// flourish.js — PRESENTATION ONLY. Additive finishing layer for the redesign.
// It does two visual things and nothing else:
//   1. Strikes a hand-inked line through any board showing three-in-a-row,
//      in the same "ink draws itself on" motion language as the marks.
//   2. Keeps the status copy dry by removing bolt-on congratulatory emoji.
//
// It NEVER touches game state, storage, or any existing hook: it only READS the
// already-rendered DOM (+ TTBoard.LINES, a public read-only constant) and paints
// a pointer-events:none overlay / trims text. No existing JS module is modified.
(function () {
  const board = window.TTBoard;
  if (!board || !board.LINES) return;
  const LINES = board.LINES;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const INK = { X: '#7a33bd', O: '#cf7d18' }; // warm grape / brass — matches styles.css (fallback only; strike reads computed color)

  function markOf(cell) {
    if (cell.classList.contains('mark-X')) return 'X';
    if (cell.classList.contains('mark-O')) return 'O';
    return null;
  }

  function findWin(cells) {
    for (const [a, b, c] of LINES) {
      const m = markOf(cells[a]);
      if (m && m === markOf(cells[b]) && m === markOf(cells[c])) return { mark: m, line: [a, b, c] };
    }
    return null;
  }

  // Draw (or clear) the winning strike on one board element.
  function strike(boardEl) {
    const existing = boardEl.querySelector(':scope > svg.winline');
    if (existing) existing.remove();
    const cells = boardEl.querySelectorAll(':scope > .cell');
    if (cells.length !== 9) return;
    const win = findWin(cells);
    if (!win) return;

    const first = cells[win.line[0]];
    const last = cells[win.line[2]];
    const bw = boardEl.clientWidth;
    const bh = boardEl.clientHeight;
    if (!bw || !bh) return;

    const cx = (el) => el.offsetLeft + el.offsetWidth / 2;
    const cy = (el) => el.offsetTop + el.offsetHeight / 2;
    let x1 = cx(first), y1 = cy(first), x2 = cx(last), y2 = cy(last);
    // run the strike a little past the outer marks, like a real pencil stroke
    const dx = x2 - x1, dy = y2 - y1, ext = 0.16;
    x1 -= dx * ext; y1 -= dy * ext; x2 += dx * ext; y2 += dy * ext;

    const svgns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgns, 'svg');
    svg.setAttribute('class', 'winline');
    svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
    svg.setAttribute('width', bw);
    svg.setAttribute('height', bh);
    const line = document.createElementNS(svgns, 'line');
    // faint wobble so it reads hand-drawn, not CAD-straight
    line.setAttribute('x1', x1); line.setAttribute('y1', y1 + 1.5);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2 - 1.5);
    // Match the strike to the winning marks' actual rendered color, so it stays
    // correct under any board theme (grape/marigold default; themed otherwise).
    let stroke = INK[win.mark];
    try { const c = getComputedStyle(first).color; if (c) stroke = c; } catch (e) {}
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', '9');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
    boardEl.appendChild(svg);

    if (!reduce) {
      const len = Math.hypot(x2 - x1, y2 - y1) + 6;
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      line.getBoundingClientRect(); // commit the start state
      line.style.transition = 'stroke-dashoffset .4s cubic-bezier(.3,.7,.3,1)';
      line.style.transitionDelay = '.12s'; // lands just after the final mark pops
      line.style.strokeDashoffset = '0';
    }
  }

  // Remove bolt-on emoji from status/feedback copy so the dry voice holds.
  const EMOJI = /\s*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]+/gu;
  function deEmoji(root) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walk.nextNode()) {
      EMOJI.lastIndex = 0;
      if (EMOJI.test(walk.currentNode.nodeValue)) hits.push(walk.currentNode);
    }
    for (const n of hits) n.nodeValue = n.nodeValue.replace(EMOJI, '');
  }

  function pass() {
    document.querySelectorAll('.board:not(.empty)').forEach(strike);
    // Only the turn/result status lines carry the bolt-on win emoji. Leave
    // .feedback/.detail alone so the *earned* lesson-complete 🎓 milestone stays.
    document.querySelectorAll('.status').forEach(deEmoji);
  }

  let queued = false;
  const obs = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      obs.disconnect();          // our own writes must not re-trigger us
      try { pass(); } finally {
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }
    });
  });

  function start() {
    pass();
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
