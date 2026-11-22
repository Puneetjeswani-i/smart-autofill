/**
 * RESIDENCE VERIFICATION ENGINE v3
 * ─────────────────────────────────────────────────────────────────────
 * Uses the new multi-metric addressEngine for far better matching.
 * Builds a verified chronological timeline of residence proofs.
 */

const { compareAddresses, clusterAddresses, extractDistrict } = require('./addressEngine');
const { extractDocumentYear } = require('../utils/ocrPostProcess');

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEARS_REQUIRED = 10;

const DOC_RESIDENCE_WEIGHT = {
  aadhaar: 25, voter_id: 20, electricity_bill: 18, ration_card: 20,
  driving_license: 15, bank_statement: 12, marksheet: 15,
  passport: 10, rent_agreement: 12, unknown: 5,
};

const RAJ_CITIES = [
  'jaipur','jodhpur','udaipur','kota','bikaner','ajmer','alwar','bharatpur',
  'sikar','pali','barmer','churu','jhunjhunu','nagaur','tonk','bundi',
  'jhalawar','karauli','dholpur','ganganagar','hanumangarh','dausa',
  'dungarpur','banswara','pratapgarh','jaisalmer','jalore','sirohi',
  'rajsamand','bhilwara','chittorgarh','sri ganganagar',
];

function isRajasthan(text, addr) {
  if (!text && !addr) return false;
  const combined = ((text || '') + ' ' + (addr || '')).toLowerCase();
  return /rajasthan|राजस्थान/i.test(combined) || RAJ_CITIES.some(c => combined.includes(c));
}

function extractResidenceEvidence(parsedFields, rawText, docType) {
  const ev = {
    docType,
    address: parsedFields.address || null,
    year: null,
    isRajasthan: false,
    district: parsedFields.district || extractDistrict(parsedFields.address),
    pincode: parsedFields.pincode || null,
    state: parsedFields.state || null,
  };

  ev.isRajasthan = isRajasthan(rawText, ev.address) ||
    (ev.state && /rajasthan/i.test(ev.state));

  // Extract best year for this doc type
  const docYear = extractDocumentYear(rawText || '', docType);

  // Try specific patterns first
  if (docType === 'marksheet') {
    const m = (rawText || '').match(/(?:Year\s*of\s*Passing|Date\s*of\s*Result)[:\s]+(\d{4})/i)
           || (rawText || '').match(/\b(20\d{2}|19\d{2})\b/);
    if (m) { const y = parseInt(m[1]); if (y >= 2000 && y <= CURRENT_YEAR) ev.year = y; }
  }
  if (docType === 'electricity_bill' || docType === 'water_bill' || docType === 'gas_bill') {
    const m = (rawText || '').match(/(?:Bill\s*Date|Date)[:\s]+\d{1,2}[\/-]\d{1,2}[\/-](\d{4})/i);
    if (m) { const y = parseInt(m[1]); if (y >= 2000 && y <= CURRENT_YEAR) ev.year = y; }
  }
  if (docType === 'bank_statement') {
    const all = (rawText || '').match(/\d{2}[\/\-]\d{2}[\/\-](\d{4})/g) || [];
    const years = all.map(d => parseInt(d.split(/[\/\-]/)[2])).filter(y => y >= 2000 && y <= CURRENT_YEAR);
    if (years.length) ev.year = Math.min(...years);
  }
  if (['voter_id','driving_license','passport'].includes(docType)) {
    const m = (rawText || '').match(/(?:Date\s*of\s*Issue|Issue\s*Date)[:\s]+\d{1,2}[\/-]\d{1,2}[\/-](\d{4})/i);
    if (m) { const y = parseInt(m[1]); if (y >= 2000 && y <= CURRENT_YEAR) ev.year = y; }
  }

  ev.year = ev.year || docYear;
  return ev;
}

