// ── 인증 확인 ─────────────────────────────────────────
Auth.requireLogin();

// ── DOM 참조 ──────────────────────────────────────────
const loadingEl    = document.getElementById("loading-overlay");
const titleEl      = document.getElementById("lecture-title");
const counterEl    = document.getElementById("slide-counter");
const slideImg     = document.getElementById("slide-img");
const slideCanvas  = document.getElementById("slide-canvas");
const subtitleBar  = document.getElementById("subtitle-bar");
const btnPlay      = document.getElementById("btn-play");
const btnPrev      = document.getElementById("btn-prev");
const btnNext      = document.getElementById("btn-next");
const timeInfo     = document.getElementById("time-info");
const effectSel    = document.getElementById("effect-select");
const speedSel     = document.getElementById("speed-select");
const progressEl   = document.getElementById("progress-indicator");
const resumeBanner = document.getElementById("resume-banner");

// ── 난이도 UI ────────────────────────────────────────
const diffBtns    = document.querySelectorAll(".diff-btn");
const diffStats   = document.getElementById("diff-stats");

// ── 채팅 UI ──────────────────────────────────────────
const chatMessages = document.getElementById("chat-messages");
const chatInput    = document.getElementById("chat-input");
const chatSend     = document.getElementById("chat-send");
const chatBadge    = document.getElementById("chat-slide-badge");

// ── 상태 ─────────────────────────────────────────────
const lectureId = new URLSearchParams(location.search).get("id") || "";
let lecture   = null;
let base      = "";
let slideIdx  = 0;
let segIdx    = 0;
let playing   = false;
let audio     = new Audio();
let _curSeg   = null;
let totalSegs = 0;
let chatPollTimer = null;
let diffPollTimer = null;
let _diffData     = [];   // [{ slide_idx, avg, total }, ...]

// ── 초기화 ───────────────────────────────────────────
Subtitle.init(subtitleBar);
Overlay.init(slideImg, slideCanvas);

