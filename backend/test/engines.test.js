'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures');
const { extractLocal } = require('../services/extractors');
const { mergeExtraction, buildEvidence, mapMarksheet } = require('../services/documentPipeline');
const P = require('../services/profileEngine');
const { residenceReport } = require('../services/residenceEngine');
const { consistencyReport } = require('../services/consistency');
const { evaluateService } = require('../services/eligibilityEngine');
const DEFAULT_SERVICES = require('../config/services.default');

let n = 0;
function fakeDoc(text, type) {
  const local = extractLocal(text, type);
  const { fields, meta } = mergeExtraction(local, null);
  const warnings = [];
  if (type === 'marksheet') mapMarksheet(fields, meta, warnings);
  n += 1;
  return {
    id: `doc_test${n}`, doc_type: type, file_label: `${type}.jpg`, uploaded_at: new Date().toISOString(),
    kind: 'image', pages: 1, ocr: { method: 'ocr', confidence: 82 }, fields, field_meta: meta,
    evidence: buildEvidence(type, fields, local.evidence, null), warnings,
  };
}

function service(id) {
  const s = JSON.parse(JSON.stringify(DEFAULT_SERVICES.find((x) => x.id === id)));
  s.unverified_rules = 1;
  return s;
}

function sunita() {
  const c = P.newCustomer({ id: 'cus_test' });
  P.addDocument(c, fakeDoc(F.AADHAAR_FRONT, 'aadhaar'));
  P.addDocument(c, fakeDoc(F.AADHAAR_BACK, 'aadhaar'));
  P.addDocument(c, fakeDoc(F.VOTER_ID, 'voter_id'));
  P.addDocument(c, fakeDoc(F.ELECTRICITY_BILL, 'electricity_bill'));
  P.addDocument(c, fakeDoc(F.MARKSHEET_10, 'marksheet'));
  P.addDocument(c, fakeDoc(F.DL, 'driving_license'));
  return c;
}

test('profile merges documents and picks the most trusted value', () => {
  const c = sunita();
  const flat = P.flatten(c);
  assert.equal(flat.name, 'Sunita Sharma', 'Aadhaar name beats marksheet maiden name');
  assert.equal(flat.id_number, F.FAKE_AADHAAR_SPACED);
  assert.equal(flat.dob, '14/08/1994');
  assert.equal(flat.gender, 'Female');
  assert.equal(flat.pincode, '303301');
  assert.equal(flat.education_10th_board, 'Board of Secondary Education, Rajasthan');
  assert.equal(flat.education_10th_year, '2010');
  assert.equal(flat.education_12th_school, null, 'a class 10 marksheet must not fill class 12 fields');
  assert.equal(flat.husband_name, 'Ramesh Sharma');
  assert.equal(flat.aadhaar_last4, F.FAKE_AADHAAR.slice(-4));
  assert.equal(flat.first_name, 'Sunita');
  assert.equal(flat.last_name, 'Sharma');
});

test('conflicts list both name versions; operator choice wins and can be undone', () => {
  const c = sunita();
  const conflicts = P.findConflicts(c);
  const nameConflict = conflicts.find((x) => x.key === 'name');
  assert.ok(nameConflict, 'Sunita Sharma vs Sunita Kumari is a conflict');
  assert.equal(nameConflict.options.length, 2);
  const marksheetOption = nameConflict.options.find((o) => o.doc_types.includes('marksheet'));
  P.chooseCandidate(c, 'name', marksheetOption.doc_id);
  assert.equal(P.flatten(c).name, 'Sunita Kumari');
  assert.equal(P.findConflicts(c).find((x) => x.key === 'name').resolved, true);
  P.clearManualValue(c, 'name');
  assert.equal(P.flatten(c).name, 'Sunita Sharma');
});

test('manual edit wins; clearing a field does not bring the OCR value back', () => {
  const c = sunita();
  P.setManualValue(c, 'phone', '+91 98290 12345');
  assert.equal(P.flatten(c).phone, '9829012345');
  P.setManualValue(c, 'pincode', '');
  assert.equal(P.flatten(c).pincode, null);
  P.clearManualValue(c, 'pincode');
  assert.equal(P.flatten(c).pincode, '303301');
});

test('removing a document removes its values', () => {
  const c = sunita();
  const voter = c.documents.find((d) => d.doc_type === 'voter_id');
  assert.ok(P.flatten(c).voter_id);
  P.removeDocument(c, voter.id);
  assert.equal(P.flatten(c).voter_id, null);
  assert.equal(c.documents.length, 5);
});

