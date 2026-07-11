'use strict';
// Validates every lesson step against the WEBAPP's ported lesson bank
// (../js/lessons.js). Mirrors the CLI's scripts/verify-lessons.js.
// Run: node scripts/verify-lessons.js
//
// Two kinds of step:
//   - Tactical (a win/block/fork exists in the position): the declared correct
//     move(s) must actually achieve that tactic — proven here.
//   - Opening (early position, no opponent threat): the answer is a best-practice
//     choice (e.g. "take the center"); we only check it is a legal empty square.
const board = require('../js/board');
const lessons = require('../js/lessons');

function other(mark) { return mark === 'X' ? 'O' : 'X'; }

// Returns { ok, reason, kind } for one declared-correct move of a step.
function checkMove(step, pos) {
  const me = step.toMove;
  const them = other(me);
  const idx = pos - 1;
  if (idx < 0 || idx > 8) return { ok: false, reason: `pos ${pos} out of range` };
  if (step.board[idx] !== null) return { ok: false, reason: `pos ${pos} is occupied` };

  const test = step.board.slice();
  test[idx] = me;
  const threats = board.winningCells(step.board, them); // opponent's immediate threats

  if (board.winner(test) === me) return { ok: true, kind: 'win' };
  if (threats.includes(idx)) return { ok: true, kind: 'block' };
  if (board.winningCells(test, me).length >= 2) return { ok: true, kind: 'fork' };

  // Not a tactic. Acceptable as a strategic/opening teaching move only if it
  // isn't ignoring a live opponent threat.
  if (threats.length > 0) return { ok: false, reason: `pos ${pos} ignores O's threat` };
  return { ok: true, kind: 'strategic' };
}

// Validate every step; returns { problems: [...], report: [lines] }.
function validateAll() {
  const problems = [];
  const report = [];
  for (const l of lessons.LESSONS) {
    for (let i = 0; i < l.steps.length; i++) {
      const step = l.steps[i];
      const where = `${l.id} step ${i + 1}`;
      if (!step.correct.length) {
        problems.push(`${where}: no correct move declared`);
        report.push(`${where}: FAIL: no correct move declared`);
        continue;
      }
      const kinds = new Set();
      let stepOk = true;
      for (const pos of step.correct) {
        const r = checkMove(step, pos);
        if (!r.ok) { problems.push(`${where}: ${r.reason}`); report.push(`${where}: FAIL: ${r.reason}`); stepOk = false; }
        else kinds.add(r.kind);
      }
      // Completeness: for a step teaching a tactic (win/block/fork), the declared
      // set must accept EVERY empty square that achieves that same tactic — not one
      // hardcoded answer (TT-32: a fork lesson rejected a second, equally-valid fork).
      // Strategic/opening steps are exempt (many squares are "fine", no unique tactic).
      for (const kind of ['win', 'block', 'fork']) {
        if (!kinds.has(kind)) continue;
        const all = [];
        for (let idx = 0; idx < 9; idx++) {
          if (step.board[idx] !== null) continue;
          const r = checkMove(step, idx + 1);
          if (r.ok && r.kind === kind) all.push(idx + 1);
        }
        const missing = all.filter((p) => !step.correct.includes(p));
        if (missing.length) {
          problems.push(`${where}: incomplete ${kind} set — also accepts ${missing.join(',')}`);
          report.push(`${where}: FAIL: incomplete ${kind} set — also accepts ${missing.join(',')}`);
          stepOk = false;
        }
      }
      if (stepOk) report.push(`${where}: OK (${[...kinds].join('/')})`);
    }
  }
  return { problems, report };
}

module.exports = { checkMove, validateAll };

if (require.main === module) {
  const { problems, report } = validateAll();
  for (const line of report) console.log(line);
  console.log(`\n${problems.length} problem(s).`);
  process.exit(problems.length ? 1 : 0);
}