// ══════════════════════════════════════════════════════
// ── 체크포인트 퀴즈 모달 ────────────────────────────
// ══════════════════════════════════════════════════════
const QuizModal = (() => {
  const modal      = document.getElementById("quiz-modal");
  const qEl        = document.getElementById("quiz-modal-q");
  const slideTagEl = document.getElementById("quiz-modal-slide");
  const optsEl     = document.getElementById("quiz-modal-options");
  const feedbackEl = document.getElementById("quiz-modal-feedback");
  const btnSubmit  = document.getElementById("quiz-btn-submit");
  const btnSkip    = document.getElementById("quiz-btn-skip");
  const btnNext    = document.getElementById("quiz-btn-next");

  const answeredSlides = new Set();   // 이미 처리한 슬라이드 (중복 표시 방지)
  let _onClose = null;
  let _slideIdx = -1;
  let _selected = -1;
  let _submitted = false;

  function shouldShow(si) { return !answeredSlides.has(si); }

  function open(quiz, slideIdx, onClose) {
    if (!modal) { onClose(); return; }
    _onClose  = onClose;
    _slideIdx = slideIdx;
    _selected = -1;
    _submitted = false;

    // 자동 재생 중이면 오디오 잠시 멈춤
    if (audio && !audio.paused) {
      Telemetry.suppressNextPause();
      audio.pause();
    }

    qEl.textContent       = quiz.question || "";
    slideTagEl.textContent = `슬라이드 ${slideIdx + 1}`;
    feedbackEl.hidden     = true;
    feedbackEl.className  = "quiz-modal-feedback";
    btnSubmit.hidden      = false;
    btnSubmit.disabled    = true;
    btnSkip.hidden        = false;
    btnNext.hidden        = true;

    optsEl.innerHTML = "";
    (quiz.options || []).forEach((opt, i) => {
      const row = document.createElement("label");
      row.className = "quiz-opt-row";
      row.dataset.idx = i;
      row.innerHTML = `
        <input type="radio" name="quiz-opt" value="${i}" />
        <span class="quiz-opt-label">${escHtml(opt)}</span>
        <span class="quiz-opt-mark" aria-hidden="true"></span>`;
      row.addEventListener("click", () => {
        if (_submitted) return;
        _selected = i;
        optsEl.querySelectorAll(".quiz-opt-row").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
        row.querySelector('input[type="radio"]').checked = true;
        btnSubmit.disabled = false;
      });
      optsEl.appendChild(row);
    });

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
    const cb = _onClose;
    _onClose = null;
    if (cb) cb();
  }

  async function submit() {
    if (_selected < 0 || _submitted) return;
    _submitted = true;
    btnSubmit.disabled = true;
    btnSkip.disabled   = true;

    let result;
    try {
      const res = await Auth.apiFetch(
        `/api/quiz/${lectureId}/${_slideIdx}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_index: _selected }),
        }
      );
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "?"}`);
      result = await res.json();
    } catch (e) {
      // 통신 실패 시 사용자 차단 방지 — 단순히 결과 없이 다음 슬라이드로
      feedbackEl.hidden = false;
      feedbackEl.className = "quiz-modal-feedback quiz-feedback-bad";
      feedbackEl.innerHTML = `<span class="quiz-feedback-label">오류</span>응답을 저장하지 못했습니다. (${e.message})`;
      btnNext.hidden = false;
      btnSkip.hidden = true;
      return;
    }

    answeredSlides.add(_slideIdx);

    optsEl.querySelectorAll(".quiz-opt-row").forEach(row => {
      row.classList.add("disabled");
      const idx = parseInt(row.dataset.idx, 10);
      const mark = row.querySelector(".quiz-opt-mark");
      if (idx === result.correct_index) {
        row.classList.add("correct");
        mark.textContent = "✓";
        mark.classList.add("ok");
      } else if (idx === _selected && !result.is_correct) {
        row.classList.add("wrong");
        mark.textContent = "✗";
        mark.classList.add("bad");
      }
    });

    feedbackEl.hidden = false;
    feedbackEl.className = "quiz-modal-feedback " +
      (result.is_correct ? "quiz-feedback-ok" : "quiz-feedback-bad");
    const headLabel = result.is_correct ? "정답입니다!" : "오답입니다.";
    const expl = result.explanation ? escHtml(result.explanation) : "";
    feedbackEl.innerHTML =
      `<span class="quiz-feedback-label">${headLabel}</span>${expl}`;

    btnSubmit.hidden = true;
    btnSkip.hidden   = true;
    btnNext.hidden   = false;
  }

  function skip() {
    answeredSlides.add(_slideIdx);   // 한 슬라이드 한 번만
    close();
  }

  function next() { close(); }

  if (btnSubmit) btnSubmit.addEventListener("click", submit);
  if (btnSkip)   btnSkip.addEventListener("click", skip);
  if (btnNext)   btnNext.addEventListener("click", next);

  return { open, shouldShow };
})();

