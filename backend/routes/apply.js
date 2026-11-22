/**
 * routes/apply.js
 *
 * GET /api/apply/:schemeId
 * Returns portal URL, deep link, hint, and the citizen's relevant profile fields
 * for the requested scheme. Used by EligibilityPanel to open the portal and
 * pre-populate the autofill payload for the Chrome extension.
 */

const express = require('express');
const router  = express.Router();
const { getDB }          = require('../utils/database');
const { decryptProfile } = require('../utils/encryption');
const { flattenProfile } = require('../services/profileEngine');
const { SCHEME_PORTAL_URLS } = require('../services/schemeEngine');

function getProfileId(req) {
  const sid = req.headers['x-session-id'];
  return sid && sid.length > 8 ? `session_${sid}` : 'default_user_profile';
}

// ── Field subsets per scheme ──────────────────────────────────────────
const SCHEME_PROFILE_FIELDS = {
  mool_niwas:         ['name','father_name','dob','id_number','address','district','pincode','phone','state','gender'],
  income_certificate: ['name','father_name','id_number','address','district','pincode','phone'],
  caste_certificate:  ['name','father_name','dob','id_number','address','district','pincode','caste'],
  scholarship:        ['name','dob','id_number','father_name','address','pincode','education_12th_school','education_12th_board','education_12th_percentage'],
  voter_registration: ['name','dob','gender','phone','email','address','pincode','district','state'],
  driving_license:    ['name','dob','gender','phone','blood_group','address','pincode','state'],
  pm_kisan:           ['name','father_name','id_number','address','district','state','pincode','phone'],
  ayushman_bharat:    ['name','id_number','phone','address'],
  nsp_scholarship:    ['name','dob','phone','email','id_number','account_number','ifsc_code','state','address'],
  rajasthan_sambal:   ['name','father_name','dob','id_number','phone','address','district','pincode'],
};

// GET /api/apply/:schemeId
router.get('/:schemeId', (req, res) => {
  const { schemeId } = req.params;
  const portalInfo = SCHEME_PORTAL_URLS[schemeId];

  if (!portalInfo) {
    return res.status(404).json({ error: `Unknown scheme: ${schemeId}` });
  }

  const PROFILE_ID = getProfileId(req);
  const timestamp  = new Date().toISOString();

  console.log(`[Apply] ${timestamp} | scheme=${schemeId} | session=${PROFILE_ID}`);

  // Load citizen profile
  let profileFields = {};
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (row) {
      const structured = decryptProfile(JSON.parse(row.data));
      const flat = flattenProfile(structured);

      // Pick only the fields relevant to this scheme
      const fieldKeys = SCHEME_PROFILE_FIELDS[schemeId] || Object.keys(flat);
      for (const key of fieldKeys) {
        if (flat[key] !== null && flat[key] !== undefined) {
          profileFields[key] = flat[key];
        }
      }
    }
  } catch (e) {
    console.warn('[Apply] Profile load error:', e.message);
  }

  res.json({
    schemeId,
    name:         portalInfo.name,
    url:          portalInfo.url,
    deepLink:     portalInfo.deepLink,
    hint:         portalInfo.hint,
    profileFields,
    fieldCount:   Object.keys(profileFields).length,
  });
});

module.exports = router;
