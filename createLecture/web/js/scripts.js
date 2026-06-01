// ── 상태 ─────────────────────────────────────────────────────────────
const PORTAL_URL = `${location.protocol}//${location.hostname}:8003`;
const params     = new URLSearchParams(location.search);
const lectureId  = params.get("id") || "";
let slides      = [];   // live state
let currentIdx  = 0;
let dirty       = false;

// ── 세그먼트 색상 팔레트 ──────────────────────────────────────────────
const SEG_COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899','#06b6d4'];

// ── 모달 드래그 상태 ──────────────────────────────────────────────────
let modalCanvas  = null;
let modalCtx     = null;
let modalSegIdx  = null;   // 현재 모달에서 편집 중인 세그먼트 인덱스
let isDragging   = false;
let dragStart    = null;   // {px,py} 캔버스 픽셀 좌표
let dragEnd      = null;

// ── DOM refs ─────────────────────────────────────────────────────────
const lectureInfo = document.getElementById("lecture-info");
const cqiBadge    = document.getElementById("cqi-badge");
const slideThumbs = document.getElementById("slide-thumbs");
const slideEditor = document.getElementById("slide-editor");
const btnSave     = document.getElementById("btn-save");
const btnRebuild  = document.getElementById("btn-rebuild");
const btnTts      = document.getElementById("btn-tts");
const saveStatus  = document.getElementById("save-status");
const ttsProgress = document.getElementById("tts-progress");
const ttsLabel    = document.getElementById("tts-label");
const ttsFill     = document.getElementById("tts-fill");
const ttsPct      = document.getElementById("tts-pct");
const donePanel   = document.getElementById("done-panel");
const doneMsg     = document.getElementById("done-msg");
const btnGoPlayer = document.getElementById("btn-go-player");
const btnKeepEdit = document.getElementById("btn-keep-edit");

// 모달 DOM refs
const drawModal       = document.getElementById("draw-modal");
const drawModalBg     = document.getElementById("draw-modal-backdrop");
const drawModalTitle  = document.getElementById("draw-modal-title");
const drawModalClose  = document.getElementById("draw-modal-close");
const drawModalImg    = document.getElementById("draw-modal-img");
const drawModalWrap   = document.getElementById("draw-modal-canvas-wrap");

// ── 초기 로드 ────────────────────────────────────────────────────────
if (!lectureId) {
  slideEditor.innerHTML = '<div class="editor-placeholder error-text">강의 ID가 없습니다.</div>';
} else {
  loadScripts();
}

