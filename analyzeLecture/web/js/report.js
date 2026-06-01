const _params  = new URLSearchParams(location.search);
const reportId = _params.get("id") || "";

// 포털 뒤로가기 버튼
(function() {
  const from = _params.get('from') || `${location.protocol}//${location.hostname}:8003`;
  document.getElementById('nav-portal-back').href = from;
})();
const loadingEl   = document.getElementById("loading");
const reportBody  = document.getElementById("report-body");

let _reportData = null;

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit",
  });
}

// ── 난이도 분포 차트 ─────────────────────────────────

function diffChartHtml(diff) {
  const total = diff.total || 0;
  if (total === 0) {
    return `<div class="diff-chart-wrap diff-no-data">난이도 평가 없음</div>`;
  }

  const easy = diff["쉬움"] || 0;
  const mid  = diff["보통"] || 0;
  const hard = diff["어려움"] || 0;

  const ePct = Math.round(easy / total * 100);
  const mPct = Math.round(mid  / total * 100);
  const hPct = 100 - ePct - mPct;   // 반올림 오차 흡수

  return `
    <div class="diff-chart-wrap">
      <div class="diff-chart-header">
        <span class="diff-chart-label">난이도 분포</span>
        <span class="diff-chart-total">총 ${total}명 응답</span>
      </div>

      <!-- Stacked bar -->
      <div class="diff-stacked-bar">
        ${ePct > 0 ? `<div class="diff-seg diff-easy"  style="width:${ePct}%" title="쉬움 ${easy}명(${ePct}%)">
          ${ePct >= 10 ? `${ePct}%` : ""}
        </div>` : ""}
        ${mPct > 0 ? `<div class="diff-seg diff-mid"   style="width:${mPct}%" title="보통 ${mid}명(${mPct}%)">
          ${mPct >= 10 ? `${mPct}%` : ""}
        </div>` : ""}
        ${hPct > 0 ? `<div class="diff-seg diff-hard"  style="width:${hPct}%" title="어려움 ${hard}명(${hPct}%)">
          ${hPct >= 10 ? `${hPct}%` : ""}
        </div>` : ""}
      </div>

      <!-- 범례 -->
      <div class="diff-legend">
        <span class="diff-legend-item easy">
          <span class="diff-legend-dot"></span>😊 쉬움 ${easy}명
        </span>
        <span class="diff-legend-item mid">
          <span class="diff-legend-dot"></span>😐 보통 ${mid}명
        </span>
        <span class="diff-legend-item hard">
          <span class="diff-legend-dot"></span>😰 어려움 ${hard}명
        </span>
      </div>
    </div>`;
}

// confusion_score 0~1 → CSS 색상 (초록→노랑→빨강)
function scoreColor(score) {
  if (score < 0.3) return "#16a34a";
  if (score < 0.6) return "#d97706";
  return "#dc2626";
}

function actionLabel(action) {
  return {
    enhance_script: "스크립트 보강",
    add_slide:      "슬라이드 추가",
    add_example:    "예시 추가",
    no_action:      "조치 불필요",
  }[action] || action;
}

// ── 재생 행동 시그널 위젯 ────────────────────────────
//
// playback_stats: { pause, seek_back, seek_forward, replay, speed_change, total }
// total === 0 인 경우 위젯 표시하지 않음.
const _PB_ITEMS = [
  { key: "pause",        icon: "⏸",  label: "일시정지", weight: "neutral", help: "수강생이 강의를 멈춘 횟수" },
  { key: "seek_back",    icon: "⏪",  label: "되감기",   weight: "warning", help: "이해가 안 돼 뒤로 돌린 횟수" },
  { key: "replay",       icon: "↻",   label: "다시보기", weight: "alert",   help: "후반에서 처음으로 돌아간 횟수" },
  { key: "seek_forward", icon: "⏩",  label: "건너뜀",   weight: "info",    help: "흥미 저하 또는 이미 아는 내용을 넘긴 횟수" },
  { key: "speed_change", icon: "⚙",  label: "속도변경", weight: "subtle",  help: "재생 속도를 바꾼 횟수" },
];