// ══════════════════════════════════════════════════════
// ── 재생 행동 텔레메트리 (CQI 시그널) ────────────────
// ══════════════════════════════════════════════════════
const Telemetry = (() => {
  const buffer = [];
  let suppressSeekUntil = 0;
  let suppressPauseUntil = 0;
  let endedAt = 0;
  let lastObservedTime = 0;
  let lastRate = 1.0;
  let flushTimer = null;

  function record(eventType, positionSec, payload) {
    buffer.push({
      slide_idx: slideIdx,
      seg_idx: segIdx,
      event_type: eventType,
      position_ms: Math.max(0, Math.round((positionSec || 0) * 1000)),
      payload: payload || null,
    });
    if (!flushTimer) flushTimer = setTimeout(flush, 3000);
    if (buffer.length >= 20) flush();
  }

  async function flush() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!buffer.length) return;
    const events = buffer.splice(0, buffer.length);
    try {
      await Auth.apiFetch("/api/playback-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecture_id: lectureId, events }),
      });
    } catch (_) { /* swallow — telemetry must not break playback */ }
  }

  function flushBeacon() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!buffer.length) return;
    const events = buffer.splice(0, buffer.length);
    const token = Auth.getToken && Auth.getToken();
    const blob = new Blob(
      [JSON.stringify({ lecture_id: lectureId, events })],
      { type: "application/json" }
    );
    navigator.sendBeacon(
      `/api/playback-event?token=${encodeURIComponent(token || "")}`,
      blob
    );
  }

  function tickTime(currentTime) { lastObservedTime = currentTime; }

  function markEnded() { endedAt = Date.now(); }

  function suppressNextSeek()  { suppressSeekUntil  = Date.now() + 700; }
  function suppressNextPause() { suppressPauseUntil = Date.now() + 700; }

  function handleSeek(newPos, duration) {
    if (Date.now() < suppressSeekUntil) { lastObservedTime = newPos; return; }
    const oldPos = lastObservedTime;
    const delta  = newPos - oldPos;
    if (Math.abs(delta) < 2.0) return;     // 2초 미만의 점프는 무시 (자동 보정 등)

    // replay: 후반(50% 지점 이후)에서 처음(1초 이내)으로 점프
    if (newPos < 1.0 && duration > 0 && oldPos > duration * 0.5) {
      record("replay", newPos, { from_ms: Math.round(oldPos * 1000) });
    } else if (delta < 0) {
      record("seek_back", newPos, {
        from_ms: Math.round(oldPos * 1000),
        delta_ms: Math.round(delta * 1000),
      });
    } else {
      record("seek_forward", newPos, {
        from_ms: Math.round(oldPos * 1000),
        delta_ms: Math.round(delta * 1000),
      });
    }
    lastObservedTime = newPos;
  }

  function handleRateChange(rate, currentTime) {
    if (Math.abs(rate - lastRate) < 0.01) return;
    record("speed_change", currentTime, { old_rate: lastRate, new_rate: rate });
    lastRate = rate;
  }

  function recordUserPause(currentTime) {
    if (Date.now() < suppressPauseUntil) return;
    if (Date.now() - endedAt < 300) return;   // ended 직후의 pause는 자동 종료
    record("pause", currentTime, null);
  }

  return {
    record, flush, flushBeacon,
    tickTime, markEnded,
    suppressNextSeek, suppressNextPause,
    handleSeek, handleRateChange,
    recordUserPause,
  };
})();

(async () => {
  if (!lectureId) { showError("URL에 ?id= 가 없습니다."); return; }
  base = `/static/${lectureId}`;

  const res = await Auth.apiFetch(`/api/lectures/${lectureId}`);
  if (!res || !res.ok) { showError("강의 로드 실패"); return; }
  lecture = await res.json();

  titleEl.textContent = lecture.title || lectureId;
  loadingEl.classList.add("hidden");

  if (lecture.slide_size) Overlay.setNaturalSize(lecture.slide_size.w, lecture.slide_size.h);
  totalSegs = lecture.slides.reduce((n, s) => n + s.segments.length, 0);

  goSlide(0, 0, false);
  setupControls();
  setupDifficulty();
  setupChat();
  setupDiffLiveGraph();
  await checkResume();  // 초기 goSlide 완료 후 이어보기 확인 (race condition 방지)
})();

// ── 슬라이드/세그먼트 이동 ──────────────────────────
function goSlide(si, segi, autoPlay) {
  if (!lecture) return;
  slideIdx = Math.max(0, Math.min(si, lecture.slides.length - 1));
  segIdx   = Math.max(0, segi);

  const slide = lecture.slides[slideIdx];
  slideImg.src = `${base}/${slide.image}`;
  counterEl.textContent = `${slideIdx + 1} / ${lecture.slides.length}`;

  Overlay.clear();
  loadSegment(slide.segments[segIdx], autoPlay);
  updateProgressIndicator();

  // 슬라이드 전환 시 채팅·난이도 리로드
  loadChatMessages(slideIdx);
  loadDifficulty(slideIdx);
  if (chatBadge) chatBadge.textContent = `슬라이드 ${slideIdx + 1}`;
  renderDiffLiveGraph();   // 현재 슬라이드 강조 업데이트
}

function loadSegment(seg, autoPlay) {
  if (!seg) return;
  _curSeg = seg;
  Subtitle.load(seg.words);
  Telemetry.suppressNextSeek();
  Telemetry.suppressNextPause();
  audio.pause();
  audio.src = `${base}/${seg.audio}`;
  audio.load();
  if (autoPlay) {
    audio.play().catch(() => {});
    playing = true;
    btnPlay.textContent = "⏸ 일시정지";
    Overlay.trigger(seg, effectSel.value);
  }
}

