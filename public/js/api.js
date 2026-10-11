// API 请求封装：自动携带 token，401 时跳转登录页
window.API = (() => {
  function getToken() { return localStorage.getItem('token') || ''; }
  function setToken(t) { localStorage.setItem('token', t); }

  async function call(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (e) {
      throw new Error('网络请求失败，请确认服务已启动');
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401) {
      localStorage.removeItem('token');
      if (location.pathname !== '/login') location.replace('/login');
      throw new Error((body && body.message) || '未登录或登录已过期');
    }
    if (!res.ok || (body && body.code !== 0)) {
      throw new Error((body && body.message) || ('请求失败 ' + res.status));
    }
    return body.data;
  }

  return { call, getToken, setToken };
})();
