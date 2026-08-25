/**
 * SlideStage — 슬라이드를 라이브 DOM으로 렌더하고, 강조 효과를 실제 텍스트에 적용한다.
 *
 * 기존 방식은 슬라이드를 PNG로 만든 뒤 Vision이 추측한 좌표(x_pct 등)에 사각형을
 * 그렸기 때문에 형광펜이 문장에서 어긋났다. 이 모듈은 슬라이드 HTML을 그대로
 * 주입하고 `data-ref`가 붙은 요소에 클래스를 더하는 방식이라 **좌표가 아예 없다**.
 * 폰트나 줄바꿈이 달라져도 강조는 항상 글자에 정확히 붙는다.
 *
 * 강조는 인라인 span(.hl-ink)에 배경을 그리므로 줄바꿈된 문장도
 * 줄마다 자연스럽게 칠해진다 (실제 형광펜처럼).
 */
const SlideStage = (() => {
  let _host = null;      // 바깥 컨테이너 (크기 기준)
  let _scaler = null;    // transform: scale 적용 대상
  let _stage = null;     // 슬라이드 HTML이 들어가는 고정 크기 박스
  let _w = 1920, _h = 1080;
  let _cssHref = null;
  let _ro = null;

  const EFFECT_CLASS = {
    highlighter: "hl-marker",
    underline:   "hl-underline",
    check:       "hl-check",
  };

  function _injectRuntimeCss() {
    if (document.getElementById("slide-stage-css")) return;
    const st = document.createElement("style");
    st.id = "slide-stage-css";
    st.textContent = `
.slide-scaler { transform-origin: top left; position: absolute; top: 0; left: 0; }
.slide-stage {
  position: relative; overflow: hidden; background: #fff;
}
/* 강조 대상 인라인 래퍼 — 배경이 줄 단위로 끊겨 실제 형광펜처럼 보인다 */
.hl-ink {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  background-repeat: no-repeat;
  border-radius: 2px;
  padding: 0.04em 0.06em;
  margin: -0.04em -0.06em;
  transition: background-size .38s cubic-bezier(.22,.61,.36,1);
  background-size: 0% 100%;
}
.hl-ink.hl-marker {
  background-image: linear-gradient(rgba(255,225,60,.62), rgba(255,225,60,.62));
  background-position: 0 0;
}
.hl-ink.hl-underline {
  background-image: linear-gradient(#f59e0b, #f59e0b);
  background-position: 0 100%;
  background-size: 0% 0.14em;
  border-radius: 0;
}
.hl-ink.on               { background-size: 100% 100%; }
.hl-ink.hl-underline.on  { background-size: 100% 0.14em; }
/* 체크 심볼 */
.hl-check::after {
  content: "✓";
  display: inline-block;
  margin-left: .35em;
  color: #16a34a;
  font-weight: 900;
  transform: scale(0);
  transition: transform .3s cubic-bezier(.34,1.56,.64,1);
}
.hl-check.on::after { transform: scale(1); }
/* SVG 도형 강조 — 텍스트가 아니라 그림의 한 부분을 짚을 때 */
.dg-part { transition: opacity .3s ease; }
.dg-dim .dg-part { opacity: .28; }
.dg-dim .dg-part.hl-shape { opacity: 1; }
.hl-shape { filter: drop-shadow(0 0 10px rgba(14,165,233,.55)); }
.hl-shape rect, .hl-shape ellipse, .hl-shape circle, .hl-shape path {
  stroke-width: 6;
}
.dg-figure.hl-shape { filter: drop-shadow(0 0 14px rgba(14,165,233,.5)); }
`;
    document.head.appendChild(st);
  }

  /** 슬라이드 공용 스타일시트를 로드 (한 번만) */
  function loadCss(href) {
    if (!href || _cssHref === href) return;
    const prev = document.getElementById("slide-css");
    if (prev) prev.remove();
    const link = document.createElement("link");
    link.id = "slide-css";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
    _cssHref = href;
  }

  /**
   * @param hostEl  슬라이드가 들어갈 컨테이너 (position:relative 권장)
   * @param size    { w, h } 논리 슬라이드 크기
   */
  function init(hostEl, size) {
    _injectRuntimeCss();
    _host = hostEl;
    if (size && size.w && size.h) { _w = size.w; _h = size.h; }

    _host.innerHTML = "";
    _scaler = document.createElement("div");
    _scaler.className = "slide-scaler";
    _stage = document.createElement("div");
    _stage.className = "slide-stage";
    _stage.style.width  = _w + "px";
    _stage.style.height = _h + "px";
    _scaler.appendChild(_stage);
    _host.appendChild(_scaler);

    if (_ro) _ro.disconnect();
    _ro = new ResizeObserver(() => resize());
    _ro.observe(_host);
    resize();
  }

  function setSize(w, h) {
    if (!w || !h) return;
    _w = w; _h = h;
    if (_stage) { _stage.style.width = w + "px"; _stage.style.height = h + "px"; }
    resize();
  }

  /** 컨테이너에 맞춰 스케일 + 가운데 정렬 */
  function resize() {
    if (!_host || !_scaler) return;
    const cw = _host.clientWidth, ch = _host.clientHeight;
    if (!cw || !ch) return;
    const k = Math.min(cw / _w, ch / _h);
    _scaler.style.transform = `translate(${(cw - _w * k) / 2}px, ${(ch - _h * k) / 2}px) scale(${k})`;
  }

  /** 슬라이드 HTML 프래그먼트를 불러와 렌더 */
  async function show(htmlUrl) {
    if (!_stage) return false;
    try {
      const res = await fetch(htmlUrl, { cache: "no-cache" });
      if (!res.ok) return false;
      _stage.innerHTML = await res.text();
      _wrapTargets();
      resize();
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * data-ref 요소의 텍스트를 인라인 span으로 감싼다.
   * 배경이 블록 전체가 아니라 **글자 줄에만** 칠해지도록 하기 위함.
   */
  function _wrapTargets() {
    _stage.querySelectorAll("[data-ref]").forEach((el) => {
      // SVG 도형은 텍스트 래핑 대상이 아니다 (도형 자체를 강조한다)
      if (el.ownerSVGElement || el.tagName.toLowerCase() === "svg") return;
      if (el.classList.contains("dg-figure")) return;
      if (el.querySelector(".hl-ink")) return;
      const span = document.createElement("span");
      span.className = "hl-ink";
      while (el.firstChild) span.appendChild(el.firstChild);
      el.appendChild(span);
    });
  }

  /** 현재 강조 해제 */
  function clear() {
    if (!_stage) return;
    _stage.querySelectorAll(".hl-ink").forEach((el) => {
      el.classList.remove("on", "hl-marker", "hl-underline", "hl-check");
    });
    _stage.querySelectorAll(".hl-shape").forEach((el) => el.classList.remove("hl-shape"));
    _stage.querySelectorAll(".dg-dim").forEach((el) => el.classList.remove("dg-dim"));
  }

  /**
   * 특정 요소를 강조한다.
   * @param ref     data-ref 값 (예: "b2")
   * @param effect  "highlighter" | "underline" | "check" | "none"
   */
  function highlight(ref, effect) {
    clear();
    if (!_stage || !ref || effect === "none") return false;
    const host = _stage.querySelector(`[data-ref="${CSS.escape(ref)}"]`);
    if (!host) return false;
    // 다이어그램 도형이면 배경 대신 도형을 부각하고 나머지를 흐린다
    const ink = host.querySelector(".hl-ink");
    if (!ink) {
      host.classList.add("hl-shape");
      const svgRoot = host.ownerSVGElement || host.closest(".dg-wrap");
      if (svgRoot) svgRoot.classList.add("dg-dim");
      return true;
    }
    const cls = EFFECT_CLASS[effect] || EFFECT_CLASS.highlighter;
    ink.classList.add(cls);
    // 다음 프레임에 .on을 붙여 전환 애니메이션이 실제로 재생되게 한다
    requestAnimationFrame(() => requestAnimationFrame(() => ink.classList.add("on")));
    return true;
  }

  /** 현재 스테이지 DOM */
  function stageEl() { return _stage; }
  function size()    { return { w: _w, h: _h }; }

  return { init, setSize, loadCss, show, highlight, clear, resize, stageEl, size };
})();
