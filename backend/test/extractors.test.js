'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../services/validators');
const { detectDocType, extractLocal, parseAddressComponents } = require('../services/extractors');
const F = require('./fixtures');

test('Verhoeff: generated fake Aadhaar validates, a changed digit fails', () => {
  assert.equal(V.isValidAadhaar(F.FAKE_AADHAAR), true);
  const broken = F.FAKE_AADHAAR.slice(0, 11) + ((+F.FAKE_AADHAAR[11] + 1) % 10);
  assert.equal(V.isValidAadhaar(broken), false);
  assert.equal(V.isValidAadhaar('123456789012'), false, 'Aadhaar never starts with 1');
});

test('PAN validation and OCR repair', () => {
  assert.equal(V.isValidPAN('ABCPS1234K'), true);
  assert.equal(V.isValidPAN('ABCXS1234K'), false, '4th char must be a holder type');
  assert.equal(V.repairPAN('ABCPS12B4K'), 'ABCPS1284K');
  assert.equal(V.repairPAN('A8CPS1234K'), 'ABCPS1234K');
});

test('dates: parse, normalise, age', () => {
  assert.equal(V.normaliseDate('14-8-1994'), '14/08/1994');
  assert.equal(V.normaliseDate('1994-08-14'), '14/08/1994');
  assert.equal(V.normaliseDate('14 Aug 1994'), '14/08/1994');
  assert.equal(V.parseDate('31/02/2001'), null);
  assert.equal(V.ageOn('14/08/1994', new Date(2026, 7, 13)), 31);
  assert.equal(V.ageOn('14/08/1994', new Date(2026, 7, 14)), 32);
});

test('Rajasthan detection prefers PIN and state over district names', () => {
  assert.equal(V.looksRajasthan({ text: 'Bassi, Jaipur 303301' }), true);
  assert.equal(V.looksRajasthan({ text: 'Civil Lines, Pratapgarh, Uttar Pradesh 230001' }), false);
  assert.equal(V.looksRajasthan({ text: 'Civil Lines, Kanpur 208001' }), false);
  assert.equal(V.looksRajasthan({ text: 'House 12' }), null);
});

test('name similarity tolerates case, honorifics and one-letter OCR errors', () => {
  assert.ok(V.nameSimilarity('SUNITA SHARMA', 'Smt. Sunita Sharma') > 0.95);
  assert.ok(V.nameSimilarity('Sunita Sharma', 'Sunlta Sharma') > 0.8);
  assert.ok(V.nameSimilarity('Sunita Sharma', 'Mohan Lal') < 0.4);
});

test('doc type detection', () => {
  assert.equal(detectDocType(F.AADHAAR_FRONT).type, 'aadhaar');
  assert.equal(detectDocType(F.PAN_CARD).type, 'pan');
  assert.equal(detectDocType(F.VOTER_ID).type, 'voter_id');
  assert.equal(detectDocType(F.ELECTRICITY_BILL).type, 'electricity_bill');
  assert.equal(detectDocType(F.MARKSHEET_10).type, 'marksheet');
  assert.equal(detectDocType(F.DL).type, 'driving_license');
});

test('Aadhaar front: number (checksum), name, Hindi name, DOB, gender', () => {
  const r = extractLocal(F.AADHAAR_FRONT, 'aadhaar');
  assert.equal(r.fields.id_number, F.FAKE_AADHAAR_SPACED);
  assert.equal(r.meta.id_number.validated, true);
  assert.equal(r.fields.name, 'Sunita Sharma');
  assert.equal(r.fields.name_hi, 'सुनीता शर्मा');
  assert.equal(r.fields.dob, '14/08/1994');
  assert.equal(r.fields.gender, 'Female');
});

test('Aadhaar back: address, husband (W/O), PIN, district, state', () => {
  const r = extractLocal(F.AADHAAR_BACK, 'aadhaar');
  assert.match(r.fields.address, /Gandhi Nagar/);
  assert.equal(r.fields.pincode, '303301');
  assert.equal(r.fields.state, 'Rajasthan');
  assert.equal(r.fields.district, 'Jaipur');
  assert.equal(r.fields.husband_name, 'Ramesh Sharma');
  assert.equal(r.fields.father_name, undefined, 'W/O must never become father');
});

test('PAN card: PAN, name, father, DOB', () => {
  const r = extractLocal(F.PAN_CARD, 'pan');
  assert.equal(r.fields.pan, 'ABCPS1234K');
  assert.equal(r.fields.name, 'Sunita Sharma');
  assert.equal(r.fields.father_name, 'Mohan Lal Sharma');
  assert.equal(r.fields.dob, '14/08/1994');
});

test('Voter ID: EPIC, husband, issue date evidence', () => {
  const r = extractLocal(F.VOTER_ID, 'voter_id');
  assert.equal(r.fields.voter_id, 'RJX1234567');
  assert.equal(r.fields.husband_name, 'Ramesh Sharma');
  assert.equal(r.fields.name, 'Sunita Sharma');
  assert.equal(r.evidence.issue_date, '10/03/2013');
});

test('Electricity bill: name, bill date, PIN', () => {
  const r = extractLocal(F.ELECTRICITY_BILL, 'electricity_bill');
  assert.equal(r.fields.name, 'Sunita Sharma');
  assert.equal(r.evidence.bill_date, '05/06/2015');
  assert.equal(r.fields.pincode, '303301');
});

test('Class 10 marksheet: class, board, year, roll, mother', () => {
  const r = extractLocal(F.MARKSHEET_10, 'marksheet');
  assert.equal(r.fields._marks_class_level, '10');
  assert.equal(r.fields._marks_board, 'Board of Secondary Education, Rajasthan');
  assert.equal(r.fields._marks_year_of_passing, '2010');
  assert.equal(r.fields._marks_roll_number, '1234567');
  assert.equal(r.fields.mother_name, 'Kamla Devi');
  assert.equal(r.fields.name, 'Sunita Kumari');
  assert.equal(r.fields._marks_percentage, '75.33%');
});

test('Driving licence: number, DOB, issue date', () => {
  const r = extractLocal(F.DL, 'driving_license');
  assert.equal(r.fields.driving_license, 'RJ14 20120045678');
  assert.equal(r.fields.dob, '14/08/1994');
  assert.equal(r.evidence.issue_date, '21/07/2012');
  // "S/O, D/O, W/O: X" does not say which relation — must not be guessed as father
  assert.equal(r.fields.father_name, undefined);
  assert.equal(r.fields._relation_name, 'Ramesh Sharma');
});

test('address components', () => {
  const c = parseAddressComponents('45, Gandhi Nagar, Near Shiv Mandir, Bassi, Jaipur, Rajasthan - 303301');
  assert.equal(c.pincode, '303301');
  assert.equal(c.state, 'Rajasthan');
  assert.equal(c.district, 'Jaipur');
  assert.equal(c.house_no, '45');
  assert.equal(c.village_city, 'Bassi');
});
