// Lesson bank — ported verbatim from the CLI's lib/lessons.js, including the
// task #10 narrative fix (follow-up steps frame their board as an illustrative
// position and never assert a specific move the learner didn't make). Dual
// export (Node module + browser `window.TTLessons`).
// Step: { board, toMove, prompt, correct (positions 1-9), explainOk, hint }
(function (root, factory) {
  'use strict';
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.TTLessons = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function b(xs, os) {
    const board = [null, null, null, null, null, null, null, null, null];
    for (const i of xs) board[i] = 'X';
    for (const i of os) board[i] = 'O';
    return board;
  }

  const LESSONS = [
    {
      id: 'center', title: 'Opening: take the center',
      steps: [
        {
          board: b([], []), toMove: 'X',
          prompt: 'You move first as X on an empty board. Play the strongest opening square.',
          correct: [5],
          explainOk: 'The center (5) sits on 4 lines — both diagonals, the middle row and the middle column — more than any other square. It is the strongest first move.',
          hint: 'Which single square is part of the most winning lines?',
        },
        {
          board: b([4], [2]), toMove: 'X',
          prompt: 'You own the center (5) and O grabbed corner 3. Take a corner to start building a line through your center.',
          correct: [1, 7, 9],
          explainOk: 'A corner combined with your center gives you a diagonal or side to threaten next. Corners are where attacks come from.',
          hint: 'Corners are 1, 3, 7, 9 — pick an empty one.',
        },
        {
          board: b([0, 4], [1, 2]), toMove: 'X',
          prompt: 'Now a position to finish. In this one, X (you) holds the center (5) and the corner (1), which line up on a diagonal, and O has two top-row squares. Play the move that wins.',
          correct: [9],
          explainOk: '5 and 1 sit on the 1–5–9 diagonal, so playing 9 completes it and wins. A center-plus-corner pair often gives you a diagonal win like this.',
          hint: 'Look at the diagonal running through the center and the corner.',
        },
      ],
    },
    {
      id: 'corner', title: 'Opening: take a corner',
      steps: [
        {
          board: b([], []), toMove: 'X',
          prompt: 'A fresh board again. If not the center, the next-best opening is a corner. Play any corner.',
          correct: [1, 3, 7, 9],
          explainOk: 'Corners each sit on 3 lines and set up traps that beat weaker players. They are the second-strongest opening after the center.',
          hint: 'Corners are the four squares 1, 3, 7, 9.',
        },
        {
          board: b([0], [8]), toMove: 'X',
          prompt: 'Here is a common follow-up position: X (you) opened in a corner — shown here at 1 — and O replied in the opposite corner (9). As X, take the center to stay safe.',
          correct: [5],
          explainOk: 'Taking the center 5 blocks O from using it and keeps your options open. Against the opposite-corner reply, the center is the safe, flexible move.',
          hint: 'The center square keeps you flexible.',
        },
        {
          board: b([0, 2], [4, 5]), toMove: 'X',
          prompt: 'One more position: here X (you) has two corners on the top row (1 and 3) with a gap between them, and it is your move. Play the move that wins.',
          correct: [2],
          explainOk: 'Corners 1 and 3 share the top row, so playing 2 completes it for the win. Two corners on the same edge give you this finish.',
          hint: 'Which square sits between the two corners on the top row?',
        },
      ],
    },
    {
      id: 'forks', title: 'Making forks (two threats at once)',
      steps: [
        {
          board: b([0, 4], [3, 5]), toMove: 'X',
          prompt: 'A fork is one move that creates TWO winning threats, so your opponent cannot stop both. Find the fork.',
          correct: [3],
          explainOk: 'Playing 3 threatens the top row (win at 2) AND the 3–5–7 diagonal (win at 7). O blocks one, you win with the other.',
          hint: 'Look for a square that lines up with two of your pieces in two different directions.',
        },
        {
          board: b([2, 4], [3, 7]), toMove: 'X',
          prompt: 'Find the move that makes two threats at once.',
          correct: [1],
          explainOk: 'Playing 1 threatens the top row (win at 2) and the 1–5–9 diagonal (win at 9) — a fork O cannot fully block.',
          hint: 'A corner can join a row/column AND a diagonal at the same time.',
        },
        {
          board: b([0, 4], [1, 7]), toMove: 'X',
          prompt: 'One more fork to spot.',
          correct: [7],
          explainOk: 'Playing 7 threatens the left column (win at 4) and the 3–5–7 diagonal (win at 3). Two threats, one move — that is a fork.',
          hint: 'The bottom-left corner joins the left column and a diagonal.',
        },
      ],
    },
    {
      id: 'blocking', title: 'Blocking your opponent',
      steps: [
        {
          board: b([4, 8], [0, 1]), toMove: 'X',
          prompt: 'When O has two in a row with the third square open, they threaten to win. Block it.',
          correct: [3],
          explainOk: 'O has 1 and 2 and would win at 3 — so you take 3 first. Always check for the opponent’s two-in-a-row before doing anything else.',
          hint: 'Find O’s two-in-a-line and take the empty third square.',
        },
        {
          board: b([1, 2], [0, 8]), toMove: 'X',
          prompt: 'O is threatening again — on a diagonal this time. Stop it.',
          correct: [5],
          explainOk: 'O has corners 1 and 9 on the diagonal and would win at 5. Taking the center 5 blocks the diagonal.',
          hint: 'Look at the long diagonal through the corners.',
        },
        {
          board: b([0, 8], [3, 5]), toMove: 'X',
          prompt: 'Last one: spot O’s threat and block it.',
          correct: [5],
          explainOk: 'O has 4 and 6 in the middle row and would win at 5 — take 5 to block. Blocking is always about the opponent’s open third square.',
          hint: 'Which row does O nearly have complete?',
        },
      ],
    },
  ];

  function byId(id) { return LESSONS.find((l) => l.id === id); }

  return { LESSONS, byId };
});
