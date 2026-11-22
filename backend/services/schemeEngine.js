/**
 * GOVERNMENT SCHEME REQUIREMENT ENGINE
 * ─────────────────────────────────────────────────────────────────────
 * Rule-based engine that checks citizen profile against scheme requirements.
 * Identifies missing documents, validates eligibility, predicts rejection.
 *
 * Each scheme has:
 *   - required_docs: must have at least one from each group
 *   - required_fields: profile fields that must be present
 *   - eligibility_rules: conditions to check
 *   - rejection_reasons: common failure patterns
 */

const SCHEMES = {
  mool_niwas: {
    name: 'Mool Niwas Praman Patra (Domicile Certificate)',
    category: 'domicile',
    icon: '🏠',
    benefit_description: 'Rajasthan domicile certificate for government jobs and local schemes',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id', 'pan', 'passport', 'driving_license'], label: 'Any Photo ID' },
      { group: 'residence_proof', options: ['aadhaar', 'electricity_bill', 'bank_statement'], label: 'Residence Proof' },
    ],
    required_fields: ['name', 'dob', 'address', 'father_name', 'years_in_rajasthan', 'id_number'],
    optional_fields: ['voter_id', 'education_12th_school', 'birth_place'],
    eligibility_rules: [
      { rule: 'state_rajasthan', message: 'Applicant or parents must be Rajasthan residents' },
      { rule: 'years_min_10', message: 'Minimum 10 years of residence required (or born in Rajasthan)' },
    ],
    rejection_reasons: [
      'Address mismatch between documents',
      'Name spelling inconsistency across documents',
      'Missing residence proof for the required period',
      'Income certificate expired or missing',
    ],
  },

  income_certificate: {
    name: 'Income Certificate',
    category: 'income',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id'], label: 'Aadhaar or Voter ID' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill', 'bank_statement'], label: 'Address Proof' },
    ],
    required_fields: ['name', 'address', 'id_number', 'father_name'],
    optional_fields: ['pan', 'phone'],
    eligibility_rules: [],
    rejection_reasons: [
      'Income not verifiable without salary slip or bank statement',
      'Self-declaration not notarized',
    ],
  },

  caste_certificate: {
    name: 'Caste Certificate',
    category: 'identity',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id', 'pan'], label: 'Photo ID' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill'], label: 'Residence Proof' },
      { group: 'ancestry', options: ['marksheet', 'birth_certificate'], label: 'Birth/Education Proof' },
    ],
    required_fields: ['name', 'dob', 'address', 'father_name', 'id_number'],
    optional_fields: [],
    eligibility_rules: [
      { rule: 'state_rajasthan', message: 'Must be a Rajasthan resident' },
    ],
    rejection_reasons: [
      "Father's caste certificate not provided",
      'Address proof older than 6 months',
      'Name mismatch between Aadhaar and application',
    ],
  },

  scholarship: {
    name: 'Scholarship Application',
    category: 'education',
    icon: '🎓',
    benefit_description: 'Financial help for school and college students from low-income families',
    required_docs: [
      { group: 'identity', options: ['aadhaar'], label: 'Aadhaar Card' },
      { group: 'education', options: ['marksheet'], label: 'Latest Marksheet' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill'], label: 'Residence Proof' },
    ],
    required_fields: ['name', 'dob', 'id_number', 'education_12th_school', 'address'],
    optional_fields: ['pan', 'bank_account'],
    eligibility_rules: [
      { rule: 'has_education', message: 'Must have education records' },
      { rule: 'income_below_250000', message: 'Annual family income must be under ₹2,50,000' },
      { rule: 'age_10_to_25', message: 'Applicant age must be between 10 and 25 years' },
    ],
    rejection_reasons: [
      'Income certificate missing or expired',
      'Marksheet not from recognized board',
      "Father's income not declared",
      'Bank account not in applicant name',
    ],
  },

  voter_registration: {
    name: 'Voter ID Registration',
    category: 'civic',
    icon: '🗳️',
    benefit_description: 'Right to vote — register as a voter in your area',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'pan', 'passport'], label: 'Identity Proof' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill', 'bank_statement'], label: 'Residence Proof' },
    ],
    required_fields: ['name', 'dob', 'address', 'pincode'],
    optional_fields: ['phone', 'email'],
    eligibility_rules: [
      { rule: 'age_18_plus', message: 'Must be 18 years or older' },
    ],
    rejection_reasons: [
      'Already registered in another constituency',
      'Address proof not matching application address',
      'Date of birth proof missing',
    ],
  },

  driving_license: {
    name: 'Driving Licence Application',
    category: 'transport',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id', 'passport'], label: 'Identity Proof' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill'], label: 'Residence Proof' },
      { group: 'age_proof', options: ['aadhaar', 'marksheet', 'passport'], label: 'Age Proof' },
    ],
    required_fields: ['name', 'dob', 'address', 'id_number', 'pincode'],
    optional_fields: ['blood_group', 'phone'],
    eligibility_rules: [
      { rule: 'age_18_plus', message: 'Must be 18 years or older for non-transport vehicles' },
    ],
    rejection_reasons: [
      'Medical fitness certificate not submitted',
      'Learner licence not obtained first',
      'Address proof older than 1 year',
    ],
  },

  pm_kisan: {
    name: 'PM-KISAN Samman Nidhi',
    category: 'agriculture',
    icon: '🌾',
    benefit_description: '₹6,000 per year in three instalments for eligible farmer families',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id'], label: 'Aadhaar or Voter ID' },
      { group: 'land', options: ['land_record'], label: 'Land / Khasra Record' },
    ],
    required_fields: ['name', 'id_number', 'address'],
    optional_fields: ['father_name', 'phone'],
    eligibility_rules: [
      { rule: 'income_below_150000', message: 'Annual family income must be under ₹1,50,000' },
      { rule: 'has_land_records', message: 'Land records (Khasra/Jamabandi) must be uploaded' },
    ],
    rejection_reasons: [
      'Land not in applicant name',
      'Income above scheme limit',
      'Bank account not linked to Aadhaar',
    ],
  },

  ayushman_bharat: {
    name: 'Ayushman Bharat PMJAY',
    category: 'health',
    icon: '🏥',
    benefit_description: 'Free health insurance up to ₹5 lakh per family per year at empaneled hospitals',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id'], label: 'Aadhaar or Voter ID' },
      { group: 'residence', options: ['aadhaar', 'ration_card'], label: 'Address / Ration Card Proof' },
    ],
    required_fields: ['name', 'id_number', 'address'],
    optional_fields: ['phone'],
    eligibility_rules: [
      { rule: 'income_below_100000', message: 'Annual family income must be under ₹1,00,000' },
    ],
    rejection_reasons: [
      'Family not listed in SECC / deprivation criteria',
      'Already covered under another government health scheme',
    ],
  },

  nsp_scholarship: {
    name: 'National Scholarship Portal (NSP)',
    category: 'education',
    icon: '📚',
    benefit_description: 'Central and state scholarships for college and university students',
    required_docs: [
      { group: 'identity', options: ['aadhaar'], label: 'Aadhaar Card' },
      { group: 'education', options: ['marksheet'], label: 'Latest Marksheet / Admission Proof' },
    ],
    required_fields: ['name', 'dob', 'id_number'],
    optional_fields: ['education_grad_school', 'address'],
    eligibility_rules: [
      { rule: 'income_below_300000', message: 'Annual family income must be under ₹3,00,000' },
      { rule: 'enrolled_in_college', message: 'Must be enrolled in a college or university' },
    ],
    rejection_reasons: [
      'Income certificate missing',
      'Not enrolled in a recognized institution',
      'Previous year marks below minimum percentage',
    ],
  },

  rajasthan_sambal: {
    name: 'Rajasthan Sambal Yojana',
    category: 'labour',
    icon: '👷',
    benefit_description: 'Accident insurance and support for unorganised workers in Rajasthan',
    required_docs: [
      { group: 'identity', options: ['aadhaar', 'voter_id'], label: 'Aadhaar or Voter ID' },
      { group: 'residence', options: ['aadhaar', 'electricity_bill'], label: 'Rajasthan Address Proof' },
    ],
    required_fields: ['name', 'id_number', 'address'],
    optional_fields: ['phone'],
    eligibility_rules: [
      { rule: 'income_below_200000', message: 'Annual family income must be under ₹2,00,000' },
      { rule: 'state_rajasthan', message: 'Must be a Rajasthan resident' },
    ],
    rejection_reasons: [
      'Not registered as unorganised worker',
      'Employer in organised sector (EPF/ESI)',
    ],
  },
};