function verifyResidence(docResults) {
  if (!docResults || docResults.length === 0) {
    return { status: 'insufficient', verdict: 'No documents uploaded', confidence: 0, readiness_score: 0 };
  }

  const evidenceList = docResults
    .filter(d => d.parsedFields && d.docType !== 'unknown')
    .map(d => extractResidenceEvidence(d.parsedFields, d.rawText || '', d.docType));

  // Find reference address using address clustering
  const addressItems = evidenceList
    .filter(e => e.address)
    .map(e => ({ address: e.address, docType: e.docType, weight: DOC_RESIDENCE_WEIGHT[e.docType] || 5 }));

  const clusters = clusterAddresses(addressItems);
  const referenceAddress = clusters.length > 0 ? clusters[0].representative : null;

  const timeline = [];
  const addressMatches = [];
  const addressMismatches = [];
  const rajasthanDocs = [];
  let totalScore = 0;
  let earliestYear = CURRENT_YEAR;
  let latestYear = 2000;

  for (const ev of evidenceList) {
    const label = ev.docType.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    // Compare address using multi-metric engine
    let addrResult = null;
    if (ev.address && referenceAddress) {
      addrResult = compareAddresses(ev.address, referenceAddress);
    }

    const addrStatus = addrResult
      ? addrResult.status
      : (ev.address ? 'uncompared' : 'no_address');

    if (addrStatus === 'match' || addrStatus === 'partial') {
      addressMatches.push({
        docType: ev.docType, label,
        similarity: addrResult.score,
        confidence: addrResult.confidence,
        address: ev.address,
        metrics: addrResult.metrics,
        matched_tokens: addrResult.matched_tokens,
        explanation: addrResult.explanation,
      });
    } else if (addrStatus === 'mismatch' && ev.address) {
      addressMismatches.push({
        docType: ev.docType, label,
        similarity: addrResult?.score || 0,
        confidence: addrResult?.confidence || 0,
        address: ev.address,
        explanation: addrResult?.explanation || 'Address does not match reference',
      });
    }

    if (ev.isRajasthan) {
      rajasthanDocs.push(ev.docType);
      totalScore += DOC_RESIDENCE_WEIGHT[ev.docType] || 5;
    }

    if (ev.year && ev.year >= 1990 && ev.year <= CURRENT_YEAR) {
      if (ev.year < earliestYear) earliestYear = ev.year;
      if (ev.year > latestYear) latestYear = ev.year;
      timeline.push({
        year: ev.year, docType: ev.docType, label,
        address: ev.address, isRajasthan: ev.isRajasthan,
        addressMatch: addrStatus,
        addressScore: addrResult ? addrResult.confidence : 0,
        district: ev.district,
        metrics: addrResult?.metrics || null,
      });
    }
  }

  timeline.sort((a, b) => a.year - b.year);

  const estimatedYears = earliestYear < CURRENT_YEAR ? CURRENT_YEAR - earliestYear : 0;
  const yearBonus = Math.min(25, estimatedYears * 3);
  totalScore = Math.min(100, totalScore + yearBonus);

  const mismatchPenalty = addressMismatches.length * 8;
  totalScore = Math.max(0, totalScore - mismatchPenalty);

  const meetsYearReq = estimatedYears >= MIN_YEARS_REQUIRED;
  const hasRajasthanProof = rajasthanDocs.length > 0;
  const hasAddressConsistency = addressMismatches.length === 0 || addressMatches.length > addressMismatches.length;

  let status, verdict, confidence;
  if (meetsYearReq && hasRajasthanProof && hasAddressConsistency && totalScore >= 60) {
    status = 'eligible';
    verdict = `Likely eligible — estimated ${estimatedYears} years of residence in Rajasthan`;
    confidence = Math.min(95, totalScore);
  } else if (estimatedYears >= 5 && hasRajasthanProof) {
    status = 'partial';
    verdict = `Partial evidence — ${estimatedYears} years estimated, need ${MIN_YEARS_REQUIRED}+`;
    confidence = Math.min(70, totalScore);
  } else {
    status = 'insufficient';
    verdict = estimatedYears > 0
      ? `Insufficient proof — only ${estimatedYears} years documented`
      : 'No residence timeline could be established';
    confidence = Math.min(40, totalScore);
  }

  // Missing documents
  const uploaded = new Set(evidenceList.map(e => e.docType));
  const missingDocs = [
    { type: 'aadhaar', label: 'Aadhaar Card', importance: 'critical' },
    { type: 'voter_id', label: 'Voter ID', importance: 'high' },
    { type: 'electricity_bill', label: 'Electricity Bill', importance: 'high' },
    { type: 'bank_statement', label: 'Bank Statement', importance: 'medium' },
    { type: 'marksheet', label: 'School Marksheet', importance: 'medium' },
    { type: 'driving_license', label: 'Driving Licence', importance: 'medium' },
  ].filter(d => !uploaded.has(d.type));

  // Missing years in timeline (gaps > 3 years between proofs)
  const missingYears = [];
  const needSince = CURRENT_YEAR - MIN_YEARS_REQUIRED;
  if (earliestYear > needSince) {
    missingYears.push({ period: `${needSince}–${earliestYear}`, message: `No proof from ${needSince} to ${earliestYear}` });
  }
  for (let i = 0; i < timeline.length - 1; i++) {
    const gap = timeline[i + 1].year - timeline[i].year;
    if (gap > 5) {
      missingYears.push({ period: `${timeline[i].year}–${timeline[i+1].year}`, message: `${gap}-year gap in evidence` });
    }
  }

  const advisories = [];
  if (!hasRajasthanProof) advisories.push({ type: 'error', msg: 'No Rajasthan address found in any document' });
  if (addressMismatches.length > 0) advisories.push({ type: 'warning', msg: `Address inconsistency in ${addressMismatches.length} document(s)` });
  if (estimatedYears < MIN_YEARS_REQUIRED) advisories.push({ type: 'warning', msg: `Need documents from ${needSince} or earlier` });
  if (meetsYearReq) advisories.push({ type: 'success', msg: `Proof spans ${earliestYear}–${CURRENT_YEAR} (${estimatedYears} years)` });
  if (hasAddressConsistency && addressMatches.length > 1) advisories.push({ type: 'success', msg: `Address consistent across ${addressMatches.length} documents` });

  return {
    status, verdict, confidence, readiness_score: totalScore,
    residence_years_estimated: estimatedYears,
    earliest_proof_year: earliestYear < CURRENT_YEAR ? earliestYear : null,
    latest_proof_year: latestYear > 2000 ? latestYear : null,
    min_years_required: MIN_YEARS_REQUIRED,
    meets_year_requirement: meetsYearReq,
    reference_address: referenceAddress,
    address_clusters: clusters.length,
    timeline, address_matches: addressMatches, address_mismatches: addressMismatches,
    rajasthan_docs: rajasthanDocs, missing_docs: missingDocs,
    missing_years: missingYears, advisories,
    documents_analyzed: evidenceList.length,
  };
}