async function loadScripts() {
  try {
    const res  = await fetch(`/api/lectures/${lectureId}/scripts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    slides = data.slides || [];
    const contextParts = [];
    if (data.course) contextParts.push(data.course);
    if (data.week)   contextParts.push(`${data.week}주차`);
    contextParts.push(`슬라이드 ${slides.length}장`);
    lectureInfo.textContent = contextParts.join("  |  ");
    if (data.cqi && data.cqi.trim()) cqiBadge.hidden = false;

    // 포털 복귀 버튼: from 파라미터 있으면 해당 URL, 없으면 포털 기본 주소
    const portalBtn = document.getElementById("btn-portal-back");
    if (portalBtn) {
      portalBtn.href = params.get("from") || PORTAL_URL;
    }

    // "← AI 강의 생성" 복귀 버튼: 업로드 페이지는 from 파라미터가 없으면 포털로
    // 리디렉션하므로, 현재 컨텍스트(from/course/week)를 그대로 전달해 직접 진입을
    // 가능하게 한다.
    const backCreateBtn = document.getElementById("btn-back-create");
    if (backCreateBtn) {
      const qs = new URLSearchParams();
      qs.set("from", params.get("from") || PORTAL_URL);
      const course = params.get("course") || data.course || "";
      const week   = params.get("week")   || data.week   || "";
      const wt     = params.get("week_title") || "";
      if (course) qs.set("course", course);
      if (week)   qs.set("week", week);
      if (wt)     qs.set("week_title", wt);
      backCreateBtn.href = `/?${qs.toString()}`;
    }
    applyLectureJsonState(data.has_lecture_json);
    buildThumbs();
    renderSlide(0);
  } catch (err) {
    slideEditor.innerHTML = `<div class="editor-placeholder error-text">로드 오류: ${err.message}</div>`;
  }
}

// ── 슬라이드 썸네일 목록 ─────────────────────────────────────────────
function buildThumbs() {
  slideThumbs.innerHTML = "";
  slides.forEach((sl, i) => {
    const item = document.createElement("div");
    item.className = "slide-thumb-item" + (i === currentIdx ? " active" : "");
    item.dataset.idx = i;
    item.innerHTML = `
      <img src="/static/lectures/${lectureId}/${sl.image}" alt="슬라이드 ${sl.index}" loading="lazy" />
      <span class="thumb-num">${sl.index}</span>`;
    item.addEventListener("click", () => { saveCurrentToState(); renderSlide(i); });
    slideThumbs.appendChild(item);
  });
}

function updateThumbActive() {
  slideThumbs.querySelectorAll(".slide-thumb-item").forEach((el, i) =>
    el.classList.toggle("active", i === currentIdx));
}

// ── 슬라이드 에디터 렌더 ──────────────────────────────────────────────
function renderSlide(idx) {
  currentIdx = idx;
  updateThumbActive();
  const sl = slides[idx];
  if (!sl) return;

  slideEditor.innerHTML = `
    <div class="slide-header">
      <label class="field-label">슬라이드 ${sl.index} 제목</label>
      <input id="slide-title" class="title-input" type="text" value="${esc(sl.title)}" />
    </div>
    <div class="slide-preview-wrap" id="slide-preview-wrap">
      <canvas id="preview-canvas" class="preview-canvas"></canvas>
      <img id="preview-img" src="/static/lectures/${lectureId}/${sl.image}"
           alt="슬라이드 ${sl.index}" class="preview-img" />
    </div>
    <div class="segments-section">
      <div class="segments-header">
        <span class="field-label">세그먼트 (${sl.segments.length}개)</span>
        <button class="btn-add-seg" id="btn-add-seg">+ 세그먼트 추가</button>
      </div>
      <div id="segments-list"></div>
    </div>
    <div class="quiz-section" id="quiz-section"></div>`;

  // 미리보기 캔버스 초기화
  const previewImg    = document.getElementById("preview-img");
  const previewCanvas = document.getElementById("preview-canvas");
  const previewWrap   = document.getElementById("slide-preview-wrap");

  function initPreview() {
    previewCanvas.width  = previewWrap.clientWidth;
    previewCanvas.height = previewWrap.clientHeight;
    drawPreviewHighlights();
  }
  previewImg.addEventListener("load", initPreview);
  if (previewImg.complete && previewImg.naturalWidth) {
    requestAnimationFrame(initPreview);
  }

  // 미리보기 클릭 → 해당 세그먼트 강조
  previewCanvas.addEventListener("click", (e) => {
    const b = getPreviewBounds(previewCanvas, previewImg);
    if (!b) return;
    const pos = canvasPos(e, previewCanvas);
    const sl  = slides[currentIdx];
    sl.segments.forEach((seg, si) => {
      const r = pctToRect(seg.highlight, b);
      if (r && pos.px >= r.x && pos.px <= r.x + r.w &&
               pos.py >= r.y && pos.py <= r.y + r.h) {
        openDrawModal(si);
      }
    });
  });
  previewCanvas.title = "클릭하여 세그먼트 선택, 영역 지정 버튼으로 직접 편집";
  previewCanvas.style.cursor = "pointer";

  renderSegments(sl.segments);

  document.getElementById("btn-add-seg").addEventListener("click", () => {
    const cur = slides[currentIdx];
    insertSegmentAt(cur.segments.length);
  });

  renderQuizSection(sl);
}

// 새 세그먼트를 지정 위치에 삽입 (insertPos = 0..length)
function insertSegmentAt(insertPos) {
  saveCurrentToState();
  const cur  = slides[currentIdx];
  const maxN = cur.segments.reduce((m, s) => {
    const n = parseInt(s.id?.split("_").pop() || "0", 10);
    return Math.max(m, n);
  }, 0);
  cur.segments.splice(insertPos, 0, {
    id: `seg_${maxN + 1}`, script: "", keyword: "",
    highlight: { x_pct: 10, y_pct: 10, w_pct: 80, h_pct: 80 },
    effect: "highlighter",
  });
  setDirty();
  renderSlide(currentIdx);
}

// 두 세그먼트의 위치 교환 (↑/↓ 버튼용)
function moveSegment(fromIdx, toIdx) {
  const cur = slides[currentIdx];
  if (toIdx < 0 || toIdx >= cur.segments.length) return;
  saveCurrentToState();
  [cur.segments[fromIdx], cur.segments[toIdx]] = [cur.segments[toIdx], cur.segments[fromIdx]];
  setDirty();
  renderSlide(currentIdx);
}

// 인라인 "+ 여기에 추가" 삽입 슬롯 생성
function makeInsertZone(insertPos, total) {
  const zone = document.createElement("button");
  zone.type      = "button";
  zone.className = "seg-insert-zone";
  zone.title     = `${insertPos + 1}번 자리에 새 세그먼트 삽입`;
  zone.innerHTML = `<span class="seg-insert-line"></span>` +
                   `<span class="seg-insert-label">＋ 여기에 추가</span>` +
                   `<span class="seg-insert-line"></span>`;
  zone.addEventListener("click", () => insertSegmentAt(insertPos));
  return zone;
}

function renderSegments(segs) {
  const list = document.getElementById("segments-list");
  list.innerHTML = "";
  segs.forEach((seg, si) => {
    // 카드 앞에 삽입 슬롯 (위치 si)
    list.appendChild(makeInsertZone(si, segs.length));

    const color   = SEG_COLORS[si % SEG_COLORS.length];
    const h       = seg.highlight;
    const hlOn    = hasHighlight(h);
    const isFirst = si === 0;
    const isLast  = si === segs.length - 1;
    const card    = document.createElement("div");
    card.className  = "segment-card" + (hlOn ? "" : " segment-card-no-hl");
    card.dataset.si = si;
    card.innerHTML  = `
      <div class="seg-header">
        <span class="seg-badge" style="background:${color}">${si + 1}</span>
        <div class="seg-move">
          <button class="btn-seg-move" data-dir="up"   ${isFirst ? "disabled" : ""}
                  title="위로 이동">↑</button>
          <button class="btn-seg-move" data-dir="down" ${isLast  ? "disabled" : ""}
                  title="아래로 이동">↓</button>
        </div>
        <div class="seg-keyword-wrap">
          <label class="field-label-sm">키워드</label>
          <input class="keyword-input" type="text" value="${esc(seg.keyword || "")}" data-field="keyword" />
        </div>
        <label class="seg-hl-toggle" title="강조 영역 사용 여부 — 끄면 재생 시 형광펜·체크 효과가 나타나지 않습니다">
          <input type="checkbox" class="hl-toggle-input" ${hlOn ? "checked" : ""} />
          <span>강조 영역</span>
        </label>
        <button class="btn-draw-hl" data-si="${si}" style="--seg-color:${color}"
                ${hlOn ? "" : "disabled"}
                title="슬라이드에서 마우스 드래그로 강조 영역 직접 지정">
          ✎ 영역 지정
        </button>
        <button class="btn-del-seg" title="세그먼트 삭제">✕</button>
      </div>
      <label class="field-label-sm">스크립트</label>
      <textarea class="script-textarea" rows="4" data-field="script">${esc(seg.script || "")}</textarea>
      <div class="hl-info" id="hl-info-${si}">
        <span class="hl-dot" style="background:${hlOn ? color : '#475569'}"></span>
        <span class="hl-coords">${fmtHl(h)}</span>
      </div>`;

    card.querySelector(".btn-draw-hl").addEventListener("click", () => openDrawModal(si));
    card.querySelector(".btn-del-seg").addEventListener("click", () => {
      saveCurrentToState();
      slides[currentIdx].segments.splice(si, 1);
      setDirty();
      renderSlide(currentIdx);
    });
    card.querySelectorAll(".btn-seg-move").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.dir;
        moveSegment(si, dir === "up" ? si - 1 : si + 1);
      });
    });
    card.querySelector(".hl-toggle-input").addEventListener("change", (e) => {
      saveCurrentToState();
      const cur = slides[currentIdx];
      if (e.target.checked) {
        // 켜기 — 기존 값이 유효하지 않으면 기본값 적용
        if (!hasHighlight(cur.segments[si].highlight)) {
          cur.segments[si].highlight = defaultHighlight();
        }
      } else {
        // 끄기 — null로 설정 (lecture_builder가 정규화하여 lecture.json에 null 저장)
        cur.segments[si].highlight = null;
      }
      setDirty();
      renderSlide(currentIdx);
    });

    list.appendChild(card);
  });
}

function fmtHl(h) {
  if (!hasHighlight(h)) return "강조 영역 사용 안 함";
  return `X ${h.x_pct}%  Y ${h.y_pct}%  W ${h.w_pct}%  H ${h.h_pct}%`;
}

// 세그먼트에 유효한 강조 영역이 설정되어 있는지 여부 (null/누락/0 크기는 false)
function hasHighlight(h) {
  return !!(h && typeof h === "object"
            && typeof h.w_pct === "number" && h.w_pct > 0
            && typeof h.h_pct === "number" && h.h_pct > 0);
}

// 기본 강조 영역 (사용자가 켜기만 했을 때 초기값)
function defaultHighlight() {
  return { x_pct: 10, y_pct: 10, w_pct: 80, h_pct: 80 };
}

// ── 미리보기 캔버스 (인라인 하이라이트 표시) ──────────────────────────
function getPreviewBounds(canvas, imgEl) {
  if (!canvas || !imgEl || !imgEl.naturalWidth) return null;
  const natW = imgEl.naturalWidth, natH = imgEl.naturalHeight;
  const cW   = canvas.width,       cH   = canvas.height;
  const scale = Math.min(cW / natW, cH / natH);
  const imgW  = natW * scale, imgH = natH * scale;
  return { imgX: (cW - imgW) / 2, imgY: (cH - imgH) / 2, imgW, imgH };
}

function drawPreviewHighlights() {
  const canvas  = document.getElementById("preview-canvas");
  const imgEl   = document.getElementById("preview-img");
  if (!canvas || !imgEl) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const b  = getPreviewBounds(canvas, imgEl);
  if (!b) return;
  const sl = slides[currentIdx];
  if (!sl) return;

  sl.segments.forEach((seg, si) => {
    const r = pctToRect(seg.highlight, b);
    if (!r) return;
    const hex = SEG_COLORS[si % SEG_COLORS.length];
    ctx.fillStyle   = hexA(hex, 0.22);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = hex;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    // 번호 뱃지
    ctx.fillStyle = hex;
    ctx.fillRect(r.x, r.y, 18, 15);
    ctx.fillStyle     = "#fff";
    ctx.font          = "bold 10px system-ui,sans-serif";
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillText(si + 1, r.x + 9, r.y + 8);
    ctx.textAlign     = "left";
    ctx.textBaseline  = "alphabetic";
  });
}

// ── 강조 영역 지정 모달 ───────────────────────────────────────────────
function openDrawModal(si) {
  saveCurrentToState();
  modalSegIdx = si;
  const sl    = slides[currentIdx];
  const color = SEG_COLORS[si % SEG_COLORS.length];

  drawModalTitle.innerHTML =
    `<span class="modal-seg-badge" style="background:${color}">${si + 1}</span>` +
    `세그먼트 ${si + 1} — 강조 영역 지정`;

  const imgSrc = `/static/lectures/${lectureId}/${sl.image}`;
  drawModalImg.src = imgSrc;
  drawModal.hidden = false;
  document.body.style.overflow = "hidden";

  // 캔버스 재생성
  const oldCanvas = drawModalWrap.querySelector("canvas");
  if (oldCanvas) oldCanvas.remove();
  modalCanvas = document.createElement("canvas");
  modalCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;";
  drawModalWrap.style.position = "relative";
  drawModalWrap.appendChild(modalCanvas);
  modalCtx = modalCanvas.getContext("2d");

  isDragging = false;
  dragStart  = dragEnd = null;

  function onImgReady() {
    requestAnimationFrame(() => {
      modalCanvas.width  = drawModalWrap.clientWidth;
      modalCanvas.height = drawModalWrap.clientHeight;
      drawModalCanvas();
    });
  }

  if (drawModalImg.complete && drawModalImg.naturalWidth) {
    onImgReady();
  } else {
    drawModalImg.onload = onImgReady;
  }

  modalCanvas.addEventListener("mousedown",  onModalDragStart);
  modalCanvas.addEventListener("mousemove",  onModalDragMove);
  modalCanvas.addEventListener("mouseup",    onModalDragEnd);
  modalCanvas.addEventListener("mouseleave", onModalDragCancel);
}

function closeDrawModal() {
  drawModal.hidden = true;
  document.body.style.overflow = "";
  isDragging = false;
  dragStart  = dragEnd = null;
  modalSegIdx = null;
}

drawModalClose.addEventListener("click", closeDrawModal);
drawModalBg.addEventListener("click", closeDrawModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !drawModal.hidden) closeDrawModal();
});

// ── 모달 캔버스 드래그 ────────────────────────────────────────────────
function getModalBounds() {
  if (!modalCanvas || !drawModalImg.naturalWidth) return null;
  const natW = drawModalImg.naturalWidth, natH = drawModalImg.naturalHeight;
  const cW   = modalCanvas.width,         cH   = modalCanvas.height;
  const scale = Math.min(cW / natW, cH / natH);
  const imgW  = natW * scale, imgH = natH * scale;
  return { imgX: (cW - imgW) / 2, imgY: (cH - imgH) / 2, imgW, imgH };
}

function drawModalCanvas() {
  if (!modalCtx || !modalCanvas) return;
  modalCtx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);

  const b  = getModalBounds();
  const sl = slides[currentIdx];
  if (!b || !sl) return;

  // 다른 세그먼트들의 기존 영역 (흐리게)
  sl.segments.forEach((seg, si) => {
    if (si === modalSegIdx) return;
    const r = pctToRect(seg.highlight, b);
    if (!r) return;
    const hex = SEG_COLORS[si % SEG_COLORS.length];
    modalCtx.fillStyle   = hexA(hex, 0.15);
    modalCtx.fillRect(r.x, r.y, r.w, r.h);
    modalCtx.strokeStyle = hexA(hex, 0.5);
    modalCtx.lineWidth   = 1;
    modalCtx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    // 번호
    modalCtx.fillStyle    = hexA(hex, 0.7);
    modalCtx.fillRect(r.x, r.y, 18, 15);
    modalCtx.fillStyle    = "#fff";
    modalCtx.font         = "bold 10px system-ui,sans-serif";
    modalCtx.textAlign    = "center";
    modalCtx.textBaseline = "middle";
    modalCtx.fillText(si + 1, r.x + 9, r.y + 8);
    modalCtx.textAlign    = "left";
    modalCtx.textBaseline = "alphabetic";
  });

  // 편집 중인 세그먼트의 기존 영역 (점선)
  const editSeg = sl.segments[modalSegIdx];
  if (editSeg) {
    const r = pctToRect(editSeg.highlight, b);
    if (r) {
      const hex = SEG_COLORS[modalSegIdx % SEG_COLORS.length];
      modalCtx.strokeStyle = hexA(hex, 0.5);
      modalCtx.lineWidth   = 1.5;
      modalCtx.setLineDash([6, 3]);
      modalCtx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      modalCtx.setLineDash([]);
    }
  }

  // 드래그 중 새 영역 미리보기
  if (isDragging && dragStart && dragEnd) {
    const x   = Math.min(dragStart.px, dragEnd.px);
    const y   = Math.min(dragStart.py, dragEnd.py);
    const w   = Math.abs(dragEnd.px - dragStart.px);
    const h   = Math.abs(dragEnd.py - dragStart.py);
    const hex = SEG_COLORS[modalSegIdx % SEG_COLORS.length];

    modalCtx.fillStyle   = hexA(hex, 0.30);
    modalCtx.fillRect(x, y, w, h);
    modalCtx.strokeStyle = hex;
    modalCtx.lineWidth   = 2;
    modalCtx.setLineDash([5, 3]);
    modalCtx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    modalCtx.setLineDash([]);

    // 크기 표시
    if (w > 40 && h > 20) {
      const b2    = getModalBounds();
      const x_pct = Math.max(0, ((x - b2.imgX) / b2.imgW) * 100).toFixed(1);
      const y_pct = Math.max(0, ((y - b2.imgY) / b2.imgH) * 100).toFixed(1);
      const w_pct = Math.max(1, (w / b2.imgW) * 100).toFixed(1);
      const h_pct = Math.max(1, (h / b2.imgH) * 100).toFixed(1);
      const label = `${w_pct}% × ${h_pct}%`;
      modalCtx.font         = "12px system-ui,sans-serif";
      modalCtx.textAlign    = "center";
      modalCtx.textBaseline = "alphabetic";
      modalCtx.fillStyle    = "rgba(0,0,0,0.65)";
      const tw = modalCtx.measureText(label).width;
      modalCtx.fillRect(x + w / 2 - tw / 2 - 4, y + h / 2 - 8, tw + 8, 16);
      modalCtx.fillStyle    = "#fff";
      modalCtx.fillText(label, x + w / 2, y + h / 2 + 5);
      modalCtx.textAlign    = "left";
    }
  }
}

function onModalDragStart(e) {
  e.preventDefault();
  isDragging = true;
  dragStart  = canvasPos(e, modalCanvas);
  dragEnd    = { ...dragStart };
}

function onModalDragMove(e) {
  if (!isDragging) return;
  dragEnd = canvasPos(e, modalCanvas);
  drawModalCanvas();
}

function onModalDragEnd(e) {
  if (!isDragging) return;
  isDragging = false;

  const b = getModalBounds();
  if (!b || !dragStart || !dragEnd) { drawModalCanvas(); return; }

  const x = Math.min(dragStart.px, dragEnd.px);
  const y = Math.min(dragStart.py, dragEnd.py);
  const w = Math.abs(dragEnd.px - dragStart.px);
  const h = Math.abs(dragEnd.py - dragStart.py);
  dragStart = dragEnd = null;

  if (w < 10 || h < 10) { drawModalCanvas(); return; }  // 너무 작으면 무시

  const pct = canvasToPct(x, y, w, h, b);
  const sl  = slides[currentIdx];
  if (sl && sl.segments[modalSegIdx]) {
    sl.segments[modalSegIdx].highlight = pct;
    setDirty();
    // 인라인 좌표 텍스트 업데이트
    const infoEl = document.getElementById(`hl-info-${modalSegIdx}`);
    if (infoEl) {
      const coordEl = infoEl.querySelector(".hl-coords");
      if (coordEl) coordEl.textContent = fmtHl(pct);
    }
    // 미리보기 캔버스 업데이트
    drawPreviewHighlights();
  }

  closeDrawModal();
}

function onModalDragCancel() {
  if (!isDragging) return;
  isDragging = false;
  dragStart  = dragEnd = null;
  drawModalCanvas();
}

// ── 좌표 변환 공통 ────────────────────────────────────────────────────
function canvasPos(e, canvas) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    px: (e.clientX - rect.left) * scaleX,
    py: (e.clientY - rect.top)  * scaleY,
  };
}

function pctToRect(h, b) {
  if (!h || !b || h.w_pct <= 0 || h.h_pct <= 0) return null;
  return {
    x: b.imgX + (h.x_pct / 100) * b.imgW,
    y: b.imgY + (h.y_pct / 100) * b.imgH,
    w: (h.w_pct / 100) * b.imgW,
    h: (h.h_pct / 100) * b.imgH,
  };
}

function canvasToPct(rx, ry, rw, rh, b) {
  const x1    = Math.max(b.imgX, rx);
  const y1    = Math.max(b.imgY, ry);
  const x2    = Math.min(b.imgX + b.imgW, rx + rw);
  const y2    = Math.min(b.imgY + b.imgH, ry + rh);
  const r1    = v => Math.round(v * 10) / 10;
  const x_pct = r1(Math.max(0, ((x1 - b.imgX) / b.imgW) * 100));
  const y_pct = r1(Math.max(0, ((y1 - b.imgY) / b.imgH) * 100));
  const w_pct = r1(Math.max(1, ((x2 - x1)      / b.imgW) * 100));
  const h_pct = r1(Math.max(1, ((y2 - y1)      / b.imgH) * 100));
  return { x_pct, y_pct, w_pct, h_pct };
}

function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── 상태 동기화 ───────────────────────────────────────────────────────
function saveCurrentToState() {
  const sl = slides[currentIdx];
  if (!sl) return;
  const titleEl = document.getElementById("slide-title");
  if (titleEl) sl.title = titleEl.value;
  document.querySelectorAll(".segment-card").forEach((card) => {
    const si  = parseInt(card.dataset.si, 10);
    const seg = sl.segments[si];
    if (!seg) return;
    const sEl = card.querySelector("[data-field='script']");
    const kEl = card.querySelector("[data-field='keyword']");
    if (sEl) seg.script  = sEl.value;
    if (kEl) seg.keyword = kEl.value;
  });
  // 퀴즈 폼 → slides 상태
  captureQuizFromDom();
}

// ── 체크포인트 퀴즈 섹션 ──────────────────────────────────────────────
function isQuizFormValid(q) {
  if (!q || !q.question || !q.question.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  if (q.options.some(o => !o || !o.trim())) return false;
  if (typeof q.correct_index !== "number" ||
      q.correct_index < 0 || q.correct_index >= q.options.length) return false;
  return true;
}

function emptyQuiz() {
  return { type: "mcq", question: "", options: ["", "", "", ""], correct_index: 0, explanation: "" };
}

function renderQuizSection(sl) {
  const host = document.getElementById("quiz-section");
  if (!host) return;
  const enabled = !!sl.quiz;
  const q = sl.quiz || emptyQuiz();
  const opts = (q.options || ["", "", "", ""]).slice(0, 4);
  while (opts.length < 4) opts.push("");

  host.innerHTML = `
    <div class="quiz-header">
      <label class="quiz-toggle">
        <input type="checkbox" id="quiz-enable" ${enabled ? "checked" : ""} />
        <span class="quiz-toggle-label">체크포인트 퀴즈</span>
      </label>
      <div class="quiz-header-actions">
        <button class="btn-secondary btn-quiz-gen" id="btn-quiz-gen"
                title="이 슬라이드 스크립트를 바탕으로 AI가 4지선다 퀴즈 1개를 생성합니다">
          ✦ AI 자동 생성
        </button>
      </div>
    </div>
    <div class="quiz-body" id="quiz-body" ${enabled ? "" : "hidden"}>
      <label class="field-label-sm">질문</label>
      <textarea id="quiz-q" class="quiz-textarea" rows="2"
                placeholder="이 슬라이드 내용을 확인할 1문장 질문">${esc(q.question || "")}</textarea>
      <label class="field-label-sm">선택지 (정답을 라디오로 표시)</label>
      <div class="quiz-options">
        ${opts.map((o, i) => `
          <div class="quiz-opt">
            <input type="radio" name="quiz-correct" id="quiz-correct-${i}"
                   value="${i}" ${i === q.correct_index ? "checked" : ""} />
            <input type="text" class="quiz-opt-input" data-opt="${i}"
                   value="${esc(o)}" placeholder="선택지 ${i + 1}" />
          </div>`).join("")}
      </div>
      <label class="field-label-sm">해설 (선택)</label>
      <textarea id="quiz-explanation" class="quiz-textarea" rows="2"
                placeholder="정답을 짧게 설명">${esc(q.explanation || "")}</textarea>
      <div class="quiz-status" id="quiz-status"></div>
    </div>`;

  const enableEl = document.getElementById("quiz-enable");
  const bodyEl   = document.getElementById("quiz-body");
  enableEl.addEventListener("change", () => {
    bodyEl.hidden = !enableEl.checked;
    if (!enableEl.checked) {
      slides[currentIdx].quiz = null;
    } else if (!slides[currentIdx].quiz) {
      slides[currentIdx].quiz = emptyQuiz();
    }
    setDirty();
  });

  // 입력 변경 → setDirty
  bodyEl.querySelectorAll("textarea, input").forEach(el =>
    el.addEventListener("input",  () => setDirty()));
  bodyEl.querySelectorAll('input[name="quiz-correct"]').forEach(el =>
    el.addEventListener("change", () => setDirty()));

  document.getElementById("btn-quiz-gen").addEventListener("click", onGenerateQuiz);
}

function captureQuizFromDom() {
  const sl = slides[currentIdx];
  if (!sl) return;
  const enableEl = document.getElementById("quiz-enable");
  if (!enableEl) return;
  if (!enableEl.checked) { sl.quiz = null; return; }

  const question = (document.getElementById("quiz-q")?.value || "").trim();
  const options  = Array.from(document.querySelectorAll(".quiz-opt-input"))
                       .sort((a, b) => parseInt(a.dataset.opt) - parseInt(b.dataset.opt))
                       .map(el => el.value);
  const correctEl = document.querySelector('input[name="quiz-correct"]:checked');
  const correct_index = correctEl ? parseInt(correctEl.value, 10) : 0;
  const explanation = (document.getElementById("quiz-explanation")?.value || "").trim();

  sl.quiz = {
    type: "mcq",
    question,
    options,
    correct_index,
    explanation,
  };
}

async function onGenerateQuiz() {
  const btn = document.getElementById("btn-quiz-gen");
  const statusEl = document.getElementById("quiz-status");
  const sl = slides[currentIdx];
  if (!sl) return;
  saveCurrentToState();   // 사용자가 편집 중인 스크립트를 vision JSON에 저장해야 AI가 본다
  const ok = await save();
  if (!ok) return;

  btn.disabled = true;
  if (statusEl) {
    statusEl.textContent = "AI가 퀴즈를 작성하는 중...";
    statusEl.className   = "quiz-status quiz-status-pending";
  }
  try {
    const res = await fetch(
      `/api/lectures/${lectureId}/slides/${sl.index}/quiz/generate`,
      { method: "POST" }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || `HTTP ${res.status}`);
    }
    const draft = await res.json();
    // 토글이 꺼져있으면 자동으로 켬
    sl.quiz = draft;
    setDirty();
    renderQuizSection(sl);
    const el = document.getElementById("quiz-status");
    if (el) {
      el.textContent = "✓ 초안이 생성되었습니다. 확인 후 [저장] 하세요.";
      el.className   = "quiz-status quiz-status-ok";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `생성 실패: ${err.message}`;
      statusEl.className   = "quiz-status quiz-status-err";
    }
  } finally {
    btn.disabled = false;
  }
}

// ── lecture.json 존재 여부에 따른 UI 조정 ────────────────────────────
function applyLectureJsonState(hasJson) {
  if (hasJson) {
    btnTts.textContent  = "🔄 TTS 재생성";
    btnRebuild.hidden   = false;
  } else {
    btnTts.textContent  = "▶ TTS 음성 생성 시작";
    btnRebuild.hidden   = true;
  }
}

// ── 완료 패널 ────────────────────────────────────────────────────────
function showDonePanel(msg) {
  ttsProgress.hidden = true;
  doneMsg.textContent = msg;
  donePanel.hidden    = false;
}

btnGoPlayer.addEventListener("click", () => {
  location.href = `/player?id=${lectureId}`;
});

btnKeepEdit.addEventListener("click", () => {
  donePanel.hidden   = true;
  btnSave.disabled   = false;
  btnTts.disabled    = false;
  btnRebuild.hidden  = false;
  btnTts.textContent = "🔄 TTS 재생성";
});

// ── 강조 효과만 적용 (lecture.json 재빌드, TTS 없음) ──────────────────
btnRebuild.addEventListener("click", async () => {
  const ok = await save();
  if (!ok) return;

  btnRebuild.disabled = true;
  btnSave.disabled    = true;
  btnTts.disabled     = true;
  setSaveStatus("강조 효과 적용 중...", "");

  try {
    const res = await fetch(`/api/lectures/${lectureId}/rebuild-json`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail ?? `HTTP ${res.status}`);
    }
    showDonePanel("✓ 강조 효과가 적용되었습니다!");
  } catch (err) {
    setSaveStatus(`적용 실패: ${err.message}`, "error");
    btnRebuild.disabled = false;
    btnSave.disabled    = false;
    btnTts.disabled     = false;
  }
});

// ── 저장 ─────────────────────────────────────────────────────────────
btnSave.addEventListener("click", async () => { await save(); });

async function save() {
  saveCurrentToState();
  btnSave.disabled = true;
  setSaveStatus("저장 중...", "");
  try {
    const res = await fetch(`/api/lectures/${lectureId}/scripts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dirty = false;
    setSaveStatus("저장됨 ✓", "ok");
    return true;
  } catch (err) {
    setSaveStatus(`저장 실패: ${err.message}`, "error");
    return false;
  } finally {
    btnSave.disabled = false;
  }
}

// ── TTS 생성 ─────────────────────────────────────────────────────────
btnTts.addEventListener("click", async () => {
  const ok = await save();
  if (!ok) return;
  btnTts.disabled    = true;
  btnSave.disabled   = true;
  btnRebuild.disabled = true;
  donePanel.hidden   = true;
  ttsProgress.hidden = false;
  setTtsProgress(5, "음성 합성 준비 중...");
  try {
    const res = await fetch(`/api/lectures/${lectureId}/synthesize`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    listenTtsSSE();
  } catch (err) {
    setTtsProgress(0, `오류: ${err.message}`);
    btnTts.disabled    = false;
    btnSave.disabled   = false;
    btnRebuild.disabled = false;
  }
});

function listenTtsSSE() {
  const src = new EventSource(`/api/jobs/${lectureId}/events`);
  let terminated = false;
  const close = () => { terminated = true; src.close(); };

  src.addEventListener("step",     (e) => { const d = JSON.parse(e.data); setTtsProgress(d.progress, d.label); });
  src.addEventListener("progress", (e) => { const d = JSON.parse(e.data); setTtsProgress(d.progress, d.label); });

  src.addEventListener("done", (e) => {
    close();
    setTtsProgress(100, "음성 생성 완료");
    // 자동 이동 대신 완료 패널 표시
    showDonePanel("✓ TTS 음성 생성이 완료되었습니다!");
    btnTts.textContent  = "🔄 TTS 재생성";
    btnRebuild.hidden   = false;
    btnRebuild.disabled = false;
  });

  src.addEventListener("job_error", (e) => {
    close();
    const msg = JSON.parse(e.data).message ?? "알 수 없는 오류";
    setTtsProgress(0, `오류: ${msg}`);
    ttsLabel.style.color = "var(--error)";
    btnTts.disabled    = false;
    btnSave.disabled   = false;
    btnRebuild.disabled = false;
  });

  src.onerror = () => {
    if (terminated) return;
    close();
    setTtsProgress(0, "서버 연결 오류");
    btnTts.disabled    = false;
    btnSave.disabled   = false;
    btnRebuild.disabled = false;
  };
}

// ── UI 헬퍼 ──────────────────────────────────────────────────────────
function setDirty() { dirty = true; setSaveStatus("저장되지 않은 변경 사항", "warn"); }
function setSaveStatus(msg, cls) {
  saveStatus.textContent = msg;
  saveStatus.className   = "save-status" + (cls ? ` status-${cls}` : "");
}
function setTtsProgress(pct, label) {
  ttsLabel.textContent = label;
  ttsFill.style.width  = `${pct}%`;
  ttsPct.textContent   = `${pct}%`;
}
function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});
