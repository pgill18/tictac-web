// APP_VERSION — the app's release version, defined as the uniform cache-buster N
// (every local asset in index.html carries ?v=N; the convention landed in Phase 5).
// This MUST stay equal to that N — check-cache-busters.js fails the publish gate on
// any mismatch, exactly like a missing/inconsistent ?v= does. Bump it together with
// the asset versions on each release. Consumed by the in-app-support context
// allowlist (inapp-support-plan.md §4) as a plain, non-sensitive build identifier.
(function (root) {
  'use strict';
  root.APP_VERSION = 33;
})(typeof self !== 'undefined' ? self : this);
