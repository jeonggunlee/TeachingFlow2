// CQI 진화 관리 — 누적 지시 검토·승인 + 새 버전 생성
const P         = new URLSearchParams(location.search);
const lectureId = P.get("id") || "";
const fromUrl   = P.get("from") || `${location.protocol}//${location.hostname}:8003`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

$("back-btn").href = fromUrl;

let _entries = [];
let _busy    = false;

const STATUS_LABEL = {
  pending:    "검토 대기",
  approved:   "승인됨",
  discarded:  "폐기",
  superseded: "대체됨",
};
const ACTION_LABEL = {
  enhance_script: "스크립트 보강",
  add_slide:      "슬라이드 추가",
  add_example:    "예시 추가",
};

// ── 로드 ────────────────────────────────────────────────────────────
async function loadAll() {
  if (!lectureId) {
    $("page-sub").textContent = "URL에 ?id= 가 없습니다.";
    return;
  }
  await Promise.all([loadLineage(), loadLedger()]);
  loadReports();
}

async function loadLineage() {
  try {
    const res = await fetch(`/api/lectures/${lectureId}/lineage`);
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();

    const box = $("lineage");
    box.innerHTML = "";
    d.versions.forEach((v, i) => {
      if (i > 0) {
        const arrow = document.createElement("span");
        arrow.className = "ver-arrow";
        arrow.textContent = "→";
        box.appendChild(arrow);
      }
      const a = document.createElement("a");
      a.className = "ver" + (v.lecture_id === lectureId ? " current" : "");
      a.href = `/evolve?id=${encodeURIComponent(v.lecture_id)}&from=${encodeURIComponent(fromUrl)}`;
      a.innerHTML = `
        <span class="ver-no">v${v.version}${v.lecture_id === lectureId ? " (현재)" : ""}</span>
        <span class="ver-meta">${v.has_lecture_json ? "완료" : "제작 중"}</span>`;
      box.appendChild(a);
    });

    const cur = d.versions.find(v => v.lecture_id === lectureId);
    if (cur && (cur.course || cur.week)) {
      const chip = $("ctx-chip");
      chip.textContent = [cur.course, cur.week ? `${cur.week}주차` : ""].filter(Boolean).join(" · ");
      chip.hidden = false;
    }
    $("page-sub").textContent =
      `강의 ${lectureId} · 버전 ${cur ? cur.version : 1} · 계보 내 ${d.versions.length}개 버전`;
  } catch (e) {
    $("lineage").innerHTML = `<span class="empty">계보 로드 실패: ${esc(e.message)}</span>`;
  }
}

async function loadLedger() {
  try {
    const res = await fetch(`/api/lectures/${lectureId}/cqi-ledger`);
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    _entries = d.entries || [];
    renderStats(d.stats || {});
    renderEntries();
  } catch (e) {
    $("entries").innerHTML = `<div class="empty">원장 로드 실패: ${esc(e.message)}</div>`;
  }
}

async function loadReports() {
  const sel = $("report-select");
  try {
    const res = await fetch("/api/cqi-reports?limit=30");
    const list = res.ok ? await res.json() : [];
    const done = list.filter(r => r.status === "done");
    if (!done.length) {
      sel.innerHTML = `<option value="">완료된 분석 보고서가 없습니다</option>`;
      return;
    }
    sel.innerHTML = done.map(r => {
      const dt = r.generated_at ? new Date(r.generated_at).toLocaleString("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }) : "";
      return `<option value="${esc(r.report_id)}">${esc(r.lecture_title || r.lecture_id)} — ${esc(dt)}</option>`;
    }).join("");
  } catch (_) {
    sel.innerHTML = `<option value="">보고서 로드 실패</option>`;
  }
}

// ── 렌더 ────────────────────────────────────────────────────────────
function renderStats(s) {
  $("stats").innerHTML = `
    <span class="stat pending">검토 대기 <b>${s.pending || 0}</b></span>
    <span class="stat approved">승인 <b>${s.approved || 0}</b></span>
    <span class="stat">폐기 <b>${s.discarded || 0}</b></span>
    <span class="stat">대체됨 <b>${s.superseded || 0}</b></span>`;

  const n = s.approved || 0;
  $("run-info").textContent = n
    ? `승인된 지시 ${n}건이 새 버전에 반영됩니다.`
    : "승인된 지시가 없습니다. 먼저 지시문을 승인해주세요.";
  $("btn-evolve").disabled = _busy || n === 0;
}

function renderEntries() {
  const box = $("entries");
  if (!_entries.length) {
    box.innerHTML = `<div class="empty">아직 누적된 지시문이 없습니다. 위에서 분석 보고서를 가져오세요.</div>`;
    return;
  }
  // 검토 대기 → 승인 → 나머지 순, 각 그룹은 최신 사이클 우선
  const order = { pending: 0, approved: 1, superseded: 2, discarded: 3 };
  const sorted = [..._entries].sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
    (b.cycle || 0) - (a.cycle || 0));

  box.innerHTML = "";
  for (const e of sorted) {
    const ref = e.slide_ref || {};
    const refBits = [];
    if (ref.title) refBits.push(`슬라이드 「${esc(ref.title)}」`);
    else if (ref.idx !== undefined && ref.idx !== null) refBits.push(`슬라이드 ${ref.idx + 1}`);
    if (ref.concepts?.length) refBits.push(esc(ref.concepts.slice(0, 3).join(", ")));
    if (typeof ref.confusion_score === "number")
      refBits.push(`혼란도 ${Math.round(ref.confusion_score * 100)}%`);

    const div = document.createElement("div");
    div.className = `entry ${e.status}`;
    div.innerHTML = `
      <div class="entry-top">
        <span class="badge ${e.status}">${STATUS_LABEL[e.status] || e.status}</span>
        <span class="badge cycle">사이클 ${e.cycle || 0}</span>
        ${e.recommended_action && ACTION_LABEL[e.recommended_action]
          ? `<span class="badge action">${ACTION_LABEL[e.recommended_action]}</span>` : ""}
        ${e.applied_in_cycle ? `<span class="badge">v${e.applied_in_cycle} 반영됨</span>` : ""}
        ${refBits.length ? `<span class="entry-ref">${refBits.join(" · ")}</span>` : ""}
      </div>
      <textarea class="entry-text" data-id="${esc(e.id)}">${esc(e.instruction)}</textarea>
      <div class="entry-actions"></div>`;

    const acts = div.querySelector(".entry-actions");
    const ta   = div.querySelector(".entry-text");

    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener("click", fn);
      acts.appendChild(b);
      return b;
    };

    if (e.status !== "approved") {
      mk("✓ 승인", "ok", () => setStatus(e.id, "approved", ta.value));
    } else {
      mk("↩ 승인 취소", "", () => setStatus(e.id, "pending", ta.value));
    }
    if (e.status !== "discarded") {
      mk("✕ 폐기", "warn", () => setStatus(e.id, "discarded", null));
    } else {
      mk("↩ 되살리기", "", () => setStatus(e.id, "pending", null));
    }
    mk("💾 문구 저장", "", async () => {
      await patch(e.id, { instruction: ta.value });
      await loadLedger();
    });

    box.appendChild(div);
  }
}

