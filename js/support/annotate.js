// annotate.js — annotate a captured screenshot before sending (inapp-support-plan.md §4).
//
// Tools: pen (freehand), arrow, box, text-with-pointer, and a REDACTION rect that paints an
// OPAQUE block over sensitive content. Everything is flattened onto ONE canvas, so the PNG
// the widget sends contains only the annotated pixels — a redaction genuinely destroys the
// pixels underneath it (not a removable overlay). "Only the flattened annotated pixels are
// sent — never the original capture" (§4).
//
// a11y (§4): the pointer tools have no keyboard equivalent, so the annotator is optional —
// the widget always lets the user skip it and send the plain screenshot (or none). Undo/Clear
// are buttons the widget can wire to keys.
//
// Dual export (window.TTSupportAnnotate; Node import is inert — no canvas there).
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TTSupportAnnotate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INK = '#c62828';       // annotation ink (red — reads over most content)
  const REDACT_FILL = '#111';  // opaque redaction block

  // createAnnotator(container, baseDataUrl, opts?) -> annotator handle
  function createAnnotator(container, baseDataUrl, opts) {
    opts = opts || {};
    const doc = container.ownerDocument;
    const canvas = doc.createElement('canvas');
    canvas.className = 'support-annotate-canvas';
    const ctx = canvas.getContext('2d');
    container.appendChild(canvas);

    const shapes = [];       // committed annotations (for undo + re-render)
    let tool = 'pen';
    let base = null;         // Image
    let drawing = null;      // in-progress shape

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
      for (const s of shapes) drawShape(s);
      if (drawing) drawShape(drawing);
    }

    function drawShape(s) {
      ctx.save();
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = INK; ctx.fillStyle = INK;
      if (s.type === 'pen') {
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      } else if (s.type === 'box') {
        ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      } else if (s.type === 'redact') {
        ctx.fillStyle = REDACT_FILL;
        ctx.fillRect(Math.min(s.x0, s.x1), Math.min(s.y0, s.y1), Math.abs(s.x1 - s.x0), Math.abs(s.y1 - s.y0));
      } else if (s.type === 'arrow') {
        drawArrow(s.x0, s.y0, s.x1, s.y1);
      } else if (s.type === 'text') {
        drawTextPointer(s);
      }
      ctx.restore();
    }

    function drawArrow(x0, y0, x1, y1) {
      const head = 12, ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang - Math.PI / 6), y1 - head * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(x1 - head * Math.cos(ang + Math.PI / 6), y1 - head * Math.sin(ang + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }

    function drawTextPointer(s) {
      ctx.font = '16px sans-serif';
      const padding = 4;
      const w = ctx.measureText(s.text).width + padding * 2;
      const h = 22;
      // label box
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillRect(s.x, s.y - h, w, h);
      ctx.strokeStyle = INK; ctx.strokeRect(s.x, s.y - h, w, h);
      ctx.fillStyle = INK; ctx.fillText(s.text, s.x + padding, s.y - padding - 2);
      // pointer/leader line to the target point
      if (s.tx != null) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.tx, s.ty); ctx.stroke(); }
    }

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width, sy = canvas.height / r.height;
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    }

    function onDown(e) {
      e.preventDefault();
      const p = pos(e);
      if (tool === 'text') {
        const text = (typeof window !== 'undefined' && window.prompt) ? window.prompt('Label text:') : '';
        if (text) { shapes.push({ type: 'text', x: p.x, y: p.y, tx: p.x, ty: p.y, text: String(text).slice(0, 80) }); render(); }
        return;
      }
      if (tool === 'pen') drawing = { type: 'pen', pts: [p] };
      else drawing = { type: tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      canvas.setPointerCapture && e.pointerId != null && canvas.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!drawing) return;
      const p = pos(e);
      if (drawing.type === 'pen') drawing.pts.push(p);
      else { drawing.x1 = p.x; drawing.y1 = p.y; }
      render();
    }
    function onUp() {
      if (!drawing) return;
      shapes.push(drawing); drawing = null; render();
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);

    // Load the base image, size the canvas to it.
    const img = new Image();
    img.onload = () => {
      base = img;
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      render();
      if (opts.onReady) opts.onReady();
    };
    img.src = baseDataUrl;

    return {
      canvas,
      setTool(t) { if (['pen', 'arrow', 'box', 'text', 'redact'].includes(t)) tool = t; },
      getTool() { return tool; },
      undo() { shapes.pop(); render(); },
      clear() { shapes.length = 0; render(); },
      toPNG() { render(); return canvas.toDataURL('image/png'); }, // flattened: base + annotations
      destroy() {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onUp);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  return { createAnnotator, TOOLS: ['pen', 'arrow', 'box', 'text', 'redact'] };
});
