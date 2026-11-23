/**
 * routes/digilockerAuth.js
 *
 * Simulated DigiLocker OAuth flow for SIH demo.
 *
 * Strategy (as accepted by SIH judges):
 *   - Shows a realistic DigiLocker-style consent page
 *   - Simulates the full OAuth flow end-to-end
 *   - Loads realistic citizen profile data on login
 *   - Displays disclaimer: "Real integration enabled after APISetu approval"
 *   - If real credentials are added to .env, switches to live OAuth automatically
 *
 * Routes:
 *   GET  /auth/digilocker              -> redirect to consent page (real or simulated)
 *   GET  /auth/digilocker/consent      -> simulated DigiLocker consent UI
 *   POST /auth/digilocker/consent      -> user clicks "Allow" on consent page
 *   GET  /auth/digilocker/callback     -> real OAuth callback
 */

const { config } = require('../config');
const express = require('express');
const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// ─── Check if real credentials are configured ─────────────────────────────────
const PLACEHOLDERS = ['your_client_id_here', '', undefined, null];
function hasRealCredentials() {
  return (
    process.env.DIGILOCKER_CLIENT_ID &&
    !PLACEHOLDERS.includes(process.env.DIGILOCKER_CLIENT_ID) &&
    process.env.DIGILOCKER_CLIENT_SECRET &&
    !PLACEHOLDERS.includes(process.env.DIGILOCKER_CLIENT_SECRET)
  );
}

// The dashboard is served by this same server in v6.
function frontendBase() {
  return (process.env.FRONTEND_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
}
function backendBase() {
  return (process.env.BACKEND_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
}

// ─── Simulated citizen profiles (realistic data for demo) ─────────────────────
const DEMO_PROFILES = [
  {
    id: 'demo1',
    name: 'Shruti Singh',
    uid: '8765 XXXX XXXX',
    mobile: '+91 98765 XXXXX',
    dob: '1990-07-25',
    gender: 'Female',
    address: '45, Civil Lines, Kanpur, Uttar Pradesh - 208001',
    state: 'Uttar Pradesh',
    district: 'Kanpur',
    photo: null,
  },
];

// ─── GET /auth/digilocker ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const state = uuidv4();
  req.session.digilocker = {
    state,
    redirectAfter: req.query.redirect_after || frontendBase() + '/',
  };

  if (hasRealCredentials()) {
    // Real OAuth flow
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     process.env.DIGILOCKER_CLIENT_ID,
      redirect_uri:  process.env.DIGILOCKER_REDIRECT_URI,
      state,
    });
    const url = (process.env.DIGILOCKER_AUTHORIZE_URL ||
      'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize');
    return res.redirect(url + '?' + params.toString());
  }

  // Simulated flow — show our consent page
  res.redirect(backendBase() + '/auth/digilocker/consent?state=' + state);
});

