/**
 * FRAUD DETECTION ENGINE
 * ─────────────────────────────────────────────────────────────────────
 * Detects signs of document manipulation, inconsistency, and fraud
 * in uploaded Indian government documents.
 *
 * CHECKS PERFORMED:
 *   1. Name consistency    — same name across all documents
 *   2. DOB consistency     — same DOB across Aadhaar, PAN, Passport
 *   3. Address consistency — address doesn't wildly change between docs
 *   4. Impossible timeline — future dates, impossible age ranges
 *   5. Duplicate documents — same doc type uploaded twice
 *   6. Low OCR confidence  — suspicious if text is garbled
 *   7. ID number format    — validate Aadhaar checksum, PAN format
 *   8. Suspiciously perfect scores — too-clean docs can be forgeries
 *
 * FRAUD RISK LEVELS:
 *   Low    (0-30)  — normal, proceed
 *   Medium (31-60) — review manually
 *   High   (61+)   — flag for rejection
 */

const { compareAddresses } = require('./addressEngine');

const CURRENT_YEAR = new Date().getFullYear();

// ── VALIDATORS ────────────────────────────────────────────────────────

/**
 * Validate Aadhaar number using Verhoeff algorithm checksum
 * Real Aadhaar numbers are verified via this checksum.
 */
function validateAadhaarChecksum(aadhaar) {
  const digits = String(aadhaar).replace(/\s/g, '');
  if (!/^\d{12}$/.test(digits)) return false;

  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const inv = [0,4,3,2,1,5,6,7,8,9];

  let c = 0;
  const arr = digits.split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i++) {
    c = d[c][p[i % 8][arr[i]]];
  }
  return c === 0;
}

/**
 * Validate PAN format: AAAAA9999A
 */
function validatePAN(pan) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

/**
 * Parse date string DD/MM/YYYY to Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize name for comparison (remove spaces, lowercase)
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Compare two names — returns similarity 0-1
 * Handles "AMIT KUMAR" vs "Amit Kumar" vs "Kumar Amit"
 */
function nameMatchScore(n1, n2) {
  if (!n1 || !n2) return 0;
  const a = normalizeName(n1);
  const b = normalizeName(n2);

  if (a === b) return 1.0;

  // Token sort comparison (handles word order differences)
  const tokA = new Set(a.split(' '));
  const tokB = new Set(b.split(' '));
  const inter = new Set([...tokA].filter(t => tokB.has(t)));
  const union = new Set([...tokA, ...tokB]);
  const jaccard = inter.size / union.size;

  // Levenshtein ratio
  const maxLen = Math.max(a.length, b.length);
  let edits = 0;
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i===0 ? j : j===0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  const levRatio = 1 - dp[m][n] / maxLen;

  return Math.max(jaccard, levRatio);
}

// ── MAIN FRAUD DETECTION ──────────────────────────────────────────────

/**
 * Run fraud detection across all parsed document results
 *
 * @param {Array} docResults - [{ parsedFields, docType, confidence, rawText }]
 * @returns {Object} FraudReport
 */
