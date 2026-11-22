/* Smart Autofill popup (v6) */

const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || {})));

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function tabMessage(msg) {
  const tab = await activeTab();
  if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) return { error: 'no_page' };
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    // Content script not present (non-government site): inject on demand (activeTab permission).
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {
      return { error: 'cannot_inject' };
    }
  }
}

async function init() {
  const { af_backend, af_key } = await chrome.storage.local.get(['af_backend', 'af_key']);
  $('backend').value = af_backend || 'http://localhost:3001';
  $('key').value = af_key ? '••••••••' : '';

  const st = await send({ action: 'status' });
  $('dot').className = `dot ${st.paired ? 'ok' : st.error === 'offline' ? 'bad' : ''}`;
  if (st.shop) $('shop').textContent = st.shop;
  if (!st.paired) {
    $('notPaired').classList.remove('hidden');
    if (st.error === 'offline') $('notPaired').querySelector('.muted').textContent = 'The Smart Autofill app is not running. Start it (start-shop.bat), then reopen this popup.';
    return;
  }
  $('notPaired').classList.add('hidden');
  $('customerBox').classList.remove('hidden');

  const data = await send({ action: 'getActive', force: true });
  if (data && data.active) {
    const c = data.active.customer;
    $('who').textContent = c.name || 'Customer';
    const svc = data.active.service ? ` · ${data.active.service.name.en}` : '';
    $('whoSub').textContent = `#${c.customer_no}${c.aadhaar_last4 ? ` · Aadhaar ••••${c.aadhaar_last4}` : ''}${svc}`;
  } else {
    $('who').textContent = '—';
    $('noCustomer').classList.remove('hidden');
  }

  $('pageBox').classList.remove('hidden');
  const scan = await tabMessage({ action: 'scan' });
  if (scan.error) {
    $('pageInfo').textContent = 'This page cannot be filled (open the portal form first).';
    return;
  }
  $('pageInfo').textContent = `${scan.inputs} input boxes · ${scan.detected} recognised${scan.taught ? ` (${scan.taught} taught)` : ''}`;
  $('learn').checked = !!scan.learning;
  $('fillBtn').disabled = !(data && data.active) || !scan.inputs;
}

$('openDash').addEventListener('click', async () => {
  const { af_backend } = await chrome.storage.local.get('af_backend');
  chrome.tabs.create({ url: af_backend || 'http://localhost:3001' });
});

$('fillBtn').addEventListener('click', async () => {
  const r = await tabMessage({ action: 'preview' });
  if (r && r.ok) window.close();
  else $('pageInfo').textContent = r && r.error === 'no_active' ? 'Open a customer in the dashboard first.' : 'Could not open the preview on this page.';
});

$('learn').addEventListener('change', async (e) => {
  await tabMessage({ action: 'learn', on: e.target.checked });
  if (e.target.checked) window.close();
});

$('clearMap').addEventListener('click', async () => {
  await tabMessage({ action: 'clearMappings' });
  $('pageInfo').textContent = 'Taught fields for this page were removed.';
});

$('saveCfg').addEventListener('click', async () => {
  const key = $('key').value.trim();
  const r = await send({ action: 'setManualConfig', backend: $('backend').value.trim(), key: key && !key.startsWith('•') ? key : undefined });
  $('cfgMsg').textContent = r.ok ? 'Saved. Reopen the popup.' : (r.error || 'Could not save');
});

init();
