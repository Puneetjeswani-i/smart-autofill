/**
 * services/consistency.js — "Document checks" (replaces the v5 fraudDetector).
 *
 * These are honest data-quality checks, not fraud accusations. Most problems
 * at a kiosk are OCR misreads or genuine life changes (e.g. a woman's name
 * after marriage), so every finding tells the operator what to verify.
 *
 * v5 bugs fixed here:
 *   - the applicant's name was compared with the father's/mother's name
 *     (every customer got a "name inconsistency")
 *   - several electricity bills (good residence proof!) raised "duplicate" risk
 *   - DOB comparison failed on 14-08-1994 vs 14/08/1994
 */

'use strict';

const V = require('./validators');
const { compareAddresses } = require('./addressEngine');
const { DOC_TYPES } = require('../config/catalog');

function docLabel(type, lang = 'en') {
  return (DOC_TYPES[type] && DOC_TYPES[type].label[lang]) || type;
}

function candidates(customer, path) {
  return (customer.values[path] || []).filter((c) => c.method !== 'manual' && c.value !== null && c.value !== undefined);
}

function pairwiseWorst(list, sim) {
  let worst = null;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const s = sim(list[i].value, list[j].value);
      if (!worst || s < worst.score) worst = { a: list[i], b: list[j], score: s };
    }
  }
  return worst;
}