test('residence report: earliest dated Rajasthan proof decides the years', () => {
  const c = sunita();
  const rep = residenceReport(c, P.flatten(c), { minYears: 10, now: new Date(2026, 10, 1) });
  assert.equal(rep.earliest_proof_year, 2010);
  assert.equal(rep.evidence_years, 16);
  assert.equal(rep.status, 'sufficient');
  const strict = residenceReport(c, P.flatten(c), { minYears: 20, now: new Date(2026, 10, 1) });
  assert.equal(strict.status, 'partial');
  assert.equal(strict.need_proof_from_year, 2006);
});

test('consistency: applicant name compared only with applicant name (not father)', () => {
  const c = sunita();
  const rep = consistencyReport(c, P.flatten(c));
  const nameCheck = rep.checks.find((x) => x.id === 'name_consistency');
  assert.equal(nameCheck.status, 'fail', 'maiden name on marksheet is flagged for review');
  assert.equal(nameCheck.severity, 'medium');
  assert.equal(rep.checks.find((x) => x.id === 'aadhaar_checksum').status, 'pass');
  assert.equal(rep.checks.find((x) => x.id === 'dob_consistency').status, 'pass');
  assert.equal(rep.level, 'review');
});

test('Mool Niwas: needs info until missing fields, photo and affidavit are done; then ready', () => {
  const c = sunita();
  const now = new Date(2026, 10, 1);
  let r = evaluateService(service('mool_niwas'), c, P.flatten(c), { now });
  assert.equal(r.eligibility, 'eligible');
  assert.equal(r.status, 'needs_info');
  const missingKeys = r.missing.fields.map((f) => f.key);
  assert.ok(missingKeys.includes('phone'));
  assert.ok(r.missing.documents.some((d) => d.id === 'photo'));

  for (const f of missingKeys) {
    const v = { phone: '9829012345', tehsil: 'Bassi', birth_place: 'Jaipur, Rajasthan', years_in_rajasthan: 32, father_name: 'Mohan Lal Sharma', district: 'Jaipur' }[f];
    P.setManualValue(c, f, v === undefined ? 'x' : v);
  }
  c.manual_docs = { photo: true, 'mool_niwas.affidavit': true };
  r = evaluateService(service('mool_niwas'), c, P.flatten(c), { now });
  assert.equal(r.status, 'ready', JSON.stringify(r.missing));
  assert.equal(r.readiness, 100);
});

test('Mool Niwas: residence rule value comes from settings (20 years → not proved)', () => {
  const c = sunita();
  const s = service('mool_niwas');
  s.rules[1].rules[0].value = 20;
  const r = evaluateService(s, c, P.flatten(c), { now: new Date(2026, 10, 1) });
  const rule = r.rules.find((x) => x.id === 'residence_or_birth');
  assert.equal(rule.status, 'unknown');
  assert.match(rule.children[0].detail.en, /2006 or earlier/);
});

test('voter registration: age rule passes, confirmation question is asked', () => {
  const c = sunita();
  let r = evaluateService(service('voter_registration'), c, P.flatten(c));
  assert.equal(r.rules.find((x) => x.id === 'age_18').status, 'pass');
  assert.equal(r.missing.answers.length, 1);
  c.declared = { no_existing_card: false };
  r = evaluateService(service('voter_registration'), c, P.flatten(c));
  assert.equal(r.status, 'not_eligible');
});

test('EWS: income and category rules', () => {
  const c = sunita();
  P.setManualValue(c, 'caste_category', 'General');
  P.setManualValue(c, 'annual_income', '9,50,000');
  let r = evaluateService(service('ews_certificate'), c, P.flatten(c));
  assert.equal(r.rules.find((x) => x.id === 'income_limit').status, 'fail');
  assert.equal(r.status, 'not_eligible');
  P.setManualValue(c, 'annual_income', '3.5 lakh');
  r = evaluateService(service('ews_certificate'), c, P.flatten(c));
  assert.equal(r.rules.find((x) => x.id === 'income_limit').status, 'pass');
  P.setManualValue(c, 'caste_category', 'OBC');
  r = evaluateService(service('ews_certificate'), c, P.flatten(c));
  assert.equal(r.rules.find((x) => x.id === 'not_reserved').status, 'fail');
});

test('state rule: address outside Rajasthan fails, unknown when no address', () => {
  const c = P.newCustomer({ id: 'cus_x' });
  let r = evaluateService(service('income_certificate'), c, P.flatten(c));
  assert.equal(r.rules[0].status, 'unknown');
  P.setManualValue(c, 'address', '45, Civil Lines, Kanpur, Uttar Pradesh 208001');
  P.setManualValue(c, 'state', 'Uttar Pradesh');
  r = evaluateService(service('income_certificate'), c, P.flatten(c));
  assert.equal(r.rules[0].status, 'fail');
});
