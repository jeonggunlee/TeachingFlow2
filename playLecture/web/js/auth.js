/**
 * auth.js — 인증 유틸리티 (모든 페이지에서 공유)
 * 사용하려면 <script src="/js/auth.js"> 를 먼저 로드할 것.
 */
const Auth = (() => {
  const TOKEN_KEY = "auth_token";
  const USER_KEY  = "auth_user";

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   {
    const s = localStorage.getItem(USER_KEY);
    return s ? JSON.parse(s) : null;
  }
  function isLoggedIn() { return !!getToken(); }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function authHeaders(extra = {}) {
    const token = getToken();
    return token
      ? { Authorization: `Bearer ${token}`, ...extra }
      : { ...extra };
  }

  function requireLogin(next = location.href) {
    if (!isLoggedIn()) {
      location.href = `/login?next=${encodeURIComponent(next)}`;
      return false;
    }
    return true;
  }

  /** fetch wrapper: 401 → clear & redirect to login */
  async function apiFetch(url, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      clearAuth();
      location.href = `/login?next=${encodeURIComponent(location.href)}`;
      return null;
    }
    return res;
  }

  return { getToken, getUser, isLoggedIn, setAuth, clearAuth, authHeaders, requireLogin, apiFetch };
})();
