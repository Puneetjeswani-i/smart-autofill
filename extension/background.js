/**
 * Smart Autofill — background service worker (v6)
 *
 * Holds the pairing (backend URL + extension key) and fetches the ACTIVE
 * customer from the Smart Autofill app on this computer. Customer data is
 * never written to extension storage — only kept in memory for a few seconds.
 */

const DEFAULT_BACKEND = 'http://localhost:3001';
let cache = { at: 0, data: null };

async function getConfig() {
  const { af_backend, af_key } = await chrome.storage.local.get(['af_backend', 'af_key']);
  return { backend: (af_backend || DEFAULT_BACKEND).replace(/\/$/, ''), key: af_key || null };
}

function isLocalBackend(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

async function apiGet(path) {
  const { backend, key } = await getConfig();
  if (!key) return { error: 'not_paired' };
  try {
    const res = await fetch(backend + path, { headers: { 'X-Extension-Key': key } });
    if (res.status === 401) return { error: 'not_paired' };
    if (!res.ok) return { error: `http_${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: 'offline' };
  }
}

async function getActive(force) {
  if (!force && cache.data && Date.now() - cache.at < 3000) return cache.data;
  const data = await apiGet('/api/ext/active');
  cache = { at: Date.now(), data };
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.action) {
      case 'pair': {
        // Only accept pairing from a content script running on a local dashboard page.
        const from = sender && sender.url ? sender.url : '';
        if (!isLocalBackend(from) || !msg.key || !isLocalBackend(msg.backend || '')) {
          sendResponse({ ok: false });
          return;
        }
        await chrome.storage.local.set({ af_key: String(msg.key), af_backend: String(msg.backend).replace(/\/$/, '') });
        cache = { at: 0, data: null };
        sendResponse({ ok: true });
        return;
      }
      case 'setManualConfig': {
        if (msg.backend && !isLocalBackend(msg.backend)) { sendResponse({ ok: false, error: 'Backend must be http://localhost:<port>' }); return; }
        const patch = {};
        if (msg.backend) patch.af_backend = msg.backend.replace(/\/$/, '');
        if (msg.key) patch.af_key = msg.key.trim();
        await chrome.storage.local.set(patch);
        cache = { at: 0, data: null };
        sendResponse({ ok: true });
        return;
      }
      case 'status': {
        const cfg = await getConfig();
        const ping = cfg.key ? await apiGet('/api/ext/ping') : { error: 'not_paired' };
        sendResponse({ backend: cfg.backend, paired: !!cfg.key && !ping.error, error: ping.error || null, shop: ping.shop_name || '' });
        return;
      }
      case 'getActive': {
        sendResponse(await getActive(!!msg.force));
        return;
      }
      default:
        sendResponse({ error: 'unknown_action' });
    }
  })();
  return true; // async response
});