function playbackStatsHtml(stats) {
  if (!stats || !stats.total) return "";
  const total = stats.total || 0;
  return `
    <div class="pb-stats-wrap">
      <div class="pb-stats-header">
        <span class="pb-stats-title">재생 행동 시그널</span>
        <span class="pb-stats-total">총 ${total}건</span>
      </div>
      <div class="pb-stats-row">
        ${_PB_ITEMS.map(it => {
          const v = stats[it.key] || 0;
          const cls = v > 0 ? `pb-cell pb-${it.weight}` : "pb-cell pb-zero";
          return `<span class="${cls}" title="${escHtml(it.label)} — ${escHtml(it.help)}">
            <span class="pb-icon">${it.icon}</span>
            <span class="pb-count">${v}</span>
            <span class="pb-label">${escHtml(it.label)}</span>
          </span>`;
        }).join("")}
      </div>
    </div>`;
}

// ── 체크포인트 퀴즈 결과 위젯 ────────────────────────
function quizStatsHtml(stats) {
  if (!stats || !stats.total_responses) return "";
  const total   = stats.total_responses || 0;
  const correct = stats.correct_count   || 0;
  const acc     = stats.accuracy;
  const accPct  = (typeof acc === "number") ? Math.round(acc * 100) : null;
  const dist    = stats.option_distribution || [];
  const ci      = stats.correct_index;
  // 정답률 색상: 0.5↓ 빨강, 0.5~0.75 노랑, 0.75↑ 초록
  let accCls = "qz-acc-unknown";
  if (accPct !== null) {
    accCls = accPct < 50 ? "qz-acc-low" : (accPct < 75 ? "qz-acc-mid" : "qz-acc-high");
  }
  const maxN = Math.max(1, ...dist);

  return `
    <div class="qz-stats-wrap">
      <div class="qz-stats-header">
        <span class="qz-stats-title">📝 체크포인트 퀴즈 결과</span>
        <span class="qz-stats-acc ${accCls}">
          정답률 ${accPct !== null ? `${accPct}%` : "—"}
          <span class="qz-stats-sub">(${correct}/${total})</span>
        </span>
      </div>
      ${dist.length ? `
      <div class="qz-dist">
        ${dist.map((n, i) => {
          const pct  = total ? Math.round(n / total * 100) : 0;
          const isC  = (i === ci);
          const cls  = isC ? "qz-bar qz-bar-correct" : "qz-bar";
          const barW = Math.max(2, (n / maxN) * 100);
          return `
            <div class="qz-row">
              <span class="qz-row-label">옵션 ${i + 1}${isC ? " ✓" : ""}</span>
              <div class="qz-bar-wrap">
                <div class="${cls}" style="width:${barW}%"></div>
              </div>
              <span class="qz-row-n">${n}명 (${pct}%)</span>
            </div>`;
        }).join("")}
      </div>` : ""}
    </div>`;
}

// ── 히트맵 ───────────────────────────────────────────