// ─── GET /auth/digilocker/consent ────────────────────────────────────────────
// Serves a realistic DigiLocker-style consent page
router.get('/consent', (req, res) => {
  const { state } = req.query;
  const stored = req.session?.digilocker;

  if (!stored || stored.state !== state) {
    return res.redirect(frontendBase() + '/?digilocker_error=Session+expired.+Please+try+again.');
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DigiLocker SIMULATION (demo only)</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f0f2f5;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .gov-bar {
    position: fixed; top: 0; left: 0; right: 0;
    background: #fff;
    border-bottom: 3px solid #f47920;
    padding: 8px 24px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
    z-index: 100;
  }
  .gov-bar img { height: 48px; }
  .gov-bar-text { font-size: 13px; color: #333; line-height: 1.4; }
  .gov-bar-text strong { display: block; font-size: 15px; color: #000; }
  .card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    width: 100%;
    max-width: 440px;
    margin-top: 80px;
    overflow: hidden;
  }
  .card-header {
    background: linear-gradient(135deg, #1a3c6e 0%, #2563a8 100%);
    padding: 28px 32px 24px;
    text-align: center;
    color: #fff;
  }
  .dl-logo {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    margin-bottom: 12px;
  }
  .dl-logo-icon {
    width: 44px; height: 44px;
    background: rgba(255,255,255,0.15);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }
  .dl-logo-text { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .dl-logo-text span { color: #f47920; }
  .card-header p { font-size: 13px; opacity: 0.85; }
  .card-body { padding: 28px 32px; }
  .requester-box {
    background: #f8f9ff;
    border: 1px solid #dde3ff;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 20px;
    display: flex; align-items: center; gap: 12px;
  }
  .requester-icon {
    width: 40px; height: 40px;
    background: #2563a8;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: white; flex-shrink: 0;
  }
  .requester-text { font-size: 13px; color: #444; }
  .requester-text strong { display: block; font-size: 14px; color: #111; margin-bottom: 2px; }
  .permissions {
    margin-bottom: 24px;
  }
  .permissions h4 { font-size: 13px; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .perm-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px; color: #333;
  }
  .perm-item:last-child { border-bottom: none; }
  .perm-icon { font-size: 16px; flex-shrink: 0; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 13px; font-weight: 500; color: #333; margin-bottom: 6px; }
  .form-group input, .form-group select {
    width: 100%; padding: 11px 14px;
    border: 1.5px solid #ddd; border-radius: 8px;
    font-size: 14px; color: #111;
    transition: border-color 0.2s;
    background: #fff;
  }
  .form-group input:focus, .form-group select:focus {
    outline: none; border-color: #2563a8;
    box-shadow: 0 0 0 3px rgba(37,99,168,0.1);
  }
  .btn-allow {
    width: 100%; padding: 13px;
    background: linear-gradient(135deg, #1a3c6e, #2563a8);
    color: #fff; border: none; border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    transition: opacity 0.2s;
    margin-bottom: 10px;
  }
  .btn-allow:hover { opacity: 0.92; }
  .btn-deny {
    width: 100%; padding: 11px;
    background: transparent; color: #666;
    border: 1.5px solid #ddd; border-radius: 8px;
    font-size: 14px; cursor: pointer;
    transition: all 0.2s;
  }
  .btn-deny:hover { background: #f5f5f5; border-color: #bbb; }
  .security-note {
    margin-top: 16px; padding: 12px;
    background: #f0f7f0; border-radius: 8px;
    font-size: 11px; color: #555; text-align: center; line-height: 1.5;
  }
  .demo-badge {
    background: #fff3cd; border: 1px solid #ffc107;
    border-radius: 6px; padding: 8px 12px;
    font-size: 11px; color: #856404; margin-bottom: 16px;
    text-align: center; line-height: 1.5;
  }
  .footer {
    text-align: center; margin-top: 20px;
    font-size: 11px; color: #999;
  }
  .loading { display: none; text-align: center; padding: 20px; }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid #e0e0e0; border-top-color: #2563a8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .user-box {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    background: #f0f7f0; border: 1px solid #c3e6cb;
    border-radius: 8px; margin-bottom: 20px;
  }
  .user-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, #1a3c6e, #2563a8);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 18px; font-weight: 700; flex-shrink: 0;
  }
  .user-info { font-size: 13px; }
  .user-info strong { display: block; font-size: 14px; color: #155724; }
  .user-info span { color: #555; }
</style>
</head>
<body>

<div class="gov-bar">
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:28px;">🇮🇳</span>
    <div class="gov-bar-text">
      <strong>DigiLocker</strong>
      SIMULATION for demonstrations — this is NOT the real DigiLocker
    </div>
  </div>
  <div style="margin-left:auto;font-size:11px;color:#b45309;font-weight:700;">DEMO ONLY</div>
</div>

<div class="card">
  <div class="card-header">
    <div class="dl-logo">
      <div class="dl-logo-icon">🔐</div>
      <div class="dl-logo-text">Digi<span>Locker</span></div>
    </div>
    <p>India's Digital Document Wallet</p>
  </div>

  <div class="card-body">
    <div class="demo-badge">
      🧪 <strong>Simulation Mode</strong> — this page imitates the OAuth flow for demonstrations only. Never use it with real customers. Real DigiLocker access is available only to approved APISetu partners.
    </div>

    <div class="requester-box">
      <div class="requester-icon">⬡</div>
      <div class="requester-text">
        <strong>Smart AutoFill</strong>
        is requesting access to your DigiLocker
      </div>
    </div>

    <!-- Step 1: Login form -->
    <div id="step-login">
      <div class="form-group">
        <label>Aadhaar-linked Mobile Number</label>
        <input type="tel" id="mobile" placeholder="Enter 10-digit mobile number" maxlength="10" />
      </div>
      <div class="form-group">
        <label>Select Demo Citizen</label>
        <select id="profile-select">
          <option value="demo1">Shruti Singh — Kanpur, Uttar Pradesh</option>
        </select>
      </div>
      <button class="btn-allow" onclick="sendOtp()">Send OTP</button>
    </div>

    <!-- Step 2: OTP verification -->
    <div id="step-otp" style="display:none;">
      <div class="user-box">
        <div class="user-avatar">A</div>
        <div class="user-info">
          <strong>Shruti Singh</strong>
          <span>OTP sent to +91 98765 XXXXX</span>
        </div>
      </div>
      <div class="form-group">
        <label>Enter OTP</label>
        <input type="text" id="otp" placeholder="6-digit OTP" maxlength="6" />
        <div style="font-size:11px;color:#888;margin-top:4px;">Demo OTP: <strong>123456</strong></div>
      </div>

      <div class="permissions">
        <h4>Smart AutoFill will access</h4>
        <div class="perm-item"><span class="perm-icon">🪪</span> Your Aadhaar Card (name, DOB, address)</div>
        <div class="perm-item"><span class="perm-icon">📋</span> Your PAN Card</div>
        <div class="perm-item"><span class="perm-icon">🚗</span> Your Driving Licence</div>
        <div class="perm-item"><span class="perm-icon">📜</span> Issued certificates & marksheets</div>
      </div>

      <button class="btn-allow" onclick="verifyAndAllow()">Allow Access</button>
      <button class="btn-deny" onclick="denyAccess()">Deny</button>

      <div class="security-note">
        🔒 Your documents will be securely shared. Smart AutoFill cannot store or share your documents without your consent.
      </div>
    </div>

    <!-- Loading -->
    <div class="loading" id="step-loading">
      <div class="spinner"></div>
      <p style="color:#555;font-size:14px;">Verifying and granting access…</p>
    </div>
  </div>
</div>

<div class="footer">
  Simulated screen for demonstrations only — no real DigiLocker account is used.
</div>

<script>
  var state = '${state}';
  var backendUrl = '${backendBase()}';

  function sendOtp() {
    var mobile = document.getElementById('mobile').value;
    // In real flow, this calls DigiLocker's OTP API
    // For demo, just show OTP step
    document.getElementById('step-login').style.display = 'none';
    document.getElementById('step-otp').style.display = 'block';
  }

  function verifyAndAllow() {
    var otp = document.getElementById('otp').value;
    var profile = document.getElementById('profile-select') ?
      document.getElementById('profile-select').value : 'demo1';

    // Show loading
    document.getElementById('step-otp').style.display = 'none';
    document.getElementById('step-loading').style.display = 'block';

    // POST to backend to complete the simulated login
    fetch(backendUrl + '/auth/digilocker/consent', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: state, profileId: profile, otp: otp })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
        window.location.href = backendUrl + '/auth/digilocker/consent?state=' + state;
      }
    })
    .catch(function(err) {
      alert('Connection error. Make sure backend is running on port 3001.');
    });
  }

  function denyAccess() {
    window.location.href = '${frontendBase()}/?digilocker_error=Access+denied+by+user';
  }

  // Auto-focus mobile input
  document.getElementById('mobile').focus();

  // Allow pressing Enter
  document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      var loginStep = document.getElementById('step-login');
      var otpStep   = document.getElementById('step-otp');
      if (loginStep.style.display !== 'none' && loginStep.style.display !== '') {
        sendOtp();
      } else if (otpStep.style.display !== 'none') {
        verifyAndAllow();
      }
    }
  });
</script>
</body>
</html>`);
});

// ─── POST /auth/digilocker/consent ───────────────────────────────────────────
// Called by the consent page JS when user clicks "Allow Access"
router.post('/consent', express.json(), (req, res) => {
  const { state, profileId } = req.body;
  const stored = req.session?.digilocker;

  if (!stored || stored.state !== state) {
    return res.status(400).json({ error: 'Session state mismatch. Please try again.' });
  }

  // Inject simulated token into session
  req.session.digilocker = {
    ...stored,
    accessToken:   'SIMULATED_TOKEN_' + Date.now(),
    refreshToken:  null,
    tokenType:     'Bearer',
    expiresAt:     Date.now() + 1000 * 60 * 60 * 2,
    digilockerUid: 'SIM_UID_876512345012',
    profileId:     profileId || 'demo1',
    isMock:        true,
  };

  console.log('[DigiLocker] ✅ Simulated login successful for profile:', profileId);

  const dest = new URL(stored.redirectAfter || '/', frontendBase());
  dest.searchParams.set('digilocker_success', '1');
  res.json({ redirect: dest.toString() });
});

// ─── GET /auth/digilocker/callback ───────────────────────────────────────────
// Real OAuth callback (only used when real credentials are configured)
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const dest = new URL('/', frontendBase());
    dest.searchParams.set('digilocker_error', error_description || error);
    return res.redirect(dest.toString());
  }

  if (!code || !state) {
    const dest = new URL('/', frontendBase());
    dest.searchParams.set('digilocker_error', 'Invalid callback — missing code or state');
    return res.redirect(dest.toString());
  }

  const stored = req.session?.digilocker;
  if (!stored || stored.state !== state) {
    const dest = new URL('/', frontendBase());
    dest.searchParams.set('digilocker_error', 'Session state mismatch. Please try again.');
    return res.redirect(dest.toString());
  }

  try {
    const tokenPayload = new URLSearchParams({
      code,
      grant_type:    'authorization_code',
      client_id:     process.env.DIGILOCKER_CLIENT_ID,
      client_secret: process.env.DIGILOCKER_CLIENT_SECRET,
      redirect_uri:  process.env.DIGILOCKER_REDIRECT_URI,
    });

    const { data: tokenData } = await axios.post(
      process.env.DIGILOCKER_TOKEN_URL || 'https://api.digitallocker.gov.in/public/oauth2/1/token',
      tokenPayload.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, timeout: 15000 }
    );

    if (!tokenData.access_token) throw new Error('No access_token in response');

    req.session.digilocker = {
      ...stored,
      accessToken:   tokenData.access_token,
      refreshToken:  tokenData.refresh_token || null,
      tokenType:     tokenData.token_type || 'Bearer',
      expiresAt:     tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      digilockerUid: tokenData.sub || tokenData.digilockerID || null,
      isMock:        false,
    };

    const dest = new URL(stored.redirectAfter || '/', frontendBase());
    dest.searchParams.set('digilocker_success', '1');
    res.redirect(dest.toString());
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message || 'Token exchange failed';
    console.error('[DigiLocker] Token error:', msg);
    const dest = new URL('/', frontendBase());
    dest.searchParams.set('digilocker_error', msg);
    res.redirect(dest.toString());
  }
});

module.exports = router;
