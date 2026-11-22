/**
 * Smart Autofill Popup — v2
 * Shows citizen profile, readiness score, field detection, consent preview toggle
 */

let currentProfile = null;
let currentFlat = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('retryBtn')?.addEventListener('click', loadProfile);
  document.getElementById('retryBtn2')?.addEventListener('click', loadProfile);
  document.getElementById('refreshBtn')?.addEventListener('click', loadProfile);
  document.getElementById('openDashBtn')?.addEventListener('click', openDash);
  document.getElementById('openDashBtn2')?.addEventListener('click', openDash);
  document.getElementById('autofillBtn')?.addEventListener('click', triggerAutofill);
  document.getElementById('clearResultBtn')?.addEventListener('click', () => {
    document.getElementById('fillResult').classList.add('hidden');
  });
  document.getElementById('newPersonBtn')?.addEventListener('click', showClearConfirm);
  document.getElementById('confirmClearBtn')?.addEventListener('click', clearProfile);
  document.getElementById('cancelClearBtn')?.addEventListener('click', hideClearConfirm);
  await loadProfile();
}

function showClearConfirm() {
  const nameEl = document.getElementById('clearPersonName');
  if (nameEl && currentFlat?.name) nameEl.textContent = currentFlat.name;
  document.getElementById('confirmClearState')?.classList.remove('hidden');
  document.getElementById('fillResult')?.classList.add('hidden');
}

function hideClearConfirm() {
  document.getElementById('confirmClearState')?.classList.add('hidden');
}

async function clearProfile() {
  hideClearConfirm();
  const sessionLabel = document.getElementById('sessionLabel');
  if (sessionLabel) sessionLabel.textContent = 'Clearing profile…';
  setDot('loading');

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'clearProfile' });
    if (resp?.success) {
      currentFlat = null;
      currentProfile = null;
      showState('noProfile');
      setDot('ok');
      if (sessionLabel) sessionLabel.textContent = 'Profile cleared — scan new documents';
    } else {
      throw new Error(resp?.error || 'Clear failed');
    }
  } catch (e) {
    setDot('error');
    if (sessionLabel) sessionLabel.textContent = 'Error: ' + e.message;
  }
}

function openDash() { chrome.tabs.create({ url: 'http://localhost:3000' }); }

async function loadProfile() {
  showState('loading');
  setDot('loading');
  const sessionLabel = document.getElementById('sessionLabel');
  if (sessionLabel) sessionLabel.textContent = 'Connecting to dashboard…';
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getProfile' });
    if (resp.error) {
      showState('error');
      setDot('error');
      if (sessionLabel) sessionLabel.textContent = 'Backend not reachable';
      return;
    }
    if (!resp.profile) {
      showState('noProfile');
      setDot('ok');
      if (sessionLabel) sessionLabel.textContent = 'No profile — upload documents first';
      return;
    }

    currentFlat = resp.profile;
    currentProfile = resp.structured_profile || null;
    setDot('ok');
    showState('main');
    if (sessionLabel) sessionLabel.textContent = resp.profile.name
      ? `Profile: ${resp.profile.name.split(' ')[0]}`
      : 'Profile loaded ✓';
    renderProfile(currentFlat);
    renderReadiness(resp.completeness);
    renderSchemes(resp.suggested_schemes);
    await scanPage();
  } catch (e) {
    console.error(e);
    showState('error');
    setDot('error');
    if (sessionLabel) sessionLabel.textContent = 'Connection error';
  }
}

function renderProfile(p) {
  const meta = [];
  if (p.dob) meta.push(`🗓 ${p.dob}`);
  if (p.phone) meta.push(`📱 ${p.phone}`);
  if (p.id_number) meta.push(`🪪 ${maskId(p.id_number)}`);
  if (p.pan) meta.push(`💳 ${p.pan}`);

  const docTypes = (p._doc_types_seen || []).map(d =>
    `<div class="doc-chip">${d.replace(/_/g,' ')}</div>`
  ).join('');

  document.getElementById('profileCard').innerHTML = `
    <div class="profile-name">${esc(p.name || 'Profile Loaded')}</div>
    <div class="profile-meta">${meta.map(m => `<span class="meta-badge">${esc(m)}</span>`).join('')}</div>
    ${docTypes ? `<div class="docs-row">${docTypes}</div>` : ''}
  `;
}

function renderReadiness(completeness) {
  if (!completeness) return;
  const score = completeness.score || 0;
  const el = document.getElementById('readinessScore');
  const fill = document.getElementById('readinessFill');
  el.textContent = `${score}%`;
  el.className = `readiness-score ${score >= 75 ? 'score-high' : score >= 50 ? 'score-med' : 'score-low'}`;
  const fillColor = score >= 75 ? '#a6e3a1' : score >= 50 ? '#f9e2af' : '#f38ba8';
  fill.style.width = `${score}%`;
  fill.style.background = fillColor;

  // Show missing fields alert
  const critical = (completeness.missing_fields || []).filter(f => f.required);
  const alertEl = document.getElementById('alertSection');
  const alertItems = document.getElementById('alertItems');
  if (critical.length > 0) {
    alertItems.innerHTML = critical.slice(0, 4).map(f =>
      `<div class="alert-item">⚠ ${esc(f.field)}</div>`
    ).join('');
    if (critical.length > 4) alertItems.innerHTML += `<div class="alert-item">...and ${critical.length - 4} more</div>`;
    alertEl.classList.remove('hidden');
  }

  // Mismatches
  if (completeness.mismatches?.length > 0) {
    alertItems.innerHTML += completeness.mismatches.slice(0,2).map(m =>
      `<div class="alert-item" style="color:#f38ba8">⚡ ${esc(m)}</div>`
    ).join('');
    alertEl.classList.remove('hidden');
  }
}

