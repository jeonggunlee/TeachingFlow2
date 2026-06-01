// ── URL 파라미터 ─────────────────────────────────────────────────────────────
const params    = new URLSearchParams(location.search);
const fromUrl   = params.get('from') || `${location.protocol}//${location.hostname}:8003`;
const course    = params.get('course') || '';
const week      = params.get('week') || '';
const weekTitle = params.get('week_title') || '';

// ── 헤더 초기화 ──────────────────────────────────────────────────────────────
document.getElementById('nav-logo').href = fromUrl;

const ctxBar = document.getElementById('ctx-bar');
const ctxBack = document.getElementById('ctx-back');
ctxBack.href = fromUrl;
ctxBar.hidden = false;

if (course) document.getElementById('ctx-course').textContent = course;
document.getElementById('ctx-week-heading').textContent = week ? `${week}주차 학습 분석` : '학습 분석';
if (weekTitle) {
  const sub = document.getElementById('ctx-week-sub');
  sub.textContent = `강의 주제: ${weekTitle}`;
  sub.hidden = false;
}

const titleParts = [];
if (course) titleParts.push(course);
if (week)   titleParts.push(`${week}주차`);
document.getElementById('page-title').textContent = titleParts.join(' · ') + ' 학습 분석';
document.getElementById('nav-page').textContent   = titleParts.join(' · ') + ' 학습 분석';
if (weekTitle) document.getElementById('page-sub').textContent = `강의 주제: ${weekTitle}`;

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit',
  });
}

function statusBadge(status) {
  const map = {
    pending:    ['badge-pending',    '⏳ 대기 중'],
    processing: ['badge-processing', '⏳ 분석 중'],
    done:       ['badge-done',       '✅ 분석 완료'],
    error:      ['badge-error',      '❌ 오류'],
  };
  const [cls, label] = map[status] || ['badge-pending', '미분석'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── 강의 목록 로드 ────────────────────────────────────────────────────────────
let _lectures = [];
let _pollingId = null;

async function loadLectures() {
  const listEl    = document.getElementById('lecture-list');
  const countEl   = document.getElementById('result-count');
  const analyzeAllBtn = document.getElementById('btn-analyze-all');

  if (!course || !week) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">과목/주차 정보가 없습니다</div>
      <div class="empty-desc">포털에서 이 페이지로 접근해주세요.</div>
    </div>`;
    return;
  }

  const qs = new URLSearchParams({ course, week });
  let data;
  try {
    const res = await fetch(`/api/week-lectures?${qs.toString()}`);
    data = await res.json();
  } catch (err) {
    listEl.innerHTML = `<div class="loading" style="color:var(--error)">로드 오류: ${esc(err.message)}</div>`;
    return;
  }

  _lectures = Array.isArray(data) ? data : [];

  if (!_lectures.length) {
    countEl.textContent = '';
    analyzeAllBtn.hidden = true;
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">이 주차에 생성된 강의가 없습니다</div>
      <div class="empty-desc">강의 제작 페이지에서 먼저 강의를 생성해주세요.</div>
    </div>`;
    return;
  }

  countEl.textContent = `총 ${_lectures.length}개 강의`;

  // "전체 분석 시작" 버튼: 분석 안 된 강의가 있을 때만 표시
  const hasUnanalyzed = _lectures.some(l => !l.analyze_status || l.analyze_status === 'error');
  analyzeAllBtn.hidden = !hasUnanalyzed;

  listEl.innerHTML = _lectures.map(lec => lectureCardHtml(lec)).join('');

  // 카드 버튼 이벤트
  for (const lec of _lectures) {
    const startBtn = document.getElementById(`btn-analyze-${lec.lecture_id}`);
    if (startBtn) startBtn.addEventListener('click', () => startAnalysis(lec.lecture_id));
  }

  // 진행 중인 분석이 있으면 폴링
  const hasActive = _lectures.some(l => l.analyze_status === 'pending' || l.analyze_status === 'processing');
  if (hasActive) schedulePolling();
  else stopPolling();
}

function lectureCardHtml(lec) {
  const date = lec.created_at
    ? new Date(lec.created_at).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' })
    : '날짜 없음';

  let actionHtml = '';
  if (!lec.analyze_status || lec.analyze_status === 'error') {
    const errMsg = lec.analyze_status === 'error' && lec.error_message
      ? `<div style="font-size:11px;color:var(--error);margin-top:4px">${esc(lec.error_message)}</div>`
      : '';
    const btnLabel = lec.analyze_status === 'error' ? '🔄 재시도' : '📊 분석 시작';
    actionHtml = `
      ${errMsg}
      <button class="btn-start-analyze" id="btn-analyze-${esc(lec.lecture_id)}">${btnLabel}</button>`;
  } else if (lec.analyze_status === 'pending' || lec.analyze_status === 'processing') {
    actionHtml = `<span class="spinner"></span>`;
  } else if (lec.analyze_status === 'done') {
    const rptParams = new URLSearchParams({ id: lec.report_id, from: fromUrl });
    actionHtml = `
      <a class="btn-view-report" href="/report?${rptParams.toString()}">📊 보고서 보기</a>`;
  }

  return `
    <div class="lecture-card" id="card-${esc(lec.lecture_id)}">
      <div class="lecture-card-info">
        <div class="lecture-card-title" title="${esc(lec.title)}">${esc(lec.title)}</div>
        <div class="lecture-card-meta">
          ${statusBadge(lec.analyze_status)}
          <span class="lecture-meta-item">${date}</span>
          <span class="lecture-meta-item">슬라이드 ${lec.slide_count}장</span>
          ${lec.report_generated_at
            ? `<span class="lecture-meta-item">분석: ${fmtDate(lec.report_generated_at)}</span>`
            : ''}
        </div>
      </div>
      <div class="lecture-card-actions">${actionHtml}</div>
    </div>`;
}

// ── 분석 시작 ─────────────────────────────────────────────────────────────────
async function startAnalysis(lectureId) {
  const btn = document.getElementById(`btn-analyze-${lectureId}`);
  if (btn) { btn.disabled = true; btn.textContent = '요청 중...'; }

  const qs = new URLSearchParams({ course, week });
  try {
    const res = await fetch(`/api/analyze-week?${qs.toString()}`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`오류: ${data.detail || res.status}`);
      if (btn) { btn.disabled = false; btn.textContent = '📊 분석 시작'; }
      return;
    }
  } catch (err) {
    alert(`네트워크 오류: ${err.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '📊 분석 시작'; }
    return;
  }

  await loadLectures();
}

// ── 전체 분석 ─────────────────────────────────────────────────────────────────
document.getElementById('btn-analyze-all').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analyze-all');
  btn.disabled = true;
  btn.textContent = '요청 중...';

  const qs = new URLSearchParams({ course, week });
  try {
    const res = await fetch(`/api/analyze-week?${qs.toString()}`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`오류: ${data.detail || res.status}`);
    }
  } catch (err) {
    alert(`네트워크 오류: ${err.message}`);
  }

  await loadLectures();
});

// ── 폴링 ──────────────────────────────────────────────────────────────────────
function schedulePolling() {
  if (_pollingId) return;
  _pollingId = setInterval(async () => {
    await loadLectures();
  }, 4000);
}

function stopPolling() {
  if (_pollingId) { clearInterval(_pollingId); _pollingId = null; }
}

// ── 초기화 ───────────────────────────────────────────────────────────────────
loadLectures();