// ── ELIGIBILITY HELPERS ───────────────────────────────────────────────

function formatInr(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function parseIncome(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

function getAnnualIncome(profile) {
  return parseIncome(profile.occupation?.annual_income);
}

function getAgeFromDob(dob) {
  if (!dob) return null;
  const parts = String(dob).split(/[\/\-\.]/).map(Number);
  if (parts.length < 3) return null;
  let d, m, y;
  if (parts[0] > 31) {
    [y, m, d] = parts;
  } else {
    [d, m, y] = parts;
  }
  const dobDate = new Date(y, m - 1, d);
  if (Number.isNaN(dobDate.getTime())) return null;
  return Math.floor((Date.now() - dobDate) / (365.25 * 24 * 3600 * 1000));
}

/** @returns {true|null|{ pass: false, failReason: string }} */
function fail(failReason) {
  return { pass: false, failReason };
}

function ruleUnknownReason(rule, fallbackMessage) {
  const incomeMatch = rule.match(/^income_below_(\d+)$/);
  if (incomeMatch) {
    return `परिवार की सालाना आमदनी दर्ज नहीं है — कृपया आय प्रमाण पत्र अपलोड करें (${fallbackMessage})`;
  }
  if (rule === 'age_10_to_25' || rule === 'age_18_plus') {
    return 'जन्म तिथि (DOB) प्रोफ़ाइल में नहीं मिली — कृपया आधार या जन्म प्रमाण पत्र अपलोड करें';
  }
  if (rule === 'has_land_records') {
    return 'ज़मीन के कागज़ात (खसरा/जमाबंदी) अपलोड नहीं किए गए — कृपया भूमि रिकॉर्ड जोड़ें';
  }
  if (rule === 'enrolled_in_college') {
    return 'कॉलेज में दाखिले का विवरण नहीं मिला — कृपया एडमिशन/मार्कशीट अपलोड करें';
  }
  return `${fallbackMessage} — जानकारी अधूरी है, कृपया संबंधित दस्तावेज़ अपलोड करें`;
}

// ── ELIGIBILITY CHECKERS ──────────────────────────────────────────────
function checkEligibility(rule, profile, uploadedDocTypes = []) {
  const docs = uploadedDocTypes.length
    ? uploadedDocTypes
    : (profile._doc_types_seen || []);

  const incomeRule = rule.match(/^income_below_(\d+)$/);
  if (incomeRule) {
    const limit = parseInt(incomeRule[1], 10);
    const income = getAnnualIncome(profile);
    if (income === null) return null;
    if (income < limit) return true;
    return fail(
      `आपकी सालाना पारिवारिक आमदनी ${formatInr(income)} है — योजना की सीमा ${formatInr(limit)} से ज़्यादा है / Annual income ${formatInr(income)} exceeds limit of ${formatInr(limit)}`
    );
  }

  switch (rule) {
    case 'state_rajasthan': {
      const inRajasthan = profile.residence?.state?.toLowerCase().includes('rajasthan');
      if (inRajasthan) return true;
      // Legacy: Aadhaar on file treated as sufficient when state not yet parsed
      if (docs.includes('aadhaar') || profile._doc_types_seen?.includes('aadhaar')) return true;
      if (!profile.residence?.state) return null;
      return fail(
        'आपका पता राजस्थान में नहीं दिखता — यह योजना राजस्थान के निवासियों के लिए है / Address does not show Rajasthan residence'
      );
    }

    case 'years_min_10': {
      const yrs = parseInt(profile.residence?.years_in_rajasthan, 10);
      if (Number.isNaN(yrs)) return null;
      if (yrs >= 10) return true;
      return fail(
        `राजस्थान में निवास केवल ${yrs} वर्ष दर्ज है — कम से कम 10 वर्ष चाहिए / Only ${yrs} years in Rajasthan recorded; minimum 10 required`
      );
    }

    case 'age_18_plus': {
      const age = getAgeFromDob(profile.personal_info?.dob);
      if (age === null) return null;
      if (age >= 18) return true;
      return fail(
        `आपकी उम्र ${age} वर्ष है — मतदाता पंजीकरण के लिए 18 वर्ष या उससे अधिक होना ज़रूरी है / Age ${age} — must be 18 or older`
      );
    }

    case 'age_10_to_25': {
      const age = getAgeFromDob(profile.personal_info?.dob);
      if (age === null) return null;
      if (age >= 10 && age <= 25) return true;
      if (age < 10) {
        return fail(
          `आपकी उम्र ${age} वर्ष है — छात्रवृत्ति के लिए कम से कम 10 वर्ष होना चाहिए / Age ${age} is below minimum 10 years`
        );
      }
      return fail(
        `आपकी उम्र ${age} वर्ष है — छात्रवृत्ति के लिए अधिकतम 25 वर्ष की सीमा है / Age ${age} exceeds scholarship maximum of 25 years`
      );
    }

    case 'has_education': {
      const has = !!(profile.education?.class_12?.school || profile.education?.graduate?.college);
      if (has) return true;
      return fail(
        'शिक्षा का विवरण (स्कूल/कॉलेज) प्रोफ़ाइल में नहीं मिला — कृपया मार्कशीट अपलोड करें / Education records not found — upload marksheet'
      );
    }

    case 'has_land_records': {
      if (docs.includes('land_record')) return true;
      return fail(
        'ज़मीन के रिकॉर्ड (खसरा/जमाबंदी) अपलोड नहीं हैं — PM-KISAN के लिए भूमि प्रमाण ज़रूरी है / Land records not uploaded — required for PM-KISAN'
      );
    }

    case 'enrolled_in_college': {
      const enrolled = !!(
        profile.education?.graduate?.college ||
        profile.education?.post_graduate?.college
      );
      if (enrolled) return true;
      return fail(
        'कॉलेज/विश्वविद्यालय में दाखिला दर्ज नहीं है — NSP छात्रवृत्ति के लिए कॉलेज प्रमाण चाहिए / College enrollment not on file — upload admission proof'
      );
    }

    default:
      return null;
  }
}

function parseEligibilityResult(raw) {
  if (raw === true) return { pass: true, failReason: null };
  if (raw === null) return { pass: null, failReason: null };
  if (raw && typeof raw === 'object' && raw.pass === false) {
    return { pass: false, failReason: raw.failReason || null };
  }
  return { pass: false, failReason: null };
}

// ── MAIN VERIFICATION FUNCTION ────────────────────────────────────────

/**
 * Verify if a citizen profile meets requirements for a given scheme.
 * @param {string} schemeId - Key from SCHEMES object
 * @param {Object} structuredProfile - CitizenProfile from profileEngine
 * @param {string[]} uploadedDocTypes - ['aadhaar', 'pan', ...]
 * @returns {Object} Verification report
 */
function verifySchemeRequirements(schemeId, structuredProfile, uploadedDocTypes) {
  const scheme = SCHEMES[schemeId];
  if (!scheme) return { error: `Unknown scheme: ${schemeId}` };

  const flat = {};
  try {
    const { flattenProfile } = require('./profileEngine');
    Object.assign(flat, flattenProfile(structuredProfile));
  } catch {}

  const docs = uploadedDocTypes || structuredProfile._doc_types_seen || [];
  const report = {
    scheme_name: scheme.name,
    scheme_id: schemeId,
    documents: [],
    required_fields: [],
    eligibility: [],
    missing_critical: [],
    predicted_rejections: [],
    readiness_score: 0,
    status: 'incomplete',
    recommendation: '',
  };

  let scorePoints = 0;
  let totalPoints = 0;

  // ── 1. Document checks ──────────────────────────────────────────────
  for (const req of scheme.required_docs) {
    const hasAny = req.options.some(opt => docs.includes(opt));
    const found = req.options.find(opt => docs.includes(opt));
    totalPoints += 20;
    if (hasAny) scorePoints += 20;

    report.documents.push({
      group: req.group,
      label: req.label,
      required_options: req.options,
      status: hasAny ? 'provided' : 'missing',
      found_doc: found || null,
    });

    if (!hasAny) {
      report.missing_critical.push(`Missing: ${req.label} (one of: ${req.options.join(', ')})`);
    }
  }

  // ── 2. Required field checks ────────────────────────────────────────
  for (const fieldKey of scheme.required_fields) {
    const value = flat[fieldKey] || flat[fieldKey + '_number'];
    const present = !!(value && String(value).trim().length > 0);
    totalPoints += 5;
    if (present) scorePoints += 5;

    const label = FIELD_LABELS[fieldKey] || fieldKey;
    report.required_fields.push({ field: fieldKey, label, present, value: present ? maskValue(fieldKey, value) : null });

    if (!present) {
      report.missing_critical.push(`Missing field: ${label}`);
    }
  }

  // ── 3. Eligibility rule checks ──────────────────────────────────────
  for (const { rule, message } of scheme.eligibility_rules) {
    const { pass, failReason } = parseEligibilityResult(
      checkEligibility(rule, structuredProfile, docs)
    );
    totalPoints += 10;
    if (pass === true) scorePoints += 10;
    else if (pass === null) scorePoints += 5; // Can't determine, partial credit

    report.eligibility.push({
      rule,
      message,
      status: pass === true ? 'pass' : pass === false ? 'fail' : 'unknown',
      fail_reason: failReason || undefined,
    });

    if (pass === false) {
      report.predicted_rejections.push(failReason || message);
    }
  }

  // ── 4. Predicted rejection analysis ────────────────────────────────
  // Name consistency check
  const nameSources = Object.entries(structuredProfile._sources || {})
    .filter(([k]) => k.includes('name'))
    .map(([, v]) => v);
  if (nameSources.length > 1) {
    const names = nameSources.map(s => s.value?.toLowerCase().trim());
    const unique = new Set(names);
    if (unique.size > 1) {
      report.predicted_rejections.push(
        `Name inconsistency: "${[...unique].join('" vs "')}" — verify spelling matches across all documents`
      );
    }
  }

  // DOB consistency
  const dobSrc = structuredProfile._sources?.['personal_info.dob'];
  if (dobSrc && dobSrc.confidence < 0.8) {
    report.predicted_rejections.push(`Date of Birth extracted with low confidence (${Math.round(dobSrc.confidence * 100)}%) — verify manually`);
  }

  // Address consistency
  const addrSrc = structuredProfile._sources?.['residence.current_address'];
  if (addrSrc && !structuredProfile.residence?.state?.toLowerCase().includes('rajasthan')) {
    if (schemeId === 'mool_niwas') {
      report.predicted_rejections.push('Address does not appear to be in Rajasthan — domicile certificate may be rejected');
    }
  }

  // ── 5. Final score ──────────────────────────────────────────────────
  report.readiness_score = totalPoints > 0 ? Math.round((scorePoints / totalPoints) * 100) : 0;
  report.status = report.readiness_score >= 80 ? 'ready'
    : report.readiness_score >= 50 ? 'partial'
    : 'incomplete';
  report.recommendation = report.status === 'ready'
    ? '✅ Application appears ready to submit. Review filled form before submitting.'
    : report.status === 'partial'
    ? '⚠️ Upload missing documents and fill required fields to improve chances.'
    : '❌ Critical documents or fields are missing. Application likely to be rejected.';

  return report;
}

/**
 * Auto-detect which scheme is most likely based on uploaded docs & context
 */
function suggestSchemes(uploadedDocTypes) {
  const scores = {};
  for (const [id, scheme] of Object.entries(SCHEMES)) {
    let score = 0;
    for (const req of scheme.required_docs) {
      if (req.options.some(o => uploadedDocTypes.includes(o))) score += 2;
    }
    scores[id] = { id, name: scheme.name, score, category: scheme.category };
  }
  return Object.values(scores).sort((a, b) => b.score - a.score);
}

/**
 * Evaluate all schemes for eligibility against profile + uploaded docs.
 * @param {Object} profile - Structured citizen profile
 * @param {string[]} uploadedDocTypes - e.g. ['aadhaar', 'marksheet', 'land_record']
 * @returns {{ eligible: Object[], ineligible: Object[] }}
 */
function getAllSchemesEligibility(profile, uploadedDocTypes = []) {
  const docs = uploadedDocTypes.length
    ? uploadedDocTypes
    : (profile?._doc_types_seen || []);

  const eligible = [];
  const ineligible = [];

  for (const [id, scheme] of Object.entries(SCHEMES)) {
    const reasons = [];

    for (const { rule, message } of scheme.eligibility_rules) {
      const { pass, failReason } = parseEligibilityResult(
        checkEligibility(rule, profile, docs)
      );
      if (pass === true) continue;
      if (pass === null) {
        reasons.push(ruleUnknownReason(rule, message));
      } else {
        reasons.push(failReason || message);
      }
    }

    const item = {
      id,
      name: scheme.name,
      category: scheme.category,
      icon: scheme.icon || '📋',
      benefit_description: scheme.benefit_description || scheme.name,
    };

    if (reasons.length === 0) {
      eligible.push(item);
    } else {
      ineligible.push({ ...item, reasons });
    }
  }

  return { eligible, ineligible };
}

const FIELD_LABELS = {
  name: 'Full Name', dob: 'Date of Birth', id_number: 'Aadhaar Number',
  address: 'Address', father_name: "Father's Name", pincode: 'PIN Code',
  voter_id: 'Voter ID', pan: 'PAN Number', phone: 'Phone',
  education_12th_school: '12th School',
};

function maskValue(key, value) {
  if (['id_number', 'pan', 'voter_id', 'passport_number', 'driving_license'].includes(key)) {
    const s = String(value);
    return s.length > 4 ? '•'.repeat(s.length - 4) + s.slice(-4) : s;
  }
  return value;
}

module.exports = {
  verifySchemeRequirements,
  suggestSchemes,
  getAllSchemesEligibility,
  checkEligibility,
  SCHEMES,
  SCHEME_PORTAL_URLS: {
    mool_niwas: {
      name:     'Mool Niwas Praman Patra (Domicile Certificate)',
      url:      'https://sso.rajasthan.gov.in/signin',
      deepLink: 'https://emitra.rajasthan.gov.in',
      hint:     'SSO login → eMitra → search "Mool Niwas" → fill the form. The extension will autofill available fields.',
      hostname: 'emitra.rajasthan.gov.in',
    },
    income_certificate: {
      name:     'Income Certificate (Aay Praman Patra)',
      url:      'https://sso.rajasthan.gov.in/signin',
      deepLink: 'https://emitra.rajasthan.gov.in',
      hint:     'SSO login → eMitra → search "Aay Praman Patra" → fill the form.',
      hostname: 'emitra.rajasthan.gov.in',
    },
    caste_certificate: {
      name:     'Caste Certificate (Jati Praman Patra)',
      url:      'https://sso.rajasthan.gov.in/signin',
      deepLink: 'https://emitra.rajasthan.gov.in',
      hint:     'SSO login → eMitra → search "Jati Praman Patra" → fill the form.',
      hostname: 'emitra.rajasthan.gov.in',
    },
    scholarship: {
      name:     'Rajasthan State Scholarship',
      url:      'https://sso.rajasthan.gov.in/signin',
      deepLink: 'https://scholarship.rajasthan.gov.in',
      hint:     'SSO login → Scholarship Portal → New Application → fill student details.',
      hostname: 'scholarship.rajasthan.gov.in',
    },
    voter_registration: {
      name:     'Voter ID Registration (Form 6)',
      url:      'https://voters.eci.gov.in',
      deepLink: 'https://voters.eci.gov.in/signup',
      hint:     'ECI Voter Portal → New Registration (Form 6) → fill personal details.',
      hostname: 'voters.eci.gov.in',
    },
    driving_license: {
      name:     'Driving Licence Application',
      url:      'https://parivahan.gov.in/sarathiservice/stateSelection.do',
      deepLink: 'https://sarathi.parivahan.gov.in/sarathiservice/stateSelection.do',
      hint:     'Sarathi Portal → Select Rajasthan → Apply for DL → fill applicant details.',
      hostname: 'sarathi.parivahan.gov.in',
    },
    pm_kisan: {
      name:     'PM-KISAN Samman Nidhi',
      url:      'https://pmkisan.gov.in',
      deepLink: 'https://pmkisan.gov.in/RegistrationFormNew.aspx',
      hint:     'PM-KISAN Portal → New Farmer Registration → enter Aadhaar → fill details.',
      hostname: 'pmkisan.gov.in',
    },
    ayushman_bharat: {
      name:     'Ayushman Bharat PMJAY',
      url:      'https://beneficiary.nha.gov.in',
      deepLink: 'https://beneficiary.nha.gov.in',
      hint:     'PMJAY Beneficiary Portal → Check Eligibility by Aadhaar or Ration Card.',
      hostname: 'beneficiary.nha.gov.in',
    },
    nsp_scholarship: {
      name:     'National Scholarship Portal (NSP)',
      url:      'https://scholarships.gov.in',
      deepLink: 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction',
      hint:     'NSP → New Registration → fill student details → submit.',
      hostname: 'scholarships.gov.in',
    },
    rajasthan_sambal: {
      name:     'Rajasthan Sambal Yojana (LDMS)',
      url:      'https://labour.rajasthan.gov.in',
      deepLink: 'https://ldms.rajasthan.gov.in/LDMSapp/public/workerRegistration',
      hint:     'Labour Department → Unorganised Worker Registration → fill worker details.',
      hostname: 'ldms.rajasthan.gov.in',
    },
  },
};
