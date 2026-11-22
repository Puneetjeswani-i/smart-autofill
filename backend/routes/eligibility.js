const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { decryptProfile } = require('../utils/encryption');
const { getAllSchemesEligibility, SCHEMES } = require('../services/schemeEngine');

function getProfileId(req) {
  const sessionId = req.headers['x-session-id'];
  return sessionId && sessionId.length > 8 ? `session_${sessionId}` : 'default_user_profile';
}

function loadProfile(profileId) {
  const db = getDB();
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
  if (!row) return null;
  return decryptProfile(JSON.parse(row.data));
}

function mergeDocTypes(profile, req) {
  const fromProfile = profile._doc_types_seen || [];
  const fromDigiLocker = (req.headers['x-digilocker-docs'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromProfile, ...fromDigiLocker])];
}

// GET /api/eligibility
router.get('/', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const profile = loadProfile(profileId);

    if (!profile) {
      return res.json({
        eligible: [],
        ineligible: [],
        error: 'No profile found. Please login with DigiLocker or upload documents.',
      });
    }

    const docTypes = mergeDocTypes(profile, req);
    const { eligible, ineligible } = getAllSchemesEligibility(profile, docTypes);
    const total_schemes = Object.keys(SCHEMES).length;
    const profile_name =
      profile.personal_info?.name || profile.name || null;

    res.json({
      eligible,
      ineligible,
      total_schemes,
      profile_name,
    });
  } catch (err) {
    console.error('Eligibility error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