// ── 오디오 이벤트 ────────────────────────────────────
audio.addEventListener("timeupdate", () => {
  Subtitle.update(audio.currentTime * 1000);
  updateTimeInfo();
  Telemetry.tickTime(audio.currentTime);
});
audio.addEventListener("ended",  () => { Telemetry.markEnded(); advance(); });
audio.addEventListener("play",  () => { playing = true;  btnPlay.textContent = "⏸ 일시정지"; });
audio.addEventListener("pause", () => { playing = false; btnPlay.textContent = "▶ 재생"; });
// `seeking`(시킥 시작) 시점엔 lastObservedTime이 아직 시킥 전 값 → 진짜 delta를 본다
// `seeked`로 잡으면 그 사이에 timeupdate가 발사돼 lastObservedTime이 새 값으로 덮어써짐
audio.addEventListener("seeking", () => Telemetry.handleSeek(audio.currentTime, audio.duration));
audio.addEventListener("ratechange", () => Telemetry.handleRateChange(audio.playbackRate, audio.currentTime));

function advance() {
  const slide = lecture.slides[slideIdx];
  segIdx++;
  if (segIdx < slide.segments.length) {
    loadSegment(slide.segments[segIdx], true);
    saveProgress();
    updateProgressIndicator();
    return;
  }
  // 슬라이드 끝 — 체크포인트 퀴즈가 있으면 표시
  if (slide.quiz && QuizModal.shouldShow(slideIdx)) {
    QuizModal.open(slide.quiz, slideIdx, () => continueAfterSlide());
    return;
  }
  continueAfterSlide();
}

function continueAfterSlide() {
  if (slideIdx + 1 < lecture.slides.length) {
    goSlide(slideIdx + 1, 0, true);
  } else {
    playing = false;
    btnPlay.textContent = "▶ 재생";
    Subtitle.clear();
    saveProgress(true);
  }
}

// ── 상단 "← 포털로 돌아가기" + 하단 "← 강의 목록" 버튼 href 설정 ────────────
(function setupBackButtons() {
  const portalBtn = document.getElementById("btn-back-list");   // 상단 nav: 포털로 돌아가기
  const listBtn   = document.getElementById("btn-goto-list");   // 하단 controls: 강의 목록으로
  const sp        = new URLSearchParams(location.search);
  const course    = sp.get("course");
  const week      = sp.get("week");
  const weekTitle = sp.get("week_title");
  const fromUrl   = sp.get("from") || `${location.protocol}//${location.hostname}:8003`;

  // 상단 버튼은 항상 포털로 (컨텍스트의 from URL 우선)
  if (portalBtn) portalBtn.href = fromUrl;
  const navLogo = document.getElementById("nav-logo");
  if (navLogo) navLogo.href = fromUrl;

  // 하단 버튼은 컨텍스트가 있으면 해당 주차 강의 목록으로, 없으면 포털로
  if (listBtn) {
    if (course && week) {
      const createUrl = `${location.protocol}//${location.hostname}:8000`;
      const params = new URLSearchParams({ from: fromUrl, course, week });
      if (weekTitle) params.set("week_title", weekTitle);
      listBtn.href = `${createUrl}/week-lectures?${params.toString()}`;
    } else {
      listBtn.href = fromUrl;
    }
  }
})();

// ── 컨트롤 ──────────────────────────────────────────
function setupControls() {
  btnPlay.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
      if (_curSeg) Overlay.trigger(_curSeg, effectSel.value);
    } else {
      Telemetry.recordUserPause(audio.currentTime);
      audio.pause();
    }
  });
  btnPrev.addEventListener("click", () => goSlide(slideIdx > 0 ? slideIdx - 1 : 0, 0, playing));
  btnNext.addEventListener("click", () => {
    const next = slideIdx + 1 < lecture.slides.length ? slideIdx + 1 : slideIdx;
    goSlide(next, 0, playing);
  });
  effectSel.addEventListener("change", () => {
    if (_curSeg) { Overlay.clear(); Overlay.trigger(_curSeg, effectSel.value); }
  });
  if (speedSel) {
    speedSel.addEventListener("change", () => {
      const rate = parseFloat(speedSel.value) || 1.0;
      audio.playbackRate = rate;
    });
  }
  slideImg.addEventListener("load", () => Overlay.resize());
  new ResizeObserver(() => Overlay.resize()).observe(slideImg.parentElement);
}

