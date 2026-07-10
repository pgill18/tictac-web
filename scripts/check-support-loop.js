'use strict';
// check-support-loop.js — the support-loop publish gate (inapp-support-plan.md §8).
// Joins `npm run check-publish`. Checks, in order:
//   1. fixes.json schema — array; every entry has source/number/fixedIn/fixedAt/note, an
//      ISO fixedAt, and a note that CITES its own report id.
//   2. Append-only — no entry present in the git-base fixes.json may be removed.
//   3. localStorage house convention — versioned root key (tictac.web.vN) still present.
// RANGE-BASED bijection (fix-ready issue <-> fixes entry) needs GitHub creds/state and is an
// S2 concern; with no git base / no credentials this runs in SCHEMA-ONLY MODE (offline-safe).

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const WEBAPP = path.join(__dirname, '..');
const REPO = path.join(WEBAPP, '..'); // workspace root (git ops run from here)
const FIXES = path.join(WEBAPP, 'fixes.json');
const problems = [];

function fail() {
  console.log('FAIL — support loop:');
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}

// 1. schema -----------------------------------------------------------------
let fixes;
try {
  fixes = JSON.parse(fs.readFileSync(FIXES, 'utf8'));
} catch (e) {
  problems.push(`fixes.json missing or invalid JSON: ${e.message}`);
  fail();
}
if (!Array.isArray(fixes)) { problems.push('fixes.json must be a JSON array'); fail(); }

const REQUIRED = ['source', 'number', 'fixedIn', 'fixedAt', 'note'];
fixes.forEach((f, i) => {
  for (const k of REQUIRED) if (!(k in f)) problems.push(`fixes.json[${i}] missing "${k}"`);
  if (f.fixedAt && !/^\d{4}-\d{2}-\d{2}/.test(String(f.fixedAt))) {
    problems.push(`fixes.json[${i}] fixedAt "${f.fixedAt}" is not an ISO date`);
  }
  // the note must cite THIS entry's report id (source-qualified id, #n, or the bare number)
  if (f.note != null && f.number != null) {
    const n = String(f.number).replace(/[^\d]/g, '');
    const cites = new RegExp(`\\b[A-Z]{1,5}-${n}\\b|#${n}\\b|\\b${n}\\b`).test(String(f.note));
    if (!cites) problems.push(`fixes.json[${i}] note must cite report id ${n} (e.g. "TT-${n}")`);
  }
});

// 2. append-only vs git base ------------------------------------------------
let gitBase = null;
try {
  gitBase = cp.execSync('git show HEAD:fixes.json', { cwd: WEBAPP, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch (e) { gitBase = null; } // no git / file not in HEAD yet → schema-only
let appendOnlyChecked = false;
if (gitBase != null) {
  let base = null;
  try { base = JSON.parse(gitBase); } catch (e) { base = null; }
  if (Array.isArray(base)) {
    appendOnlyChecked = true;
    const key = (f) => `${f.source}#${f.number}`;
    const present = new Set(fixes.map(key));
    for (const b of base) {
      if (!present.has(key(b))) problems.push(`fixes.json is append-only — entry ${key(b)} was removed vs git base`);
    }
  }
}

// 3. localStorage house convention ------------------------------------------
try {
  const store = fs.readFileSync(path.join(WEBAPP, 'js', 'store.js'), 'utf8');
  if (!/const KEY = 'tictac\.web\.v\d+'/.test(store)) {
    problems.push('store.js: versioned localStorage root key (tictac.web.vN) not found — a destructive rename must be a deliberate, backfilled migration');
  }
} catch (e) {
  problems.push(`store.js unreadable: ${e.message}`);
}

if (problems.length) fail();
const mode = appendOnlyChecked ? 'schema + append-only' : 'schema-only (no git base — offline-safe)';
console.log(`OK — support loop: fixes.json ${fixes.length} entr${fixes.length === 1 ? 'y' : 'ies'} valid (${mode}).`);
process.exit(0);
