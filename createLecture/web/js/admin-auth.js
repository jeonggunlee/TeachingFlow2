/* 관리자 토큰 처리 — 모든 페이지에서 가장 먼저 로드한다.
 *
 * 1. 포털이 링크에 실어 보낸 ?token= 을 localStorage에 보관하고 주소창에서 지운다
 *    (브라우저 히스토리·북마크에 토큰이 남지 않게).
 * 2. 같은 출처의 /api/ 호출에 Authorization: Bearer 를 자동으로 붙인다.
 * 3. 변경 요청이 401을 받으면 비밀번호를 물어 /api/auth/login 으로 토큰을 받고 한 번 재시도한다.
 *    (포털과 같은 관리자 비밀번호)
 */
(function () {
  'use strict';
  const KEY = 'edutech_admin_token';
  const _fetch = window.fetch.bind(window);

  const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (_) {} };

  try {
    const u = new URL(location.href);
    const t = u.searchParams.get('token');
    if (t) {
      setToken(t);
      u.searchParams.delete('token');
      history.replaceState(null, '', u.toString());
    }
  } catch (_) {}

  async function login() {
    const pw = window.prompt('관리자 비밀번호를 입력하세요 (포털과 같은 비밀번호)');
    if (pw == null) return null;
    const r = await _fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) { window.alert('비밀번호가 틀렸습니다.'); return null; }
    const d = await r.json();
    setToken(d.token);
    return d.token;
  }

  function isApi(input) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    return url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
  }

  window.fetch = async function (input, init) {
    if (!isApi(input)) return _fetch(input, init);
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const withAuth = (tok) => {
      const h = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
      if (tok) h.set('Authorization', 'Bearer ' + tok);
      return Object.assign({}, init, { headers: h });
    };
    let res = await _fetch(input, withAuth(getToken()));
    if (res.status === 401 && method !== 'GET') {
      setToken('');
      const tok = await login();
      if (tok) res = await _fetch(input, withAuth(tok));
    }
    return res;
  };

  window.EdutechAdmin = { getToken, login, logout: () => setToken('') };
})();
