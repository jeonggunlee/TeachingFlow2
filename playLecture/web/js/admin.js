let authHeader = null;

// ── DOM 참조 ──────────────────────────────────────────────
const loginSection  = document.getElementById("login-section");
const adminSection  = document.getElementById("admin-section");
const passwordInput = document.getElementById("password-input");
const loginForm     = document.getElementById("login-form");
const loginError    = document.getElementById("login-error");
const uploadForm    = document.getElementById("upload-form");
const zipInput      = document.getElementById("zip-input");
const zipLabel      = document.getElementById("zip-label");
const progressFill  = document.getElementById("upload-progress-fill");
const uploadStatus  = document.getElementById("upload-status");
const lectureList   = document.getElementById("lecture-list");

// ── 초기화 ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const stored = sessionStorage.getItem("admin_auth");
  if (stored) {
    authHeader = stored;
    showAdminPanel();
  }

  // 파일 선택 시 라벨 업데이트
  zipInput?.addEventListener("change", () => {
    const name = zipInput.files[0]?.name || "ZIP 파일 선택";
    zipLabel.textContent = name;
  });
});

// ── 로그인 ───────────────────────────────────────────────
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const password = passwordInput.value;
  const candidate = "Basic " + btoa("admin:" + password);

  try {
    const res = await fetch("/admin/lectures", { headers: { Authorization: candidate } });
    if (res.ok) {
      authHeader = candidate;
      sessionStorage.setItem("admin_auth", authHeader);
      showAdminPanel();   // 로그인 후 관리자 패널 표시 (ZIP 업로드 · 강의별 운영 설정)
    } else {
      loginError.textContent = "비밀번호가 틀렸습니다.";
    }
  } catch (_) {
    loginError.textContent = "서버 연결 오류";
  }
});

function showAdminPanel() {
  loginSection.hidden = true;
  adminSection.hidden = false;
  loadLectures();
}

// ── 로그아웃 ─────────────────────────────────────────────
document.getElementById("btn-logout")?.addEventListener("click", () => {
  sessionStorage.removeItem("admin_auth");
  authHeader = null;
  loginSection.hidden = false;
  adminSection.hidden = true;
  passwordInput.value = "";
});

// ── 업로드 ───────────────────────────────────────────────
uploadForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const file = zipInput.files[0];
  if (!file) return;

  setStatus("", "");
  progressFill.style.width = "0%";

  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (ev) => {
    if (ev.lengthComputable) {
      const pct = Math.round(ev.loaded / ev.total * 100);
      progressFill.style.width = pct + "%";
    }
  });

  xhr.addEventListener("load", () => {
    progressFill.style.width = "0%";
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      setStatus(`✅ "${data.title}" 등록 완료`, "ok");
      zipInput.value = "";
      zipLabel.textContent = "ZIP 파일 선택";
      loadLectures();
    } else {
      const msg = tryParseDetail(xhr.responseText);
      setStatus(`❌ 오류: ${msg}`, "error");
    }
  });

  xhr.addEventListener("error", () => {
    progressFill.style.width = "0%";
    setStatus("❌ 업로드 중 네트워크 오류", "error");
  });

  xhr.open("POST", "/admin/upload");
  xhr.setRequestHeader("Authorization", authHeader);
  xhr.send(formData);
});

function tryParseDetail(text) {
  try { return JSON.parse(text).detail || text; } catch (_) { return text; }
}

function setStatus(msg, cls) {
  uploadStatus.textContent = msg;
  uploadStatus.className   = "upload-status " + cls;
}

