// config.js — deploy-time support configuration (inapp-support-plan.md §6 "config > inbox > relay").
//
// This is the ONE place the live site points the widget at the serverless relay. It sets a
// global that transport.js reads; when `relayBase` is null the widget falls back to the local
// inbox probe (localhost dev) or the copy-bundle degrade path — i.e. behaviour is unchanged
// until a relay URL is filled in here.
//
// relayBase is the relay's `/api` mount (the endpoints live at `<relayBase>/tictac/issues` …).
// It is set to the deployed Vercel URL only AFTER the relay is ARMED (PAT injected by the
// operator) and verified — then this file is bumped and the webapp republished.
(function (root) {
  'use strict';
  // On LOCALHOST we deliberately leave relayBase null so the local inbox (S1) stays the dev
  // fallback: transport.js then probes the loopback inbox first (config > inbox-probe > relay),
  // preserving the offline/localhost loop per §6. Everywhere else (the live Pages site) we point
  // at the armed S2 relay (Vercel project tictac-support-relay), whose endpoints live at
  // `<relayBase>/tictac/issues` … .
  var host = (typeof location !== 'undefined' && location.hostname) || '';
  var isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '';
  root.TTSupportConfig = {
    relayBase: isLocalhost ? null : 'https://tictac-support-relay.vercel.app/api',
  };
})(typeof self !== 'undefined' ? self : this);
