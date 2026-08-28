'use strict';

// ── Auth ───────────────────────────────────────────────────────────────────

const AUTH_KEY = 'portal_admin_auth';   // 값 = 서버가 발급한 세션 토큰

// 401로 중단된 모달 id — 로그인 뒤 입력값을 살린 채 그대로 되살린다
let _interruptedModal = null;

function authToken() {
  const t = localStorage.getItem(AUTH_KEY);
  // 예전 버전은 플래그 '1'만 저장했다 — 토큰이 아니므로 로그인을 다시 받는다.
  return t && t !== '1' ? t : null;
}

function isLoggedIn() {
  return !!authToken();
}

function showPortal() {
  document.getElementById('promo-section').hidden = true;
  document.getElementById('portal-section').hidden = false;
  document.getElementById('btn-nav-login').hidden = true;
  document.getElementById('nav-admin-badge').hidden = false;
  document.body.classList.add('portal-mode');
}

function showPromo() {
  document.getElementById('promo-section').hidden = false;
  document.getElementById('portal-section').hidden = true;
  document.getElementById('btn-nav-login').hidden = false;
  document.getElementById('nav-admin-badge').hidden = true;
  document.body.classList.remove('portal-mode');
}

function openLoginModal() {
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-modal').hidden = false;
  setTimeout(() => document.getElementById('login-password').focus(), 50);
}

function closeLoginModal() {
  document.getElementById('login-modal').hidden = true;
}

/**
 * 401을 만났을 때 호출한다.
 * 과목·주차 모달이 열려 있으면 로그인 창이 그 **뒤에** 뜨면서 보이지 않는다.
 * 실제로 이것 때문에 "저장이 안 된다"는 상태에 갇혔다 — 먼저 감추고 띄운다.
 */
function requireLogin() {
  _interruptedModal = null;
  for (const id of ['course-modal', 'week-modal']) {
    const el = document.getElementById(id);
    if (el && !el.hidden) { el.hidden = true; _interruptedModal = id; }
  }
  openLoginModal();
}

async function doLogin() {
  const pw  = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-do-login');
  btn.disabled = true;
  document.getElementById('login-error').textContent = '';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      const { token } = await r.json();
      localStorage.setItem(AUTH_KEY, token);
      closeLoginModal();
      showPortal();
      await initPortalContent();
      if (_interruptedModal) {
        // 열기 함수는 입력을 비우므로, 적어 둔 값을 살리려면 그대로 다시 보인다
        document.getElementById(_interruptedModal).hidden = false;
        _interruptedModal = null;
      }
    } else {
      document.getElementById('login-error').textContent = '비밀번호가 틀렸습니다.';
    }
  } catch (_) {
    document.getElementById('login-error').textContent = '서버 연결 오류';
  } finally {
    btn.disabled = false;
  }
}

function doLogout() {
  const t = authToken();
  if (t) {
    fetch('/api/auth/logout', {
      method: 'POST', headers: { Authorization: `Bearer ${t}` },
    }).catch(() => {});
  }
  localStorage.removeItem(AUTH_KEY);
  showPromo();
}

function setupAuthHandlers() {
  document.getElementById('btn-nav-login').addEventListener('click', openLoginModal);
  document.getElementById('btn-close-login-modal').addEventListener('click', closeLoginModal);
  document.getElementById('btn-cancel-login').addEventListener('click', closeLoginModal);
  document.getElementById('btn-do-login').addEventListener('click', doLogin);
  document.getElementById('btn-nav-logout').addEventListener('click', doLogout);
  document.getElementById('btn-promo-login').addEventListener('click', openLoginModal);
  document.getElementById('btn-promo-login2').addEventListener('click', openLoginModal);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
    if (e.key === 'Escape') closeLoginModal();
  });
}

// ── State ──────────────────────────────────────────────────────────────────

let _config         = {};
let _courses        = [];
let _selectedCourse = null;
let _weeks          = [];
let _statusMap      = {};   // week.id → { has_lectures, play_exists, analyze_status, analyze_id, ... }
let _editingWeekId  = null; // null = new, string = existing id

// ── API helper ─────────────────────────────────────────────────────────────