// ── 강의 목록 ────────────────────────────────────────────
async function loadLectures() {
  lectureList.innerHTML = '<p class="lecture-list-empty">로딩 중…</p>';
  try {
    const res = await fetch("/admin/lectures", { headers: { Authorization: authHeader } });
    const data = await res.json();

    if (!data.length) {
      lectureList.innerHTML = '<p class="lecture-list-empty">등록된 강의가 없습니다.</p>';
      return;
    }

    lectureList.innerHTML = "";

    // 파일이 사라진 강의(유령)는 재생·분석이 불가능하다 — 한 번에 정리할 수 있게 안내
    const missing = data.filter((l) => l.files_present === false);
    if (missing.length) {
      const bar = document.createElement("div");
      bar.className = "lecture-list-warning";
      bar.innerHTML = `
        <span>⚠️ 강의 파일이 없는 항목 ${missing.length}건 — 수강생 목록에 보이지 않고 분석도 되지 않습니다.</span>
        <button class="prune-btn">정리하기</button>`;
      bar.querySelector(".prune-btn").addEventListener("click", pruneMissing);
      lectureList.appendChild(bar);
    }

    for (const l of data) {
      const mins = Math.floor(l.duration_ms / 60000);
      const secs = Math.floor((l.duration_ms % 60000) / 1000);

      const row = document.createElement("div");
      row.className = "lecture-row" + (l.files_present === false ? " lecture-row-missing" : "");
      row.innerHTML = `
        <span class="lecture-row-title" title="${escHtml(l.title)}">${
          l.files_present === false ? "⚠️ " : ""}${escHtml(l.title)}</span>
        <span class="lecture-row-meta">${l.slide_count}슬라이드 · ${mins}분 ${secs}초${
          l.files_present === false ? " · 파일 없음" : ""}</span>
        <span class="lecture-row-date">${l.registered_at.slice(0, 10)}</span>
        <button class="delete-btn" data-id="${escHtml(l.id)}">삭제</button>
        <div class="lecture-row-settings">
          <span class="settings-label">🤖 AI 운영</span>
          <label class="toggle">
            <input type="checkbox" class="opt-ai-answer" ${l.ai_answer ? "checked" : ""} />
            <span class="toggle-track"></span>
            <span class="toggle-text">AI 교수 답변</span>
          </label>
          <label class="toggle">
            <input type="checkbox" class="opt-auto-question" ${l.auto_question ? "checked" : ""} />
            <span class="toggle-track"></span>
            <span class="toggle-text">자동 질문 생성</span>
          </label>
          <span class="settings-saved" hidden>저장됨 ✓</span>
        </div>
      `;
      row.querySelector(".delete-btn").addEventListener("click", () => deleteLecture(l.id));

      const aiCb   = row.querySelector(".opt-ai-answer");
      const autoCb = row.querySelector(".opt-auto-question");
      const saved  = row.querySelector(".settings-saved");
      const onToggle = () => saveSettings(l.id, aiCb.checked, autoCb.checked, saved, [aiCb, autoCb]);
      aiCb.addEventListener("change", onToggle);
      autoCb.addEventListener("change", onToggle);

      lectureList.appendChild(row);
    }
  } catch (e) {
    lectureList.innerHTML = `<p class="lecture-list-empty" style="color:var(--error)">로드 실패: ${e.message}</p>`;
  }
}

async function pruneMissing() {
  if (!confirm("강의 파일이 없는 항목과 그 수강 데이터(질문·난이도·진도)를 삭제합니다.\n계속할까요?")) return;
  try {
    const res = await fetch("/admin/prune-missing", {
      method: "POST", headers: { Authorization: authHeader },
    });
    const data = await res.json();
    alert(`${data.removed}건을 정리했습니다.`);
    loadLectures();
  } catch (e) {
    alert("정리 실패: " + e.message);
  }
}

async function saveSettings(id, aiAnswer, autoQuestion, savedEl, inputs) {
  inputs.forEach((i) => (i.disabled = true));
  try {
    const res = await fetch(`/admin/lectures/${id}/settings`, {
      method:  "PUT",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body:    JSON.stringify({ ai_answer: aiAnswer, auto_question: autoQuestion }),
    });
    if (res.ok) {
      savedEl.hidden = false;
      setTimeout(() => (savedEl.hidden = true), 1500);
    } else {
      alert("설정 저장 실패: " + tryParseDetail(await res.text()));
    }
  } catch (e) {
    alert("설정 저장 중 오류: " + e.message);
  } finally {
    inputs.forEach((i) => (i.disabled = false));
  }
}

async function deleteLecture(id) {
  if (!confirm("강의를 삭제하면 모든 파일과 데이터가 영구 삭제됩니다. 계속하시겠습니까?")) return;
  try {
    const res = await fetch(`/admin/lectures/${id}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      loadLectures();
    } else {
      alert("삭제 실패: " + tryParseDetail(await res.text()));
    }
  } catch (e) {
    alert("삭제 중 오류: " + e.message);
  }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