// ── 액션 ────────────────────────────────────────────────────────────
async function patch(entryId, body) {
  const res = await fetch(`/api/lectures/${lectureId}/cqi-ledger/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(`오류: ${d.detail || res.status}`);
    return null;
  }
  return res.json();
}

async function setStatus(entryId, status, instruction) {
  const body = { status };
  // 승인 시 편집한 문구를 함께 저장
  if (instruction !== null && instruction !== undefined) body.instruction = instruction;
  await patch(entryId, body);
  await loadLedger();
}

$("btn-import").addEventListener("click", async () => {
  const reportId = $("report-select").value;
  if (!reportId) { alert("가져올 보고서를 선택하세요."); return; }
  const btn = $("btn-import");
  btn.disabled = true; btn.textContent = "가져오는 중…";
  try {
    const res = await fetch(`/api/lectures/${lectureId}/cqi-ledger/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) alert(`오류: ${d.detail || res.status}`);
    else if (!d.added) alert("새로 추가된 지시문이 없습니다 (이미 가져왔거나 조치 불필요).");
    await loadLedger();
  } finally {
    btn.disabled = false; btn.textContent = "↓ 지시문 가져오기";
  }
});

$("btn-add-manual").addEventListener("click", async () => {
  const text = $("manual-text").value.trim();
  if (!text) return;
  const res = await fetch(`/api/lectures/${lectureId}/cqi-ledger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: text }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(`오류: ${d.detail || res.status}`);
    return;
  }
  $("manual-text").value = "";
  await loadLedger();
});

// ── 진화 실행 ───────────────────────────────────────────────────────
$("btn-evolve").addEventListener("click", async () => {
  if (!confirm("승인된 CQI 지시를 반영해 새 버전을 만듭니다.\n현재 버전은 그대로 보존됩니다. 계속할까요?")) return;

  _busy = true;
  $("btn-evolve").disabled = true;
  $("prog-wrap").hidden = false;
  setProg(2, "진화 준비 중…");

  let newId;
  try {
    const res = await fetch(`/api/lectures/${lectureId}/evolve`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`오류: ${d.detail || res.status}`);
      _busy = false; $("btn-evolve").disabled = false; $("prog-wrap").hidden = true;
      return;
    }
    newId = d.lecture_id;
    setProg(3, `새 버전 v${d.version} 생성 — 진화 시작…`);
  } catch (e) {
    alert(`네트워크 오류: ${e.message}`);
    _busy = false; $("btn-evolve").disabled = false; $("prog-wrap").hidden = true;
    return;
  }

  // SSE 진행 스트림
  const es = new EventSource(`/api/jobs/${newId}/events`);
  let terminated = false;

  const onProgress = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.label) setProg(d.progress ?? 0, d.label);
    } catch (_) {}
  };
  es.addEventListener("step", onProgress);
  es.addEventListener("progress", onProgress);

  es.addEventListener("scripts_ready", () => {
    terminated = true; es.close();
    setProg(100, "진화 완료 — 스크립트 편집으로 이동합니다…");
    const q = new URLSearchParams({ id: newId, from: fromUrl });
    setTimeout(() => { location.href = `/scripts?${q.toString()}`; }, 900);
  });

  es.addEventListener("job_error", (ev) => {
    terminated = true; es.close();
    let msg = "알 수 없는 오류";
    try { msg = JSON.parse(ev.data).message || msg; } catch (_) {}
    setProg(0, `❌ ${msg}`);
    alert(`진화 실패: ${msg}`);
    _busy = false; $("btn-evolve").disabled = false;
  });

  es.onerror = () => { if (terminated) es.close(); };
});

function setProg(pct, label) {
  $("prog-fill").style.width = `${Math.max(0, Math.min(100, pct))}%`;
  $("prog-label").textContent = label || "";
}

loadAll();
