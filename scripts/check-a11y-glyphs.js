'use strict';
// A11y publish gate (task #66). Third recurrence of one bug class — decorative glyph
// text (Tournament pips ●○○○, mastery ★★★) rendered as bare text that a screen reader
// reads out ("black star black star…"). This scans the render code for a decorative
// glyph inside an HTML template that DOESN'T mark it up accessibly, and fails loudly.
//
// Rule: a line that (a) is inside markup (contains '<') and (b) contains a decorative
// glyph must ALSO carry one of the accepted a11y treatments on that line:
//   - `aria-hidden` (the glyph is decorative and hidden), OR
//   - `aria-label`  (a label describes it), OR
//   - `decorativeGlyph(` (the sanctioned helper in app.js, which does both).
// Bare JS glyphs NOT in markup (e.g. a confetti char array whose container is
// aria-hidden) and comment lines are ignored. Emoji are out of scope — flourish.js
// strips bolt-on status emoji and the earned 🎓 milestone is intentional.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'); // webapp/
const SKIP_DIRS = new Set(['scripts', 'node_modules', '.git']);

// Decorative glyphs we've seen (or are likely) to be used as badge/pip/star marks.
const GLYPHS = '★☆✦✧✩✪✫✬✭✮✯✰●○◉◌◍◎◆◇◈■□▢▣▲△▼▽►◄▶◀♦♠♥♣✓✔✗✕✖✘';
const GLYPH_RE = new RegExp('[' + GLYPHS + ']');
const OK_TOKENS = ['aria-hidden', 'aria-label', 'decorativeGlyph('];

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
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // comment line
    if (!GLYPH_RE.test(line)) return;
    if (line.indexOf('<') === -1) return; // not inside markup — bare JS glyph
    if (OK_TOKENS.some((t) => line.indexOf(t) !== -1)) return; // accessibly handled
    problems.push(`${path.relative(ROOT, f)}:${i + 1}  ${trimmed}`);
  });
}

if (problems.length) {
  console.log('FAIL — decorative glyph(s) rendered in markup without a11y treatment:');
  problems.forEach((p) => console.log('  ' + p));
  console.log('\nWrap decorative glyphs so a screen reader does not read them out:');
  console.log('  use decorativeGlyph(glyphs, label) (app.js), or put aria-hidden on the glyph');
  console.log('  and aria-label on its container. (See task #66.)');
  process.exit(1);
}
console.log(`OK — ${files.length} file(s) scanned, no bare decorative glyphs in markup.`);
process.exit(0);
