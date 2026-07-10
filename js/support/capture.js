// capture.js — screenshot the current view as a PNG (inapp-support-plan.md §4/§6).
//
// LADDER (each rung degrades gracefully): clone the DOM → snapshot any live <canvas> into
// <img> (foreignObject can't see canvas pixels — the "canvas swap") → serialize to an SVG
// <foreignObject> → rasterize via Image → <canvas> → PNG data URL. If ANY rung fails (CSP,
// cross-origin taint, oversized), captureViewport resolves to null and the widget offers
// "send without a screenshot" — capture is never required to file a report.
//
// Only the flattened PNG is ever produced here; the widget sends the ANNOTATED pixels, never
// a separate original. Dual export (window.TTSupportCapture; Node import is a no-op stub).
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTSupportCapture = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_DIM = 2000; // cap the raster to keep payloads and memory bounded

  function supported() {
    return typeof document !== 'undefined' && typeof XMLSerializer !== 'undefined'
      && typeof Image !== 'undefined' && !!document.createElement('canvas').getContext;
  }

  // Replace live <canvas> nodes in the clone with an <img> of their current pixels, since
  // foreignObject rasterization does not capture canvas contents. Best-effort per node.
  function swapCanvases(srcRoot, cloneRoot) {
    const srcCanvases = srcRoot.querySelectorAll('canvas');
    const cloneCanvases = cloneRoot.querySelectorAll('canvas');
    for (let i = 0; i < cloneCanvases.length; i++) {
      const src = srcCanvases[i];
      const dst = cloneCanvases[i];
      if (!src || !dst) continue;
      try {
        const img = document.createElement('img');
        img.src = src.toDataURL('image/png'); // throws if the canvas is tainted → skip
        img.width = src.width; img.height = src.height;
        img.setAttribute('style', dst.getAttribute('style') || '');
        dst.parentNode.replaceChild(img, dst);
      } catch (e) { /* tainted/failed canvas — leave it blank in the shot */ }
    }
  }

  // Prune from the clone anything that is NOT visible in the LIVE DOM (#17). External CSS is
  // not applied inside an SVG <foreignObject>, so class-driven hides like `.hidden{display:none}`
  // (how the SPA hides inactive tabs) would otherwise all render — the report screenshot then
  // shows every tab's content instead of the active one. We read getComputedStyle on the LIVE
  // node (where the real cascade applies) and drop/hide the matching clone node. cloneNode(true)
  // + the 1:1 canvas swap keep the two node lists index-aligned; if they ever diverge we bail
  // (leaving the clone untouched) rather than risk removing the wrong node.
  function pruneInvisible(srcRoot, cloneRoot) {
    if (typeof getComputedStyle !== 'function') return;
    const src = srcRoot.querySelectorAll('*');
    const clone = cloneRoot.querySelectorAll('*');
    if (src.length !== clone.length) return; // alignment lost — don't risk it, capture as-is
    const toRemove = [];
    for (let i = 0; i < src.length; i++) {
      let cs;
      try { cs = getComputedStyle(src[i]); } catch (e) { continue; }
      if (cs.display === 'none') toRemove.push(clone[i]);
      else if (cs.visibility === 'hidden') clone[i].style.visibility = 'hidden';
    }
    for (const el of toRemove) { if (el.parentNode) el.parentNode.removeChild(el); }
  }

  // Rasterize an XHTML string of width×height into a PNG data URL via SVG foreignObject.
  function rasterize(xhtml, width, height) {
    return new Promise((resolve) => {
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png')); // throws if tainted → caught below
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // captureViewport(target?) → Promise<{ dataUrl, width, height } | null>
  async function captureViewport(target) {
    if (!supported()) return null;
    try {
      const el = target || document.body;
      const rect = el.getBoundingClientRect();
      let width = Math.min(Math.round(rect.width) || window.innerWidth, MAX_DIM);
      let height = Math.min(Math.round(rect.height) || window.innerHeight, MAX_DIM);
      if (!width || !height) return null;

      const clone = el.cloneNode(true);
      swapCanvases(el, clone);
      pruneInvisible(el, clone); // #17: drop tabs/sections hidden in the live DOM but not in the style-less SVG
      // Wrap the clone in a namespaced div so it's valid XHTML inside foreignObject.
      const wrapper = document.createElement('div');
      wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrapper.appendChild(clone);
      const xhtml = new XMLSerializer().serializeToString(wrapper);

      const dataUrl = await rasterize(xhtml, width, height);
      if (!dataUrl) return null;
      return { dataUrl, width, height };
    } catch (e) {
      return null; // any failure → no screenshot; caller falls back cleanly
    }
  }

  return { captureViewport, supported };
});
