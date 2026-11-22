const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { encryptProfile, decryptProfile } = require('../utils/encryption');
const { flattenProfile, generateCompletenessReport, emptyProfile, mergeDocumentIntoProfile } = require('../services/profileEngine');
const { suggestSchemes } = require('../services/schemeEngine');

// P2.2: read session ID from header, fall back to default
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

// GET /api/profile/latest — returns the most recently updated profile (for Chrome extension)
// No session ID required — finds whichever profile was updated most recently
router.get('/latest', (req, res) => {
  try {
    const db = getDB();
    const allProfiles = db.getAllProfiles();

    if (!allProfiles || allProfiles.length === 0) {
      return res.json({ profile: null, message: 'No profile found' });
    }

    // Sort by updated_at descending, pick the most recent
    const latest = allProfiles
      .filter(row => row.id !== 'default_user_profile')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]
      || allProfiles[0];

    const structured = decryptProfile(JSON.parse(latest.data));
    if (!structured || !structured.personal_info) {
      return res.json({ profile: null, message: 'No valid profile found' });
    }

    const flat = flattenProfile(structured);
    const completeness = generateCompletenessReport(structured);
    const suggested_schemes = structured._doc_types_seen
      ? suggestSchemes(structured._doc_types_seen).slice(0, 3)
      : [];

    res.json({
      success: true,
      profile: flat,
      structured_profile: structured,
      completeness,
      suggested_schemes,
      residence_report: structured._residence_report || null,
      fraud_report: structured._fraud_report || null,
      session_id: latest.id.replace('session_', ''),
    });
  } catch (err) {
    console.error('Get latest profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile
router.get('/', (req, res) => {
  try {
    const PROFILE_ID = getProfileId(req);
    const structured = loadProfile(PROFILE_ID);
    if (!structured) return res.json({ profile: null, message: 'No profile found' });

    const flat = structured.personal_info ? flattenProfile(structured) : structured;
    const completeness = structured.personal_info ? generateCompletenessReport(structured) : null;
    const suggested_schemes = structured._doc_types_seen
      ? suggestSchemes(structured._doc_types_seen).slice(0, 3)
      : [];

    res.json({
      success: true,
      profile: flat,
      structured_profile: structured.personal_info ? structured : null,
      completeness,
      suggested_schemes,
      residence_report: structured._residence_report || null,
      fraud_report: structured._fraud_report || null,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile
router.put('/', (req, res) => {
  try {
    const PROFILE_ID = getProfileId(req);
    const profileData = req.body;
    if (!profileData || Object.keys(profileData).length === 0)
      return res.status(400).json({ error: 'No profile data provided' });

    const db = getDB();
    const existing = loadProfile(PROFILE_ID);

    let toSave = profileData;
    if (existing && existing.personal_info) {
      const fakeConf = {};
      Object.keys(profileData).forEach(k => { fakeConf[k] = 0.99; });
      toSave = mergeDocumentIntoProfile(existing, profileData, fakeConf, 'manual_edit');
    }

    const encrypted = encryptProfile(toSave);
    const existsRow = db.prepare('SELECT id FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (existsRow) {
      db.prepare('UPDATE profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(encrypted), PROFILE_ID);
    } else {
      db.prepare('INSERT INTO profiles (id, data) VALUES (?, ?)')
        .run(PROFILE_ID, JSON.stringify(encrypted));
    }

    res.json({
      success: true,
      message: 'Profile saved',
      fields_saved: Object.keys(profileData).filter(k => profileData[k]).length,
    });
  } catch (err) {
    console.error('Save profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/profile
router.delete('/', (req, res) => {
  try {
    const PROFILE_ID = getProfileId(req);
    const db = getDB();
    db.prepare('DELETE FROM profiles WHERE id = ?').run(PROFILE_ID);
    db.prepare('DELETE FROM extractions').run();
    res.json({ success: true, message: 'All data deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/reset  — clear current session profile so a new person can be scanned
router.post('/reset', (req, res) => {
  try {
    const PROFILE_ID = getProfileId(req);
    const db = getDB();
    db.prepare('DELETE FROM profiles WHERE id = ?').run(PROFILE_ID);
    res.json({ success: true, message: 'Profile cleared — ready for new person scan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/:sessionId — partial update from VerifyData form
// Merges only the provided fields into the existing structured profile
router.put('/:sessionId', (req, res) => {
  try {
    const PROFILE_ID = `session_${req.params.sessionId}`;
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No fields provided' });

    const db = getDB();
    const existing = loadProfile(PROFILE_ID);
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    // High-confidence manual edit — use 0.99 so it always wins conflict resolution
    const fakeConf = {};
    Object.keys(updates).forEach(k => { fakeConf[k] = 0.99; });
    const updated = mergeDocumentIntoProfile(existing, updates, fakeConf, 'manual_edit');

    const encrypted = encryptProfile(updated);
    db.prepare('UPDATE profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(encrypted), PROFILE_ID);

    const flat = flattenProfile(updated);
    const completeness = generateCompletenessReport(updated);
    res.json({ success: true, profile: flat, completeness });
  } catch (err) {
    console.error('PUT profile/:sessionId error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
