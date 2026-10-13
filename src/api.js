const KEY = 'mafia_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers.Authorization = 'Bearer ' + getToken();
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  if (r.status === 401 && path !== '/login') {
    setToken(null);
    window.dispatchEvent(new Event('logout'));
  }
  if (!r.ok) {
    const e = new Error(d.error || 'Ошибка');
    e.status = r.status;
    e.data = d;
    throw e;
  }
  return d;
}
