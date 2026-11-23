/**
 * services/residenceEngine.js — how long do the customer's documents show
 * them living in Rajasthan?
 *
 * Input: the customer's processed documents (each has `evidence`: address,
 * date/year, is_rajasthan), the declared years and birth place.
 *
 * Only documents that show a Rajasthan address AND carry a date count towards
 * the years. Aadhaar proves the current address but usually has no date.
 *
 * The number of years required is NOT hard-coded: it comes from the service
 * rule in Settings (default 10, marked "verify with official notification").
 */

'use strict';

const V = require('./validators');
const { clusterAddresses, compareAddresses } = require('./addressEngine');
const { DOC_TYPES } = require('../config/catalog');

function label(docType) {
  return (DOC_TYPES[docType] && DOC_TYPES[docType].label) || { en: docType, hi: docType };
}

function residenceReport(customer, flat, { minYears = 10, now = new Date() } = {}) {
  const currentYear = now.getFullYear();
  const docs = customer.documents || [];
  const evidence = docs.map((d) => ({
    doc_id: d.id,
    doc_type: d.doc_type,
    label: label(d.doc_type),
    ...(d.evidence || {}),
  }));

  const rajDocs = evidence.filter((e) => e.is_rajasthan === true);
  const outsideDocs = evidence.filter((e) => e.is_rajasthan === false);
  const dated = rajDocs.filter((e) => e.year && e.year <= currentYear);

  const birthYear = (() => { const p = V.parseDate(flat.dob); return p ? p.y : null; })();
  const plausible = dated.filter((e) => !birthYear || e.year >= birthYear);
  const implausible = dated.filter((e) => birthYear && e.year < birthYear);

  const earliest = plausible.length ? Math.min(...plausible.map((e) => e.year)) : null;
  const evidenceYears = earliest ? currentYear - earliest : 0;
  const declaredYears = Number.isFinite(parseInt(flat.years_in_rajasthan, 10)) ? parseInt(flat.years_in_rajasthan, 10) : null;

  const birthEvidence = evidence.find((e) => e.proves === 'birth' && e.is_rajasthan === true);
  const birthPlaceRaj = flat.birth_place ? V.looksRajasthan({ text: flat.birth_place }) : null;
  const bornInRajasthan = birthEvidence ? true : birthPlaceRaj;

  // timeline: dated documents (Rajasthan and others), oldest first
  const timeline = evidence.filter((e) => e.year).sort((a, b) => a.year - b.year).map((e) => ({
    year: e.year, doc_id: e.doc_id, doc_type: e.doc_type, label: e.label,
    is_rajasthan: e.is_rajasthan, district: e.district || null, date: e.date || null, proves: e.proves,
  }));

  // gaps between Rajasthan proofs (years without any document)
  const years = [...new Set(plausible.map((e) => e.year))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < years.length - 1; i++) {
    if (years[i + 1] - years[i] > 4) gaps.push({ from: years[i], to: years[i + 1] });
  }
  if (years.length && currentYear - years[years.length - 1] > 4) gaps.push({ from: years[years.length - 1], to: currentYear });

  // address consistency between Rajasthan documents
  const addressItems = rajDocs.filter((e) => e.address).map((e) => ({ address: e.address, docType: e.doc_type }));
  const clusters = clusterAddresses(addressItems);
  const reference = clusters.length ? clusters[0].representative : null;
  const mismatches = [];
  if (reference) {
    for (const e of rajDocs.filter((x) => x.address)) {
      const r = compareAddresses(e.address, reference);
      if (r.status === 'mismatch') mismatches.push({ doc_id: e.doc_id, doc_type: e.doc_type, label: e.label, similarity: Math.round(r.score * 100) });
    }
  }

  let status;
  if (evidenceYears >= minYears) status = 'sufficient';
  else if (evidenceYears > 0 || (declaredYears !== null && declaredYears >= minYears) || bornInRajasthan) status = 'partial';
  else status = 'insufficient';

  const needFrom = currentYear - minYears;
  const advisories = [];
  if (!docs.length) {
    advisories.push({ type: 'info', en: 'Upload documents to check residence.', hi: 'निवास जाँच के लिए दस्तावेज़ अपलोड करें।' });
  } else {
    if (!rajDocs.length) advisories.push({ type: 'error', en: 'No document shows a Rajasthan address yet.', hi: 'अभी तक किसी दस्तावेज़ में राजस्थान का पता नहीं मिला।' });
    if (rajDocs.length && !dated.length) advisories.push({ type: 'warning', en: 'Rajasthan address found, but no document has a readable date. Add dated proofs (old bills, marksheet, voter ID with issue date).', hi: 'राजस्थान का पता मिला, पर किसी दस्तावेज़ पर तारीख नहीं पढ़ी जा सकी। तारीख वाले प्रमाण जोड़ें (पुराने बिल, अंकतालिका, जारी तिथि वाला वोटर कार्ड)।' });
    if (evidenceYears >= minYears) advisories.push({ type: 'success', en: `Documents show Rajasthan residence since ${earliest} (${evidenceYears} years; required ${minYears}).`, hi: `दस्तावेज़ ${earliest} से राजस्थान में निवास दिखाते हैं (${evidenceYears} वर्ष; आवश्यक ${minYears})।` });
    else if (evidenceYears > 0) advisories.push({ type: 'warning', en: `Documents prove only ${evidenceYears} years (since ${earliest}). Need proof from ${needFrom} or earlier.`, hi: `दस्तावेज़ केवल ${evidenceYears} वर्ष (${earliest} से) साबित करते हैं। ${needFrom} या उससे पहले का प्रमाण चाहिए।` });
    if (declaredYears !== null && declaredYears >= minYears && evidenceYears < minYears) {
      advisories.push({ type: 'warning', en: `Customer says ${declaredYears} years, but documents prove ${evidenceYears}. Ask for older documents.`, hi: `ग्राहक ${declaredYears} वर्ष बताते हैं, पर दस्तावेज़ ${evidenceYears} वर्ष साबित करते हैं। पुराने दस्तावेज़ माँगें।` });
    }
    if (bornInRajasthan) advisories.push({ type: 'success', en: 'Place of birth is in Rajasthan.', hi: 'जन्म स्थान राजस्थान में है।' });
    for (const g of gaps) advisories.push({ type: 'info', en: `No proof between ${g.from} and ${g.to}.`, hi: `${g.from} से ${g.to} के बीच कोई प्रमाण नहीं।` });
    if (mismatches.length) advisories.push({ type: 'warning', en: `Address differs on ${mismatches.length} document(s) — confirm the customer lived at both places in Rajasthan.`, hi: `${mismatches.length} दस्तावेज़ों पर पता अलग है — पुष्टि करें कि ग्राहक दोनों स्थानों पर राजस्थान में रहे।` });
    if (implausible.length) advisories.push({ type: 'error', en: `${implausible.length} document date(s) are before the date of birth — probably misread. Check them.`, hi: `${implausible.length} दस्तावेज़ों की तारीख जन्म तिथि से पहले है — शायद गलत पढ़ी गई। जाँचें।` });
    if (outsideDocs.length) advisories.push({ type: 'info', en: `${outsideDocs.length} document(s) show an address outside Rajasthan.`, hi: `${outsideDocs.length} दस्तावेज़ों में राजस्थान के बाहर का पता है।` });
  }

  const suggestions = status === 'sufficient' ? [] : [
    { en: `Electricity / water bill from ${needFrom} or earlier`, hi: `${needFrom} या उससे पहले का बिजली / पानी बिल` },
    { en: 'School marksheet or TC from a Rajasthan school', hi: 'राजस्थान के विद्यालय की अंकतालिका या TC' },
    { en: 'Old ration card / voter ID showing issue date', hi: 'जारी तिथि वाला पुराना राशन कार्ड / वोटर कार्ड' },
    { en: 'Land record (Jamabandi) or birth certificate', hi: 'भूमि रिकॉर्ड (जमाबंदी) या जन्म प्रमाण पत्र' },
  ];

  return {
    status,
    min_years_required: minYears,
    evidence_years: evidenceYears,
    declared_years: declaredYears,
    earliest_proof_year: earliest,
    need_proof_from_year: needFrom,
    born_in_rajasthan: bornInRajasthan,
    rajasthan_documents: rajDocs.length,
    dated_rajasthan_documents: plausible.length,
    documents_considered: docs.length,
    timeline,
    gaps,
    reference_address: reference,
    address_mismatches: mismatches,
    advisories,
    suggestions,
  };
}

module.exports = { residenceReport };
