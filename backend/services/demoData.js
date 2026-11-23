/**
 * services/demoData.js — a clearly fictional demo customer (DEMO_MODE only).
 * Built by running fake OCR text through the real extraction pipeline, so the
 * demo shows exactly what the app does with real documents.
 */

'use strict';

const { extractLocal } = require('./extractors');
const { mergeExtraction, buildEvidence, mapMarksheet } = require('./documentPipeline');
const P = require('./profileEngine');
const store = require('./customerStore');
const { verhoeffCheckDigit } = require('./validators');
const { randomId } = require('../utils/crypto');

const base = '39418275063';
const AADHAAR = base + verhoeffCheckDigit(base);
const A = `${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`;

const DOCS = [
  ['aadhaar', `GOVERNMENT OF INDIA\nअमित कुमार\nAmit Kumar\nजन्म तिथि/DOB: 12/05/1998\nपुरुष/ MALE\n${A}\nमेरा आधार, मेरी पहचान`],
  ['aadhaar', `Unique Identification Authority of India\nAddress:\nS/O: Rajesh Kumar, 221, Shanti Nagar,\nDurgapura, Jaipur,\nRajasthan - 302018\n${A}`],
  ['marksheet', `BOARD OF SECONDARY EDUCATION, RAJASTHAN, AJMER\nSecondary Examination 2013\nRoll No.: 2345678\nName of Candidate : AMIT KUMAR\nFather's Name : RAJESH KUMAR\nMother's Name : SUNITA DEVI\nSchool : GOVT. SR. SEC. SCHOOL, DURGAPURA, JAIPUR\nTotal 489/600 81.50% FIRST DIVISION`],
  ['electricity_bill', `Jaipur Vidyut Vitran Nigam Ltd. (JVVNL)\nElectricity Bill\nK No.: 210498765432\nName: Rajesh Kumar\nAddress: 221 Shanti Nagar Durgapura Jaipur 302018\nBill Date: 07/04/2014\nUnits Consumed: 210`],
  ['voter_id', `ELECTION COMMISSION OF INDIA\nELECTOR PHOTO IDENTITY CARD\nRJD7654321\nName : Amit Kumar\nFather's Name : Rajesh Kumar\nGender : Male\nDate of Birth : 12/05/1998\nAddress : 221, Shanti Nagar, Durgapura, Jaipur, Rajasthan 302018\nDate of Issue : 15/02/2017`],
];

function createDemoCustomer() {
  const customer = store.create({ consentStore: false });
  for (const [type, text] of DOCS) {
    const local = extractLocal(text, type);
    const { fields, meta } = mergeExtraction(local, null);
    if (type === 'marksheet') mapMarksheet(fields, meta, []);
    P.addDocument(customer, {
      id: randomId('doc'), doc_type: type, detected_type: type, file_label: `DEMO ${type}.jpg`,
      uploaded_at: new Date().toISOString(), kind: 'image', pages: 1,
      ocr: { method: 'demo', confidence: 90 }, ai: { used: false }, fields, field_meta: meta,
      evidence: buildEvidence(type, fields, local.evidence, null), warnings: [],
    });
  }
  P.setManualValue(customer, 'phone', '9000000000');
  customer.notes = 'DEMO customer — fictional data';
  return store.save(customer);
}

module.exports = { createDemoCustomer };
