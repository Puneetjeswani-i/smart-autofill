/**
 * GET  /api/demo-profile  — returns a pre-built demo citizen profile
 * POST /api/demo-profile  — writes the demo profile to the session's DB slot
 * POST /api/demo-profile/digilocker — DigiLocker-shaped demo payload (no Setu API)
 *
 * Purpose: lets hackathon judges / demo audiences skip OCR entirely and
 * immediately see the full verification dashboard with realistic data.
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { encryptProfile } = require('../utils/encryption');
const { emptyProfile, mergeDocumentIntoProfile, flattenProfile, generateCompletenessReport } = require('../services/profileEngine');
const { verifyResidence } = require('../services/residenceEngine');
const { detectFraud } = require('../services/fraudDetector');
const { suggestSchemes } = require('../services/schemeEngine');

/** DOB string (DD/MM/YYYY) for exactly `age` years old today */
function dobForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ── DEMO DATA ─────────────────────────────────────────────────────────
// Realistic but clearly fictional citizen profile for Jaipur, Rajasthan.
// Uses the same field keys as the real OCR parser output.
const DEMO_FLAT = {
  // Personal
  name:                  'Amit Kumar',
  father_name:           'Rajesh Kumar',
  mother_name:           'Sunita Kumari',
  dob:                   dobForAge(28),
  gender:                'Male',
  nationality:           'Indian',
  phone:                 '9876543210',
  email:                 'amit.kumar@example.com',
  // IDs
  id_number:             '1234 5678 9012',
  pan:                   'ABCDE1234F',
  voter_id:              'RQW1234567',
  driving_license:       'RJ1420180012345',
  // Address
  address:               '221, Shantinagar, Jaipur, Rajasthan - 302016',
  pincode:               '302016',
  district:              'Jaipur',
  state:                 'Rajasthan',
  birth_place:           'Jaipur',
  native_place:          'Jaipur, Rajasthan',
  years_in_rajasthan:    '14',
  in_voter_list:         'हाँ / Yes',
  // Family / occupation
  father_occupation:     'Business',
  father_occupation_address: '45, MI Road, Jaipur, Rajasthan - 302001',
  // Education
  education_10th_school: 'Govt. Sr. Sec. School, Jaipur',
  education_10th_place:  'Jaipur',
  education_12th_school: 'Govt. Sr. Sec. School, Jaipur',
  education_12th_place:  'Jaipur',
  highest_education:     '12th',
  // Marriage
  is_married:            'No',
  // Eligibility engine fields
  annual_income:         180000,
  category:              'OBC',
  occupation:            'Farmer',
  caste:                 'Mali',
  _doc_types_seen:       ['aadhaar', 'pan', 'marksheet', 'income_certificate', 'land_record'],
};

// Confidence scores per field (simulating high-quality OCR from multiple docs)
const DEMO_CONFIDENCE = {
  name: 0.97, father_name: 0.95, mother_name: 0.93, dob: 0.98,
  gender: 0.97, phone: 0.90, email: 0.95,
  id_number: 0.98, pan: 0.98, voter_id: 0.96, driving_license: 0.94,
  address: 0.92, pincode: 0.98, district: 0.96, state: 0.97,
  birth_place: 0.88, native_place: 0.85, years_in_rajasthan: 0.82,
  in_voter_list: 0.96, father_occupation: 0.80,
  education_10th_school: 0.92, education_12th_school: 0.92,
  highest_education: 0.94, is_married: 0.85,
  annual_income: 0.90, category: 0.88, occupation: 0.85, caste: 0.88,
};

// Multiple "documents" for residence timeline
const DEMO_RESIDENCE_INPUTS = [
  {
    docType: 'aadhaar',
    parsedFields: { ...DEMO_FLAT, doc_type: 'aadhaar' },
    rawText: `UIDAI Aadhaar Card Amit Kumar DOB: ${DEMO_FLAT.dob} Address: 221, Shantinagar, Jaipur, Rajasthan - 302016 1234 5678 9012`,
  },
  {
    docType: 'voter_id',
    parsedFields: { name: 'Amit Kumar', address: '221, Shantinagar, Jaipur, Rajasthan', state: 'Rajasthan', voter_id: 'RQW1234567' },
    rawText: 'Election Commission of India EPIC No: RQW1234567 Name: AMIT KUMAR Date of Issue: 10/03/2018 Address: 221, Shantinagar, Jaipur, Rajasthan',
  },
  {
    docType: 'electricity_bill',
    parsedFields: { name: 'Amit Kumar', address: '221, Shantinagar, Jaipur, Rajasthan', state: 'Rajasthan' },
    rawText: 'JVVNL Jaipur Vidyut Vitran Nigam Bill Date: 01/05/2017 Consumer Name: Amit Kumar Address: 221, Shantinagar, Jaipur, Rajasthan - 302016',
  },
  {
    docType: 'marksheet',
    parsedFields: { name: 'Amit Kumar', state: 'Rajasthan', district: 'Jaipur', education_12th_school: 'Govt. Sr. Sec. School, Jaipur' },
    rawText: 'Board of Secondary Education Rajasthan BSER Ajmer Senior Secondary Examination Date of Result: 20/05/2012 Candidate Name: AMIT KUMAR School: GOVT. SR. SEC. SCHOOL, JAIPUR',
  },
  {
    docType: 'income_certificate',
    parsedFields: { name: 'Amit Kumar', annual_income: 180000, state: 'Rajasthan' },
    rawText: 'Income Certificate Annual Family Income: Rs. 1,80,000 Name: Amit Kumar Category: OBC',
  },
  {
    docType: 'land_record',
    parsedFields: { name: 'Amit Kumar', state: 'Rajasthan', district: 'Jaipur' },
    rawText: 'Rajasthan Revenue Department Jamabandi Khasra Record Holder: Amit Kumar Village: Shantinagar, Jaipur',
  },
  {
    docType: 'driving_license',
    parsedFields: { name: 'Amit Kumar', address: '221, Shantinagar, Jaipur, Rajasthan', state: 'Rajasthan', driving_license: 'RJ1420180012345' },
    rawText: 'Rajasthan Sarkar Driving Licence RJ14 20180012345 Date of Issue: 10/06/2018 Name: Amit Kumar Address: 221, Shantinagar, Jaipur, Rajasthan - 302016',
  },
];