// ── 진도 저장 ────────────────────────────────────────
let saveTimer = null;
function saveProgress(completed = false) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const doneSegs = lecture.slides
      .slice(0, slideIdx).reduce((n, s) => n + s.segments.length, 0) + segIdx + 1;
    const pct = completed ? 100 : Math.min(99, Math.round(doneSegs / totalSegs * 100));
    await Auth.apiFetch(`/api/progress/${lectureId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ slide_idx: slideIdx, seg_idx: segIdx, pct }),
    }).catch(() => {});
  }, 2000);
}

// ── 이어보기 ─────────────────────────────────────────
async function checkResume() {
  const res = await Auth.apiFetch(`/api/progress/${lectureId}`);
  if (!res || !res.ok) return;
  const { slide_idx, seg_idx, pct } = await res.json();
  if (pct < 100 && (slide_idx > 0 || seg_idx > 0)) {
    resumeBanner.hidden = false;
    resumeBanner.querySelector(".btn-resume-cont").addEventListener("click", () => {
      resumeBanner.hidden = true;
      goSlide(slide_idx, seg_idx, false);
    });
    resumeBanner.querySelector(".btn-dismiss").addEventListener("click", () => {
      resumeBanner.hidden = true;
    });
  }
}

// ── 진도 표시 ────────────────────────────────────────
function updateProgressIndicator() {
  if (!progressEl || !totalSegs) return;
  const done = lecture.slides.slice(0, slideIdx).reduce((n, s) => n + s.segments.length, 0) + segIdx + 1;
  progressEl.textContent = `${Math.round(done / totalSegs * 100)}%`;
}

// ══════════════════════════════════════════════════════
// ── 난이도 평가 ──────────────────────────────────────
// ══════════════════════════════════════════════════════

function setupDifficulty() {
  diffBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const rating = parseInt(btn.dataset.rating);
      setDiffActive(rating);
      await Auth.apiFetch(`/api/difficulty/${lectureId}/${slideIdx}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rating }),
      });
      loadDifficulty(slideIdx);       // 슬라이드 버튼 통계 갱신
      loadAllDifficultyAndDraw();     // 그래프 즉시 갱신
    });
  });
}

function setDiffActive(rating) {
  diffBtns.forEach(b => {
    b.classList.remove("active-0", "active-1", "active-2");
    if (parseInt(b.dataset.rating) === rating) b.classList.add(`active-${rating}`);
  });
}

async function loadDifficulty(si) {
  // 버튼 초기화
  diffBtns.forEach(b => b.classList.remove("active-0", "active-1", "active-2"));
  if (diffStats) diffStats.innerHTML = "";

  const res = await Auth.apiFetch(`/api/difficulty/${lectureId}/${si}`);
  if (!res || !res.ok) return;
  const data = await res.json();

  if (data.my_rating !== null && data.my_rating !== undefined) {
    setDiffActive(data.my_rating);
  }

  // 전체 통계 표시
  if (data.total > 0 && diffStats) {
    const labels = [
      { key: "쉬움", icon: "😊", cls: "active-0" },
      { key: "보통", icon: "😐", cls: "active-1" },
      { key: "어려움", icon: "😰", cls: "active-2" },
    ];
    diffStats.innerHTML = labels.map(l =>
      `<span class="diff-stat">
        <span>${l.icon}</span>
        <span>${data.counts[l.key] || 0}</span>
      </span>`
    ).join("");
  }
}

// ══════════════════════════════════════════════════════
// ── 채팅 ────────────────────────────────────────────
// ══════════════════════════════════════════════════════

function setupChat() {
  chatSend.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  // 30초마다 자동 갱신
  chatPollTimer = setInterval(() => loadChatMessages(slideIdx), 30000);
}

