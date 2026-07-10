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
  root.TTSupportConfig = {
    // The armed S2 relay (Vercel project tictac-support-relay). Endpoints live at
    // `<relayBase>/tictac/issues` … . On the live site this makes the widget file to the
    // relay; on localhost dev with no config the inbox probe still wins for the local loop.
    relayBase: 'https://tictac-support-relay.vercel.app/api',
  };
})(typeof self !== 'undefined' ? self : this);
