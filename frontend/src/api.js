/**
 * api.js — tiny fetch wrapper for the Smart Autofill backend.
 * The session token lives in sessionStorage (cleared when the browser closes).
 */

const TOKEN_KEY = 'sa_token';
let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { token = null; }
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(message, status, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra || {});
  }
}

export function setToken(t) {
  token = t || null;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode */ }
}

export function getToken() {
  return token;
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn || (() => {});
}

export async function api(path, { method = 'GET', body, form, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch (err) {
    throw new ApiError('Cannot reach the Smart Autofill server. Is it running? (start-shop.bat)', 0, 'network');
  }
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    setToken(null);
    onUnauthorized();
  }
  if (raw) {
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new ApiError(e.error || `Request failed (${res.status})`, res.status, e.code);
    }
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code, { retry_after: data.retry_after });
  return data;
}

/** Download a file from the API and save it with the browser. */
export async function downloadFile(path, fallbackName, { method = 'GET', form } = {}) {
  const res = await api(path, { method, form, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^";]+)"?/i);
  const name = m ? m[1] : fallbackName;
  saveBlob(blob, name);
  return {
    size: Number(res.headers.get('X-Result-Size')) || blob.size,
    overLimit: res.headers.get('X-Over-Limit') === '1',
    pages: Number(res.headers.get('X-Pages')) || null,
    name,
  };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