async function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  chatSend.disabled = true;
  chatInput.disabled = true;

  const res = await Auth.apiFetch(`/api/chat/${lectureId}/${slideIdx}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ message: msg }),
  });

  chatInput.value = "";
  chatSend.disabled = false;
  chatInput.disabled = false;
  chatInput.focus();

  if (res && res.ok) {
    await loadChatMessages(slideIdx);
  }
}

async function loadChatMessages(si) {
  const res = await Auth.apiFetch(`/api/chat/${lectureId}/${si}`);
  if (!res || !res.ok) return;
  const msgs = await res.json();
  renderMessages(msgs);
}

function renderMessages(msgs) {
  if (!msgs.length) {
    chatMessages.innerHTML = '<span class="chat-empty">이 슬라이드에 대한 질문을 남겨보세요.</span>';
    return;
  }

  chatMessages.innerHTML = "";
  for (const m of msgs) {
    const div = document.createElement("div");
    const classes = ["chat-msg", m.is_mine ? "mine" : "theirs"];
    if (m.is_teacher) classes.push("teacher");
    div.className = classes.join(" ");

    const time = new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const teacherTag = m.is_teacher ? `<span class="chat-teacher-tag">👨‍🏫 교수</span>` : "";
    const nameHtml   = !m.is_mine
      ? `<span class="chat-msg-name">${teacherTag}${escHtml(m.display_name)}</span>`
      : (m.is_teacher ? `<span class="chat-msg-name">${teacherTag}</span>` : "");
    div.innerHTML = `
      ${nameHtml}
      <div class="chat-msg-bubble">${escHtml(m.message)}</div>
      <span class="chat-msg-time">${time}</span>
    `;
    chatMessages.appendChild(div);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── 유틸 ────────────────────────────────────────────
function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function updateTimeInfo() {
  if (timeInfo) timeInfo.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`;
}
function showError(msg) {
  loadingEl.textContent = `오류: ${msg}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ══════════════════════════════════════════════════════
// ── 실시간 난이도 그래프 ─────────────────────────────
// ══════════════════════════════════════════════════════

async function loadAllDifficultyAndDraw() {
  const res = await Auth.apiFetch(`/api/difficulty/${lectureId}`);
  if (!res || !res.ok) return;
  _diffData = await res.json();   // [{ slide_idx, avg, total }, ...]
  renderDiffLiveGraph();
}

function renderDiffLiveGraph() {
  const canvas = document.getElementById("diff-live-canvas");
  if (!canvas || !lecture) return;

  const totalSlides = lecture.slides.length;
  const upTo        = slideIdx;           // 0-based, 현재 슬라이드까지만 표시

  // 슬라이드 0 ~ upTo 슬롯 생성
  const slots = Array.from({ length: upTo + 1 }, (_, i) => {
    const found = _diffData.find(d => d.slide_idx === i);
    return found || { slide_idx: i, avg: null, total: 0 };
  });

  // ── 캔버스 크기 ────────────────────────────────────
  const PAD  = { top: 20, right: 8, bottom: 28, left: 34 };
  const H    = 120;
  const W    = Math.max(100, canvas.offsetWidth);
  const dpr  = window.devicePixelRatio || 1;

  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx    = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;
  const n      = slots.length;
  const slotW  = chartW / n;
  const yScale = chartH / 2;

  // 배경
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, W, H);

  // 그리드 + Y축 레이블
  const yTicks = [{ v: 0, l: "0" }, { v: 1, l: "1" }, { v: 2, l: "2" }];
  ctx.font = `10px -apple-system, sans-serif`;

  yTicks.forEach(({ v, l }) => {
    const y = PAD.top + chartH - v * yScale;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    ctx.fillStyle   = "#475569";
    ctx.textAlign   = "right";
    ctx.fillText(l, PAD.left - 4, y + 3);
  });

  // 기준선 (보통 = 1)
  const refY = PAD.top + chartH - yScale;
  ctx.strokeStyle = "#334155";
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(PAD.left, refY); ctx.lineTo(PAD.left + chartW, refY); ctx.stroke();
  ctx.setLineDash([]);

  // 축
  ctx.strokeStyle = "#334155";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // ── 포인트 좌표 계산 ─────────────────────────────
  const baseY = PAD.top + chartH;
  const pts = slots.map(({ slide_idx, avg }, i) => {
    const cx    = PAD.left + i * slotW + slotW / 2;
    const isCur = slide_idx === slideIdx;
    if (avg === null) return { cx, cy: null, avg: null, isCur };
    return { cx, cy: PAD.top + chartH - avg * yScale, avg, isCur };
  });

  // ── X 레이블 ─────────────────────────────────────
  slots.forEach(({ slide_idx }, i) => {
    const isCur = slide_idx === slideIdx;
    const cx    = PAD.left + i * slotW + slotW / 2;
    ctx.fillStyle = isCur ? "#e2e8f0" : "#475569";
    ctx.font      = isCur ? "bold 10px sans-serif" : "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(slide_idx + 1, cx, baseY + 18);
  });

  // ── 그라디언트 채우기 ─────────────────────────────
  const areaGrad = ctx.createLinearGradient(0, PAD.top, 0, baseY);
  areaGrad.addColorStop(0, "rgba(99,102,241,0.22)");
  areaGrad.addColorStop(1, "rgba(99,102,241,0.01)");
  ctx.fillStyle = areaGrad;

  let segStart = null;
  for (let i = 0; i <= pts.length; i++) {
    const p = i < pts.length ? pts[i] : null;
    if (p && p.cy !== null) {
      if (segStart === null) segStart = i;
    } else if (segStart !== null) {
      ctx.beginPath();
      ctx.moveTo(pts[segStart].cx, pts[segStart].cy);
      for (let j = segStart + 1; j < i; j++) ctx.lineTo(pts[j].cx, pts[j].cy);
      ctx.lineTo(pts[i - 1].cx, baseY);
      ctx.lineTo(pts[segStart].cx, baseY);
      ctx.closePath();
      ctx.fill();
      segStart = null;
    }
  }

  // ── 라인 ─────────────────────────────────────────
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth   = 2;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  let inLine = false;
  pts.forEach(p => {
    if (p.cy === null) { inLine = false; return; }
    if (!inLine) { ctx.moveTo(p.cx, p.cy); inLine = true; }
    else ctx.lineTo(p.cx, p.cy);
  });
  ctx.stroke();

  // ── 점 · 값 레이블 ───────────────────────────────
  pts.forEach(p => {
    if (p.cy === null) return;
    const color = p.avg < 0.7 ? "#16a34a" : p.avg < 1.3 ? "#d97706" : "#dc2626";

    // 현재 슬라이드: 노란 링
    if (p.isCur) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // glow
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.isCur ? 6 : 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 채운 원
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.isCur ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 흰 중심
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // 값 레이블
    ctx.fillStyle = p.isCur ? "#e2e8f0" : "#94a3b8";
    ctx.font      = p.isCur ? "bold 9px sans-serif" : "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.avg.toFixed(1), p.cx, p.cy - 9);
  });
}

function setupDiffLiveGraph() {
  // 초기 로드
  requestAnimationFrame(() => loadAllDifficultyAndDraw());
  // 30초마다 갱신
  diffPollTimer = setInterval(loadAllDifficultyAndDraw, 30000);
  // 창 크기 변경 시 리드로우
  window.addEventListener("resize", renderDiffLiveGraph);
}

// 페이지 떠날 때 폴링 정리 + 진도 즉시 저장 (sendBeacon: 비동기 fetch는 unload 전 완료 보장 없음)
window.addEventListener("beforeunload", () => {
  clearInterval(chatPollTimer);
  clearInterval(diffPollTimer);
  clearTimeout(saveTimer);   // 대기 중인 디바운스 취소
  Telemetry.flushBeacon();   // 대기 중인 행동 이벤트 즉시 전송
  if (lecture && totalSegs) {
    const doneSegs = lecture.slides
      .slice(0, slideIdx).reduce((n, s) => n + s.segments.length, 0) + segIdx + 1;
    const pct = Math.min(99, Math.round(doneSegs / totalSegs * 100));
    const token = Auth.getToken();
    const blob  = new Blob(
      [JSON.stringify({ slide_idx: slideIdx, seg_idx: segIdx, pct })],
      { type: "application/json" }
    );
    // sendBeacon은 Authorization 헤더를 지원하지 않으므로 토큰을 쿼리 파라미터로 전달
    navigator.sendBeacon(
      `/api/progress/${lectureId}?token=${encodeURIComponent(token || "")}`,
      blob
    );
  }
});
