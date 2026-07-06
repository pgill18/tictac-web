'use strict';
// Prints forced-winning moves for win2 puzzles and validates every puzzle,
// running against the WEBAPP's ported puzzle bank (../js/puzzles.js). Mirrors
// the CLI's scripts/verify-puzzles.js. Run: node scripts/verify-puzzles.js
const p = require('../js/puzzles');

console.log('--- win2 forced-winning moves (candidates for correct set) ---');
for (const puz of p.byCategory('win2')) {
  const wins = p.forcedWinningMoves(puz.board, puz.toMove);
  console.log(`${puz.id}: forced-win moves = [${wins.join(', ')}]`);
}

console.log('\n--- validation ---');
let bad = 0;
for (const puz of p.PUZZLES) {
  const r = p.validatePuzzle(puz);
  console.log(`${puz.id.padEnd(8)} ${r.ok ? 'OK' : 'FAIL: ' + r.reason}`);
  if (!r.ok) bad++;
}
console.log(`\n${p.PUZZLES.length} puzzles, ${bad} failing.`);
process.exit(bad ? 1 : 0);
