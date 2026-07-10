'use strict';
// setup-hooks.js — point git at the committed hooks dir (.githooks) via core.hooksPath, so the
// pre-push publish-gate check is active in this clone. Wired to run automatically by npm's
// "prepare" lifecycle (on `npm install`), and available manually as `npm run setup-hooks`.
//
// Cross-platform and non-fatal: a checkout that isn't a git repo (e.g. an unpacked tarball, or a
// CI shallow export) must NOT fail `npm install` — we just skip silently.
const { execSync } = require('child_process');
try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
} catch (e) {
  process.exit(0); // not a git working tree — nothing to wire, and that's fine
}
try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('setup-hooks: git core.hooksPath -> .githooks (pre-push publish gate active)');
} catch (e) {
  console.log('setup-hooks: could not set core.hooksPath (skipping): ' + (e && e.message));
}