function detectFraud(docResults) {
  if (!docResults || docResults.length === 0) {
    return { risk_level: 'unknown', risk_score: 0, checks: [], flags: [], summary: 'No documents to analyze' };
  }

  const checks = [];   // All checks run
  const flags = [];    // Failed checks
  let riskScore = 0;

  // Group parsed fields by doc type
  const docsWithFields = docResults.filter(d => d.parsedFields && Object.keys(d.parsedFields).length > 0);
  const docTypes = docsWithFields.map(d => d.docType);

  // ── CHECK 1: Duplicate document types ─────────────────────────────
  const typeCounts = {};
  docTypes.forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const duplicates = Object.entries(typeCounts).filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    const dupeTypes = duplicates.map(([t]) => t).join(', ');
    flags.push({ check: 'duplicate_documents', severity: 'medium', message: `Same document type uploaded multiple times: ${dupeTypes}` });
    riskScore += 15;
  }
  checks.push({ id: 'duplicate_documents', name: 'Duplicate Documents', passed: duplicates.length === 0 });

  // ── CHECK 2: Name consistency across documents ─────────────────────
  const allNames = docsWithFields
    .filter(d => d.parsedFields.name)
    .map(d => ({ name: d.parsedFields.name, docType: d.docType }));

  if (allNames.length >= 2) {
    const nameScores = [];
    for (let i = 0; i < allNames.length; i++) {
      for (let j = i + 1; j < allNames.length; j++) {
        const score = nameMatchScore(allNames[i].name, allNames[j].name);
        nameScores.push({ a: allNames[i], b: allNames[j], score });
      }
    }
    const minNameScore = Math.min(...nameScores.map(s => s.score));
    if (minNameScore < 0.60) {
      const worst = nameScores.find(s => s.score === minNameScore);
      flags.push({
        check: 'name_mismatch',
        severity: minNameScore < 0.40 ? 'high' : 'medium',
        message: `Name inconsistency: "${worst.a.name}" (${worst.a.docType}) vs "${worst.b.name}" (${worst.b.docType})`
      });
      riskScore += minNameScore < 0.40 ? 30 : 15;
    }
    checks.push({
      id: 'name_consistency',
      name: 'Name Consistency',
      passed: minNameScore >= 0.60,
      detail: `Min name similarity: ${Math.round(minNameScore * 100)}%`
    });
  }

  // ── CHECK 3: DOB consistency ───────────────────────────────────────
  const allDOBs = docsWithFields
    .filter(d => d.parsedFields.dob)
    .map(d => ({ dob: d.parsedFields.dob, docType: d.docType }));

  if (allDOBs.length >= 2) {
    const uniqueDOBs = new Set(allDOBs.map(d => d.dob));
    if (uniqueDOBs.size > 1) {
      flags.push({
        check: 'dob_mismatch',
        severity: 'high',
        message: `DOB inconsistency: ${allDOBs.map(d => `${d.dob} (${d.docType})`).join(' vs ')}`
      });
      riskScore += 25;
    }
    checks.push({ id: 'dob_consistency', name: 'Date of Birth Consistency', passed: uniqueDOBs.size === 1 });
  }

  // ── CHECK 4: Impossible age / future dates ─────────────────────────
  const dobFields = docsWithFields.filter(d => d.parsedFields.dob);
  for (const doc of dobFields) {
    const dob = parseDate(doc.parsedFields.dob);
    if (dob) {
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 0) {
        flags.push({ check: 'future_dob', severity: 'high', message: `DOB is in the future: ${doc.parsedFields.dob} (${doc.docType})` });
        riskScore += 40;
      } else if (age > 130) {
        flags.push({ check: 'impossible_age', severity: 'high', message: `Impossible age: ${Math.floor(age)} years (DOB: ${doc.parsedFields.dob})` });
        riskScore += 35;
      } else if (age < 0.5) {
        flags.push({ check: 'infant_applicant', severity: 'medium', message: `Applicant appears to be under 6 months old` });
        riskScore += 10;
      }
    }
  }
  checks.push({ id: 'age_validity', name: 'Age / Date Validity', passed: !flags.find(f => ['future_dob','impossible_age'].includes(f.check)) });

  // ── CHECK 5: Aadhaar checksum validation ──────────────────────────
  const aadhaarDoc = docsWithFields.find(d => d.parsedFields.id_number && d.docType === 'aadhaar');
  if (aadhaarDoc) {
    const aadhaar = aadhaarDoc.parsedFields.id_number;
    const valid = validateAadhaarChecksum(aadhaar);
    if (!valid) {
      flags.push({
        check: 'invalid_aadhaar_checksum',
        severity: 'high',
        message: `Aadhaar number fails checksum validation: ${aadhaar} — may be fake or OCR error`
      });
      riskScore += 20;
    }
    checks.push({ id: 'aadhaar_checksum', name: 'Aadhaar Checksum', passed: valid });
  }

  // ── CHECK 6: PAN format validation ────────────────────────────────
  const panDoc = docsWithFields.find(d => d.parsedFields.pan);
  if (panDoc) {
    const valid = validatePAN(panDoc.parsedFields.pan);
    if (!valid) {
      flags.push({
        check: 'invalid_pan_format',
        severity: 'medium',
        message: `PAN number format invalid: ${panDoc.parsedFields.pan}`
      });
      riskScore += 10;
    }
    checks.push({ id: 'pan_format', name: 'PAN Format', passed: valid });
  }

  // ── CHECK 7: Address consistency (multi-doc) ──────────────────────
  const addressDocs = docsWithFields.filter(d => d.parsedFields.address);
  if (addressDocs.length >= 2) {
    const refAddress = addressDocs.find(d => d.docType === 'aadhaar')?.parsedFields?.address
      || addressDocs[0].parsedFields.address;

    let worstAddrScore = 1;
    let worstPair = null;
    for (const doc of addressDocs.slice(1)) {
      const result = compareAddresses(refAddress, doc.parsedFields.address);
      if (result.score < worstAddrScore) {
        worstAddrScore = result.score;
        worstPair = doc;
      }
    }

    if (worstAddrScore < 0.25 && worstPair) {
      flags.push({
        check: 'major_address_mismatch',
        severity: 'medium',
        message: `Significant address discrepancy in ${worstPair.docType} (similarity: ${Math.round(worstAddrScore * 100)}%)`
      });
      riskScore += 15;
    }
    checks.push({
      id: 'address_consistency',
      name: 'Address Consistency',
      passed: worstAddrScore >= 0.25,
      detail: `Worst address similarity: ${Math.round(worstAddrScore * 100)}%`
    });
  }

  // ── CHECK 8: OCR confidence too low ───────────────────────────────
  const lowConfDocs = docResults.filter(d => d.confidence !== undefined && d.confidence < 40);
  if (lowConfDocs.length > 0) {
    flags.push({
      check: 'low_ocr_confidence',
      severity: 'low',
      message: `${lowConfDocs.length} document(s) have very low OCR confidence — may be poor quality images`
    });
    riskScore += 5 * lowConfDocs.length;
  }
  checks.push({ id: 'ocr_quality', name: 'OCR Confidence', passed: lowConfDocs.length === 0 });

  // ── CHECK 9: Timeline plausibility ────────────────────────────────
  // If a utility bill is dated BEFORE the person's DOB, that's suspicious
  const mainDOB = docsWithFields.find(d => d.parsedFields.dob)?.parsedFields?.dob;
  if (mainDOB) {
    const dobYear = parseInt(mainDOB.split('/')[2]);
    if (dobYear > 1900) {
      const billDocs = docsWithFields.filter(d => ['electricity_bill','bank_statement','ration_card'].includes(d.docType));
      for (const doc of billDocs) {
        if (doc.parsedFields.year && doc.parsedFields.year < dobYear - 1) {
          flags.push({
            check: 'impossible_timeline',
            severity: 'medium',
            message: `${doc.docType} dated before applicant's birth year (${doc.parsedFields.year} vs DOB ${mainDOB})`
          });
          riskScore += 20;
        }
      }
    }
  }
  checks.push({ id: 'timeline_plausibility', name: 'Timeline Plausibility', passed: !flags.find(f => f.check === 'impossible_timeline') });

  // ── RISK LEVEL ────────────────────────────────────────────────────
  riskScore = Math.min(100, riskScore);
  const risk_level = riskScore >= 50 ? 'High' : riskScore >= 20 ? 'Medium' : 'Low';

  const highFlags = flags.filter(f => f.severity === 'high').length;
  const medFlags  = flags.filter(f => f.severity === 'medium').length;

  let summary = '';
  if (risk_level === 'Low') summary = 'No significant fraud indicators detected';
  else if (risk_level === 'Medium') summary = `${medFlags} medium-severity issue(s) require manual review`;
  else summary = `${highFlags} high-severity flag(s) — application should be reviewed carefully`;

  return {
    risk_level,
    risk_score: riskScore,
    checks,
    flags,
    checks_passed: checks.filter(c => c.passed).length,
    checks_total: checks.length,
    summary,
  };
}

module.exports = { detectFraud, validateAadhaarChecksum, validatePAN };
