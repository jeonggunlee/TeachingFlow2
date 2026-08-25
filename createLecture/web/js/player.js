/**
 * player.js — 강의 플레이어 메인 컨트롤러
 *
 * 상태: lecture(JSON) → slideIdx → segIdx → audio 재생
 * lecture.json의 경로(slides/, audio/)는 /static/lectures/{id}/ 를 base로 사용.
 */

// ── DOM 참조 ────────────────────────────────────────────────────
const loadingEl   = document.getElementById("loading-overlay");
const titleEl     = document.getElementById("lecture-title");
const counterEl   = document.getElementById("slide-counter");
const slideImg    = document.getElementById("slide-img");
const slideCanvas = document.getElementById("slide-canvas");
const slideDom    = document.getElementById("slide-dom");
// HTML 슬라이드(라이브 DOM) 모드 여부 — 좌표 없이 텍스트에 직접 강조한다
let htmlMode = false;
const subtitleBar = document.getElementById("subtitle-bar");
const btnPlay     = document.getElementById("btn-play");
const btnPrev     = document.getElementById("btn-prev");
const btnNext     = document.getElementById("btn-next");
const timeInfo    = document.getElementById("time-info");
const effectSel   = document.getElementById("effect-select");

// ── 상태 ────────────────────────────────────────────────────────
const PORTAL_URL = `${location.protocol}//${location.hostname}:8003`;
const urlParams  = new URLSearchParams(location.search);
const lectureId  = urlParams.get("id") || "";
let lecture   = null;     // lecture.json 전체
let base      = "";       // /static/lectures/{id}
let slideIdx  = 0;
let segIdx    = 0;
let playing   = false;
let audio     = new Audio();
let _curSeg   = null;     // 현재 세그먼트 (오버레이 트리거용)

// ── 초기화 ──────────────────────────────────────────────────────
Subtitle.init(subtitleBar);
Overlay.init(slideImg, slideCanvas);
Recorder.init(slideImg, subtitleBar, audio);

(async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { showError("URL에 ?id= 가 없습니다."); return; }

  base = `/static/lectures/${id}`;

  try {
    const res = await fetch(`/api/lectures/${id}`);
    if (!res.ok) throw new Error(`lecture.json 로드 실패: ${res.status}`);
    lecture = await res.json();
  } catch (e) {
    showError(e.message);
    return;
  }

  titleEl.textContent = lecture.title || id;
  loadingEl.classList.add("hidden");

  // ── 상단 "← 포털로 돌아가기" + 하단 "← AI 강의 생성" 링크 설정 ──
  const portalBack = document.getElementById("btn-portal-back");
  if (portalBack) portalBack.href = urlParams.get("from") || PORTAL_URL;

  const backCreateBtn = document.getElementById("btn-back-create");
  if (backCreateBtn) {
    // 업로드 페이지는 from 파라미터가 없으면 포털로 강제 리디렉션하므로,
    // 현재 컨텍스트(URL → lecture.json fallback)를 그대로 전달한다.
    const qs = new URLSearchParams();
    qs.set("from", urlParams.get("from") || PORTAL_URL);
    const course = urlParams.get("course") || lecture.course || "";
    const week   = urlParams.get("week")   || lecture.week   || "";
    const wt     = urlParams.get("week_title") || "";
    if (course) qs.set("course", course);
    if (week)   qs.set("week", week);
    if (wt)     qs.set("week_title", wt);
    backCreateBtn.href = `/?${qs.toString()}`;
  }

  if (lecture.slide_size) {
    Overlay.setNaturalSize(lecture.slide_size.w, lecture.slide_size.h);
    Recorder.setNaturalSize(lecture.slide_size.w, lecture.slide_size.h);
  }

  // HTML 슬라이드면 라이브 DOM으로 렌더 (레거시 PNG 강의는 기존 경로 유지)
  htmlMode = !!(lecture.slides || []).some((s) => s.html);
  if (htmlMode) {
    slideImg.hidden = true;
    slideCanvas.hidden = true;
    slideDom.hidden = false;
    SlideStage.loadCss(`${base}/${lecture.slide_css || "slides/slide.css"}`);
    SlideStage.init(slideDom, lecture.slide_size || { w: 1920, h: 1080 });

    // 녹화는 슬라이드를 캔버스에 합성하는 방식이라 라이브 DOM 슬라이드에서는
    // 아직 지원하지 않는다. 오해를 막기 위해 버튼을 명시적으로 비활성화한다.
    const recBtn = document.getElementById("btn-record");
    if (recBtn) {
      recBtn.disabled = true;
      recBtn.title = "웹 슬라이드 강의는 아직 녹화를 지원하지 않습니다";
      recBtn.style.opacity = "0.45";
      recBtn.style.cursor = "not-allowed";
    }
  }

  goSlide(0, 0, false);
  setupControls();
})();