function applyEligibilityFields(structured) {
  structured.occupation = structured.occupation || {};
  structured.occupation.annual_income = String(DEMO_FLAT.annual_income);
  structured.occupation.citizen_occupation = DEMO_FLAT.occupation;
  structured.occupation.category = DEMO_FLAT.category;
  structured.occupation.caste = DEMO_FLAT.caste;
  structured._doc_types_seen = [...DEMO_FLAT._doc_types_seen];
  return structured;
}

function toClientFlat(structured) {
  return {
    ...flattenProfile(structured),
    annual_income: DEMO_FLAT.annual_income,
    category: DEMO_FLAT.category,
    occupation: DEMO_FLAT.occupation,
    caste: DEMO_FLAT.caste,
    _doc_types_seen: structured._doc_types_seen,
  };
}

/** Shape returned by GET /api/digilocker/documents for DigiLockerPanel */
function toDigiLockerProfile(flat) {
  return {
    name: flat.name,
    dob: flat.dob,
    gender: flat.gender,
    address: flat.address,
    pincode: flat.pincode,
    state: flat.state,
    district: flat.district,
    aadhaar_number: flat.id_number,
    father_name: flat.father_name,
    doc_types: ['aadhaar'],
    annual_income: flat.annual_income,
    category: flat.category,
    occupation: flat.occupation,
    caste: flat.caste,
    _doc_types_seen: flat._doc_types_seen,
  };
}

function getProfileId(req) {
  const sessionId = req.headers['x-session-id'];
  return sessionId && String(sessionId).length > 8
    ? `session_${sessionId}`
    : 'default_user_profile';
}

// ── BUILD FULL STRUCTURED DEMO PROFILE ───────────────────────────────
function buildDemoStructured() {
  let structured = emptyProfile();
  structured = mergeDocumentIntoProfile(structured, DEMO_FLAT, DEMO_CONFIDENCE, 'aadhaar');
  structured = applyEligibilityFields(structured);
  structured._residence_report = verifyResidence(DEMO_RESIDENCE_INPUTS);
  structured._fraud_report = detectFraud(DEMO_RESIDENCE_INPUTS.map(d => ({
    parsedFields: d.parsedFields,
    docType: d.docType,
    confidence: 90,
  })));
  return structured;
}

function demoResponsePayload(structured) {
  const flat = toClientFlat(structured);
  const completeness = generateCompletenessReport(structured);
  const suggested_schemes = suggestSchemes(structured._doc_types_seen);
  return {
    success: true,
    profile: flat,
    structured_profile: structured,
    completeness,
    residence_report: structured._residence_report,
    fraud_report: structured._fraud_report,
    suggested_schemes: suggested_schemes.slice(0, 3),
    is_demo: true,
    message: 'Demo profile loaded — Amit Kumar, Jaipur, Rajasthan',
  };
}

// ── GET /api/demo-profile ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const structured = buildDemoStructured();
  res.json(demoResponsePayload(structured));
});

// ── POST /api/demo-profile — write demo into the session's DB slot ────
router.post('/', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const structured = buildDemoStructured();
    const db = getDB();
    const toSave = encryptProfile(structured);
    const exists = db.prepare('SELECT id FROM profiles WHERE id = ?').get(profileId);
    if (exists) {
      db.prepare('UPDATE profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(toSave), profileId);
    } else {
      db.prepare('INSERT INTO profiles (id, data) VALUES (?, ?)')
        .run(profileId, JSON.stringify(toSave));
    }

    res.json(demoResponsePayload(structured));
  } catch (err) {
    console.error('Demo profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/demo-profile/digilocker — sandbox DigiLocker fetch ──────
router.post('/digilocker', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const structured = buildDemoStructured();
    const flat = toClientFlat(structured);

    const db = getDB();
    const toSave = encryptProfile(structured);
    const exists = db.prepare('SELECT id FROM profiles WHERE id = ?').get(profileId);
    if (exists) {
      db.prepare('UPDATE profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(toSave), profileId);
    } else {
      db.prepare('INSERT INTO profiles (id, data) VALUES (?, ?)')
        .run(profileId, JSON.stringify(toSave));
    }

    res.json({
      success: true,
      source: 'DigiLocker Sandbox',
      profile: toDigiLockerProfile(flat),
      message: 'Demo DigiLocker data loaded',
    });
  } catch (err) {
    console.error('Demo DigiLocker error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
