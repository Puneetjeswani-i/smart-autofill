const express = require('express');
const router = express.Router();
const { verifySchemeRequirements, suggestSchemes, SCHEMES } = require('../services/schemeEngine');
const { getDB } = require('../utils/database');
const { decryptProfile } = require('../utils/encryption');
const { compareAddresses } = require('../services/addressEngine');

// P2.2: read session ID from header
function getProfileId(req) {
  const sessionId = req.headers['x-session-id'];
  return sessionId && sessionId.length > 8 ? `session_${sessionId}` : 'default_user_profile';
}

function loadStructuredProfile(profileId) {
  try {
    const db = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
    if (!row) return null;
    return decryptProfile(JSON.parse(row.data));
  } catch { return null; }
}

router.get('/schemes', (req, res) => {
  const profile = loadStructuredProfile(getProfileId(req));
  const docTypes = profile?._doc_types_seen || [];
  const suggestions = suggestSchemes(docTypes);
  const schemeList = Object.entries(SCHEMES).map(([id, s]) => ({
    id, name: s.name, category: s.category,
    suggested: suggestions.find(sg => sg.id === id)?.score > 0,
  }));
  res.json({ schemes: schemeList, suggested: suggestions.slice(0, 3) });
});

router.get('/residence', (req, res) => {
  const profile = loadStructuredProfile(getProfileId(req));
  if (!profile) return res.status(404).json({ error: 'No profile found.' });
  res.json(profile._residence_report || { status: 'insufficient', message: 'Upload documents first.' });
});

router.get('/fraud', (req, res) => {
  const profile = loadStructuredProfile(getProfileId(req));
  if (!profile) return res.status(404).json({ error: 'No profile found.' });
  res.json(profile._fraud_report || { risk_level: 'unknown', risk_score: 0, checks: [], flags: [], summary: 'No analysis available.' });
});

router.post('/address', (req, res) => {
  const { addr1, addr2 } = req.body;
  if (!addr1 || !addr2) return res.status(400).json({ error: 'Both addr1 and addr2 required' });
  res.json(compareAddresses(addr1, addr2));
});

router.get('/:schemeId', (req, res) => {
  const profile = loadStructuredProfile(getProfileId(req));
  if (!profile) return res.status(404).json({ error: 'No profile found.' });
  res.json(verifySchemeRequirements(req.params.schemeId, profile, profile._doc_types_seen || []));
});

module.exports = router;
