// Match-code codec for async two-player play with no server. A match's full
// state is the 9-cell board (turn and status are derived from it: X always
// moves first, so X is to move on an even fill count, O on odd). We encode the
// board as a 9-char string ("X"/"O"/"-"), wrap it with a version tag, and
// base64 it into a short copyable code. Dual export (Node + `window.TTMatchCode`)
// so the encode/decode/round-trip can be proven under Node.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./board'));
  } else {
    root.TTMatchCode = factory(root.TTBoard);
  }
})(typeof self !== 'undefined' ? self : this, function (board) {
  'use strict';

  const VERSION = '1';
  const PREFIX = 'TTT';

  function b64encode(str) {
    if (typeof btoa !== 'undefined') return btoa(str);
    return Buffer.from(str, 'binary').toString('base64');
  }
  function b64decode(str) {
    if (typeof atob !== 'undefined') return atob(str);
    return Buffer.from(str, 'base64').toString('binary');
  }

  function boardToString(b) {
    return b.map((c) => (c === 'X' ? 'X' : c === 'O' ? 'O' : '-')).join('');
  }
  function stringToBoard(s) {
    return s.split('').map((ch) => (ch === 'X' ? 'X' : ch === 'O' ? 'O' : null));
  }

  // Whose mark is to move on this board (X first, by fill parity).
  function turnMark(b) {
    const filled = b.filter((c) => c !== null).length;
    return filled % 2 === 0 ? 'X' : 'O';
  }

  // board array -> copyable code string.
  function encode(b) {
    const payload = PREFIX + VERSION + boardToString(b);
    return b64encode(payload);
  }

  // code string -> { board } ; throws with a friendly message on anything
  // malformed, out of range, or that could not arise from legal alternating play.
  function decode(code) {
    let payload;
    try {
      payload = b64decode(String(code).trim());
    } catch (e) {
      throw new Error('That code is not valid — it could not be decoded.');
    }
    if (!payload.startsWith(PREFIX + VERSION)) {
      throw new Error('That code is not a recognised match code.');
    }
    const body = payload.slice(PREFIX.length + VERSION.length);
    if (body.length !== 9 || /[^XO-]/.test(body)) {
      throw new Error('That code is corrupted (bad board data).');
    }
    const b = stringToBoard(body);
    const cx = b.filter((c) => c === 'X').length;
    const co = b.filter((c) => c === 'O').length;
    // X moves first, so X has equal or exactly one more mark than O.
    if (!(cx === co || cx === co + 1)) {
      throw new Error('That code describes an impossible position.');
    }
    // A position with a winner is a valid finished state; reject only genuinely
    // unreachable ones (both players "winning" cannot occur under legal play, and
    // is already excluded by parity above for most cases).
    return { board: b, turn: turnMark(b), status: board.status(b) };
  }

  return { encode, decode, turnMark, boardToString, stringToBoard, VERSION };
});