// ── 슬라이드/세그먼트 이동 ───────────────────────────────────────
function goSlide(si, segi, autoPlay) {
  if (!lecture) return;
  slideIdx = Math.max(0, Math.min(si, lecture.slides.length - 1));
  segIdx   = Math.max(0, segi);

  const slide = lecture.slides[slideIdx];
  counterEl.textContent = `${slideIdx + 1} / ${lecture.slides.length}`;

  if (htmlMode) {
    // 프래그먼트를 주입한 뒤 세그먼트를 시작 (강조 대상이 DOM에 있어야 하므로)
    SlideStage.show(`${base}/${slide.html}`).then(() => {
      loadSegment(slide.segments[segIdx], autoPlay);
    });
    return;
  }

  slideImg.src = `${base}/${slide.image}`;
  Overlay.clear();
  loadSegment(slide.segments[segIdx], autoPlay);
}

/** 현재 선택된 효과로 세그먼트를 강조한다 (HTML 모드는 DOM, 레거시는 Canvas). */
function applyHighlight(seg) {
  if (!seg) return;
  const effect = effectSel.value;
  if (htmlMode) {
    SlideStage.highlight(seg.ref, effect);
  } else {
    Overlay.clear();
    Overlay.trigger(seg, effect);
  }
}

function loadSegment(seg, autoPlay) {
  if (!seg) return;

  _curSeg = seg;
  Subtitle.load(seg.words);

  audio.pause();
  audio.src = `${base}/${seg.audio}`;
  audio.load();

  if (autoPlay) {
    audio.play().catch(() => {});
    playing = true;
    btnPlay.textContent = "⏸ 일시정지";
    applyHighlight(seg);
  }
}

// ── 오디오 이벤트 ────────────────────────────────────────────────
audio.addEventListener("timeupdate", () => {
  const ms = audio.currentTime * 1000;
  Subtitle.update(ms);
  updateTimeInfo();
});

audio.addEventListener("ended", advance);

audio.addEventListener("play",  () => { playing = true;  btnPlay.textContent = "⏸ 일시정지"; });
audio.addEventListener("pause", () => { playing = false; btnPlay.textContent = "▶ 재생"; });

// ── 세그먼트 자동 진행 ───────────────────────────────────────────
function advance() {
  const slide = lecture.slides[slideIdx];
  segIdx++;

  if (segIdx < slide.segments.length) {
    // 같은 슬라이드 다음 세그먼트
    loadSegment(slide.segments[segIdx], true);
    return;
  }

  // 다음 슬라이드
  if (slideIdx + 1 < lecture.slides.length) {
    goSlide(slideIdx + 1, 0, true);
  } else {
    // 전체 완료
    playing = false;
    btnPlay.textContent = "▶ 재생";
    Subtitle.clear();
  }
}

// ── 컨트롤 ──────────────────────────────────────────────────────
function setupControls() {
  btnPlay.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
      if (_curSeg) applyHighlight(_curSeg);
    } else {
      audio.pause();
    }
  });

  btnPrev.addEventListener("click", () => {
    const prev = slideIdx > 0 ? slideIdx - 1 : 0;
    goSlide(prev, 0, playing);
  });

  btnNext.addEventListener("click", () => {
    const next = slideIdx + 1 < lecture.slides.length ? slideIdx + 1 : slideIdx;
    goSlide(next, 0, playing);
  });

  effectSel.addEventListener("change", () => {
    const seg = lecture.slides[slideIdx]?.segments[segIdx];
    if (seg) {
      applyHighlight(seg);
    }
  });

  // 슬라이드 이미지 로드/리사이즈 시 캔버스 동기화
  slideImg.addEventListener("load", () => Overlay.resize());
  new ResizeObserver(() => Overlay.resize()).observe(slideImg.parentElement);

  // ── 편집 버튼 ──────────────────────────────────────────────────
  const btnEdit = document.getElementById("btn-edit-scripts");
  if (btnEdit) btnEdit.href = `/scripts?id=${lectureId}`;

  // ── 녹화 버튼 ───────────────────────────────────────────────────
  const btnRecord = document.getElementById("btn-record");
  if (btnRecord) {
    if (!Recorder.isSupported()) {
      btnRecord.disabled = true;
      btnRecord.title    = "이 브라우저는 녹화를 지원하지 않습니다 (Chromium 계열 권장)";
    } else {
      btnRecord.addEventListener("click", () => {
        if (Recorder.isRecording()) {
          Recorder.stop();
          btnRecord.textContent = "⏺ 녹화";
          btnRecord.classList.remove("recording");
        } else {
          Recorder.start();
          btnRecord.textContent = "⏹ 녹화 중지";
          btnRecord.classList.add("recording");
        }
      });
    }
  }
}

// ── 유틸 ────────────────────────────────────────────────────────
function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function updateTimeInfo() {
  timeInfo.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`;
}

function showError(msg) {
  loadingEl.textContent = `오류: ${msg}`;
}
