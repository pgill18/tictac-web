'use strict';
// Level-3 publish gate (fresh addition — no chess-org equivalent yet). Enforces the cache-buster
// convention that directly prevents #15A (the stale-cache false-failure incident): a browser or
// static host must never be able to serve a stale MIX of old+new assets. For every local asset
// referenced by a page (<script src> / <link href>), assert:
//   (a) it carries a `?v=N` query param, and
//   (b) every local asset in a given .html file shares the SAME N (uniform bump per release).
// If one asset is forgotten on a release bump, its N mismatches the rest and this fails loudly,
// instead of surfacing later as a confusing "the fix didn't work" bug report.
//
// External refs (https:, protocol-relative //, data:, mailto:, tel:, #anchors) are exempt.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'); // webapp/
const SKIP_DIRS = new Set(['scripts', 'node_modules', '.git']);

const SCRIPT_SRC = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const LINK_HREF = /<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi;

// True for references we don't cache-bust (external / inline / anchors).
function isExternal(url) {
  return /^(https?:|\/\/|data:|mailto:|tel:|#)/i.test(url) || url.trim() === '';
}

function versionOf(url) {
  const m = url.match(/[?&]v=([^"'&\s]+)/);
  return m ? m[1] : null;
}

function walkHtml(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkHtml(path.join(dir, entry.name), out);
    } else if (/\.html$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const htmlFiles = [];
walkHtml(ROOT, htmlFiles);
const problems = [];
let assetCount = 0;

for (const f of htmlFiles) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const versions = new Map(); // version string -> first "line: url" seen (for the mismatch report)

  lines.forEach((line, i) => {
    for (const re of [SCRIPT_SRC, LINK_HREF]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const url = m[1];
        if (isExternal(url)) continue;
        assetCount++;
        const v = versionOf(url);
        if (v === null) {
          problems.push(`${rel}:${i + 1}  [missing ?v=]  ${url}`);
        } else if (!versions.has(v)) {
          versions.set(v, `line ${i + 1} (${url})`);
        }
      }
    }
  });

  if (versions.size > 1) {
    const detail = [...versions.entries()].map(([v, where]) => `v=${v} @ ${where}`).join('; ');
    problems.push(`${rel}  [mismatched cache-buster versions — all local assets must share one N]  ${detail}`);
  }
}

// APP_VERSION (js/app-version.js) must equal the uniform cache-buster N, so the
// app's self-reported version never drifts from what's actually served (§8).
try {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nMatch = idx.match(/[?&]v=(\d+)/); // uniformity already asserted above
  const av = fs.readFileSync(path.join(ROOT, 'js', 'app-version.js'), 'utf8').match(/APP_VERSION\s*=\s*(\d+)/);
  if (!av) problems.push('js/app-version.js  [APP_VERSION constant not found]');
  else if (nMatch && av[1] !== nMatch[1]) {
    problems.push(`js/app-version.js  [APP_VERSION=${av[1]} must equal the uniform cache-buster N=${nMatch[1]}]`);
  }
} catch (e) { problems.push(`app-version check failed: ${e.message}`); }

if (problems.length) {
  console.log('FAIL — cache-buster problems (a stale mix of old+new assets could be served):');
  problems.forEach((p) => console.log('  ' + p));
  console.log('\nEvery local <script src>/<link href> must carry ?v=N, and all N in a file must match.');
  console.log('On each release, bump every asset in the page to the same new N.');
  process.exit(1);
}
console.log(`OK — ${htmlFiles.length} html file(s), ${assetCount} local asset ref(s), all cache-busted and uniform.`);
process.exit(0);