function renderHeatmap(slides) {
  const row = document.getElementById("heatmap-row");
  row.innerHTML = "";
  for (const s of slides) {
    const score = s.confusion_score ?? 0;
    const pct   = Math.round(score * 100);
    const cell  = document.createElement("div");
    cell.className = "heatmap-cell";
    cell.title = `슬라이드 ${s.slide_idx + 1}  혼란도 ${pct}%`;
    cell.style.background = scoreColor(score);
    cell.style.opacity = 0.4 + score * 0.6;
    cell.textContent = s.slide_idx + 1;
    cell.addEventListener("click", () => {
      document.getElementById(`slide-card-${s.slide_idx}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    row.appendChild(cell);
  }
}

// ── 슬라이드 카드 ────────────────────────────────────

function renderSlideCards(slides) {
  const container = document.getElementById("slide-cards");
  container.innerHTML = "";

  for (const s of slides) {
    const score  = s.confusion_score ?? 0;
    const pct    = Math.round(score * 100);
    const color  = scoreColor(score);
    const concepts = (s.core_concepts || []);
    const questions = (s.questions || []);
    const diff   = s.difficulty || {};

    const card = document.createElement("div");
    card.className = "slide-card";
    card.id = `slide-card-${s.slide_idx}`;

    // 헤더
    card.innerHTML = `
      <div class="slide-card-header">
        <span class="slide-num">슬라이드 ${s.slide_idx + 1}</span>
        <span class="action-badge action-${escHtml(s.recommended_action || "no_action")}">
          ${escHtml(actionLabel(s.recommended_action))}
        </span>
      </div>

      <!-- 혼란도 바 -->
      <div class="confusion-bar-wrap">
        <span class="confusion-label">혼란도</span>
        <div class="confusion-bar">
          <div class="confusion-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="confusion-score" style="color:${color}">${pct}%</span>
      </div>

      ${diffChartHtml(diff)}

      ${playbackStatsHtml(s.playback_stats)}

      ${quizStatsHtml(s.quiz_stats)}

      <!-- 핵심 개념 -->
      ${concepts.length ? `
      <div class="concepts-row">
        ${concepts.map(c => `<span class="concept-tag">${escHtml(c)}</span>`).join("")}
      </div>` : ""}

      <!-- 학생 질문 -->
      ${questions.length ? `
      <div class="questions-list">
        <div class="questions-title">학생 질문 (${questions.length}건)</div>
        ${questions.map(q => `
          <div class="question-item">
            <span class="q-name">${escHtml(q.display_name)}</span>${escHtml(q.message)}
          </div>`).join("")}
      </div>` : ""}

      <!-- CQI 지시문 -->
      ${s.cqi_instruction && s.recommended_action !== "no_action" ? `
      <div class="cqi-box">
        <div class="cqi-box-label">CQI 지시문</div>
        <div class="cqi-box-text">${escHtml(s.cqi_instruction)}</div>
      </div>` : ""}
    `;

    container.appendChild(card);
  }
}

// ── 슬라이드별 평균 난이도 그래프 ────────────────────

function avgDifficulty(diff) {
  const total = diff.total || 0;
  if (total === 0) return null;
  return ((diff["보통"] || 0) * 1 + (diff["어려움"] || 0) * 2) / total;
}

function barColor(avg) {
  if (avg < 0.7)  return "#16a34a";   // 초록 — 쉬움
  if (avg < 1.3)  return "#d97706";   // 노랑 — 보통
  return "#dc2626";                    // 빨강 — 어려움
}

function renderDiffGraph(slides) {
  const canvas = document.getElementById("diff-graph-canvas");
  if (!canvas) return;

  const avgs = slides.map(s => avgDifficulty(s.difficulty || {}));

  // ── 캔버스 크기 설정 ────────────────────────────────
  const PAD   = { top: 28, right: 24, bottom: 52, left: 58 };
  const H     = 240;
  const W     = Math.max(200, canvas.offsetWidth);   // offsetWidth: 레이아웃 후 실제 너비
  const dpr   = window.devicePixelRatio || 1;        // Retina 대응

  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx    = canvas.getContext("2d");
  ctx.scale(dpr, dpr);                               // 논리 좌표계 유지
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;
  const n      = slides.length;
  const slotW  = chartW / n;
  const yScale = chartH / 2;           // Y 축 최대값 = 2

  // ── 배경 ─────────────────────────────────────────
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  // ── 그리드·Y축 레이블 ───────────────────────────
  const yTicks = [
    { v: 0,   label: "0  쉬움" },
    { v: 0.5, label: "0.5" },
    { v: 1,   label: "1  보통" },
    { v: 1.5, label: "1.5" },
    { v: 2,   label: "2  어려움" },
  ];

  ctx.font      = "11px -apple-system, 'Noto Sans KR', sans-serif";
  ctx.textAlign = "right";

  yTicks.forEach(({ v, label }) => {
    const y = PAD.top + chartH - v * yScale;

    // 그리드 라인
    ctx.strokeStyle = v % 1 === 0 ? "#1e293b" : "#161f2e";
    ctx.lineWidth   = v % 1 === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();

    // Y 레이블
    ctx.fillStyle = v % 1 === 0 ? "#94a3b8" : "#475569";
    ctx.fillText(label, PAD.left - 8, y + 4);
  });

  // 보통(1) 기준선 강조
  const refY = PAD.top + chartH - 1 * yScale;
  ctx.strokeStyle = "#334155";
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD.left, refY);
  ctx.lineTo(PAD.left + chartW, refY);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 축 ──────────────────────────────────────────
  ctx.strokeStyle = "#334155";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // ── 포인트 좌표 계산 ─────────────────────────────
  const baseY = PAD.top + chartH;
  const pts = avgs.map((avg, i) => {
    const cx = PAD.left + i * slotW + slotW / 2;
    if (avg === null) return { cx, cy: null, avg: null };
    return { cx, cy: PAD.top + chartH - avg * yScale, avg };
  });

  // ── X 레이블 ─────────────────────────────────────
  pts.forEach((p, i) => {
    ctx.fillStyle = "#94a3b8";
    ctx.font      = "11px -apple-system, 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(i + 1, p.cx, baseY + 18);
  });

  // ── 라인 아래 그라디언트 채우기 ───────────────────
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
  ctx.lineWidth   = 2.5;
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
    if (p.cy === null) {
      ctx.fillStyle = "#475569";
      ctx.font      = "11px -apple-system, 'Noto Sans KR', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("–", p.cx, baseY - 8);
      return;
    }
    const color = barColor(p.avg);

    // glow 링
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 채운 원
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 흰 중심
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // 값 레이블
    ctx.fillStyle = "#e2e8f0";
    ctx.font      = "bold 11px -apple-system, 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.avg.toFixed(2), p.cx, p.cy - 12);
  });

  // X축 타이틀
  ctx.fillStyle   = "#475569";
  ctx.font        = "11px -apple-system, 'Noto Sans KR', sans-serif";
  ctx.textAlign   = "center";
  ctx.fillText("슬라이드 번호", PAD.left + chartW / 2, H - 8);
}

// 창 크기 변경 시 리드로우
let _graphSlides = null;
window.addEventListener("resize", () => {
  if (_graphSlides) requestAnimationFrame(() => renderDiffGraph(_graphSlides));
});

// ── 내보내기 ─────────────────────────────────────────

document.getElementById("btn-export").addEventListener("click", () => {
  if (!_reportData) return;
  const blob = new Blob(
    [JSON.stringify(_reportData.report, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `cqi_${_reportData.lecture_id}_${_reportData.generated_at.slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── 강의 제작 적용 (deep-link) ──────────────────────────
let _createlectureUrl = null;
async function getCreatelectureUrl() {
  if (_createlectureUrl) return _createlectureUrl;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const cfg = await res.json();
      _createlectureUrl = cfg.createlecture_url || `${location.protocol}//${location.hostname}:8000`;
    }
  } catch (_) { /* ignore */ }
  return _createlectureUrl || `${location.protocol}//${location.hostname}:8000`;
}

document.getElementById("btn-apply-cqi")?.addEventListener("click", async () => {
  if (!_reportData) return;
  const base = await getCreatelectureUrl();
  const sp = new URLSearchParams();
  // createLecture는 from 파라미터가 없으면 포털로 리다이렉트하므로 from을 채워 둠
  const fromUrl = new URLSearchParams(location.search).get("from") || `${location.protocol}//${location.hostname}:8003`;
  sp.set("from", fromUrl);
  sp.set("cqi_report_id", reportId);
  // course/week가 보고서 메타에 있으면 함께 전달 (없으면 createLecture가 알아서 처리)
  // _reportData.report는 createLecture URL이 가진 context와 무관할 수도 있어 lecture_title만 참고용
  const r = _reportData.report || {};
  if (r.course)     sp.set("course",     r.course);
  if (r.week)       sp.set("week",       String(r.week));
  if (r.week_title) sp.set("week_title", r.week_title);

  window.location.href = `${base}/?${sp.toString()}`;
});

// ── 초기화 ───────────────────────────────────────────

(async () => {
  if (!reportId) { loadingEl.textContent = "보고서 ID가 없습니다."; return; }

  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`);
  if (!res.ok) { loadingEl.textContent = "보고서를 찾을 수 없습니다."; return; }

  const data = await res.json();
  _reportData = data;

  if (data.status !== "done" || !data.report) {
    loadingEl.textContent = `분석 상태: ${data.status}${data.error_message ? " — " + data.error_message : ""}`;
    return;
  }

  const report = data.report;
  document.title = `CQI — ${report.lecture_title}`;
  document.getElementById("report-title").textContent = report.lecture_title;
  document.getElementById("report-date").textContent  = `생성: ${fmtDate(report.generated_at)}`;
  document.getElementById("report-slide-count").textContent =
    `슬라이드 ${report.slides.length}개 분석`;

  // hidden 해제를 먼저 해야 캔버스 부모의 clientWidth가 정상으로 잡힘
  loadingEl.hidden  = true;
  reportBody.hidden = false;

  renderHeatmap(report.slides);
  renderSlideCards(report.slides);

  // 레이아웃이 확정된 다음 프레임에서 캔버스 렌더
  _graphSlides = report.slides;
  requestAnimationFrame(() => renderDiffGraph(report.slides));
})();
