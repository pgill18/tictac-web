'use strict';
// Level-3 publish gate (patterned on chess-org/workspace/scripts/check-relative-paths.js).
// The published tree is SELF-CONTAINED: the tictac-web repo root IS this webapp/ folder, and
// GitHub Pages serves it under a /tictac-web/ subpath. So every asset/fetch reference must be
// (a) relative, not site-root-relative (a leading "/" means "from the site root" and 404s under
// a subpath), AND (b) must not escape the app's own tree with "../" (there is no parent dir
// above the site root in production). This script fails loudly on either pattern so a regression
// is caught before the publish, not by a confused 404 in the browser.
//
// Scans served page assets only (.html / .js under webapp/, excluding this scripts/ dir, which
// is dev/release tooling that the page never <script src>'s).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'); // webapp/
const SKIP_DIRS = new Set(['scripts', 'node_modules', '.git']);

// A leading single slash right after the opening quote = site-root-relative (breaks under a
// subpath). Protocol-relative "//host" and absolute "https://" URLs are external and fine.
const PATTERN_ROOT = /(src|href)\s*=\s*["']\/(?!\/)|fetch\(\s*["']\/(?!\/)/g;
// A leading "../" = escapes the app's own directory; the publish tree has no parent dir.
const PATTERN_ESCAPE = /(src|href)\s*=\s*["']\.\.\/|fetch\(\s*["']\.\.\//g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(html|js)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const files = [];
walk(ROOT, files);
const problems = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PATTERN_ROOT.test(line)) problems.push(`${path.relative(ROOT, f)}:${i + 1}  [site-root-relative]  ${line.trim()}`);
    PATTERN_ROOT.lastIndex = 0;
    if (PATTERN_ESCAPE.test(line)) problems.push(`${path.relative(ROOT, f)}:${i + 1}  [escapes app root]  ${line.trim()}`);
    PATTERN_ESCAPE.lastIndex = 0;
  });
}

if (problems.length) {
  console.log('FAIL — references found in webapp/ that break under the Level-3 publish tree:');
  problems.forEach((p) => console.log('  ' + p));
  console.log('\nThe published site is self-contained (repo root IS webapp/, served under a subpath).');
  console.log('Use paths relative to webapp/ that never leave it (./js/x, ./css/x); never a leading');
  console.log('slash or a "../" that reaches above the app root.');
  process.exit(1);
}
console.log(`OK — ${files.length} file(s) scanned under webapp/, no site-root-relative or app-root-escaping references.`);
process.exit(0);