async function api(method, url, body) {
  const opts = { method, headers: {} };
  const t = authToken();
  if (t) opts.headers['Authorization'] = `Bearer ${t}`;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  // 서버가 재시작되면 발급했던 토큰이 사라진다 — 다시 로그인 받는다.
  if (r.status === 401) {
    localStorage.removeItem(AUTH_KEY);
    showPromo();
    requireLogin();
    throw new Error('로그인이 풀렸습니다. 다시 로그인하면 입력하던 내용이 그대로 남아 있습니다.');
  }
  if (r.status === 204) return null;
  const data = await r.json();
  if (!r.ok) throw new Error(data?.detail || r.statusText);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

async function initPortalContent() {
  // Load service URLs from config
  try {
    _config = await api('GET', '/api/config');
    const analyzeFrom = `${_config.analyzelecture_url}?from=${encodeURIComponent(window.location.origin)}`;
  } catch (e) { /* services may not be running */ }

  // Static button wiring
  document.getElementById('btn-add-course').addEventListener('click', openCourseModal);
  document.getElementById('btn-close-course-modal').addEventListener('click', closeCourseModal);
  document.getElementById('btn-cancel-course').addEventListener('click', closeCourseModal);
  document.getElementById('btn-save-course').addEventListener('click', saveCourse);

  document.getElementById('btn-add-week').addEventListener('click', () => openWeekModal(null));
  document.getElementById('btn-add-week-empty').addEventListener('click', () => openWeekModal(null));
  document.getElementById('btn-close-week-modal').addEventListener('click', closeWeekModal);
  document.getElementById('btn-cancel-week').addEventListener('click', closeWeekModal);
  document.getElementById('btn-save-week').addEventListener('click', saveWeek);
  document.getElementById('btn-load-lectures').addEventListener('click', loadLectureDropdown);
  document.getElementById('btn-delete-course').addEventListener('click', deleteCourse);
  document.getElementById('week-lecture-select').addEventListener('change', onLectureSelect);

  // Event delegation — sidebar course clicks
  document.getElementById('course-list').addEventListener('click', e => {
    const item = e.target.closest('[data-course-idx]');
    if (item) selectCourse(_courses[+item.dataset.courseIdx]);
  });

  // Event delegation — week card actions
  document.getElementById('week-list').addEventListener('click', async e => {
    const editBtn    = e.target.closest('[data-edit-week]');
    const delBtn     = e.target.closest('[data-delete-week]');
    const analyzeBtn = e.target.closest('[data-start-analyze]');
    if (editBtn)    openWeekModal(_weeks.find(w => w.id === editBtn.dataset.editWeek));
    if (delBtn)     await deleteWeek(delBtn.dataset.deleteWeek);
    if (analyzeBtn) await startAnalysis(analyzeBtn.dataset.startAnalyze);
  });

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!document.getElementById('course-modal').hidden) closeCourseModal();
      if (!document.getElementById('week-modal').hidden)   closeWeekModal();
      if (!document.getElementById('login-modal').hidden)  closeLoginModal();
    }
  });

  await loadCourses();
}

(async function init() {
  setupAuthHandlers();

  if (isLoggedIn()) {
    showPortal();
    await initPortalContent();
  } else {
    showPromo();
  }
})();

// ── Courses ────────────────────────────────────────────────────────────────

async function loadCourses() {
  _courses = await api('GET', '/api/courses');
  renderSidebar();

  if (!_courses.length) {
    _selectedCourse = null;
    document.getElementById('content-placeholder').hidden = false;
    document.getElementById('course-content').hidden = true;
    return;
  }
  const still = _selectedCourse && _courses.find(c => c.id === _selectedCourse.id);
  await selectCourse(still || _courses[0]);
}

function renderSidebar() {
  const el = document.getElementById('course-list');
  if (!_courses.length) {
    el.innerHTML = `<div class="sidebar-empty">과목이 없습니다</div>`;
    return;
  }
  el.innerHTML = _courses.map((c, i) => `
    <div class="course-item ${_selectedCourse?.id === c.id ? 'active' : ''}"
         data-course-idx="${i}">
      <div class="course-item-name">${esc(c.name)}</div>
      <div class="course-item-meta">${esc([c.code, c.semester].filter(Boolean).join(' · '))}</div>
    </div>
  `).join('');
}

async function selectCourse(course) {
  _selectedCourse = course;
  _statusMap = {};
  renderSidebar();

  document.getElementById('content-placeholder').hidden = true;
  document.getElementById('course-content').hidden = false;
  document.getElementById('course-header-title').textContent = course.name;
  document.getElementById('course-header-meta').textContent =
    [course.code, course.semester, course.description].filter(Boolean).join(' · ');

  _weeks = await api('GET', `/api/courses/${course.id}/weeks`);
  renderWeeks();

  // Async status checks — non-blocking (모든 주차 대상)
  for (const w of _weeks) loadStatus(w);
}

// ── Course modal ───────────────────────────────────────────────────────────

