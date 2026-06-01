// ── 포털 컨텍스트 (URL 파라미터) ─────────────────────────────────────────────
const PORTAL_URL = `${location.protocol}//${location.hostname}:8003`;

(function initContext() {
  const p         = new URLSearchParams(location.search);
  const fromUrl   = p.get('from');
  const course    = p.get('course');
  const week      = p.get('week');
  const weekTitle = p.get('week_title');

  // 포털에서 진입하지 않은 경우 포털로 리디렉션
  if (!fromUrl) {
    location.href = PORTAL_URL;
    return;
  }

  document.getElementById('nav-logo').href = fromUrl;
  document.getElementById('ctx-back').href = fromUrl;

  if (course && week) {
    const block   = document.getElementById('ctx-block');
    const chipEl  = document.getElementById('ctx-course');
    const headEl  = document.getElementById('ctx-week-heading');
    const subEl   = document.getElementById('ctx-week-sub');

    chipEl.textContent = course;
    headEl.textContent = `${week}주차 강의 제작`;
    subEl.textContent  = weekTitle ? `강의 제목: ${weekTitle}` : '';
    subEl.hidden       = !weekTitle;
    block.hidden       = false;
  }
})();

const form          = document.getElementById("upload-form");
const fileInput     = document.getElementById("file");
const fileNameEl    = document.getElementById("file-name");
const submitBtn     = document.getElementById("submit");
const statusEl      = document.getElementById("status");
const progressWrap  = document.getElementById("progress-wrap");
const progressLabel = document.getElementById("progress-label");
const progressFill  = document.getElementById("progress-fill");
const progressPct   = document.getElementById("progress-pct");

// 프롬프트 모드 요소
const promptForm   = document.getElementById("prompt-form");
const promptText   = document.getElementById("prompt-text");
const promptNum    = document.getElementById("prompt-num");
const promptSubmit = document.getElementById("prompt-submit");
const tabFile      = document.getElementById("tab-file");
const tabPrompt    = document.getElementById("tab-prompt");
const panelFile    = document.getElementById("panel-file");
const panelPrompt  = document.getElementById("panel-prompt");

// 프롬프트 파일 업로드 요소
const promptFileInput  = document.getElementById("prompt-file");
const promptFileLabel  = document.getElementById("prompt-file")?.closest(".prompt-file-label");
const promptFileNameEl = document.getElementById("prompt-file-name");
const promptFileClear  = document.getElementById("prompt-file-clear");

// CQI 파일 업로드 요소
const cqiTextEl       = document.getElementById("cqi-text");
const cqiFileInput    = document.getElementById("cqi-file");
const cqiFileLabel    = document.getElementById("cqi-file")?.closest(".prompt-file-label");
const cqiFileNameEl   = document.getElementById("cqi-file-name");
const cqiFileClear    = document.getElementById("cqi-file-clear");

// ── 모드 탭 전환 ─────────────────────────────────────────────────────
function setMode(mode) {
  const isFile = mode === "file";
  tabFile.classList.toggle("active", isFile);
  tabPrompt.classList.toggle("active", !isFile);
  tabFile.setAttribute("aria-selected", isFile ? "true" : "false");
  tabPrompt.setAttribute("aria-selected", isFile ? "false" : "true");
  panelFile.hidden   = !isFile;
  panelPrompt.hidden = isFile;

  // 사이드바 최근 항목 패널도 모드에 맞게 토글 + 처음 활성화 시 로드
  const recentPpt = document.getElementById("recent-ppt");
  const recentPrompt = document.getElementById("recent-prompt");
  if (recentPpt && recentPrompt) {
    recentPpt.hidden = !isFile;
    recentPrompt.hidden = isFile;
    if (isFile) loadRecentPpt();
    else        loadRecentPrompts();
  }
}
tabFile.addEventListener("click",   () => setMode("file"));
tabPrompt.addEventListener("click", () => setMode("prompt"));

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  fileNameEl.textContent = f ? f.name : "PPT 파일 선택 (.ppt, .pptx)";
});

