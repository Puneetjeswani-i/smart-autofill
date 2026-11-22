/**
 * UNIFIED CITIZEN PROFILE ENGINE
 * ─────────────────────────────────────────────────────────────────────
 * Transforms raw OCR parsed fields into a structured, source-tracked,
 * confidence-scored citizen profile. Handles conflict resolution when
 * the same field appears in multiple documents.
 *
 * Architecture:
 *   OCR Output (flat) → normalizeField() → mergeIntoProfile()
 *                     → resolveConflicts() → CitizenProfile (structured)
 */

// ── PROFILE SCHEMA ────────────────────────────────────────────────────
function emptyProfile() {
  return {
    personal_info: {
      name: null, father_name: null, mother_name: null, husband_name: null,
      dob: null, gender: null, nationality: null, blood_group: null,
      phone: null, email: null,
    },
    identity_documents: {
      aadhaar_number: null, pan_number: null, voter_id: null,
      driving_license: null, passport_number: null,
      account_number: null, ifsc_code: null, roll_number: null,
    },
    residence: {
      current_address: null, permanent_address: null,
      pincode: null, district: null, state: null,
      birth_place: null, native_place: null,
      years_in_rajasthan: null, in_voter_list: null,
    },
    education: {
      class_1_9: { school: null, place: null, year: null },
      class_10: { school: null, place: null, year: null, board: null, percentage: null },
      class_12: { school: null, place: null, year: null, board: null, percentage: null },
      graduate: { college: null, place: null, year: null },
      post_graduate: { college: null, place: null, year: null },
      highest_level: null,
    },
    occupation: {
      father_occupation: null, father_occupation_address: null,
    },
    marriage: {
      is_married: null, marriage_date: null,
      husband_domicile: null, living_with_husband_since: null,
    },
    // Meta: per-field source tracking
    _sources: {},
    _doc_types_seen: [],
    _last_updated: null,
  };
}

// Maps raw OCR field keys → profile paths
// Each entry: { path: 'section.field', aliases: ['alt_key1',...] }
const FIELD_REGISTRY = {
  name:                     { path: 'personal_info.name', priority: 3 },
  father_name:              { path: 'personal_info.father_name', priority: 3 },
  mother_name:              { path: 'personal_info.mother_name', priority: 2 },
  husband_name:             { path: 'personal_info.husband_name', priority: 2 },
  dob:                      { path: 'personal_info.dob', priority: 4 },
  gender:                   { path: 'personal_info.gender', priority: 3 },
  nationality:              { path: 'personal_info.nationality', priority: 1 },
  blood_group:              { path: 'personal_info.blood_group', priority: 1 },
  phone:                    { path: 'personal_info.phone', priority: 2 },
  email:                    { path: 'personal_info.email', priority: 2 },

  id_number:                { path: 'identity_documents.aadhaar_number', priority: 4 },
  aadhaar:                  { path: 'identity_documents.aadhaar_number', priority: 4 },
  pan:                      { path: 'identity_documents.pan_number', priority: 4 },
  voter_id:                 { path: 'identity_documents.voter_id', priority: 3 },
  driving_license:          { path: 'identity_documents.driving_license', priority: 3 },
  passport_number:          { path: 'identity_documents.passport_number', priority: 3 },
  account_number:           { path: 'identity_documents.account_number', priority: 2 },
  ifsc_code:                { path: 'identity_documents.ifsc_code', priority: 2 },
  roll_number:              { path: 'identity_documents.roll_number', priority: 2 },

  address:                  { path: 'residence.current_address', priority: 3 },
  pincode:                  { path: 'residence.pincode', priority: 3 },
  district:                 { path: 'residence.district', priority: 3 },
  state:                    { path: 'residence.state', priority: 2 },
  birth_place:              { path: 'residence.birth_place', priority: 2 },
  native_place:             { path: 'residence.native_place', priority: 2 },
  years_in_rajasthan:       { path: 'residence.years_in_rajasthan', priority: 2 },
  in_voter_list:            { path: 'residence.in_voter_list', priority: 2 },

  education_10th_school:    { path: 'education.class_10.school', priority: 3 },
  education_10th_place:     { path: 'education.class_10.place', priority: 2 },
  education_10th_board:     { path: 'education.class_10.board', priority: 2 },
  education_10th_year:      { path: 'education.class_10.year', priority: 2 },
  education_10th_percentage:{ path: 'education.class_10.percentage', priority: 2 },
  education_12th_school:    { path: 'education.class_12.school', priority: 3 },
  education_12th_place:     { path: 'education.class_12.place', priority: 2 },
  education_12th_board:     { path: 'education.class_12.board', priority: 2 },
  education_12th_year:      { path: 'education.class_12.year', priority: 2 },
  education_12th_percentage:{ path: 'education.class_12.percentage', priority: 2 },
  education_grad_school:    { path: 'education.graduate.college', priority: 2 },
  education_grad_place:     { path: 'education.graduate.place', priority: 2 },
  education_grad_year:      { path: 'education.graduate.year', priority: 2 },
  highest_education:        { path: 'education.highest_level', priority: 3 },
  school_name:              { path: 'education.class_12.school', priority: 2 },
  school_college:           { path: 'education.class_12.school', priority: 2 },
  class_level:              { path: 'education.highest_level', priority: 2 },
  board:                    { path: 'education.class_12.board', priority: 2 },
  year_of_passing:          { path: 'education.class_12.year', priority: 2 },
  percentage:               { path: 'education.class_12.percentage', priority: 2 },

  father_occupation:        { path: 'occupation.father_occupation', priority: 2 },
  father_occupation_address:{ path: 'occupation.father_occupation_address', priority: 2 },

  is_married:               { path: 'marriage.is_married', priority: 2 },
  marriage_date:            { path: 'marriage.marriage_date', priority: 2 },
};

