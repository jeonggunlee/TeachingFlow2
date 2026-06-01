const PORTAL_URL     = `${location.protocol}//${location.hostname}:8003`;
const PLAYLECTURE_URL = `${location.protocol}//${location.hostname}:8001`;
const params     = new URLSearchParams(location.search);
const course     = params.get('course') || '';
const week       = params.get('week')   || '';
const weekTitle  = params.get('week_title') || '';
const fromUrl    = params.get('from') || PORTAL_URL;

// ── 헤더 UI 초기화 ─────────────────────────────────────────────
document.getElementById('btn-portal-back').href = fromUrl;
document.getElementById('nav-logo').href        = fromUrl;

if (course || week) {
  const chip = document.getElementById('course-chip');
  if (course) { chip.textContent = course; chip.style.display = ''; }

  const titleParts = [];
  if (course) titleParts.push(course);
  if (week)   titleParts.push(`${week}주차`);
  document.getElementById('page-title').textContent = titleParts.join(' · ') + ' 강의 목록';
  document.getElementById('nav-page').textContent   = titleParts.join(' · ') + ' 강의 목록';

  if (weekTitle) {
    document.getElementById('page-sub').textContent = `강의 주제: ${weekTitle}`;
  }
}

// "새 강의 제작" 버튼 → createLecture 메인 페이지에 포털 컨텍스트 전달
const createParams = new URLSearchParams({ from: fromUrl, course, week });
if (weekTitle) createParams.set('week_title', weekTitle);
document.getElementById('btn-create-new').href = `/?${createParams.toString()}`;

// ── 강의 목록 로드 ─────────────────────────────────────────────
async function loadLectures() {
  const listEl = document.getElementById('lecture-list');
  const countEl = document.getElementById('result-count');

  try {
    const qs  = new URLSearchParams();
    if (course) qs.set('course', course);
    if (week)   qs.set('week', week);
    const res  = await fetch(`/api/lectures?${qs.toString()}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      countEl.textContent = '강의 없음';
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">아직 생성된 강의가 없습니다</div>
          <div class="empty-desc">"새 강의 제작" 버튼을 눌러 이 주차를 위한 강의를 만들어보세요.</div>
        </div>`;
      return;
    }

    countEl.textContent = `총 ${data.length}개 강의`;
    listEl.innerHTML = data.map(lec => {
      const date = lec.created_at
        ? new Date(lec.created_at).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' })
        : '날짜 없음';
      const cqiBadge = lec.has_cqi ? '<span class="badge-cqi">CQI</span>' : '';
      const ctxParams = new URLSearchParams({ from: fromUrl, course, week });
      if (weekTitle) ctxParams.set('week_title', weekTitle);
      const playUrl = `${PLAYLECTURE_URL}/player?id=${lec.lecture_id}&${ctxParams.toString()}`;
      return `
        <div class="lecture-card">
          <div class="lecture-info">
            <div class="lecture-title" title="${esc(lec.title)}">${esc(lec.title)}</div>
            <div class="lecture-meta">
              ${cqiBadge}
              <span class="lecture-meta-item">${date}</span>
              <span class="lecture-meta-item">슬라이드 ${lec.slide_count}장</span>
              <span class="lecture-meta-item">세그먼트 ${lec.segment_count}개</span>
            </div>
          </div>
          <div class="lecture-actions">
            <a class="btn-play" href="${playUrl}">▶ 재생</a>
            <a class="btn-edit" href="/scripts?id=${lec.lecture_id}&${ctxParams.toString()}">✏️ 편집</a>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="loading" style="color:var(--error)">로드 오류: ${err.message}</div>`;
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadLectures();