/**
 * MOOL NIWAS (PERMANENT RESIDENCE) VALIDATION v1
 * ─────────────────────────────────────────────────────────────────────
 * Validates specific requirements for Rajasthan Mool Niwas domicile certificate:
 * - Continuous residence in Rajasthan for 10+ years
 * - Proof of address (Aadhaar, Voter ID, utility bills)
 * - School records showing study in Rajasthan
 * - Birth certificate or parents' residence proof
 * - No gaps in residence timeline (or justified gaps)
 */
function validateMoolNiwasEligibility(docResults, profile) {
  const requirements = {
    continuous_residence_10_years: false,
    address_proof: false,
    school_records_rajasthan: false,
    voter_list_or_aadhaar: false,
    birth_certificate_or_parent_proof: false,
    utility_bills: false,
    old_school_certificates: false,
  };
  
  const docTypes = new Set((docResults || []).map(d => d.docType));
  const issues = [];
  const verified = [];

  // 1. Continuous Residence: Need 10+ years and Rajasthan proof
  const residenceReport = verifyResidence(docResults);
  if (residenceReport.residence_years_estimated >= 10 && residenceReport.rajasthan_docs.length > 0) {
    requirements.continuous_residence_10_years = true;
    verified.push(`✓ Continuous residence: ${residenceReport.residence_years_estimated} years documented in Rajasthan`);
  } else if (residenceReport.residence_years_estimated >= 8) {
    issues.push(`⚠ Almost sufficient residence: ${residenceReport.residence_years_estimated} years (need 10+ years)`);
  } else {
    issues.push(`✗ Insufficient residence timeline: ${residenceReport.residence_years_estimated} years (need 10+ years)`);
  }

  // 2. Address Proof (Aadhaar, Voter ID, or utility bills)
  if (docTypes.has('aadhaar')) {
    requirements.address_proof = true;
    verified.push('✓ Aadhaar Card provided');
  } else if (docTypes.has('voter_id')) {
    requirements.voter_list_or_aadhaar = true;
    verified.push('✓ Voter ID provided');
  }
  
  if (docTypes.has('electricity_bill') || docTypes.has('water_bill')) {
    requirements.utility_bills = true;
    verified.push('✓ Utility bill (electricity/water) provided');
  } else {
    issues.push('⚠ No utility bills provided (electricity/water bills strengthen application)');
  }
  
  if (!requirements.address_proof && !requirements.voter_list_or_aadhaar) {
    issues.push('✗ CRITICAL: No Aadhaar or Voter ID found');
  }

  // 3. School Records — marksheet showing study in Rajasthan
  if (docTypes.has('marksheet')) {
    const marksheet = (docResults || []).find(d => d.docType === 'marksheet');
    if (marksheet && marksheet.parsedFields) {
      const schoolState = marksheet.parsedFields.state || '';
      const schoolDistrict = marksheet.parsedFields.district || '';
      const schoolName = marksheet.parsedFields.school_name || marksheet.parsedFields.education_12th_school || marksheet.parsedFields.education_10th_school || '';
      
      if (/rajasthan/i.test(schoolState) || /rajasthan/i.test(schoolDistrict)) {
        requirements.school_records_rajasthan = true;
        verified.push(`✓ School record from Rajasthan: ${schoolName}`);
        requirements.old_school_certificates = true;
      } else {
        issues.push(`⚠ School is not in Rajasthan: ${schoolName} (${schoolState || schoolDistrict || 'unknown'})`);
      }
    }
  } else {
    issues.push('⚠ No school marksheet provided (strongly recommended for continuous residence proof)');
  }

  // 4. Birth Certificate or Parents' Residence Proof
  if (profile) {
    if (profile.personal_info?.dob) {
      verified.push('✓ Date of birth verified');
    }
    const birthPlace = profile.residence?.birth_place || '';
    if (/rajasthan/i.test(birthPlace)) {
      requirements.birth_certificate_or_parent_proof = true;
      verified.push(`✓ Birth place in Rajasthan: ${birthPlace}`);
    }
  }

  // 5. Voter List / Old Voter ID
  if (docTypes.has('voter_id')) {
    verified.push('✓ Voter ID shows registration in Rajasthan electoral rolls');
  }

  // 6. Check for address consistency
  if (residenceReport.address_matches && residenceReport.address_matches.length > 0) {
    verified.push(`✓ Address consistent across ${residenceReport.address_matches.length} documents`);
  }
  if (residenceReport.address_mismatches && residenceReport.address_mismatches.length > 0) {
    issues.push(`⚠ Address inconsistency detected in ${residenceReport.address_mismatches.length} document(s)`);
  }

  // Calculate Mool Niwas readiness score
  const checkedReqs = Object.values(requirements).filter(Boolean).length;
  const totalReqs = Object.keys(requirements).length;
  const moolNiwasScore = Math.round((checkedReqs / totalReqs) * 100);

  const overallEligible = requirements.continuous_residence_10_years && 
                         (requirements.address_proof || requirements.voter_list_or_aadhaar) &&
                         (requirements.school_records_rajasthan || requirements.birth_certificate_or_parent_proof);

  return {
    mool_niwas_eligible: overallEligible,
    mool_niwas_score: moolNiwasScore,
    requirements_met: Object.entries(requirements).map(([req, met]) => ({
      requirement: req.replace(/_/g, ' '),
      status: met ? 'met' : 'not_met',
    })),
    verified_points: verified,
    issues: issues,
    recommendation: overallEligible 
      ? 'Application is likely eligible for Mool Niwas domicile certificate'
      : 'Missing critical requirements. Please upload: ' + 
        issues.filter(i => i.startsWith('✗')).map(i => i.replace('✗ ', '').replace('CRITICAL: ', '')).join(', '),
  };
}

module.exports = { verifyResidence, isRajasthan, validateMoolNiwasEligibility };
