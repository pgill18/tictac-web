// transport.js — the five support verbs from the browser (inapp-support-plan.md §6).
//   file(report) · thread(ref) · reply(ref, body) · status([refs]) · confirm(ref)
//   ref = { source, number, key }
//
// BINDING autodetect (§6 priority: config > local-inbox-probe > relay):
//   1. file://                     → 'copy'  (cross-origin POST can't work; degrade to a bundle)
//   2. a configured relay base URL → 'relay' (the LIVE Pages site sets window.TTSupportConfig)
//   3. the local inbox answers     → 'inbox' (localhost dev: loopback http://127.0.0.1:8030)
//   4. otherwise                   → 'copy'  (nothing reachable, no relay configured)
// The result is resolved once per session and cached.
//
// SECURITY (identical across inbox and relay — same path shape, same header rules):
//   • The capability key travels ONLY in the `X-Support-Key` HEADER (thread/reply/confirm),
//     never the URL/query. Batched status carries per-ref keys in the POST BODY.
//   • clientReportId is sent on file() so a retry returns the ORIGINAL issue, not a dup.
//   • confirm() is its own call — the app never infers confirmation from reply text.
//
// Dual export (Node testable + window.TTSupportTransport).
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTSupportTransport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP = 'tictac';
  const INBOX_BASE = 'http://127.0.0.1:8030'; // loopback local inbox (S1)

  // Deploy-time config, injected by js/support/config.js (window.TTSupportConfig). Absent in
  // local dev; on the live Pages site it carries { relayBase: 'https://…/api' }.
  function cfg() {
    const g = (typeof window !== 'undefined' && window.TTSupportConfig)
      || (typeof self !== 'undefined' && self.TTSupportConfig) || null;
    return g && typeof g === 'object' ? g : {};
  }
  function relayBase() {
    const b = cfg().relayBase;
    return (typeof b === 'string' && /^https?:\/\//.test(b)) ? b.replace(/\/+$/, '') : null;
  }

  function proto() {
    return (typeof location !== 'undefined' && location.protocol) || 'http:';
  }

  // Probe the local inbox with a tiny, side-effect-free status call. Any HTTP response (even an
  // error status) proves the loopback server is up; a network/refused error means it isn't.
  async function probeInbox() {
    if (typeof fetch !== 'function') return false;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 800) : null;
      const res = await fetch(`${INBOX_BASE}/${APP}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"refs":[]}',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (t) clearTimeout(t);
      return !!res;
    } catch (e) { return false; }
  }

  let _binding = null; // resolved once per session
  async function resolveBinding() {
    if (_binding) return _binding;
    if (proto() === 'file:') return (_binding = 'copy');
    if (relayBase()) return (_binding = 'relay');        // config wins (§6)
    if (await probeInbox()) return (_binding = 'inbox');  // local dev
    return (_binding = 'copy');                            // nothing reachable
  }
  function _resetBinding() { _binding = null; } // test hook

  // Synchronous best-effort (no probe) — used only where a quick guess is acceptable.
  function detectBinding() {
    if (proto() === 'file:') return 'copy';
    if (relayBase()) return 'relay';
    return 'inbox';
  }

  function baseFor(binding) { return binding === 'relay' ? relayBase() : INBOX_BASE; }
  function verbUrl(binding, pathSuffix) {
    return `${baseFor(binding)}/${APP}${pathSuffix}`; // key NEVER goes in here (§3)
  }

  async function jsonFetch(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = new Error(`support transport: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // A copyable text bundle for the file:// / no-transport degrade path (§6). No network.
  function copyBundle(report) {
    return [
      `tictac support report (${report.reportType || 'bug'})`,
      `title: ${report.title || ''}`,
      '',
      report.body || '',
      '',
      `context: ${JSON.stringify(report.context || {})}`,
      `clientReportId: ${report.clientReportId || ''}`,
    ].join('\n');
  }

  // --- the five verbs -------------------------------------------------------

  // file(report) → { source, number, key } (or { copy } on the degrade path).
  async function file(report) {
    const binding = await resolveBinding();
    if (binding === 'copy') return { copy: copyBundle(report) };
    return jsonFetch(verbUrl(binding, '/issues'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientReportId: report.clientReportId,     // idempotency key (§6)
        reportType: report.reportType,
        title: report.title,
        body: report.body,
        context: report.context || null,           // allowlist payload — profile name NOT here (§4)
        screenshot: report.screenshot || null,     // flattened annotated pixels; relay re-encodes (inbox ignores)
      }),
    });
  }

  // thread(ref) → the user-facing thread (PUBLIC comments only, server-enforced).
  async function thread(ref) {
    const binding = await resolveBinding();
    if (binding === 'copy') return null;
    return jsonFetch(verbUrl(binding, `/issues/${encodeURIComponent(ref.number)}`), {
      method: 'GET',
      headers: { 'X-Support-Key': ref.key },        // key in HEADER only (§3)
      cache: 'no-store',
    });
  }

  // reply(ref, body) → posts a user reply; the server clears needs-info automatically.
  async function reply(ref, body) {
    const binding = await resolveBinding();
    if (binding === 'copy') throw new Error('offline: cannot reply');
    return jsonFetch(verbUrl(binding, `/issues/${encodeURIComponent(ref.number)}/comments`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Support-Key': ref.key },
      body: JSON.stringify({ body: body }),
    });
  }

  // status(refs) → batched state for My Reports. Per-ref keys ride in the BODY (not a URL).
  async function status(refs) {
    const binding = await resolveBinding();
    if (binding === 'copy') return [];
    const r = await jsonFetch(verbUrl(binding, '/status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ refs: (refs || []).map((x) => ({ source: x.source, number: x.number, key: x.key })) }),
    });
    return r.results || [];
  }

  // confirm(ref, outcome, comment) → the graded Works✓ verb (#21). The TYPED outcome
  // (works|partial|doesnt_work) drives the server-side state change; the optional comment is
  // attached as data only and NEVER parsed for intent. Distinct call; never inferred from text (§6).
  async function confirm(ref, outcome, comment) {
    const binding = await resolveBinding();
    if (binding === 'copy') throw new Error('offline: cannot confirm');
    return jsonFetch(verbUrl(binding, `/issues/${encodeURIComponent(ref.number)}/confirm`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Support-Key': ref.key },
      body: JSON.stringify({ outcome: outcome, comment: comment || '' }),
    });
  }

  return { file, thread, reply, status, confirm, detectBinding, resolveBinding, _resetBinding, relayBase, APP, INBOX_BASE, copyBundle };
});