function renderSchemes(schemes) {
  if (!schemes || schemes.length === 0) return;
  const sec = document.getElementById('schemesSection');
  const chips = document.getElementById('schemesChips');
  sec.style.display = '';
  chips.innerHTML = schemes.map(s =>
    `<div class="scheme-chip" title="${esc(s.name)}">${esc(s.name.split('(')[0].trim())}</div>`
  ).join('');
}

async function scanPage() {
  const container = document.getElementById('fieldsDetected');
  const btn = document.getElementById('autofillBtn');
  container.innerHTML = '<div class="no-fields">Scanning...</div>';
  btn.disabled = true;
  btn.textContent = '⚡ Autofill This Page';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'scanFields' });
    const fields = resp?.fields || [];

    if (fields.length === 0) {
      container.innerHTML = '<div class="no-fields">No matching fields found on this page</div>';
      return;
    }

    // Filter to fields that have a value in profile
    const fillable = fields.filter(f => {
      const val = currentFlat && getProfileValue(f.matched, currentFlat);
      return !!val;
    });

    container.innerHTML = fields.map(f => {
      const haVal = currentFlat && !!getProfileValue(f.matched, currentFlat);
      const confClass = f.score >= 0.85 ? 'conf-high' : f.score >= 0.65 ? 'conf-med' : 'conf-low';
      return `
        <div class="field-row" style="${haVal ? '' : 'opacity:0.5'}">
          <div class="conf-dot ${confClass}"></div>
          <div class="field-name">${esc(f.name)}</div>
          <div class="field-arrow">→</div>
          <div class="field-match">${f.matched.replace(/_/g,' ')}</div>
        </div>
      `;
    }).join('');

    if (fillable.length > 0) {
      btn.disabled = false;
      btn.textContent = `⚡ Autofill ${fillable.length} Field${fillable.length !== 1 ? 's' : ''}`;
    } else {
      container.innerHTML += '<div class="no-fields" style="margin-top:6px">Profile data not available for these fields</div>';
    }
  } catch {
    container.innerHTML = '<div class="no-fields">Cannot scan — refresh the page and try again</div>';
  }
}

function getProfileValue(field, profile) {
  const FIELD_MAP = {
    name:                    p => p.name,
    father_name:             p => p.father_name,
    mother_name:             p => p.mother_name,
    husband_name:            p => p.husband_name || p.father_name,
    dob:                     p => p.dob,
    gender:                  p => p.gender,
    phone:                   p => p.phone,
    email:                   p => p.email,
    id_number:               p => p.id_number,
    pan:                     p => p.pan,
    voter_id:                p => p.voter_id,
    driving_license:         p => p.driving_license,
    passport_number:         p => p.passport_number,
    address:                 p => p.address,
    pincode:                 p => p.pincode,
    district:                p => p.district,
    state:                   p => p.state,
    nationality:             p => p.nationality || 'Indian',
    birth_place:             p => p.birth_place,
    years_in_rajasthan:      p => p.years_in_rajasthan,
    highest_education:       p => p.highest_education,
    education_10th_school:   p => p.education_10th_school,
    education_10th_board:    p => p.education_10th_board,
    education_10th_year:     p => p.education_10th_year,
    education_10th_percentage: p => p.education_10th_percentage,
    education_12th_school:   p => p.education_12th_school,
    education_12th_board:    p => p.education_12th_board,
    education_12th_year:     p => p.education_12th_year,
    education_12th_percentage: p => p.education_12th_percentage,
    education_grad_school:   p => p.education_grad_school,
  };
  return FIELD_MAP[field]?.(profile) || null;
}

async function triggerAutofill() {
  if (!currentFlat) return;
  const btn = document.getElementById('autofillBtn');
  const result = document.getElementById('fillResult');
  const showPreview = document.getElementById('previewToggle')?.checked !== false;

  btn.disabled = true;
  btn.textContent = '⏳ Filling...';
  result.classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const resp = await chrome.tabs.sendMessage(tab.id, {
      action: 'doAutofill',
      profile: currentFlat,
      showPreview,
    });

    if (resp?.preview) {
      result.className = 'result info';
      result.textContent = `Preview shown — ${resp.fields_detected} fields ready. Review and confirm.`;
      result.classList.remove('hidden');
    } else {
      const { filled = 0 } = resp || {};
      result.className = `result ${filled > 0 ? 'success' : 'error'}`;
      result.textContent = filled > 0
        ? `✓ Filled ${filled} field${filled !== 1 ? 's' : ''} successfully!`
        : '⚠ No matching fields could be filled';
      result.classList.remove('hidden');
    }
  } catch (e) {
    result.className = 'result error';
    result.textContent = `Error: ${e.message}`;
    result.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Autofill This Page';
  }
}

// ── Utils ──────────────────────────────────────────────────────────
function showState(s) {
  ['loadingState','errorState','noProfileState','mainState'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  );
  const map = { loading:'loadingState', error:'errorState', noProfile:'noProfileState', main:'mainState' };
  document.getElementById(map[s])?.classList.remove('hidden');
}

function setDot(s) {
  const d = document.getElementById('statusDot');
  d.className = `status-dot ${s}`;
}

function maskId(id) {
  const c = String(id).replace(/\s/g,'');
  return c.length <= 4 ? c : '•••• •••• ' + c.slice(-4);
}

function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}
