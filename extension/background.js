/**
 * Smart Autofill Background Service Worker — v3
 *
 * Session ID resolution order:
 *   1. Read sessionStorage from open localhost:3000 tab (most accurate)
 *   2. Read localStorage from open localhost:3000 tab (persists across reloads)
 *   3. Read last-known session ID from chrome.storage.local (works when dashboard is closed)
 *   4. Fall back to no session ID (hits default_user_profile)
 */

const API = 'http://localhost:3001';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'getProfile') {
    // Use /latest endpoint — finds the most recently updated profile without needing session ID
    fetch(`${API}/api/profile/latest`)
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          // Cache the session ID for clear/reset operations
          if (data.session_id) {
            chrome.storage.local.set({ af_session_id: data.session_id });
          }
        }
        sendResponse({
          profile: data.profile || null,
          structured_profile: data.structured_profile || null,
          completeness: data.completeness || null,
          suggested_schemes: data.suggested_schemes || [],
        });
      })
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === 'clearProfile') {
    getSessionId()
      .then(sessionId => {
        const headers = { 'Content-Type': 'application/json' };
        if (sessionId) headers['X-Session-ID'] = sessionId;
        return fetch(`${API}/api/profile/reset`, { method: 'POST', headers });
      })
      .then(r => r.json())
      .then(data => {
        // Clear stored session ID so next scan starts fresh
        chrome.storage.local.remove('af_session_id');
        sendResponse({ success: true, message: data.message });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'autofillComplete') {
    console.log('[BG] Autofill complete:', message.result);
  }

  if (message.action === 'autofillCancelled') {
    console.log('[BG] Autofill cancelled by user');
  }
});

// ── Portal autofill: watch for tabs loading scheme portals ────────────
const PORTAL_HOSTNAMES = [
  'emitra.rajasthan.gov.in',
  'scholarship.rajasthan.gov.in',
  'voters.eci.gov.in',
  'sarathi.parivahan.gov.in',
  'pmkisan.gov.in',
  'beneficiary.nha.gov.in',
  'scholarships.gov.in',
  'ldms.rajasthan.gov.in',
];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  let tabHostname;
  try { tabHostname = new URL(tab.url).hostname; } catch { return; }

  const isPortal = PORTAL_HOSTNAMES.some(h => tabHostname === h || tabHostname.endsWith('.' + h));
  if (!isPortal) return;

  // Check if there's a pending autofill for this portal
  chrome.storage.local.get('pendingAutofill', (result) => {
    const pending = result.pendingAutofill;
    if (!pending) return;

    // Expire after 2 minutes
    if (Date.now() - pending.timestamp > 2 * 60 * 1000) {
      chrome.storage.local.remove('pendingAutofill');
      return;
    }

    console.log('[BG] Portal loaded, sending autofill to tab', tabId, pending.schemeId);
    // Small delay to let the page's JS initialize
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action: 'doPortalAutofill',
        schemeId: pending.schemeId,
        profileData: pending.profileData,
      }).catch(() => {});
    }, 2000);
  });
});

/**
 * Resolve the session ID using a 3-tier fallback strategy.
 */
async function getSessionId() {
  // Tier 1 & 2: Try to read from the open dashboard tab
  const fromTab = await getSessionIdFromDashboardTab();
  if (fromTab) {
    // Cache it for when the tab is closed
    chrome.storage.local.set({ af_session_id: fromTab });
    return fromTab;
  }

  // Tier 3: Use cached value from chrome.storage.local
  try {
    const stored = await chrome.storage.local.get('af_session_id');
    if (stored.af_session_id) {
      console.log('[BG] Using cached session ID from storage:', stored.af_session_id);
      return stored.af_session_id;
    }
  } catch (e) {
    console.warn('[BG] Could not read from chrome.storage.local:', e.message);
  }

  console.warn('[BG] No session ID found — will use default profile slot');
  return null;
}

/**
 * Try to read the session ID from the open localhost:3000 tab.
 * Tries sessionStorage first, then localStorage.
 */
async function getSessionIdFromDashboardTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:3000/*' });
    if (tabs.length === 0) {
      console.log('[BG] No dashboard tab open');
      return null;
    }

    const tab = tabs[0];

    // Try sessionStorage first
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => sessionStorage.getItem('af_session_id') || localStorage.getItem('af_session_id'),
      });
      const sessionId = results?.[0]?.result;
      if (sessionId) {
        console.log('[BG] Got session ID from dashboard tab:', sessionId);
        return sessionId;
      }
    } catch (e) {
      console.warn('[BG] scripting.executeScript failed:', e.message);
    }

    return null;
  } catch (e) {
    console.warn('[BG] Tab query failed:', e.message);
    return null;
  }
}