// ── 프롬프트 .txt 파일 → textarea 로드 ─────────────────────────────
const MAX_PROMPT_FILE_BYTES = 1024 * 1024;  // 1 MB

function resetPromptFile() {
  if (promptFileInput) promptFileInput.value = "";
  if (promptFileNameEl) promptFileNameEl.textContent = ".txt 파일에서 프롬프트 불러오기 (선택)";
  if (promptFileLabel)  promptFileLabel.classList.remove("has-file");
  if (promptFileClear)  promptFileClear.hidden = true;
}

promptFileInput?.addEventListener("change", async () => {
  const f = promptFileInput.files?.[0];
  if (!f) { resetPromptFile(); return; }

  if (f.size > MAX_PROMPT_FILE_BYTES) {
    showError(`프롬프트 파일이 너무 큽니다 (최대 1MB). 현재: ${(f.size/1024).toFixed(1)} KB`);
    resetPromptFile();
    return;
  }

  try {
    const text = await f.text();
    if (!text || !text.trim()) {
      showError("파일이 비어 있습니다.");
      resetPromptFile();
      return;
    }
    if (promptText.value.trim() &&
        !confirm("현재 입력된 프롬프트가 있습니다. 파일 내용으로 덮어쓰시겠습니까?")) {
      resetPromptFile();
      return;
    }
    promptText.value = text;
    promptFileNameEl.textContent = `✓ ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
    promptFileLabel.classList.add("has-file");
    promptFileClear.hidden = false;
    // 시각적 피드백
    promptText.style.transition = "box-shadow .4s";
    promptText.style.boxShadow = "0 0 0 3px rgba(56,189,248,.4)";
    setTimeout(() => { promptText.style.boxShadow = ""; }, 800);
    statusEl.hidden = true;
  } catch (err) {
    showError(`파일 읽기 오류: ${err.message}`);
    resetPromptFile();
  }
});

promptFileClear?.addEventListener("click", () => resetPromptFile());

// ── CQI JSON 보고서 → 텍스트 요약 → cqi-text 로드 ─────────────────
const MAX_CQI_FILE_BYTES = 2 * 1024 * 1024;  // 2 MB
const ACTION_LABEL = {
  enhance_script: "스크립트 보강",
  add_slide:      "슬라이드 추가",
  add_example:    "예시 추가",
  no_action:      "조치 불필요",
};

function resetCqiFile() {
  if (cqiFileInput) cqiFileInput.value = "";
  if (cqiFileNameEl) cqiFileNameEl.textContent = "학습 분석 CQI 보고서(.json) 업로드 (선택)";
  if (cqiFileLabel)  cqiFileLabel.classList.remove("has-file");
  if (cqiFileClear)  cqiFileClear.hidden = true;
}

function formatCqiReport(data) {
  // 두 가지 입력 모두 지원:
  //   1) report.html에서 export한 형식 — 최상위가 곧 report 본문
  //   2) GET /api/reports/{id} 응답 — { ..., report: { ... } }
  const report = (data && data.report && Array.isArray(data.report.slides)) ? data.report : data;
  if (!report || !Array.isArray(report.slides)) {
    throw new Error("CQI 보고서 형식이 아닙니다. (slides 배열 누락)");
  }

  const meaningful = report.slides.filter(s =>
    s && s.recommended_action !== "no_action" &&
    (s.cqi_instruction || "").trim()
  );

  const lines = [];
  lines.push("[학습 분석 CQI 보고서 - 자동 생성]");
  if (report.lecture_title) lines.push(`강의: ${report.lecture_title}`);
  if (report.generated_at) {
    const d = new Date(report.generated_at);
    lines.push(`분석 일시: ${isNaN(d) ? report.generated_at : d.toLocaleString("ko-KR")}`);
  }
  lines.push("");

  if (meaningful.length === 0) {
    lines.push("개선이 필요한 슬라이드가 없습니다 (모두 조치 불필요).");
    return lines.join("\n");
  }

  lines.push(`다음 ${meaningful.length}개 슬라이드에 개선이 필요합니다:`);
  lines.push("");

  for (const s of meaningful) {
    const idx       = (typeof s.slide_idx === "number") ? (s.slide_idx + 1) : "-";
    const score     = typeof s.confusion_score === "number" ? Math.round(s.confusion_score * 100) : null;
    const action    = ACTION_LABEL[s.recommended_action] || s.recommended_action || "-";
    const concepts  = Array.isArray(s.core_concepts) && s.core_concepts.length
                        ? s.core_concepts.join(", ") : "";
    const scoreStr  = score !== null ? `혼란도 ${score}%` : "";
    const header    = [`▶ 슬라이드 ${idx}`, scoreStr, `조치: ${action}`]
                        .filter(Boolean).join(" · ");

    lines.push(header);
    if (concepts) lines.push(`  핵심 미이해 개념: ${concepts}`);
    if (s.cqi_instruction) lines.push(`  지시사항: ${s.cqi_instruction.trim()}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

cqiFileInput?.addEventListener("change", async () => {
  const f = cqiFileInput.files?.[0];
  if (!f) { resetCqiFile(); return; }

  if (f.size > MAX_CQI_FILE_BYTES) {
    showError(`CQI 파일이 너무 큽니다 (최대 2MB). 현재: ${(f.size/1024).toFixed(1)} KB`);
    resetCqiFile();
    return;
  }

  let data;
  try {
    const text = await f.text();
    data = JSON.parse(text);
  } catch (err) {
    showError(`JSON 파싱 오류: ${err.message}`);
    resetCqiFile();
    return;
  }

  let formatted;
  try {
    formatted = formatCqiReport(data);
  } catch (err) {
    showError(`CQI 보고서 변환 오류: ${err.message}`);
    resetCqiFile();
    return;
  }

  if (cqiTextEl.value.trim() &&
      !confirm("CQI 피드백 입력란에 내용이 있습니다. 보고서 내용으로 덮어쓰시겠습니까?")) {
    resetCqiFile();
    return;
  }

  cqiTextEl.value = formatted;
  cqiFileNameEl.textContent = `✓ ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
  cqiFileLabel.classList.add("has-file");
  cqiFileClear.hidden = false;
  cqiTextEl.style.transition = "box-shadow .4s";
  cqiTextEl.style.boxShadow = "0 0 0 3px rgba(56,189,248,.4)";
  setTimeout(() => { cqiTextEl.style.boxShadow = ""; }, 800);
  statusEl.hidden = true;
});

cqiFileClear?.addEventListener("click", () => resetCqiFile());

// ── CQI 보고서 모달 (analyzeLecture에서 가져오기) ─────────────────
const cqiModal       = document.getElementById("cqi-modal");
const cqiModalList   = document.getElementById("cqi-modal-list");
const cqiModalScope  = document.getElementById("cqi-modal-scope");
const cqiModalToggle = document.getElementById("cqi-modal-toggle");
let _cqiShowAll = false;

function openCqiModal() {
  cqiModal.hidden = false;
  loadCqiReportsModal();
}
function closeCqiModal() { cqiModal.hidden = true; }

async function loadCqiReportsModal() {
  cqiModalList.innerHTML = '<p class="lib-empty">로딩 중...</p>';
  const _sp = new URLSearchParams(location.search);
  const course = _sp.get("course") || "";
  const week   = _sp.get("week")   || "";
  const useFilter = (course && week) && !_cqiShowAll;

  if (cqiModalScope) {
    cqiModalScope.textContent = useFilter
      ? `${course} · ${week}주차 보고서`
      : "모든 보고서";
  }
  if (cqiModalToggle) {
    cqiModalToggle.textContent = useFilter ? "전체 보기" : "현재 컨텍스트만";
    cqiModalToggle.hidden = !(course && week);
  }

  const qs = new URLSearchParams();
  if (useFilter) {
    qs.set("course", course);
    qs.set("week", week);
  }
  qs.set("limit", "30");

  try {
    const res = await fetch(`/api/cqi-reports?${qs.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      cqiModalList.innerHTML =
        `<p class="lib-empty" style="color:var(--error)">보고서 목록 조회 실패: ${esc(data.detail ?? res.status)}</p>`;
      return;
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      cqiModalList.innerHTML = useFilter
        ? `<p class="lib-empty">${esc(course)} ${esc(week)}주차에 해당하는 보고서가 없습니다.<br>"전체 보기"를 눌러 다른 주차도 확인해 보세요.</p>`
        : '<p class="lib-empty">학습 분석 보고서가 아직 없습니다.</p>';
      return;
    }
    cqiModalList.innerHTML = items.map((it, idx) => {
      const isDone = it.status === "done";
      const stClass = `cqi-status-${esc(it.status || "unknown")}`;
      const stLabel = ({
        done: "완료",
        pending: "대기",
        processing: "분석 중",
        error: "오류",
      })[it.status] || it.status;
      const date = it.generated_at
        ? new Date(it.generated_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
        : "";
      const ctx = (it.course && it.week)
        ? `<span>${esc(it.course)} · ${esc(it.week)}주차</span>`
        : "";
      return `
        <div class="cqi-report-card ${isDone ? "" : "disabled"}" data-idx="${idx}"
             title="${isDone ? "클릭하면 이 보고서를 CQI 입력란에 불러옵니다" : "완료된 보고서만 불러올 수 있습니다"}">
          <div class="cqi-report-title">${esc(it.lecture_title || it.lecture_id)}</div>
          <div class="cqi-report-meta">
            <span class="cqi-status-badge ${stClass}">${esc(stLabel || "-")}</span>
            ${ctx}
            <span>${esc(date)}</span>
          </div>
        </div>`;
    }).join("");
    cqiModalList.querySelectorAll(".cqi-report-card").forEach(card => {
      const i = parseInt(card.dataset.idx, 10);
      if (items[i].status !== "done") return;
      card.addEventListener("click", () => applyCqiReport(items[i]));
    });
  } catch (err) {
    cqiModalList.innerHTML =
      `<p class="lib-empty" style="color:var(--error)">네트워크 오류: ${esc(err.message)}</p>`;
  }
}

async function applyCqiReport(meta) {
  const id = meta.report_id;
  if (!id) return;
  cqiModalList.innerHTML = '<p class="lib-empty">보고서 본문을 가져오는 중...</p>';
  try {
    const res = await fetch(`/api/cqi-reports/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      cqiModalList.innerHTML =
        `<p class="lib-empty" style="color:var(--error)">보고서 조회 실패: ${esc(data.detail ?? res.status)}</p>`;
      return;
    }
    const data = await res.json();

    let formatted;
    try {
      formatted = formatCqiReport(data);
    } catch (err) {
      cqiModalList.innerHTML =
        `<p class="lib-empty" style="color:var(--error)">보고서 변환 오류: ${esc(err.message)}</p>`;
      return;
    }

    if (cqiTextEl.value.trim() &&
        !confirm("CQI 피드백 입력란에 내용이 있습니다. 보고서 내용으로 덮어쓰시겠습니까?")) {
      return;
    }
    cqiTextEl.value = formatted;
    // 시각 피드백
    cqiTextEl.style.transition = "box-shadow .4s";
    cqiTextEl.style.boxShadow = "0 0 0 3px rgba(56,189,248,.4)";
    setTimeout(() => { cqiTextEl.style.boxShadow = ""; }, 800);

    // 파일 업로드 상태가 남아있으면 같이 정리 (소스 일관성)
    resetCqiFile();
    closeCqiModal();
    cqiTextEl.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    cqiModalList.innerHTML =
      `<p class="lib-empty" style="color:var(--error)">네트워크 오류: ${esc(err.message)}</p>`;
  }
}

document.getElementById("btn-cqi-fetch")?.addEventListener("click", openCqiModal);
document.getElementById("cqi-modal-close")?.addEventListener("click", closeCqiModal);
cqiModalToggle?.addEventListener("click", () => {
  _cqiShowAll = !_cqiShowAll;
  loadCqiReportsModal();
});
cqiModal?.addEventListener("click", (e) => {
  if (e.target === cqiModal) closeCqiModal();
});

// Deep-link: ?cqi_report_id=xxx 가 URL에 있으면 자동으로 fetch & 적용
(function initDeepLinkCqi() {
  const sp = new URLSearchParams(location.search);
  const rid = sp.get("cqi_report_id");
  if (!rid) return;
  // 다른 모듈 초기화가 끝난 뒤 실행
  setTimeout(async () => {
    try {
      const res = await fetch(`/api/cqi-reports/${encodeURIComponent(rid)}`);
      if (!res.ok) return;
      const data = await res.json();
      const formatted = formatCqiReport(data);
      cqiTextEl.value = formatted;
      cqiTextEl.style.transition = "box-shadow .4s";
      cqiTextEl.style.boxShadow = "0 0 0 3px rgba(56,189,248,.5)";
      setTimeout(() => { cqiTextEl.style.boxShadow = ""; }, 1200);
      showStatus("✅ 학습 분석 보고서를 자동으로 불러왔습니다. 검토 후 PPT를 업로드하세요.", "ok");
    } catch (e) {
      console.warn("CQI deep-link 자동 적용 실패:", e);
    }
  }, 200);
})();

// ── 모드 1: PPT 파일 업로드 ─────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = fileInput.files?.[0];
  if (!f) return;

  submitBtn.disabled = true;
  statusEl.hidden = true;
  setProgress(2, "파일 업로드 중...");

  const fd = new FormData();
  fd.append("file", f);
  fd.append("cqi", document.getElementById("cqi-text")?.value || "");
  // 포털 컨텍스트 (교과목명·주차번호) 전달
  const _sp = new URLSearchParams(location.search);
  fd.append("course", _sp.get("course") || "");
  fd.append("week",   _sp.get("week")   || "");

  let lectureId;
  try {
    const res  = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(`업로드 오류 ${res.status}: ${data.detail ?? "알 수 없는 오류"}`);
      submitBtn.disabled = false;
      return;
    }
    lectureId = data.lecture_id;
  } catch (err) {
    showError(`네트워크 오류: ${err.message}`);
    submitBtn.disabled = false;
    return;
  }

  showStatus(`업로드 완료 (lecture_id: ${lectureId}). 처리 중...`, "ok");
  listenSSE(lectureId, submitBtn);
});

// ── 모드 2: 프롬프트로 PPT 자동 생성 ────────────────────────────────
promptForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = (promptText.value || "").trim();
  if (text.length < 10) {
    showError("프롬프트가 너무 짧습니다. 강의 주제와 세부 내용을 더 자세히 작성해 주세요 (최소 10자).");
    return;
  }

  promptSubmit.disabled = true;
  statusEl.hidden = true;
  setProgress(1, "프롬프트 전송 중...");

  const fd = new FormData();
  fd.append("prompt", text);
  fd.append("num_slides", (promptNum.value || "").trim());
  fd.append("cqi", document.getElementById("cqi-text")?.value || "");
  const _sp = new URLSearchParams(location.search);
  fd.append("course", _sp.get("course") || "");
  fd.append("week",   _sp.get("week")   || "");

  let lectureId;
  try {
    const res  = await fetch("/api/upload-prompt", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(`요청 오류 ${res.status}: ${data.detail ?? "알 수 없는 오류"}`);
      promptSubmit.disabled = false;
      return;
    }
    lectureId = data.lecture_id;
  } catch (err) {
    showError(`네트워크 오류: ${err.message}`);
    promptSubmit.disabled = false;
    return;
  }

  showStatus(`프롬프트 접수 완료 (lecture_id: ${lectureId}). AI가 PPT를 자동 생성합니다...`, "ok");
  listenSSE(lectureId, promptSubmit);
});

// ── SSE 진행률 수신 ─────────────────────────────────────────────────
function listenSSE(lectureId, activeBtn) {
  const src = new EventSource(`/api/jobs/${lectureId}/events`);
  let terminated = false;

  function closeSSE() { terminated = true; src.close(); }
  function reenable() { if (activeBtn) activeBtn.disabled = false; }

  src.addEventListener("step",     (e) => { const d = JSON.parse(e.data); setProgress(d.progress, d.label); });
  src.addEventListener("progress", (e) => { const d = JSON.parse(e.data); setProgress(d.progress, d.label); });

  src.addEventListener("scripts_ready", (e) => {
    closeSSE();
    setProgress(80, "스크립트 편집 페이지로 이동합니다...");
    const d = JSON.parse(e.data);
    setTimeout(() => { location.href = `/scripts?id=${d.lecture_id}`; }, 600);
  });

  src.addEventListener("job_error", (e) => {
    closeSSE();
    const msg = JSON.parse(e.data).message ?? "알 수 없는 오류";
    showError(`처리 오류: ${msg}`);
    reenable();
  });

  src.onerror = () => {
    if (terminated) return;
    closeSSE();
    showError("서버 연결이 끊어졌습니다. 페이지를 새로고침하세요.");
    reenable();
  };
}

// ── UI 헬퍼 ─────────────────────────────────────────────────────────
function setProgress(pct, label) {
  progressWrap.hidden    = false;
  progressLabel.textContent = label;
  progressFill.style.width  = `${pct}%`;
  progressPct.textContent   = `${pct}%`;
}

function showStatus(msg, cls = "") {
  statusEl.hidden    = false;
  statusEl.className = `status${cls ? " " + cls : ""}`;
  statusEl.textContent = msg;
}

function showError(msg) {
  progressWrap.hidden = true;
  showStatus(msg, "error");
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── 강의 목록 (현재 컨텍스트의 교과목·주차에 한정) ────────────────────
async function loadLibrary() {
  const listEl   = document.getElementById("library-list");
  const titleEl  = document.getElementById("lib-sidebar-title");
  if (!listEl) return;
  listEl.innerHTML = '<p class="lib-empty">로딩 중...</p>';

  // URL의 course/week 파라미터를 API 쿼리에 포함
  const _sp     = new URLSearchParams(location.search);
  const course  = _sp.get("course") || "";
  const week    = _sp.get("week")   || "";

  // 사이드바 헤더 텍스트를 컨텍스트에 맞게 갱신
  if (titleEl) {
    if (course && week) {
      titleEl.textContent = `${course} · ${week}주차 강의`;
    } else if (course) {
      titleEl.textContent = `${course} 강의 목록`;
    } else {
      titleEl.textContent = "생성된 강의 목록";
    }
  }

  // 컨텍스트가 있으면 필터링 쿼리, 없으면 전체
  const qs = new URLSearchParams();
  if (course) qs.set("course", course);
  if (week)   qs.set("week", week);
  const url = qs.toString() ? `/api/lectures?${qs.toString()}` : "/api/lectures";

  try {
    const res      = await fetch(url);
    const lectures = await res.json();

    if (!Array.isArray(lectures) || lectures.length === 0) {
      const emptyMsg = (course && week)
        ? `${course} ${week}주차 강의가 아직 없습니다. 위에서 PPT를 업로드하세요.`
        : "아직 생성된 강의가 없습니다. 위에서 PPT를 업로드하세요.";
      listEl.innerHTML = `<p class="lib-empty">${esc(emptyMsg)}</p>`;
      return;
    }

    listEl.innerHTML = lectures.map(lec => {
      const date = lec.created_at
        ? new Date(lec.created_at).toLocaleDateString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" })
        : "날짜 없음";
      const cqiBadge = lec.has_cqi ? '<span class="lib-badge-cqi">CQI</span>' : "";
      return `
        <div class="lib-card" id="card-${lec.lecture_id}">
          <div class="lib-card-info">
            <div class="lib-card-title">${esc(lec.title)}</div>
            <div class="lib-card-meta">
              ${cqiBadge}
              <span>${date}</span>
              <span>${lec.slide_count}장 · ${lec.segment_count}세그</span>
            </div>
          </div>
          <div class="lib-card-actions">
            <a href="/player?id=${lec.lecture_id}" class="lib-btn lib-btn-primary">▶ 재생</a>
            <a href="/scripts?id=${lec.lecture_id}" class="lib-btn">✏️ 편집</a>
            <button class="lib-btn lib-btn-delete" title="강의 삭제"
              onclick="deleteLecture('${lec.lecture_id}', '${esc(lec.title)}')">🗑</button>
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    listEl.innerHTML = `<p class="lib-empty" style="color:var(--error)">목록 로드 오류: ${err.message}</p>`;
  }
}

document.getElementById("btn-lib-refresh")?.addEventListener("click", loadLibrary);
loadLibrary();

// ── 최근 업로드 PPT / 프롬프트 ────────────────────────────────────────
function fmtDate(epochSec) {
  if (!epochSec) return "";
  const d = new Date(epochSec * 1000);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) +
    " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

async function loadRecentPpt() {
  const listEl = document.getElementById("recent-ppt-list");
  if (!listEl) return;
  listEl.innerHTML = '<p class="lib-empty">로딩 중...</p>';
  try {
    const res = await fetch("/api/recent-uploads?type=ppt&limit=10");
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = '<p class="lib-empty">최근 업로드한 PPT가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = items.map(it => {
      const ctx = (it.course && it.week)
        ? `<span class="recent-card-chip">${esc(it.course)} · ${esc(it.week)}주차</span>`
        : "";
      return `
        <div class="recent-card" data-source-id="${esc(it.lecture_id)}"
             data-filename="${esc(it.original_filename)}">
          <div class="recent-card-title" title="${esc(it.original_filename)}">📂 ${esc(it.original_filename)}</div>
          <div class="recent-card-meta">
            ${ctx}
            <span>${fmtDate(it.created_at)}</span>
            <span>${fmtSize(it.size_bytes)}</span>
          </div>
          <span class="recent-card-hint">↻ 이 PPT로 새 강의 만들기</span>
        </div>`;
    }).join("");
    // 클릭 핸들러
    listEl.querySelectorAll(".recent-card").forEach(card => {
      card.addEventListener("click", () => reusePpt(card.dataset.sourceId, card.dataset.filename));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="lib-empty" style="color:var(--error)">목록 로드 오류: ${err.message}</p>`;
  }
}

async function loadRecentPrompts() {
  const listEl = document.getElementById("recent-prompt-list");
  if (!listEl) return;
  listEl.innerHTML = '<p class="lib-empty">로딩 중...</p>';
  try {
    const res = await fetch("/api/recent-uploads?type=prompt&limit=10");
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = '<p class="lib-empty">최근 입력한 프롬프트가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = items.map((it, idx) => {
      const ctx = (it.course && it.week)
        ? `<span class="recent-card-chip">${esc(it.course)} · ${esc(it.week)}주차</span>`
        : "";
      const numChip = it.num_slides
        ? `<span>${it.num_slides}장 요청</span>`
        : "";
      return `
        <div class="recent-card" data-idx="${idx}">
          <div class="recent-card-prompt">${esc(it.prompt_text || "").trim()}</div>
          <div class="recent-card-meta">
            ${ctx}
            <span>${fmtDate(it.created_at)}</span>
            ${numChip}
          </div>
          <span class="recent-card-hint">↻ 이 프롬프트 불러오기</span>
        </div>`;
    }).join("");
    // 클릭 핸들러
    listEl.querySelectorAll(".recent-card").forEach(card => {
      const i = parseInt(card.dataset.idx, 10);
      card.addEventListener("click", () => loadPromptIntoForm(items[i]));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="lib-empty" style="color:var(--error)">목록 로드 오류: ${err.message}</p>`;
  }
}

async function reusePpt(sourceId, filename) {
  if (!confirm(`"${filename}" 으로 새 강의를 생성합니다.\n현재 교과목·주차 컨텍스트로 등록됩니다. 계속하시겠습니까?`)) return;

  submitBtn.disabled = true;
  statusEl.hidden = true;
  setProgress(2, "원본 PPT 복사 중...");

  const fd = new FormData();
  fd.append("source_lecture_id", sourceId);
  fd.append("cqi", document.getElementById("cqi-text")?.value || "");
  const _sp = new URLSearchParams(location.search);
  fd.append("course", _sp.get("course") || "");
  fd.append("week",   _sp.get("week")   || "");

  let lectureId;
  try {
    const res  = await fetch("/api/upload-from-source", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(`요청 오류 ${res.status}: ${data.detail ?? "알 수 없는 오류"}`);
      submitBtn.disabled = false;
      return;
    }
    lectureId = data.lecture_id;
  } catch (err) {
    showError(`네트워크 오류: ${err.message}`);
    submitBtn.disabled = false;
    return;
  }

  showStatus(`복사 완료 (lecture_id: ${lectureId}). 처리 중...`, "ok");
  listenSSE(lectureId, submitBtn);
}

function loadPromptIntoForm(item) {
  if (!item || !promptText) return;
  promptText.value = (item.prompt_text || "").trim();
  if (promptNum && item.num_slides) promptNum.value = String(item.num_slides);
  promptText.focus();
  promptText.scrollIntoView({ behavior: "smooth", block: "center" });
  // 시각적 피드백
  promptText.style.transition = "box-shadow .4s";
  promptText.style.boxShadow = "0 0 0 3px rgba(56,189,248,.4)";
  setTimeout(() => { promptText.style.boxShadow = ""; }, 800);
}

document.getElementById("btn-recent-ppt-refresh")?.addEventListener("click", loadRecentPpt);
document.getElementById("btn-recent-prompt-refresh")?.addEventListener("click", loadRecentPrompts);

// 초기 모드(PPT)에 맞춰 한 번 로드
loadRecentPpt();
document.getElementById("recent-ppt").hidden = false;

// ── 강의 삭제 ────────────────────────────────────────────────────────
async function deleteLecture(lectureId, title) {
  if (!confirm(`"${title}" 강의를 삭제하시겠습니까?\n슬라이드·음성 파일이 모두 디스크에서 제거됩니다.`)) return;

  const card = document.getElementById(`card-${lectureId}`);
  if (card) {
    card.style.opacity = "0.4";
    card.style.pointerEvents = "none";
  }

  try {
    const res = await fetch(`/api/lectures/${lectureId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`삭제 실패: ${data.detail ?? res.status}`);
      if (card) { card.style.opacity = ""; card.style.pointerEvents = ""; }
      return;
    }
    card?.remove();
    const listEl = document.getElementById("library-list");
    if (listEl && !listEl.querySelector(".lib-card")) {
      const _sp = new URLSearchParams(location.search);
      const c = _sp.get("course") || "";
      const w = _sp.get("week")   || "";
      const emptyMsg = (c && w)
        ? `${c} ${w}주차 강의가 아직 없습니다. 위에서 PPT를 업로드하세요.`
        : "아직 생성된 강의가 없습니다. 위에서 PPT를 업로드하세요.";
      listEl.innerHTML = `<p class="lib-empty">${esc(emptyMsg)}</p>`;
    }
  } catch (err) {
    alert(`삭제 오류: ${err.message}`);
    if (card) { card.style.opacity = ""; card.style.pointerEvents = ""; }
  }
}
