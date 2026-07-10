'use strict';
// js/support/a11y.js — reusable accessibility scaffolding.
//
// S1 PRE-WORK for the in-app support feature (docs/inapp-support-plan.md §4, §11).
// Two generic, dependency-free a11y patterns for a FUTURE support widget that is
// NOT built this phase (no FAB, no panel, no capture/annotate):
//   1. createFocusTrap(panel, opts) — trap Tab focus inside a panel, close on Esc,
//      restore focus to the opener on close (the "panel focus-trap + Esc" in §4).
//   2. getPoliteAnnouncer() / createAnnouncer() — an aria-live="polite" region for
//      unobtrusive announcements (the "badges via aria-live=polite" in §4).
//
// Deliberately INERT on load: importing this file runs nothing, creates no DOM, and
// adds no listeners. Nothing happens until a caller invokes the API. Exposed as a
// browser global (window.TTA11y) and CommonJS-exported so it can be referenced or
// reasoned about in Node. No framework, no build step, no external calls.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTA11y = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Elements that can receive keyboard focus (the tab ring inside a panel).
  var FOCUSABLE = [
    'a[href]', 'area[href]', 'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
    'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    'audio[controls]', 'video[controls]', 'details > summary:first-of-type', 'iframe'
  ].join(',');

  // Visible, focusable descendants in DOM order. Visibility is best-effort via box
  // size (jsdom-safe: elements with no layout fall through to the container focus).
  function focusableWithin(container) {
    var all = container.querySelectorAll(FOCUSABLE);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetWidth > 0 || el.offsetHeight > 0 || el === (container.ownerDocument || document).activeElement) {
        out.push(el);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Pattern 1 — focus-trap panel
  // ---------------------------------------------------------------------------
  // createFocusTrap(panel, {
  //   onClose,               // called after Esc / api.close()
  //   initialFocus,          // CSS selector within panel to focus on activate
  //   closeOnEsc = true,     // Escape triggers close()
  //   restoreFocus = true    // return focus to the opener on deactivate
  // }) -> { activate(), deactivate(), close(), get active }
  function createFocusTrap(panel, opts) {
    if (!panel) throw new Error('createFocusTrap: panel element is required');
    opts = opts || {};
    var closeOnEsc = opts.closeOnEsc !== false;
    var restoreFocus = opts.restoreFocus !== false;
    var doc = panel.ownerDocument || document;
    var active = false;
    var prevFocus = null;

    function firstFocusTarget() {
      if (opts.initialFocus) {
        var pref = panel.querySelector(opts.initialFocus);
        if (pref) return pref;
      }
      return focusableWithin(panel)[0] || panel;
    }

    function onKeydown(e) {
      if (!active) return;
      if (e.key === 'Escape' && closeOnEsc) { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var items = focusableWithin(panel);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      var first = items[0], last = items[items.length - 1], cur = doc.activeElement;
      if (e.shiftKey && (cur === first || !panel.contains(cur))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (cur === last || !panel.contains(cur))) { e.preventDefault(); first.focus(); }
    }

    // Pull focus back if it escapes the panel by any means (mouse, programmatic).
    function onFocusIn(e) {
      if (active && !panel.contains(e.target)) firstFocusTarget().focus();
    }

    function activate() {
      if (active) return api;
      active = true;
      prevFocus = doc.activeElement;
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      doc.addEventListener('keydown', onKeydown, true);
      doc.addEventListener('focusin', onFocusIn, true);
      firstFocusTarget().focus();
      return api;
    }

    function deactivate() {
      if (!active) return api;
      active = false;
      doc.removeEventListener('keydown', onKeydown, true);
      doc.removeEventListener('focusin', onFocusIn, true);
      if (restoreFocus && prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
      prevFocus = null;
      return api;
    }

    function close() {
      deactivate();
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    var api = {
      activate: activate,
      deactivate: deactivate,
      close: close,
      get active() { return active; }
    };
    return api;
  }

  // ---------------------------------------------------------------------------
  // Pattern 2 — polite aria-live announcer (for badges / status)
  // ---------------------------------------------------------------------------
  // createAnnouncer(existingRegion?) -> { announce(text), clear(), region }
  // getPoliteAnnouncer() -> a lazily-created shared singleton.
  //
  // The region is visually hidden but exposed to assistive tech, styled inline so
  // the pattern carries no CSS dependency. announce() clears then re-sets the text
  // on a later frame so that identical consecutive messages are still spoken.
  var sharedAnnouncer = null;

  function makeRegion(doc) {
    var r = doc.createElement('div');
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('aria-atomic', 'true');
    r.setAttribute('role', 'status');
    r.className = 'tta11y-live';
    r.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
      'border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
    return r;
  }

  function createAnnouncer(existingRegion, doc) {
    doc = doc || (existingRegion && existingRegion.ownerDocument) || document;
    var region = existingRegion || makeRegion(doc);

    function ensureAttached() {
      if (!region.parentNode) (doc.body || doc.documentElement).appendChild(region);
    }

    function announce(text) {
      ensureAttached();
      var value = (text == null) ? '' : String(text);
      region.textContent = '';
      var set = function () { region.textContent = value; };
      // Double rAF: let AT observe the clear, then the new value (a common,
      // reliable way to make polite regions re-announce). Falls back to sync.
      var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
      if (raf) raf(function () { raf(set); }); else set();
    }

    function clear() { region.textContent = ''; }

    return { announce: announce, clear: clear, region: region };
  }

  function getPoliteAnnouncer() {
    if (!sharedAnnouncer) sharedAnnouncer = createAnnouncer();
    return sharedAnnouncer;
  }

  return {
    createFocusTrap: createFocusTrap,
    createAnnouncer: createAnnouncer,
    getPoliteAnnouncer: getPoliteAnnouncer,
    focusableWithin: focusableWithin,
    FOCUSABLE_SELECTOR: FOCUSABLE
  };
});
