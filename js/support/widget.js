// widget.js — the support UI: FAB + "New report" panel + "My reports" panel (§4/§5/§10).
//
// Ties together: transport.js (five verbs), context.js (allowlist), capture.js + annotate.js
// (optional screenshot), and iris's a11y scaffolding (TTA11y.createFocusTrap + announcer).
// Persists reports via TTStore (browser-global My Reports, §5) and fires the Contributor
// thanks moment through a host hook (so it routes via the gamification registry, #74).
//
// Security-relevant behavior mirrored here: the payload is the context ALLOWLIST only (no
// profile name — that stays client-side for badge attribution); confirm is an explicit
// button, never inferred; the disclosure line states exactly what is sent.
//
// init(host) — host: { currentUser(), currentView(), settingsSnapshot(), onReportEvent(type,ctx),
//                       persist(fn) }  where persist(fn) runs fn(store) then saves.
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTSupportWidget = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DISCLOSURE = 'Sent with your report: this screenshot (as annotated), a few app settings, and the app’s recent error log — nothing else.';
  const CONTINUITY = 'This browser remembers your reports; clearing site data loses the thread.';

  let host = null, transport = null, ctxMod = null, capMod = null, annoMod = null, a11y = null, store = null;
  let root_ = null, fab = null, panel = null, trap = null, announcer = null;
  let annotator = null, shot = null; // current capture/annotate session

  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'r-' + Date.now() + '-' + Math.floor(Math.random() * 1e9));

  function init(hostApi) {
    host = hostApi;
    transport = window.TTSupportTransport;
    ctxMod = window.TTSupportContext;
    capMod = window.TTSupportCapture;
    annoMod = window.TTSupportAnnotate;
    a11y = window.TTA11y;
    store = window.TTStore;
    if (ctxMod && ctxMod.installErrorCapture) ctxMod.installErrorCapture();
    mount();
  }

  function mount() {
    root_ = $('div', 'support-root');
    fab = $('button', 'support-fab');
    fab.type = 'button';
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-label', 'Report a problem');
    fab.textContent = 'Report a problem';
    fab.addEventListener('click', openHome);
    root_.appendChild(fab);
    document.body.appendChild(root_);
    if (a11y && a11y.createAnnouncer) announcer = a11y.createAnnouncer();
  }

  // Reflect the "Show support button" app setting (default off — inert until enabled).
  function applyVisibility() {
    let on = false;
    try { on = store.getAppSetting(store.load(), 'showSupportButton', false); } catch (e) {}
    if (fab) fab.style.display = on ? '' : 'none';
  }

  // ---- panel plumbing ------------------------------------------------------
  function closePanel() {
    // Use deactivate(), NOT close(): the trap's onClose IS closePanel, so trap.close()
    // would re-enter closePanel → close() → … (stack overflow, #82). deactivate() tears the
    // trap down without calling onClose; closePanel already does the rest of the teardown.
    if (trap) { trap.deactivate(); trap = null; }
    if (annotator) { annotator.destroy(); annotator = null; }
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null; shot = null;
  }
  function openPanel(build) {
    closePanel();
    panel = $('div', 'support-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    build(panel);
    root_.appendChild(panel);
    if (a11y && a11y.createFocusTrap) trap = a11y.createFocusTrap(panel, { onClose: closePanel });
  }

  function header(title, opts) {
    const h = $('div', 'support-panel-head');
    h.appendChild($('h2', 'support-panel-title', title));
    if (opts && opts.noMax) { // compact panels (e.g. the filed-confirmation) skip Maximize
      const xc = $('button', 'support-close', '×');
      xc.type = 'button'; xc.setAttribute('aria-label', 'Close'); xc.addEventListener('click', closePanel);
      h.appendChild(xc);
      return h;
    }
    // Maximize toggle (#16): expand the panel to a near-full-window overlay so the screenshot
    // annotator has room to read/draw/type on. The annotate canvas is max-width:100% and maps
    // pointer coords via live getBoundingClientRect, so it scales up with the wider panel — no
    // reflow needed. Glyph is decorative; the button's accessible name is the aria-label.
    const max = $('button', 'support-max', '⤢');
    max.type = 'button'; max.setAttribute('aria-label', 'Maximize'); max.setAttribute('aria-pressed', 'false');
    max.addEventListener('click', () => {
      if (!panel) return;
      const on = panel.classList.toggle('support-panel--max');
      max.setAttribute('aria-pressed', on ? 'true' : 'false');
      max.setAttribute('aria-label', on ? 'Restore size' : 'Maximize');
      max.textContent = on ? '⤡' : '⤢';
    });
    h.appendChild(max);
    const x = $('button', 'support-close', '×');
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closePanel);
    h.appendChild(x);
    return h;
  }

  function openHome() {
    openPanel((p) => {
      p.appendChild(header('Support'));
      const nb = $('button', 'support-btn primary', 'New report'); nb.type = 'button'; nb.addEventListener('click', openNew);
      const mb = $('button', 'support-btn', 'My reports'); mb.type = 'button'; mb.addEventListener('click', openMine);
      p.appendChild(nb); p.appendChild(mb);
    });
  }

  // ---- new report ----------------------------------------------------------
  function openNew() {
    openPanel((p) => {
      p.appendChild(header('New report'));
      const type = $('select', 'support-type');
      [['bug', 'Bug'], ['enhancement', 'Enhancement'], ['suggestion', 'Suggestion']].forEach(([v, l]) => {
        const o = $('option', null, l); o.value = v; type.appendChild(o);
      });
      const title = $('input', 'support-input'); title.type = 'text'; title.placeholder = 'Short summary';
      title.setAttribute('aria-label', 'Report title');
      const body = $('textarea', 'support-textarea'); body.placeholder = 'What happened?'; body.rows = 4;
      body.setAttribute('aria-label', 'Report details');

      // screenshot area (bug = on by default; always skippable)
      const shotWrap = $('div', 'support-shot');
      const shotToggle = $('input'); shotToggle.type = 'checkbox'; shotToggle.id = 'support-shot-toggle';
      const shotLabel = $('label', null, ' Include a screenshot'); shotLabel.htmlFor = 'support-shot-toggle';
      const shotHost = $('div', 'support-shot-host');
      const tools = $('div', 'support-tools');
      annoMod && annoMod.TOOLS.forEach((t) => { const b = $('button', 'support-tool', t); b.type = 'button'; b.addEventListener('click', () => annotator && annotator.setTool(t)); tools.appendChild(b); });
      const undo = $('button', 'support-tool', 'undo'); undo.type = 'button'; undo.addEventListener('click', () => annotator && annotator.undo()); tools.appendChild(undo);
      tools.style.display = 'none';
      shotToggle.addEventListener('change', async () => {
        if (shotToggle.checked) { await beginCapture(shotHost, tools); } else { endCapture(shotHost, tools); }
      });
      shotWrap.appendChild(shotToggle); shotWrap.appendChild(shotLabel); shotWrap.appendChild(tools); shotWrap.appendChild(shotHost);

      const disclosure = $('p', 'support-disclosure', DISCLOSURE);
      const continuity = $('p', 'support-fineprint', CONTINUITY);
      const send = $('button', 'support-btn primary', 'Send report'); send.type = 'button';
      const status = $('p', 'support-status');
      send.addEventListener('click', () => submit(type.value, title.value, body.value, status, send));

      // bug defaults the screenshot ON
      if (type.value === 'bug') { shotToggle.checked = true; beginCapture(shotHost, tools); }
      type.addEventListener('change', () => { /* copy stays; screenshot default is a first-open nicety */ });

      [type, title, body, shotWrap, disclosure, continuity, send, status].forEach((el) => p.appendChild(el));
      title.focus();
    });
  }

  async function beginCapture(shotHost, tools) {
    shotHost.textContent = 'Capturing…';
    shot = capMod ? await capMod.captureViewport(document.body) : null;
    shotHost.textContent = '';
    if (!shot) { shotHost.appendChild($('p', 'support-fineprint', 'Couldn’t capture a screenshot — you can still send the report without one.')); tools.style.display = 'none'; return; }
    tools.style.display = '';
    annotator = annoMod ? annoMod.createAnnotator(shotHost, shot.dataUrl, {}) : null;
  }
  function endCapture(shotHost, tools) {
    if (annotator) { annotator.destroy(); annotator = null; }
    shot = null; shotHost.textContent = ''; tools.style.display = 'none';
  }

  async function submit(reportType, titleText, bodyText, statusEl, sendBtn) {
    if (!titleText.trim()) { statusEl.textContent = 'Please add a short summary.'; return; }
    sendBtn.disabled = true; statusEl.textContent = 'Sending…';
    const clientReportId = uuid();
    const title = titleText.trim();
    const now = new Date().toISOString();

    // ANTI-LOSS (#86): persist a local record FIRST — before building the screenshot/context
    // or sending — so a report can NEVER silently vanish no matter what throws next
    // (toPNG/buildContext errors, a transport failure against the real :8022 inbox, the
    // file:// degrade path — all covered). It's in "My reports" immediately; we update it to
    // 'filed' only on genuine confirmed success, else it stays 'unsent'.
    host.persist((s) => store.addSupportReport(s, {
      clientReportId, source: 'local', number: null, key: null,
      type: reportType, title: title, user: host.currentUser() || null,
      filedAt: now, workState: 'unsent', needsReply: false, resolution: null,
      timeline: [{ state: 'unsent', at: now }], lastChecked: now, ackFixed: false, bundle: null,
    }));

    try {
      // flattened annotated pixels only (never the original), if a screenshot is attached
      const screenshot = annotator ? annotator.toPNG() : (shot ? shot.dataUrl : null);
      const context = ctxMod ? ctxMod.buildContext({ view: host.currentView(), env: 'web', settings: host.settingsSnapshot() }) : {};
      const report = { clientReportId, reportType, title: title, body: bodyText, context, screenshot };
      const res = await transport.file(report);
      // Degrade path (file:// or no inbox): can't file, so KEEP the local record and
      // surface a copyable bundle. Never claim "sent" — the report stays in My reports.
      if (res && res.copy) {
        host.persist((s) => store.updateSupportReport(s, clientReportId, { bundle: res.copy }));
        tryClipboard(res.copy);
        showBundle(statusEl, res.copy);
        statusEl.textContent = 'Couldn’t reach support from here. Your report is saved in “My reports” and copied below — paste it to us to send it.';
        sendBtn.disabled = false; sendBtn.textContent = 'Saved locally';
        return;
      }
      if (!res || res.number == null) throw new Error('no issue number returned'); // don't fake success
      host.persist((s) => store.updateSupportReport(s, clientReportId, {
        source: res.source, number: res.number, key: res.key, workState: 'filed',
        timeline: [{ state: 'filed', at: new Date().toISOString() }],
      }));
      host.onReportEvent('report_filed', { number: res.number }); // thanks moment (Contributor)
      if (announcer) announcer.announce(`Filed as ${idLabel(res.number)}.`);
      // #18: dismiss the New report modal and show a small confirmation modal in its place.
      openFiled(res.number);
    } catch (e) {
      // Send failed — the local 'unsent' record stays, so it's visible in My reports.
      statusEl.textContent = 'Couldn’t send right now — your report is saved in “My reports”. Please try again.';
      sendBtn.disabled = false;
    }
  }

  // #18: compact confirmation modal shown in place of the New report modal after a successful
  // filing (replaces the old "append the message at the bottom of the form" behavior).
  function openFiled(number) {
    openPanel((p) => {
      p.classList.add('support-panel--confirm');
      p.appendChild(header('Report filed', { noMax: true }));
      p.appendChild($('p', 'support-status', `Filed as ${idLabel(number)}. Thank you!`));
      const done = $('button', 'support-btn primary', 'Done'); done.type = 'button';
      done.addEventListener('click', closePanel);
      p.appendChild(done);
    });
  }

  function tryClipboard(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); } catch (e) { /* best effort */ }
  }
  // Show the report bundle in a read-only textarea the user can copy from by hand.
  function showBundle(statusEl, text) {
    const ta = $('textarea', 'support-textarea');
    ta.readOnly = true; ta.rows = 6; ta.value = text; ta.setAttribute('aria-label', 'Report bundle to copy');
    statusEl.parentNode.insertBefore(ta, statusEl.nextSibling);
  }

  const idLabel = (n) => `TT-${n}`;

  // ---- my reports ----------------------------------------------------------
  async function openMine() {
    openPanel((p) => {
      p.appendChild(header('My reports'));
      const list = $('div', 'support-list'); p.appendChild(list);
      const reports = store.getSupportReports(store.load());
      if (!reports.length) { list.appendChild($('p', 'support-fineprint', 'No reports yet.')); return; }
      list.appendChild($('p', 'support-fineprint', 'These are the reports filed from this browser.'));
      reports.slice().reverse().forEach((r) => {
        const row = $('button', 'support-report-row'); row.type = 'button';
        const unsent = r.workState === 'unsent' || r.number == null;
        row.appendChild($('span', 'support-report-title', `${unsent ? 'Not sent' : idLabel(r.number)} · ${r.title}`));
        row.appendChild($('span', 'support-report-state', unsent ? 'not sent — tap to copy' : (r.needsReply ? 'support asked you a question' : r.workState)));
        row.addEventListener('click', () => openThread(r.clientReportId));
        list.appendChild(row);
      });
      refreshStatuses(reports);
    });
  }

  async function refreshStatuses(reports) {
    try {
      // Only poll reports that were actually filed (have a number/key); unsent ones have none.
      const refs = reports.filter((r) => r.number != null && r.key).map((r) => ({ source: r.source, number: r.number, key: r.key }));
      if (!refs.length) return;
      const results = await transport.status(refs);
      host.persist((s) => {
        for (const res of results) {
          if (res.notFound) continue;
          const r = store.getSupportReports(s).find((x) => x.number === res.number);
          if (r) { r.workState = res.workState; r.needsReply = res.needsReply; r.resolution = res.resolution; r.lastChecked = new Date().toISOString(); }
        }
      });
    } catch (e) { /* background refresh — silent per §5 */ }
  }

  // View for a saved-but-unsent report: it was never lost — show the bundle to copy.
  function openUnsent(rec) {
    openPanel((p) => {
      p.appendChild(header(`Not sent · ${rec.title}`));
      p.appendChild($('p', 'support-status', 'This report is saved on your device but hasn’t reached support yet. Copy it below and send it to us, or try again from a connected page.'));
      if (rec.bundle) {
        const ta = $('textarea', 'support-textarea'); ta.readOnly = true; ta.rows = 6; ta.value = rec.bundle;
        ta.setAttribute('aria-label', 'Report bundle to copy'); p.appendChild(ta);
        const copy = $('button', 'support-btn', 'Copy to clipboard'); copy.type = 'button';
        copy.addEventListener('click', () => { tryClipboard(rec.bundle); copy.textContent = 'Copied'; });
        p.appendChild(copy);
      }
    });
  }

  async function openThread(clientReportId) {
    const rec = store.findSupportReport(store.load(), clientReportId);
    if (!rec) return;
    // An UNSENT report has no thread yet — show its bundle to copy (never a dead thread).
    if (rec.number == null || rec.workState === 'unsent') { openUnsent(rec); return; }
    const ref = { source: rec.source, number: rec.number, key: rec.key };
    openPanel(async (p) => {
      p.appendChild(header(`${idLabel(rec.number)} · ${rec.title}`));
      const timeline = $('ol', 'support-timeline');
      (rec.timeline || []).forEach((t) => timeline.appendChild($('li', null, `${t.state} — seen by you ${String(t.at).slice(0, 10)}`)));
      p.appendChild(timeline);
      const thread = $('div', 'support-thread', 'Loading…'); p.appendChild(thread);
      let view = null;
      try { view = await transport.thread(ref); } catch (e) { thread.textContent = 'Couldn’t load the conversation — try again later.'; }
      if (view) renderThread(thread, view, ref, rec, p);
    });
  }

  function renderThread(thread, view, ref, rec, p) {
    thread.textContent = '';
    view.comments.forEach((c) => {
      const b = $('div', 'support-msg ' + (c.from === 'you' ? 'from-you' : 'from-support'));
      b.appendChild($('div', 'support-msg-who', c.from === 'you' ? 'You' : 'Support'));
      b.appendChild($('div', 'support-msg-body', c.body));
      thread.appendChild(b);
    });
    if (view.needsReply) {
      const q = $('p', 'support-needsreply', 'Support asked you a question.'); p.insertBefore(q, thread);
      const box = $('textarea', 'support-textarea'); box.rows = 2; box.setAttribute('aria-label', 'Your reply');
      const rb = $('button', 'support-btn primary', 'Send reply'); rb.type = 'button';
      rb.addEventListener('click', async () => {
        if (!box.value.trim()) return;
        rb.disabled = true;
        try { await transport.reply(ref, box.value.trim()); host.persist((s) => { const r = store.findSupportReport(s, rec.clientReportId); if (r) r.needsReply = false; }); openThread(rec.clientReportId); }
        catch (e) { rb.disabled = false; }
      });
      p.appendChild(box); p.appendChild(rb); box.focus();
    }
    // Graded fix-ready outcome (#21) — three explicit, TYPED choices. Only shown when fix-ready.
    // The state change is driven by WHICH button is pressed (the typed outcome sent to the
    // server), NEVER by the note text; the note is optional data attached to the outcome.
    if (view.workState === 'fix-ready' && view.resolution !== 'confirmed') {
      const wrap = $('div', 'support-outcome');
      wrap.appendChild($('p', 'support-fineprint', 'Did the fix work for you?'));
      const note = $('textarea', 'support-textarea'); note.rows = 2;
      note.placeholder = 'Optional: add a note for support';
      note.setAttribute('aria-label', 'Optional note about the fix');
      const row = $('div', 'support-outcome-btns');
      const setDisabled = (v) => row.querySelectorAll('button').forEach((b) => { b.disabled = v; });
      const send = async (outcome) => {
        setDisabled(true);
        try {
          const r = await transport.confirm(ref, outcome, note.value.trim());
          if (r && r.ok) {
            host.persist((s) => {
              const rr = store.findSupportReport(s, rec.clientReportId);
              if (!rr) return;
              if (outcome === 'works') { rr.resolution = 'confirmed'; rr.workState = 'resolved'; }
              else if (outcome === 'doesnt_work') { rr.workState = 'in-progress'; }
              // partial: no local state change — stays fix-ready
            });
            if (outcome === 'works') {
              host.onReportEvent('report_confirmed', { number: ref.number }); // thanks moment (Contributor)
              if (announcer) announcer.announce('Thanks for confirming the fix!');
            } else if (outcome === 'doesnt_work') {
              if (announcer) announcer.announce('Thanks — we’ve reopened this for support.');
            } else if (announcer) { announcer.announce('Thanks — support will take another look.'); }
            openThread(rec.clientReportId);
          } else { setDisabled(false); }
        } catch (e) { setDisabled(false); }
      };
      const bWorks = $('button', 'support-btn primary', 'Works'); bWorks.type = 'button';
      bWorks.addEventListener('click', () => send('works'));
      const bPartial = $('button', 'support-btn', 'Partially works'); bPartial.type = 'button';
      bPartial.addEventListener('click', () => send('partial'));
      const bNo = $('button', 'support-btn', 'Doesn’t work'); bNo.type = 'button';
      bNo.addEventListener('click', () => send('doesnt_work'));
      row.appendChild(bWorks); row.appendChild(bPartial); row.appendChild(bNo);
      wrap.appendChild(note); wrap.appendChild(row);
      p.appendChild(wrap);
    }
  }

  // open() lets the app offer "Report a problem" even when the FAB is hidden (§10 —
  // Settings keeps a report entry point when the support button is toggled off).
  return { init, applyVisibility, open: openHome, _idLabel: idLabel };
});