// Trust order for conflict resolution (higher = more trusted)
const DOC_TRUST = {
  aadhaar:          90,
  pan:              88,
  passport:         87,
  driving_license:  85,
  voter_id:         82,
  marksheet:        78,
  electricity_bill: 65,
  bank_statement:   63,
  rent_agreement:   60,
  unknown:          40,
};

// ── DEEP GET/SET HELPERS ──────────────────────────────────────────────
function deepGet(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function deepSet(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ── MAIN MERGE FUNCTION ───────────────────────────────────────────────

/**
 * Merge one document's OCR result into a structured profile.
 * @param {Object} existingProfile  - Current structured profile (or null for new)
 * @param {Object} parsedFields     - Flat OCR output {name, dob, ...}
 * @param {Object} confidenceScores - {name: 0.92, dob: 0.97, ...}
 * @param {string} docType          - 'aadhaar' | 'pan' | etc.
 * @returns {Object} Updated structured profile
 */
function mergeDocumentIntoProfile(existingProfile, parsedFields, confidenceScores, docType) {
  const profile = existingProfile || emptyProfile();
  const trust = DOC_TRUST[docType] || DOC_TRUST.unknown;

  // Track which doc types have been seen
  if (docType && !profile._doc_types_seen.includes(docType)) {
    profile._doc_types_seen.push(docType);
  }
  profile._last_updated = new Date().toISOString();

  for (const [rawKey, rawValue] of Object.entries(parsedFields)) {
    if (!rawValue || rawKey.startsWith('_')) continue;

    const registry = FIELD_REGISTRY[rawKey];
    if (!registry) continue;

    const fieldPath = registry.path;
    const fieldConf = confidenceScores[rawKey] || 0;
    const incomingScore = fieldConf * (trust / 100);

    const existingSource = profile._sources[fieldPath];
    const existingValue = deepGet(profile, fieldPath);

    // Conflict resolution: take the higher-scoring value
    if (existingValue && existingSource) {
      const existingScore = existingSource.confidence * (existingSource.trust / 100);
      if (incomingScore <= existingScore) continue; // Keep existing
    }

    deepSet(profile, fieldPath, rawValue);
    profile._sources[fieldPath] = {
      value: rawValue,
      doc_type: docType,
      confidence: fieldConf,
      trust,
      combined_score: incomingScore,
      extracted_at: new Date().toISOString(),
    };
  }

  return profile;
}

/**
 * Convert structured profile back to flat profile for legacy compatibility
 * (used by extension popup, MoolNiwasForm, ProfilePanel)
 */
function flattenProfile(structuredProfile) {
  const s = structuredProfile;
  return {
    // personal
    name:                     s.personal_info?.name,
    father_name:              s.personal_info?.father_name,
    mother_name:              s.personal_info?.mother_name,
    husband_name:             s.personal_info?.husband_name,
    dob:                      s.personal_info?.dob,
    gender:                   s.personal_info?.gender,
    nationality:              s.personal_info?.nationality || 'Indian',
    blood_group:              s.personal_info?.blood_group,
    phone:                    s.personal_info?.phone,
    email:                    s.personal_info?.email,
    // IDs
    id_number:                s.identity_documents?.aadhaar_number,
    pan:                      s.identity_documents?.pan_number,
    voter_id:                 s.identity_documents?.voter_id,
    driving_license:          s.identity_documents?.driving_license,
    passport_number:          s.identity_documents?.passport_number,
    account_number:           s.identity_documents?.account_number,
    ifsc_code:                s.identity_documents?.ifsc_code,
    roll_number:              s.identity_documents?.roll_number,
    // residence
    address:                  s.residence?.current_address,
    pincode:                  s.residence?.pincode,
    district:                 s.residence?.district,
    state:                    s.residence?.state,
    birth_place:              s.residence?.birth_place,
    native_place:             s.residence?.native_place,
    years_in_rajasthan:       s.residence?.years_in_rajasthan,
    in_voter_list:            s.residence?.in_voter_list,
    // education
    education_10th_school:    s.education?.class_10?.school,
    education_10th_place:     s.education?.class_10?.place,
    education_10th_year:      s.education?.class_10?.year,
    education_10th_board:     s.education?.class_10?.board,
    education_10th_percentage:s.education?.class_10?.percentage,
    education_12th_school:    s.education?.class_12?.school,
    education_12th_place:     s.education?.class_12?.place,
    education_12th_year:      s.education?.class_12?.year,
    education_12th_board:     s.education?.class_12?.board,
    education_12th_percentage:s.education?.class_12?.percentage,
    education_grad_school:    s.education?.graduate?.college,
    education_grad_place:     s.education?.graduate?.place,
    education_grad_year:      s.education?.graduate?.year,
    highest_education:        s.education?.highest_level,
    // occupation
    father_occupation:        s.occupation?.father_occupation,
    father_occupation_address:s.occupation?.father_occupation_address,
    // marriage
    is_married:               s.marriage?.is_married,
    marriage_date:            s.marriage?.marriage_date,
    // meta
    _doc_types_seen:          s._doc_types_seen,
  };
}

/**
 * Generate document completeness report for Mool Niwas / general use
 */
function generateCompletenessReport(profile) {
  const flat = flattenProfile(profile);

  const coreFields = {
    'Applicant Name':     !!flat.name,
    'Date of Birth':      !!flat.dob,
    'Gender':             !!flat.gender,
    'Current Address':    !!flat.address,
    'PIN Code':           !!flat.pincode,
    'District':           !!flat.district,
    'State':              !!flat.state,
    'Aadhaar Number':     !!flat.id_number,
    'Mobile Number':      !!flat.phone,
    "Father's Name":      !!flat.father_name,
  };

  const optionalFields = {
    'PAN Number':         !!flat.pan,
    'Voter ID':           !!flat.voter_id,
    'Driving License':    !!flat.driving_license,
    'Birth Place':        !!flat.birth_place,
    '10th School':        !!flat.education_10th_school,
    '12th School':        !!flat.education_12th_school,
    'Years in Rajasthan': !!flat.years_in_rajasthan,
  };

  const coreCount = Object.values(coreFields).filter(Boolean).length;
  const optCount = Object.values(optionalFields).filter(Boolean).length;
  const totalCore = Object.keys(coreFields).length;
  const totalOpt = Object.keys(optionalFields).length;

  const score = Math.round(
    (coreCount / totalCore) * 75 + (optCount / totalOpt) * 25
  );

  const missing = [
    ...Object.entries(coreFields).filter(([,v]) => !v).map(([k]) => ({ field: k, required: true })),
    ...Object.entries(optionalFields).filter(([,v]) => !v).map(([k]) => ({ field: k, required: false })),
  ];

  // Mismatch detection
  const mismatches = [];
  const sources = profile._sources || {};
  const nameKeys = Object.keys(sources).filter(k => k.includes('name'));
  for (const key of nameKeys) {
    const src = sources[key];
    if (src && src.confidence < 0.6) {
      mismatches.push(`Low confidence on ${key} from ${src.doc_type} (${Math.round(src.confidence * 100)}%)`);
    }
  }

  return {
    score,
    core_fields: coreFields,
    optional_fields: optionalFields,
    missing_fields: missing,
    mismatches,
    docs_uploaded: profile._doc_types_seen || [],
    recommendation: score >= 90 ? 'Ready to submit'
      : score >= 70 ? 'Review missing optional fields'
      : 'Upload more documents to improve readiness',
  };
}

module.exports = { emptyProfile, mergeDocumentIntoProfile, flattenProfile, generateCompletenessReport };
