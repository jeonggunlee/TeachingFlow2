/**
 * overlay.js — Canvas 강조 효과 모듈 (createLecture에서 그대로 복사)
 */
const Overlay = (() => {
  let _img    = null;
  let _canvas = null;
  let _ctx    = null;
  let _raf    = null;
  let _drawn  = [];
  let _anim   = null;
  let _natW   = 0;
  let _natH   = 0;

  function init(imgEl, canvasEl) {
    _img    = imgEl;
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext("2d");
    _syncSize();
  }

  function setNaturalSize(w, h) {
    _natW = w;
    _natH = h;
  }

  function _syncSize() {
    if (!_canvas) return;
    const p = _canvas.parentElement;
    const w = (p ? p.clientWidth  : _canvas.offsetWidth)  || 800;
    const h = (p ? p.clientHeight : _canvas.offsetHeight) || 600;
    if (_canvas.width  !== w) _canvas.width  = w;
    if (_canvas.height !== h) _canvas.height = h;
  }

  function resize() {
    _syncSize();
    _redrawAll();
  }

  function trigger(seg, effectType) {
    if (!seg || !seg.highlight) return;
    const type = effectType === "none"
      ? "none"
      : (effectType || seg.effect || "highlighter");

    _cancelAnim();
    _drawn = [];
    if (!_ctx) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    if (type === "none") return;

    _anim = { type, h: seg.highlight, segId: seg.id, start: null };
    _raf  = requestAnimationFrame(_step);
  }

  function _step(ts) {
    if (!_anim) return;
    if (_anim.start === null) {
      _syncSize();
      _anim.start = ts;
    }

    const dur  = _anim.type === "check" ? 400 : 350;
    const t    = Math.min((ts - _anim.start) / dur, 1);
    const rect = _toPixels(_anim.h, _canvas.width, _canvas.height);

    _redrawAll();
    if (rect.w > 0 && rect.h > 0) _drawEffect(_ctx, _anim.type, rect, t);

    if (t < 1) {
      _raf = requestAnimationFrame(_step);
    } else {
      _drawn.push({ type: _anim.type, h: _anim.h, segId: _anim.segId });
      _anim = null;
    }
  }

  function _redrawAll() {
    if (!_ctx) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    for (const d of _drawn) {
      const r = _toPixels(d.h, _canvas.width, _canvas.height);
      if (r.w > 0 && r.h > 0) _drawEffect(_ctx, d.type, r, 1);
    }
  }

  function _toPixels(h, cw, ch) {
    const nw = _natW || (_img && _img.naturalWidth)  || 0;
    const nh = _natH || (_img && _img.naturalHeight) || 0;
    if (!nw || !nh) return { x: 0, y: 0, w: 0, h: 0 };

    const scale = Math.min(cw / nw, ch / nh);
    const rw = nw * scale;
    const rh = nh * scale;
    const rx = (cw - rw) / 2;
    const ry = (ch - rh) / 2;

    return {
      x: rx + (h.x_pct / 100) * rw,
      y: ry + (h.y_pct / 100) * rh,
      w:      (h.w_pct / 100) * rw,
      h:      (h.h_pct / 100) * rh,
    };
  }

  function _drawEffect(ctx, type, rect, t) {
    if (type === "highlighter") _drawHighlighter(ctx, rect, t);
    else if (type === "check")  _drawCheck(ctx, rect, t);
  }

  function _drawHighlighter(ctx, rect, t) {
    ctx.fillStyle = "rgba(255, 235, 59, 0.45)";
    ctx.fillRect(rect.x, rect.y, rect.w * _easeOut(t), rect.h);
  }

  function _drawCheck(ctx, rect, t) {
    const size = Math.min(rect.h * 0.65, rect.w * 0.18, 36);
    const pad  = size * 0.2;
    const cx   = rect.x + rect.w - pad - size * 0.5;
    const cy   = rect.y + pad + size * 0.5;

    const p1 = { x: cx - size * 0.42, y: cy + size * 0.02 };
    const p2 = { x: cx - size * 0.08, y: cy + size * 0.40 };
    const p3 = { x: cx + size * 0.44, y: cy - size * 0.36 };

    ctx.save();
    ctx.fillStyle = "rgba(22, 163, 74, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = Math.max(2.5, size * 0.14);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.beginPath();

    if (t <= 0.4) {
      const s = t / 0.4;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x + (p2.x - p1.x) * s, p1.y + (p2.y - p1.y) * s);
    } else {
      const s = (t - 0.4) / 0.6;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x + (p3.x - p2.x) * s, p2.y + (p3.y - p2.y) * s);
    }
    ctx.stroke();
    ctx.restore();
  }

  function clear() {
    _cancelAnim();
    _drawn = [];
    _anim  = null;
    if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function _cancelAnim() {
    if (_raf !== null) { cancelAnimationFrame(_raf); _raf = null; }
    _anim = null;
  }

  function _easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  return { init, setNaturalSize, trigger, clear, resize };
})();