function consistencyReport(customer, flat) {
  const checks = [];
  const add = (id, status, severity, en, hi, extra = {}) => checks.push({ id, status, severity, message: { en, hi }, ...extra });

  // 1. applicant name across documents
  const names = candidates(customer, 'personal_info.name');
  if (names.length >= 2) {
    const w = pairwiseWorst(names, V.nameSimilarity);
    if (w.score < 0.75) {
      const sev = w.score < 0.45 ? 'high' : 'medium';
      add('name_consistency', 'fail', sev,
        `Name differs: "${w.a.value}" (${docLabel(w.a.doc_type)}) vs "${w.b.value}" (${docLabel(w.b.doc_type)}). If the name changed after marriage, keep the marriage proof / affidavit ready.`,
        `नाम अलग है: "${w.a.value}" (${docLabel(w.a.doc_type, 'hi')}) और "${w.b.value}" (${docLabel(w.b.doc_type, 'hi')})। विवाह के बाद नाम बदला हो तो विवाह प्रमाण / शपथ पत्र साथ रखें।`,
        { field: 'name' });
    } else add('name_consistency', 'pass', 'none', 'Name matches on all documents.', 'सभी दस्तावेज़ों पर नाम मेल खाता है।', { field: 'name' });
  }

  // 2. father's name
  const fathers = candidates(customer, 'personal_info.father_name');
  if (fathers.length >= 2) {
    const w = pairwiseWorst(fathers, V.nameSimilarity);
    if (w.score < 0.75) {
      add('father_name_consistency', 'fail', 'medium',
        `Father's name differs: "${w.a.value}" vs "${w.b.value}".`,
        `पिता का नाम अलग है: "${w.a.value}" और "${w.b.value}"।`, { field: 'father_name' });
    } else add('father_name_consistency', 'pass', 'none', "Father's name matches.", 'पिता का नाम मेल खाता है।', { field: 'father_name' });
  }

  // 3. date of birth
  const dobs = candidates(customer, 'personal_info.dob');
  if (dobs.length >= 2) {
    const parsed = dobs.map((c) => ({ c, p: V.parseDate(c.value) })).filter((x) => x.p);
    const full = parsed.filter((x) => x.p.d);
    const distinctFull = [...new Set(full.map((x) => V.formatDate(x.p)))];
    const distinctYears = [...new Set(parsed.map((x) => x.p.y))];
    if (distinctFull.length > 1 || distinctYears.length > 1) {
      add('dob_consistency', 'fail', 'high',
        `Date of birth differs: ${dobs.map((c) => `${c.value} (${docLabel(c.doc_type)})`).join(', ')}. Check each card — one digit may be misread.`,
        `जन्म तिथि अलग है: ${dobs.map((c) => `${c.value} (${docLabel(c.doc_type, 'hi')})`).join(', ')}। हर कार्ड जाँचें — एक अंक गलत पढ़ा गया हो सकता है।`,
        { field: 'dob' });
    } else add('dob_consistency', 'pass', 'none', 'Date of birth matches.', 'जन्म तिथि मेल खाती है।', { field: 'dob' });
  }

  // 4. gender
  const genders = [...new Set(candidates(customer, 'personal_info.gender').map((c) => c.value))];
  if (genders.length > 1) {
    add('gender_consistency', 'fail', 'high', `Gender differs between documents (${genders.join(' / ')}).`, `दस्तावेज़ों में लिंग अलग है (${genders.join(' / ')})।`, { field: 'gender' });
  }

  // 5. Aadhaar checksum
  const aadhaars = candidates(customer, 'identity_documents.aadhaar_number');
  if (flat.id_number) {
    if (!V.isValidAadhaar(flat.id_number)) {
      add('aadhaar_checksum', 'fail', 'high',
        'Aadhaar number fails the checksum — a digit is probably misread. Compare with the card and correct it.',
        'आधार नंबर जाँच में सही नहीं है — शायद कोई अंक गलत पढ़ा गया। कार्ड से मिलाकर सुधारें।', { field: 'id_number' });
    } else add('aadhaar_checksum', 'pass', 'none', 'Aadhaar number format and checksum are valid.', 'आधार नंबर का प्रारूप और जाँच अंक सही है।', { field: 'id_number' });
  }
  const distinctAadhaar = [...new Set(aadhaars.filter((c) => V.isValidAadhaar(c.value)).map((c) => V.digitsOnly(c.value)))];
  if (distinctAadhaar.length > 1) {
    add('aadhaar_consistency', 'fail', 'high', 'Different Aadhaar numbers were found on documents.', 'दस्तावेज़ों पर अलग-अलग आधार नंबर मिले।', { field: 'id_number' });
  }

  // 6. PAN
  if (flat.pan) {
    if (!V.isValidPAN(flat.pan)) {
      add('pan_format', 'fail', 'medium', `PAN "${flat.pan}" is not in a valid format.`, `पैन "${flat.pan}" सही प्रारूप में नहीं है।`, { field: 'pan' });
    } else if (!V.isIndividualPAN(flat.pan)) {
      add('pan_format', 'fail', 'medium', 'This PAN is not an individual PAN (4th letter is not "P").', 'यह व्यक्तिगत पैन नहीं है (चौथा अक्षर "P" नहीं है)।', { field: 'pan' });
    } else add('pan_format', 'pass', 'none', 'PAN format is valid.', 'पैन प्रारूप सही है।', { field: 'pan' });
  }

  // 7. DOB sanity
  if (flat.dob) {
    const age = V.ageOn(flat.dob);
    if (V.isFutureDate(flat.dob)) add('dob_valid', 'fail', 'high', 'Date of birth is in the future.', 'जन्म तिथि भविष्य की है।', { field: 'dob' });
    else if (age !== null && age > 110) add('dob_valid', 'fail', 'high', `Age ${age} looks wrong — check the date of birth.`, `आयु ${age} गलत लगती है — जन्म तिथि जाँचें।`, { field: 'dob' });
  }

  // 8. mobile
  if (flat.phone && !V.isValidMobile(flat.phone)) {
    add('mobile_format', 'fail', 'medium', 'Mobile number should be 10 digits starting with 6–9.', 'मोबाइल नंबर 6–9 से शुरू होने वाले 10 अंकों का होना चाहिए।', { field: 'phone' });
  }

  // 9. address across documents
  const addrs = candidates(customer, 'residence.current_address');
  if (addrs.length >= 2) {
    const w = pairwiseWorst(addrs, (a, b) => compareAddresses(String(a), String(b)).score);
    if (w.score < 0.35) {
      add('address_consistency', 'fail', 'low',
        `Address on ${docLabel(w.a.doc_type)} differs from ${docLabel(w.b.doc_type)}. Fine if the customer moved — use the current address on the form.`,
        `${docLabel(w.a.doc_type, 'hi')} का पता ${docLabel(w.b.doc_type, 'hi')} से अलग है। ग्राहक ने घर बदला हो तो ठीक है — फॉर्म में वर्तमान पता भरें।`,
        { field: 'address' });
    } else add('address_consistency', 'pass', 'none', 'Addresses on documents match.', 'दस्तावेज़ों के पते मेल खाते हैं।', { field: 'address' });
  }

  // 10. document dated before birth
  const birth = V.parseDate(flat.dob);
  if (birth) {
    for (const d of customer.documents || []) {
      const y = d.evidence && d.evidence.year;
      if (y && y < birth.y && d.doc_type !== 'birth_certificate') {
        add('timeline', 'fail', 'medium',
          `${docLabel(d.doc_type)} date (${y}) is before the date of birth — the date or DOB was probably misread.`,
          `${docLabel(d.doc_type, 'hi')} की तारीख (${y}) जन्म तिथि से पहले है — तारीख या जन्म तिथि शायद गलत पढ़ी गई।`,
          { doc_id: d.id });
      }
    }
  }

  // 11. poor scans
  const poor = (customer.documents || []).filter((d) => d.ocr && d.ocr.method !== 'pdf-text' && d.ocr.confidence < 55);
  if (poor.length) {
    add('scan_quality', 'fail', 'low',
      `${poor.length} document(s) were hard to read. Re-scan them flat, in good light, for better accuracy.`,
      `${poor.length} दस्तावेज़ ठीक से पढ़े नहीं जा सके। बेहतर सटीकता के लिए उन्हें समतल रखकर अच्छी रोशनी में फिर से स्कैन करें।`);
  }

  // 12. AI values not found in the document text
  const unverified = Object.entries(customer.sources || {}).filter(([, s]) => s.method === 'ai' && s.grounded === false);
  if (unverified.length) {
    add('ai_unverified', 'fail', 'low',
      `${unverified.length} value(s) were suggested by AI but not found in the scanned text — check them before using.`,
      `${unverified.length} मान AI ने सुझाए पर स्कैन किए गए पाठ में नहीं मिले — उपयोग से पहले जाँचें।`,
      { fields: unverified.map(([p]) => p) });
  }

  const failed = checks.filter((c) => c.status === 'fail');
  const level = failed.some((c) => c.severity === 'high') ? 'problem' : failed.some((c) => c.severity === 'medium') ? 'review' : 'ok';
  return {
    level,
    checks,
    failed: failed.length,
    passed: checks.filter((c) => c.status === 'pass').length,
  };
}

module.exports = { consistencyReport };
