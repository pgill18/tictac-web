// context.js — auto-context for a support report as an ALLOWLIST, not a snapshot (§4).
//
// What we attach: view id, APP_VERSION, viewport/DPR, an ENUMERATED settings whitelist, and
// a SANITIZED error ring (last 20). What we NEVER attach: the user's profile name (that's
// client-only, for local badge attribution) and anything not on the allowlist.
//
// The error ring is sanitized at capture time AND again at build time: query strings, path
// prefixes, and secret-shaped tokens are stripped so nothing sensitive rides along.
//
// Dual export (Node testable + window.TTSupportContext).
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTSupportContext = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The ONLY settings fields that may travel with a report. Add deliberately.
  const SETTINGS_ALLOWLIST = [
    'boardTheme', 'showSupportButton',
    'gami.xp', 'gami.achievements', 'gami.streaks', 'gami.mastery',
    'gami.celebration', 'gami.themes', 'gami.leaderboard', 'gami.contributor',
  ];

  const RING_MAX = 20;
  const ring = []; // { msg, at }

  // --- sanitizer ------------------------------------------------------------
  // Strip things that could carry PII/secrets from a free-text string (§4).
  function sanitize(input) {
    let s = String(input == null ? '' : input);
    // email addresses → [email] (PII scrubbing, rex #79 note 2). Done first so the local
    // part isn't partially eaten by the token redaction below.
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
    // secret-shaped tokens: long hex / base64-ish runs → [redacted]
    s = s.replace(/\b[A-Fa-f0-9]{16,}\b/g, '[redacted]');
    s = s.replace(/\b[A-Za-z0-9_\-]{24,}\b/g, '[redacted]');
    // URLs: drop the query string, keep origin + path (no query on the log path)
    s = s.replace(/(https?:\/\/[^\s'"?]+)\?[^\s'"]*/g, '$1');
    // Windows drive paths → basename (strip path prefix)
    s = s.replace(/[A-Za-z]:\\[^\s'"]*[\\]([^\s'"\\]+)/g, '$1');
    // unix absolute stack paths (start/space/@/paren + /a/b/c) → last segment. The
    // leading boundary keeps this from matching inside a "https://" URL.
    s = s.replace(/(^|[\s(@])\/(?:[^\s'":()]+\/)+([^\s'":()]+)/g, '$1$2');
    return s.slice(0, 300); // cap length (don't ship long entered text)
  }

  // Record one error into the ring (sanitized, capped). Safe to call a lot.
  function record(msg) {
    ring.push({ msg: sanitize(msg), at: new Date().toISOString() });
    while (ring.length > RING_MAX) ring.shift();
  }

  // Install lightweight global error capture. Idempotent; no-op outside a browser.
  let installed = false;
  function installErrorCapture(target) {
    const t = target || (typeof window !== 'undefined' ? window : null);
    if (!t || installed) return;
    installed = true;
    t.addEventListener('error', (e) => {
      const src = e && e.filename ? ` @ ${e.filename}:${e.lineno || 0}` : '';
      record(`${(e && e.message) || 'error'}${src}`);
    });
    t.addEventListener('unhandledrejection', (e) => {
      record(`unhandledrejection: ${(e && e.reason && (e.reason.message || e.reason)) || ''}`);
    });
  }

  // Pull the allowlisted settings out of a raw settings object (supports dotted keys).
  function pickSettings(raw) {
    const out = {};
    if (!raw) return out;
    for (const key of SETTINGS_ALLOWLIST) {
      const parts = key.split('.');
      let v = raw;
      for (const p of parts) { v = v == null ? undefined : v[p]; }
      if (v !== undefined) out[key] = v;
    }
    return out;
  }

  // Build the context payload. opts: { view, settings, env }. Profile name is NEVER read.
  function buildContext(opts) {
    opts = opts || {};
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    let appVersion = null;
    if (typeof window !== 'undefined' && window.APP_VERSION != null) appVersion = window.APP_VERSION;
    else if (typeof self !== 'undefined' && self.APP_VERSION != null) appVersion = self.APP_VERSION;
    return {
      view: sanitize(opts.view || ''),
      appVersion: appVersion,
      env: opts.env || 'web',
      viewport: { w: vw, h: vh, dpr: dpr },
      settings: pickSettings(opts.settings),
      errors: ring.map((e) => ({ msg: e.msg, at: e.at })), // already sanitized
      // NOTE: no `user` / profile name — client-only, per §4.
    };
  }

  return {
    buildContext, sanitize, record, installErrorCapture, pickSettings,
    SETTINGS_ALLOWLIST, _ring: ring,
  };
});