function openCourseModal() {
  document.getElementById('course-modal-title').textContent = '새 과목 추가';
  ['course-name','course-code','course-semester','course-desc'].forEach(id =>
    document.getElementById(id).value = '');
  document.getElementById('course-modal').hidden = false;
  document.getElementById('course-name').focus();
}
function closeCourseModal() {
  document.getElementById('course-modal').hidden = true;
}
async function saveCourse() {
  const name = document.getElementById('course-name').value.trim();
  if (!name) { alert('과목명을 입력하세요.'); return; }
  const btn = document.getElementById('btn-save-course');
  btn.disabled = true;
  try {
    await api('POST', '/api/courses', {
      name,
      code:        document.getElementById('course-code').value.trim(),
      semester:    document.getElementById('course-semester').value.trim(),
      description: document.getElementById('course-desc').value.trim(),
    });
    closeCourseModal();
    await loadCourses();
    // Auto-select the newly created course (last in list)
    if (_courses.length) await selectCourse(_courses[_courses.length - 1]);
  } catch(e) {
    alert(`오류: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}
async function deleteCourse() {
  if (!_selectedCourse) return;
  if (!confirm(`"${_selectedCourse.name}" 과목과 모든 주차 강의를 삭제하시겠습니까?`)) return;
  await api('DELETE', `/api/courses/${_selectedCourse.id}`);
  _selectedCourse = null;
  await loadCourses();
}

// ── Week rendering ─────────────────────────────────────────────────────────

function renderWeeks() {
  const list  = document.getElementById('week-list');
  const empty = document.getElementById('week-empty');
  if (!_weeks.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = _weeks.map(w => weekCardHtml(w)).join('');
}

function refreshWeekCard(weekId) {
  const w = _weeks.find(w => w.id === weekId);
  if (!w) return;
  const existing = document.getElementById(`week-card-${w.id}`);
  if (existing) existing.outerHTML = weekCardHtml(w);
}

function weekCardHtml(w) {
  const status = _statusMap[w.id] ?? null;
  return `
    <div class="week-card" id="week-card-${w.id}">
      <div class="week-card-header">
        <span class="week-num">${w.week}주차</span>
        <span class="week-title">${esc(w.title || '(제목 없음)')}</span>
        ${w.lecture_id
          ? `<span class="week-lecture-id" title="${esc(w.lecture_id)}">${esc(w.lecture_id)}</span>`
          : ''}
        <div class="week-actions">
          <button class="week-action-btn" data-edit-week="${w.id}">편집</button>
          <button class="week-action-btn delete" data-delete-week="${w.id}">삭제</button>
        </div>
      </div>
      <div class="step-flow">
        ${stepCreateHtml(w, status)}
        <div class="step-connector">→</div>
        ${stepPlayHtml(w, status)}
        <div class="step-connector">→</div>
        ${stepAnalyzeHtml(w, status)}
      </div>
    </div>
  `;
}

// ── Step cells ─────────────────────────────────────────────────────────────

function stepCreateHtml(w, status) {
  const url = _config.createlecture_url || `${location.protocol}//${location.hostname}:8000`;
  const hasLectures = !!status?.has_lectures;
  const params = new URLSearchParams({
    from:       window.location.origin,
    course:     _selectedCourse?.name || '',
    week:       String(w.week),
    week_title: w.title || '',
  });
  const createUrl = `${url}?${params.toString()}`;

  let statusHtml;
  if (status === null) {
    statusHtml = '<div class="step-status s-loading">⏳ 확인 중...</div>';
  } else if (hasLectures) {
    statusHtml = '<div class="step-status s-done">✅ 강의 제작됨</div>';
  } else {
    statusHtml = '<div class="step-status s-pending">⬜ 미제작</div>';
  }

  return `
    <div class="step-card">
      <div class="step-header">
        <span class="step-icon">📝</span>
        <span class="step-name">강의 제작</span>
      </div>
      ${statusHtml}
      <div class="step-action">
        <a class="step-btn step-btn-create" href="${esc(createUrl)}">
          📝 ${hasLectures ? '제작 페이지' : '강의 제작하기'}
        </a>
      </div>
    </div>`;
}

function stepPlayHtml(w, status) {
  const createUrl   = _config.createlecture_url || `${location.protocol}//${location.hostname}:8000`;
  const hasLectures = !!status?.has_lectures;

  // createLecture 필터링 목록 URL (course+week 기준)
  const listParams = new URLSearchParams({
    from:       window.location.origin,
    course:     _selectedCourse?.name || '',
    week:       String(w.week),
    week_title: w.title || '',
  });
  const weekLecturesUrl = `${createUrl}/week-lectures?${listParams.toString()}`;

  let statusHtml;
  if (status === null) {
    statusHtml = '<div class="step-status s-loading">⏳ 확인 중...</div>';
  } else if (hasLectures) {
    statusHtml = '<div class="step-status s-done">✅ 재생 가능</div>';
  } else {
    statusHtml = '<div class="step-status s-pending">⬜ 강의 제작 후 활성화</div>';
  }

  return `
    <div class="step-card">
      <div class="step-header">
        <span class="step-icon">▶</span>
        <span class="step-name">강의 운영</span>
      </div>
      ${statusHtml}
      <div class="step-action">
        <a class="step-btn step-btn-create" href="${esc(weekLecturesUrl)}">📋 강의 목록 · 재생</a>
      </div>
    </div>`;
}

function stepAnalyzeHtml(w, status) {
  const url          = _config.analyzelecture_url || `${location.protocol}//${location.hostname}:8002`;
  const analyzeParams = new URLSearchParams({
    from:       window.location.origin,
    course:     _selectedCourse?.name || '',
    week:       String(w.week),
    week_title: w.title || '',
  });
  const weekAnalyzeUrl = `${url}/week-analyze?${analyzeParams.toString()}`;

  // 상태 확인 중
  if (status === null) {
    return `
      <div class="step-card">
        <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
        <div class="step-status s-loading">⏳ 확인 중...</div>
      </div>`;
  }

  // 이 주차에 강의가 없으면 비활성화
  if (!status?.has_lectures) {
    return `
      <div class="step-card">
        <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
        <div class="step-status s-pending">⬜ 강의 제작 후 활성화</div>
        <div class="step-action">
          <a class="step-btn step-btn-analyze" href="${esc(weekAnalyzeUrl)}">📊 분석 페이지</a>
        </div>
      </div>`;
  }

  const ast = status.analyze_status;

  if (ast === 'done') {
    const rptParams = new URLSearchParams({ id: status.analyze_id, from: window.location.origin });
    const rptUrl = `${url}/report?${rptParams.toString()}`;
    // 재분석이 돌고 있어도 이미 완성된 보고서는 계속 열 수 있어야 한다.
    const statusLine = status.analyze_running
      ? '<div class="step-status s-active">✅ 보고서 완성 · ⏳ 재분석 중</div>'
      : '<div class="step-status s-done">✅ CQI 보고서 완성</div>';
    return `
      <div class="step-card">
        <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
        ${statusLine}
        <div class="step-action" style="display:flex;gap:6px;flex-wrap:wrap">
          <a class="step-btn step-btn-report" href="${esc(rptUrl)}">📊 보고서 보기</a>
          <a class="step-btn step-btn-analyze" href="${esc(weekAnalyzeUrl)}" style="font-size:10px;padding:4px 8px">분석 페이지</a>
        </div>
      </div>`;
  }

  if (ast === 'processing' || ast === 'pending') {
    return `
      <div class="step-card">
        <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
        <div class="step-status s-active">⏳ 분석 진행 중...</div>
        <div class="step-action">
          <a class="step-btn step-btn-analyze" href="${esc(weekAnalyzeUrl)}">📊 분석 페이지</a>
        </div>
      </div>`;
  }

  if (ast === 'error') {
    return `
      <div class="step-card">
        <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
        <div class="step-status s-error">❌ 분석 오류</div>
        <div class="step-action" style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="step-btn step-btn-retry" data-start-analyze="${esc(w.id)}">🔄 재시도</button>
          <a class="step-btn step-btn-analyze" href="${esc(weekAnalyzeUrl)}" style="font-size:10px;padding:4px 8px">분석 페이지</a>
        </div>
      </div>`;
  }

  // 강의는 있으나 아직 분석 전
  return `
    <div class="step-card">
      <div class="step-header"><span class="step-icon">📊</span><span class="step-name">학습 분석</span></div>
      <div class="step-status s-pending">⬜ 분석 전</div>
      <div class="step-action" style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="step-btn step-btn-start" data-start-analyze="${esc(w.id)}">📊 분석 시작</button>
        <a class="step-btn step-btn-analyze" href="${esc(weekAnalyzeUrl)}" style="font-size:10px;padding:4px 8px">분석 페이지</a>
      </div>
    </div>`;
}

// ── Status loading & polling ───────────────────────────────────────────────

async function loadStatus(week) {
  const course = _selectedCourse?.name || '';
  const qs     = new URLSearchParams({ course, week: String(week.week) });
  try {
    const status = await api('GET', `/api/status-week?${qs.toString()}`);
    _statusMap[week.id] = status;
    refreshWeekCard(week.id);
    // 완료본이 있어도 재분석이 돌고 있으면 계속 갱신한다.
    if (status.analyze_running ||
        status.analyze_status === 'pending' || status.analyze_status === 'processing') {
      setTimeout(() => loadStatus(week), 10_000);
    }
  } catch (e) {
    _statusMap[week.id] = { has_lectures: false, analyze_status: null };
    refreshWeekCard(week.id);
  }
}

// ── Analysis trigger ───────────────────────────────────────────────────────

async function startAnalysis(weekId) {
  const week = _weeks.find(w => w.id === weekId);
  if (!week) return;
  const course = _selectedCourse?.name || '';
  const qs     = new URLSearchParams({ course, week: String(week.week) });
  try {
    await api('POST', `/api/proxy/analyze-week?${qs.toString()}`);
    _statusMap[week.id] = { ..._statusMap[week.id], analyze_status: 'pending' };
    refreshWeekCard(week.id);
    setTimeout(() => loadStatus(week), 5_000);
  } catch (e) {
    alert(`분석 시작 실패: ${e.message}`);
  }
}

// ── Week modal ─────────────────────────────────────────────────────────────

function openWeekModal(week) {
  _editingWeekId = week?.id ?? null;
  document.getElementById('week-modal-title').textContent =
    week ? '주차 강의 편집' : '주차 강의 추가';

  // Default week number = max existing + 1
  const nextWeek = _weeks.length
    ? Math.max(..._weeks.map(w => w.week)) + 1
    : 1;
  document.getElementById('week-number').value     = week?.week ?? nextWeek;
  document.getElementById('week-title').value      = week?.title ?? '';
  document.getElementById('week-lecture-id').value = week?.lecture_id ?? '';
  document.getElementById('week-note').value       = week?.note ?? '';
  document.getElementById('week-lecture-select').style.display = 'none';
  document.getElementById('week-modal').hidden = false;
  document.getElementById('week-title').focus();
}

function closeWeekModal() {
  document.getElementById('week-modal').hidden = true;
  _editingWeekId = null;
}

async function loadLectureDropdown() {
  const sel = document.getElementById('week-lecture-select');
  sel.style.display = 'block';
  sel.innerHTML = `<option value="">불러오는 중...</option>`;
  try {
    const lectures = await api('GET', '/api/proxy/lectures');
    if (!lectures.length) {
      sel.innerHTML = `<option value="">등록된 강의 없음</option>`;
      return;
    }
    sel.innerHTML = `<option value="">— 강의 선택 —</option>` +
      lectures.map(l =>
        `<option value="${esc(l.id)}">${esc(l.title)} (${esc(l.id)})</option>`
      ).join('');
  } catch (e) {
    sel.innerHTML = `<option value="">playLecture 연결 실패</option>`;
  }
}

function onLectureSelect() {
  const val = document.getElementById('week-lecture-select').value;
  if (val) document.getElementById('week-lecture-id').value = val;
}

async function saveWeek() {
  const weekNum = parseInt(document.getElementById('week-number').value, 10);
  if (!weekNum || weekNum < 1) { alert('올바른 주차 번호를 입력하세요.'); return; }
  const body = {
    week:       weekNum,
    title:      document.getElementById('week-title').value.trim(),
    lecture_id: document.getElementById('week-lecture-id').value.trim(),
    note:       document.getElementById('week-note').value.trim(),
  };
  const btn = document.getElementById('btn-save-week');
  btn.disabled = true;
  try {
    if (_editingWeekId) {
      await api('PUT', `/api/courses/${_selectedCourse.id}/weeks/${_editingWeekId}`, body);
    } else {
      await api('POST', `/api/courses/${_selectedCourse.id}/weeks`, body);
    }
    closeWeekModal();
    _weeks = await api('GET', `/api/courses/${_selectedCourse.id}/weeks`);
    renderWeeks();
    for (const w of _weeks.filter(w => w.lecture_id)) loadStatus(w);
  } catch (e) {
    alert(`저장 실패: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function deleteWeek(weekId) {
  const w = _weeks.find(w => w.id === weekId);
  if (!w) return;
  if (!confirm(`${w.week}주차 "${w.title || '(제목 없음)'}"를 삭제하시겠습니까?`)) return;
  await api('DELETE', `/api/courses/${_selectedCourse.id}/weeks/${weekId}`);
  _weeks = _weeks.filter(x => x.id !== weekId);
  renderWeeks();
}
