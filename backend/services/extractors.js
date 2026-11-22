/**
 * services/extractors.js — local (offline) document understanding.
 *
 * Works on raw OCR text in English and/or Hindi. No network, no AI.
 *   detectDocType(text)          → { type, confidence, scores }
 *   extractLocal(text, docType)  → { fields, meta, evidence, warnings }
 *
 * Confidence levels used in `meta`:
 *   0.95  value passed a strict check (Aadhaar Verhoeff checksum, PAN structure…)
 *   0.80  value found next to its printed label ("DOB:", "पिता का नाम")
 *   0.55  value guessed from position / layout
 */

'use strict';

const V = require('./validators');

// ── Document type detection ──────────────────────────────────────────────────

const DOC_SIGNALS = {
  aadhaar: [
    [/aadhaar|aadhar|आधार/i, 2], [/unique identification authority|uidai|विशिष्ट पहचान/i, 3],
    [/\b[2-9]\d{3}\s\d{4}\s\d{4}\b/, 2], [/enrol?ment\s*no|नामांकन/i, 1], [/मेरा आधार|मेरी पहचान/, 2],
    [/\bvid\b\s*:?\s*\d{4}/i, 1],
  ],
  jan_aadhaar: [[/jan\s*-?\s*aadhaar|जन\s*-?\s*आधार|janaadhaar/i, 4], [/family|परिवार/i, 1]],
  pan: [
    [/permanent account number|स्थायी लेखा संख्या/i, 4], [/income\s*tax\s*department|आयकर विभाग/i, 3],
    [/\b[A-Z]{3}[P][A-Z]\d{4}[A-Z]\b/, 2],
  ],
  passport: [[/passport|पासपोर्ट/i, 3], [/P<IND/, 4], [/date of expiry/i, 1], [/place of issue/i, 1], [/republic of india/i, 1]],
  voter_id: [
    [/election commission|निर्वाचन आयोग/i, 4], [/elector|मतदाता|निर्वाचक/i, 2], [/\bepic\b/i, 2],
    [/\b[A-Z]{3}\d{7}\b/, 2], [/identity card|पहचान पत्र/i, 1],
  ],
  driving_license: [
    [/driving\s*licen[cs]e|ड्राइविंग|चालन अनुज्ञ/i, 4], [/\b(LMV|MCWG|MCWOG|TRANS)\b/, 2],
    [/\b[A-Z]{2}[-\s]?\d{2}[-\s]?(19|20)\d{2}[-\s]?\d{7}\b/, 2], [/transport|परिवहन/i, 1], [/valid\s*till|validity/i, 1],
  ],
  ration_card: [[/ration\s*card|राशन\s*कार्ड/i, 4], [/\bnfsa\b|खाद्य सुरक्षा/i, 2], [/fair price|उचित मूल्य/i, 1]],
  birth_certificate: [[/birth certificate|जन्म प्रमाण/i, 4], [/registration of births|जन्म.{0,10}पंजीकरण/i, 2], [/place of birth|जन्म स्थान/i, 1]],
  marksheet: [
    [/mark\s*sheet|marks?\s*statement|अंक\s*तालिका|अंकतालिका/i, 4],
    [/board of secondary education|secondary education|माध्यमिक शिक्षा बोर्ड|\bBSER\b|\bCBSE\b|central board of secondary/i, 3],
    [/roll\s*no|अनुक्रमांक/i, 1], [/\bsubjects?\b|विषय/i, 1], [/total marks|पूर्णांक|division|श्रेणी|percentage|प्रतिशत/i, 1],
  ],
  school_certificate: [[/transfer certificate|school leaving|स्थानांतरण प्रमाण/i, 4], [/bona\s*fide student|अध्ययनरत/i, 3]],
  electricity_bill: [
    [/electricity|vidyut|विद्युत|बिजली/i, 2], [/jvvnl|avvnl|jdvvnl|vitran nigam|वितरण निगम|discom/i, 3],
    [/\bk\.?\s*no\b|consumer\s*(no|number|id)|उपभोक्ता/i, 2], [/units?\s*consumed|kwh|meter\s*no|मीटर/i, 1],
    [/bill\s*(date|month)|due\s*date|बिल\s*दिनांक/i, 1],
  ],
  water_bill: [[/water\s*bill|पानी\s*का\s*बिल|phed|जल\s*(कर|बिल|विभाग)|पेयजल/i, 4]],
  bank_passbook: [
    [/passbook|पासबुक|statement of account|account statement/i, 3], [/\bifsc\b/i, 2],
    [/(a\/c|account)\s*(no|number)|खाता\s*(सं|नं)/i, 1], [/withdrawal|deposit|balance/i, 1],
  ],
  rent_agreement: [[/rent\s*agreement|lease deed|किरायानामा/i, 4], [/landlord|tenant|किरायेदार|मकान मालिक/i, 2]],
  land_record: [[/jamabandi|जमाबंदी|khasra|खसरा|khatauni|खतौनी/i, 4], [/patwar|पटवार|apna\s*khata|अपना खाता/i, 2]],
  income_certificate: [[/income certificate|आय\s*प्रमाण/i, 4], [/annual income|वार्षिक आय/i, 2]],
  caste_certificate: [
    [/caste certificate|जाति\s*प्रमाण/i, 4],
    [/scheduled caste|scheduled tribe|other backward|most backward|अनुसूचित|पिछड़ा वर्ग/i, 2],
  ],
  domicile_certificate: [[/mool\s*niwas|मूल\s*निवास/i, 4], [/domicile|bona\s*fide resident/i, 2]],
};

function detectDocType(text) {
  const t = String(text || '');
  const scores = {};
  for (const [type, signals] of Object.entries(DOC_SIGNALS)) {
    let score = 0;
    for (const [rx, w] of signals) if (rx.test(t)) score += w;
    if (score > 0) scores[type] = score;
  }
  // A domicile/income/caste *certificate* also mentions identity words; prefer certificates when strongly matched.
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { type: 'other', confidence: 0, scores };
  const [bestType, best] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 0;
  const confidence = Math.max(0.3, Math.min(0.95, 0.35 + best * 0.08 + (best - second) * 0.05));
  return { type: bestType, confidence: Math.round(confidence * 100) / 100, scores };
}

// ── Text helpers ─────────────────────────────────────────────────────────────

function lines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const NAME_STOP = /\b(government|govt|india|bharat|republic|department|authority|income|tax|card|election|commission|identity|address|male|female|dob|birth|year|signature|valid|issue|date|aadhaar|aadhar|permanent|account|number|father|mother|husband|name|elector|unique|identification|enrolment|enrollment|help|www|uidai|board|examination|school|roll|vid)\b/i;

function cleanPersonName(raw) {
  if (!raw) return null;
  let s = String(raw)
    .replace(/\b(s\/o|d\/o|w\/o|c\/o)\b.*$/i, '')   // cut "Amit Kumar S/O ..." tails
    .replace(/[|_*:;"'`~^<>{}[\]\\=+]/g, ' ')
    .replace(/[0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[-.,\s]+|[-.,\s]+$/g, '');
  if (!s) return null;
  const words = s.split(' ');
  if (words.length > 6 || s.length < 3 || s.length > 60) return null;
  const isDevanagari = /[ऀ-ॿ]/.test(s);
  if (!isDevanagari) {
    if (!/^[A-Za-z][A-Za-z .'-]*$/.test(s)) return null;
    if (NAME_STOP.test(s)) return null;
    return V.titleCase(s);
  }
  return s;
}

// Words that only form labels ("पिता का नाम / Father's Name") — never values.
const LABEL_ONLY = /^[\s/|:.\-]*((father|mother|husband|elector|candidate|holder|consumer|applicant)'?s?|name|of|the|नाम|पिता|माता|पति|का|की|के|\/|\s)*$/i;

/** Text that follows a label on the same line (after ":" if present). */
function sameLineValue(line, m) {
  const colon = line.indexOf(':', m.index);
  const raw = colon !== -1 && colon - (m.index + m[0].length) < 25
    ? line.slice(colon + 1)
    : line.slice(m.index + m[0].length);
  const v = raw.replace(/^[\s:.\-/|]+/, '').trim();
  return LABEL_ONLY.test(v) ? '' : v;
}

function afterLabel(text, labelRx, { maxLen = 80, sameLineOnly = false } = {}) {
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(labelRx);
    if (!m) continue;
    const rest = sameLineValue(ls[i], m);
    if (rest) return rest.slice(0, maxLen);
    if (!sameLineOnly && ls[i + 1]) return ls[i + 1].slice(0, maxLen);
  }
  return null;
}

/** First valid person name printed after a label (same line or the next line). */
function labelledName(text, labelRx) {
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(labelRx);
    if (!m) continue;
    const candidate = cleanPersonName(sameLineValue(ls[i], m)) || cleanPersonName(ls[i + 1]);
    if (candidate) return candidate;
  }
  return null;
}

function firstMatch(text, rx, group = 1) {
  const m = String(text || '').match(rx);
  return m ? m[group] : null;
}

// ── Individual field extractors ──────────────────────────────────────────────

function extractAadhaar(text) {
  const t = String(text || '');
  const candidates = [];
  const rx = /(?<!\d[\s-]?)\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b(?![\s-]?\d{4})/g;
  let m;
  while ((m = rx.exec(t)) !== null) candidates.push(m[1] + m[2] + m[3]);
  const valid = candidates.filter(V.isValidAadhaar);
  if (valid.length) return { value: V.formatAadhaar(valid[0]), confidence: 0.97, validated: true };
  const shaped = candidates.find((c) => /^[2-9]/.test(c));
  if (shaped) return { value: V.formatAadhaar(shaped), confidence: 0.35, validated: false, warning: 'aadhaar_checksum_failed' };
  return null;
}

function extractVID(text) {
  const m = String(text || '').match(/\b(\d{4})\s(\d{4})\s(\d{4})\s(\d{4})\b/);
  return m ? m.slice(1).join(' ') : null;
}

function extractPAN(text) {
  const tokens = String(text || '').toUpperCase().match(/\b[A-Z0-9]{10}\b/g) || [];
  for (const tok of tokens) {
    if (V.isValidPAN(tok)) return { value: tok, confidence: 0.96, validated: true };
  }
  for (const tok of tokens) {
    const fixed = V.repairPAN(tok);
    if (fixed && /[A-Z]{3}/.test(tok.slice(0, 3))) return { value: fixed, confidence: 0.8, validated: true, repaired: true };
  }
  return null;
}

function extractEPIC(text) {
  const up = String(text || '').toUpperCase();
  const labelled = afterLabel(up, /(EPIC\s*NO|ELECTOR'?S?\s*PHOTO\s*IDENTITY\s*CARD\s*NO|CARD\s*NO|मतदाता\s*पहचान\s*पत्र\s*सं)/i, { sameLineOnly: true });
  const pool = [labelled, up].filter(Boolean);
  for (const src of pool) {
    const m = src.match(/\b([A-Z]{3})\s?([0-9O]{7})\b/);
    if (m) {
      const value = m[1] + m[2].replace(/O/g, '0');
      if (V.isValidEPIC(value)) return { value, confidence: labelled ? 0.9 : 0.8, validated: true };
    }
    const old = src.match(/\b([A-Z]{2}\/\d{2}\/\d{3}\/\d{5,7})\b/);
    if (old) return { value: old[1], confidence: 0.8, validated: true };
  }
  return null;
}

function extractDL(text) {
  const up = String(text || '').toUpperCase();
  const m = up.match(/\b([A-Z]{2})[-\s]?(\d{2})[-\s]?((?:19|20)\d{2})[-\s]?(\d{7})\b/);
  if (m) return { value: `${m[1]}${m[2]} ${m[3]}${m[4]}`, confidence: 0.88, validated: true };
  const labelled = afterLabel(up, /(DL\s*NO|LICEN[CS]E\s*NO)/i, { sameLineOnly: true });
  if (labelled) {
    const v = labelled.match(/[A-Z]{2}[-\s]?\d{2}[-\s]?\d{6,13}/);
    if (v) return { value: v[0].replace(/\s+/g, ' '), confidence: 0.7, validated: false };
  }
  return null;
}

function extractPassport(text) {
  const t = String(text || '').toUpperCase();
  // MRZ line 2: passport no (9) + check + nationality (3) + DOB YYMMDD + check + sex + expiry YYMMDD
  const mrz = t.replace(/ /g, '').match(/([A-Z0-9<]{9})(\d)IND(\d{6})(\d)([MFX<])(\d{6})/);
  if (mrz) {
    const yy = parseInt(mrz[3].slice(0, 2), 10);
    const century = yy > (new Date().getFullYear() % 100) ? 1900 : 2000;
    const dob = `${mrz[3].slice(4, 6)}/${mrz[3].slice(2, 4)}/${century + yy}`;
    const ey = 2000 + parseInt(mrz[6].slice(0, 2), 10);
    return {
      value: mrz[1].replace(/</g, ''), confidence: 0.93, validated: true,
      extra: { dob, gender: mrz[5] === 'M' ? 'Male' : mrz[5] === 'F' ? 'Female' : null, date_of_expiry: `${mrz[6].slice(4, 6)}/${mrz[6].slice(2, 4)}/${ey}` },
    };
  }
  const m = t.match(/\b([A-Z][1-9]\d{6})\b/);
  if (m && /passport/i.test(t)) return { value: m[1], confidence: 0.75, validated: false };
  return null;
}

const DATE_RX = /(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4}|\d{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{4})/;

function extractLabelledDate(text, labelRx) {
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    if (!labelRx.test(ls[i])) continue;
    const here = ls[i].match(DATE_RX) || (ls[i + 1] && ls[i + 1].match(DATE_RX));
    if (here) {
      const norm = V.normaliseDate(here[1]);
      if (V.parseDate(norm)) return norm;
    }
  }
  return null;
}

function extractDOB(text, docType) {
  const labelled = extractLabelledDate(text, /(d\.?\s?o\.?\s?b|date\s*of\s*birth|birth\s*date|जन्म\s*(तिथि|दिनांक|तारीख)|जन्मतिथि)/i);
  if (labelled) {
    const age = V.ageOn(labelled);
    if (age !== null && age >= 0 && age <= 120) return { value: labelled, confidence: 0.85 };
  }
  const yob = firstMatch(text, /(year\s*of\s*birth|yob|जन्म\s*वर्ष)\s*[:\-/]?\s*((?:19|20)\d{2})/i, 2);
  if (yob) return { value: yob, confidence: 0.75, yearOnly: true };
  if (['pan', 'aadhaar', 'birth_certificate'].includes(docType)) {
    const all = String(text || '').match(new RegExp(DATE_RX.source, 'g')) || [];
    for (const d of all) {
      const norm = V.normaliseDate(d);
      const age = V.ageOn(norm);
      if (age !== null && age >= 0 && age <= 110) return { value: norm, confidence: 0.55 };
    }
  }
  return null;
}

function extractGender(text) {
  const t = String(text || '');
  if (/\bfemale\b|महिला|स्त्री/i.test(t)) return { value: 'Female', confidence: 0.85 };
  if (/\btransgender\b|ट्रांसजेंडर/i.test(t)) return { value: 'Transgender', confidence: 0.85 };
  if (/\bmale\b|पुरुष/i.test(t)) return { value: 'Male', confidence: 0.85 };
  return null;
}

function extractMobile(text, excludeDigits = []) {
  const labelled = firstMatch(text, /(mobile|mob\.?|phone|ph\.?|मोबाइल|फोन)\s*(no\.?|number|नं\.?)?\s*[:\-]?\s*(\+?91[\s-]?)?([6-9]\d{4}\s?\d{5})/i, 4);
  if (labelled) return { value: V.normaliseMobile(labelled), confidence: 0.85 };
  const all = String(text || '').match(/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g) || [];
  const found = all.map(V.normaliseMobile).find((d) => d.length === 10 && !excludeDigits.some((x) => x.includes(d)));
  return found ? { value: found, confidence: 0.55 } : null;
}

function extractPincode(text, address) {
  const fromAddr = V.findPins(address || '');
  if (fromAddr.length) return { value: fromAddr[fromAddr.length - 1], confidence: 0.85 };
  const labelled = firstMatch(text, /(pin\s*(code)?|पिन\s*(कोड)?)\s*[:\-]?\s*(\d{3}\s?\d{3})/i, 4);
  if (labelled) return { value: labelled.replace(/\s/g, ''), confidence: 0.85 };
  return null;
}

const ADDRESS_END = /(\b[1-8]\d{2}\s?\d{3}\b|help@uidai|www\.|1947|aadhaar|आधार|signature|हस्ताक्षर)/i;

function extractAddress(text) {
  const ls = lines(text);
  const startIdx = ls.findIndex((l) => /^(address|पता|addr\.?|residential address|पता\s*[:])/i.test(l) || /\b(address|पता)\s*[:]/i.test(l));
  if (startIdx === -1) return null;
  const parts = [];
  const first = ls[startIdx].replace(/.*?(address|पता)\s*[:\-]?\s*/i, '').trim();
  if (first) parts.push(first);
  for (let i = startIdx + 1; i < Math.min(ls.length, startIdx + 7); i++) {
    if (/^(dob|date of birth|male|female|mobile|phone|vid|enrolment)/i.test(ls[i])) break;
    parts.push(ls[i]);
    if (ADDRESS_END.test(ls[i])) break;
  }
  const latin = parts.filter((p) => /[A-Za-z]/.test(p) && !/[ऀ-ॿ]/.test(p));
  const chosen = latin.length >= Math.ceil(parts.length / 2) ? latin : parts;
  const address = chosen.join(', ').replace(/\s*,\s*,+/g, ', ').replace(/\s{2,}/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();
  if (address.length < 10) return null;
  const hindiParts = parts.filter((p) => /[ऀ-ॿ]/.test(p));
  return {
    value: address.slice(0, 300),
    hindi: hindiParts.length ? hindiParts.join(', ').slice(0, 300) : null,
    confidence: 0.7,
  };
}

const STATES = ['Rajasthan', 'Uttar Pradesh', 'Madhya Pradesh', 'Gujarat', 'Haryana', 'Punjab', 'Delhi',
  'Maharashtra', 'Bihar', 'Uttarakhand', 'Himachal Pradesh', 'Jharkhand', 'Chhattisgarh', 'West Bengal',
  'Odisha', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Andhra Pradesh', 'Assam', 'Jammu and Kashmir'];

/** Split an Indian address into components (best-effort). */
function parseAddressComponents(address) {
  if (!address) return {};
  const out = {};
  const pins = V.findPins(address);
  if (pins.length) out.pincode = pins[pins.length - 1];
  const state = STATES.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(address)) || (/राजस्थान/.test(address) ? 'Rajasthan' : null);
  if (state) out.state = state;
  else if (out.pincode && V.isRajasthanPin(out.pincode)) out.state = 'Rajasthan';

  const parts = address.split(/,|\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.replace(/\b[1-8]\d{2}\s?\d{3}\b/, '').replace(/-\s*$/, '').trim()).filter(Boolean);

  const distLabel = address.match(/\b(?:dist(?:rict)?|distt|जिला)\.?\s*[:\-]?\s*([A-Za-zऀ-ॿ ]{3,30})/i);
  if (distLabel) out.district = V.titleCase(distLabel[1].replace(/\b(state|rajasthan|pin.*)$/i, '').trim());
  if (!out.district && (out.state === 'Rajasthan' || !out.state)) {
    const d = V.findRajasthanDistrict(address);
    if (d) out.district = d;
  }
  const teh = address.match(/\b(?:teh(?:sil)?|sub[\s-]?district|तहसील)\.?\s*[:\-]?\s*([A-Za-zऀ-ॿ ]{3,30})/i);
  if (teh) out.tehsil = V.titleCase(teh[1].trim());
  const po = address.match(/\b(?:p\.?\s?o\.?|post(?:\s*office)?|डाकघर)\s*[:\-]?\s*([A-Za-zऀ-ॿ ]{3,30})/i);
  if (po) out.post_office = V.titleCase(po[1].trim());

  const house = parts.find((p) => /^(h\.?\s?no\.?|house|plot|flat|म\.?\s?न\.?|#)?\s*[\dA-Z]{1,6}([\/-]\d+)?\b/i.test(p) && /\d/.test(p) && p.length <= 30);
  if (house) out.house_no = house.replace(/^(h\.?\s?no\.?|house\s*no\.?|plot\s*no\.?)\s*[:\-]?\s*/i, '').trim();

  // village / city: the part just before the district/state parts, if it is not the house part
  const clean = parts.filter((p) => !/^(s\/o|d\/o|w\/o|c\/o)\b/i.test(p));
  const idxState = clean.findIndex((p) => STATES.some((s) => new RegExp(`\\b${s}\\b`, 'i').test(p)));
  const idxDist = out.district ? clean.findIndex((p) => p.toLowerCase().includes(out.district.toLowerCase())) : -1;
  const anchor = idxDist > 0 ? idxDist : idxState > 0 ? idxState : -1;
  if (anchor > 0) {
    const cand = clean[anchor - 1];
    if (cand && cand !== house && !/\d{3,}/.test(cand) && cand.length <= 40) out.village_city = V.titleCase(cand.replace(/^(vill(age)?|vpo|po|ग्राम)\.?\s*[:\-]?\s*/i, ''));
    const streetCand = clean.slice(house ? clean.indexOf(house) + 1 : 0, anchor - 1).join(', ');
    if (streetCand && streetCand.length <= 80) out.street = streetCand;
  }
  return out;
}

function extractRelations(text) {
  const out = {};
  const t = String(text || '');
  // "S/O, D/O, W/O: X" (driving licence) does not tell us which relation it is.
  const ambiguousRelation = /s\/o\s*,\s*d\/o\s*,\s*w\/o/i.test(t);
  const fatherClean = labelledName(t, /(father'?s?\s*name|पिता\s*का\s*नाम|पिता\s*\/\s*पति\s*का\s*नाम|father\s*\/\s*husband)/i)
    || (!ambiguousRelation && cleanPersonName(firstMatch(t, /\b(?:s\/o|d\/o|son of|daughter of)\s*[:\-]?\s*([A-Za-z .]{3,40})/i)));
  if (fatherClean) out.father_name = { value: fatherClean, confidence: 0.8 };

  const motherClean = labelledName(t, /(mother'?s?\s*name|माता\s*का\s*नाम)/i);
  if (motherClean) out.mother_name = { value: motherClean, confidence: 0.8 };

  const husbandClean = labelledName(t, /(husband'?s?\s*name|पति\s*का\s*नाम)/i)
    || (!ambiguousRelation && cleanPersonName(firstMatch(t, /\b(?:w\/o|wife of)\s*[:\-]?\s*([A-Za-z .]{3,40})/i)));
  if (husbandClean) out.husband_name = { value: husbandClean, confidence: 0.78 };

  if (ambiguousRelation) {
    const rel = cleanPersonName(firstMatch(t, /s\/o\s*,\s*d\/o\s*,\s*w\/o\s*[:\-]?\s*([A-Za-z .]{3,40})/i));
    if (rel) out._relation_name = { value: rel, confidence: 0.6 };
  }
  return out;
}

// Longest alternatives first so "Name of Candidate" is consumed as one label.
const NAME_LABEL = /^(?!.*(father|mother|husband|पिता|माता|पति|school|college|bank|branch))(?:.*?)(name of (the )?(candidate|student|applicant)|candidate'?s?\s*name|elector'?s?\s*name|student'?s?\s*name|applicant'?s?\s*name|consumer\s*name|holder\s*name|परीक्षार्थी\s*का\s*नाम|निर्वाचक\s*का\s*नाम|आवेदक\s*का\s*नाम|name|नाम)\s*[:\-/]?/i;

function extractApplicantName(text, docType) {
  const ls = lines(text);
  // 1. labelled
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(NAME_LABEL);
    if (!m) continue;
    const candidate = cleanPersonName(sameLineValue(ls[i], m)) || cleanPersonName(ls[i + 1]);
    if (candidate) return { value: candidate, confidence: 0.82 };
  }
  // 2. Aadhaar / PAN layout: English name line just above the DOB / gender line
  if (['aadhaar', 'pan', 'driving_license'].includes(docType)) {
    const dobIdx = ls.findIndex((l) => /(dob|date of birth|year of birth|जन्म)/i.test(l));
    const anchor = dobIdx > 0 ? dobIdx : ls.findIndex((l) => /\b(male|female)\b/i.test(l));
    for (let i = anchor - 1; i >= Math.max(0, anchor - 4); i--) {
      const candidate = cleanPersonName(ls[i]);
      if (candidate && /[A-Za-z]/.test(candidate) && candidate.split(' ').length >= 2) {
        return { value: candidate, confidence: 0.6, index: i };
      }
    }
    if (docType === 'pan') {
      const caps = ls.filter((l) => /^[A-Z][A-Z .]{3,40}$/.test(l) && !NAME_STOP.test(l));
      if (caps[0]) return { value: V.titleCase(caps[0]), confidence: 0.55 };
    }
  }
  return null;
}

function extractHindiName(text, englishNameIndex) {
  const ls = lines(text);
  const range = englishNameIndex !== undefined ? [englishNameIndex - 1, englishNameIndex - 2] : [];
  for (const i of range) {
    const l = ls[i];
    if (l && /^[ऀ-ॿ\s.]{3,40}$/.test(l) && !/(भारत|सरकार|आधार|पहचान|जन्म|पुरुष|महिला|पिता)/.test(l)) {
      return { value: l.trim(), confidence: 0.6 };
    }
  }
  return null;
}

function extractIssueDate(text) {
  return extractLabelledDate(text, /(date\s*of\s*issue|issue\s*date|issued\s*on|\bd\.?o\.?i\b|जारी\s*(करने\s*की)?\s*(तिथि|दिनांक)|दिनांक)/i);
}

function extractBillDate(text) {
  const d = extractLabelledDate(text, /(bill\s*(date|dt)|billing\s*date|बिल\s*(दिनांक|तिथि)|issue\s*date)/i);
  if (d) return d;
  const month = String(text || '').match(/(bill(ing)?\s*month|बिल\s*माह)\s*[:\-]?\s*([A-Za-z]{3,9})[\s\-/']*(\d{2,4})/i);
  if (month) {
    const y = month[4].length === 2 ? 2000 + parseInt(month[4], 10) : parseInt(month[4], 10);
    return `01/${String(monthIndex(month[3])).padStart(2, '0')}/${y}`;
  }
  return null;
}

function monthIndex(name) {
  const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(String(name).slice(0, 3).toLowerCase());
  return i === -1 ? 1 : i + 1;
}

function extractMarksheet(text) {
  const t = String(text || '');
  const out = {};
  let cls = null;
  if (/senior secondary|higher secondary|उच्च\s*माध्यमिक|class\s*(xii|12)|\b12th\b|intermediate/i.test(t)) cls = '12';
  else if (/secondary school|secondary examination|माध्यमिक\s*(परीक्षा|शिक्षा)|class\s*(x|10)\b|\b10th\b|high school|matric/i.test(t)) cls = '10';
  if (cls) out.class_level = { value: cls, confidence: 0.8 };

  let board = null;
  if (/board of secondary education,?\s*rajasthan|माध्यमिक\s*शिक्षा\s*बोर्ड\s*,?\s*राजस्थान|\bBSER\b|\bRBSE\b/i.test(t)) board = 'Board of Secondary Education, Rajasthan';
  else if (/central board of secondary education|\bCBSE\b/i.test(t)) board = 'CBSE';
  else if (/\bICSE\b|\bCISCE\b/i.test(t)) board = 'CISCE';
  else if (/uttar pradesh|upmsp/i.test(t)) board = 'UP Board';
  if (board) out.board = { value: board, confidence: 0.85 };

  const year = firstMatch(t, /(?:examination|exam|परीक्षा|year\s*of\s*passing|passing\s*year|session|सत्र)\D{0,25}((?:19[89]|20[0-4])\d)/i);
  if (year) out.year_of_passing = { value: year, confidence: 0.75 };

  const roll = firstMatch(t, /(?:roll\s*no\.?|roll\s*number|अनुक्रमांक)\s*[:\-]?\s*([A-Z0-9]{4,12})/i);
  if (roll) out.roll_number = { value: roll, confidence: 0.8 };

  const school = afterLabel(t, /(school|college|विद्यालय|institution|centre)\s*(name)?\s*[:\-]/i, { sameLineOnly: true });
  if (school && school.length >= 5) out.school_college = { value: school.replace(/\s{2,}/g, ' ').slice(0, 100), confidence: 0.65 };

  const pct = firstMatch(t, /(\d{2}(?:\.\d{1,2})?)\s*%/) || firstMatch(t, /(?:percentage|प्रतिशत)\s*[:\-]?\s*(\d{2}(?:\.\d{1,2})?)/i);
  if (pct && parseFloat(pct) <= 100) out.percentage = { value: `${pct}%`, confidence: 0.7 };

  const div = firstMatch(t, /\b(first|second|third|1st|2nd|3rd|distinction|प्रथम|द्वितीय|तृतीय)\s*(division|श्रेणी)/i);
  if (div) out.division = { value: V.titleCase(div), confidence: 0.7 };
  return out;
}

function extractCategory(text) {
  const t = String(text || '');
  if (/scheduled tribe|अनुसूचित\s*जनजाति|\bS\.?T\.?\b(?=.*(caste|जाति|category|वर्ग))/i.test(t)) return { value: 'ST', confidence: 0.8 };
  if (/scheduled caste|अनुसूचित\s*जाति/i.test(t)) return { value: 'SC', confidence: 0.8 };
  if (/most backward|अति\s*पिछड़ा|\bM\.?B\.?C\.?\b/i.test(t)) return { value: 'MBC', confidence: 0.75 };
  if (/other backward|अन्य\s*पिछड़ा|\bO\.?B\.?C\.?\b/i.test(t)) return { value: 'OBC', confidence: 0.75 };
  return null;
}

function extractIncome(text) {
  const m = String(text || '').match(/(annual\s*(family\s*)?income|वार्षिक\s*आय|आय)\D{0,40}?(?:rs\.?|₹|inr|रु\.?)?\s*([\d,]{4,12}(?:\.\d{1,2})?)/i);
  if (m) {
    const amount = V.parseAmount(m[3]);
    if (amount && amount >= 1000 && amount <= 100000000) return { value: amount, confidence: 0.75 };
  }
  return null;
}

function extractBank(text) {
  const out = {};
  const t = String(text || '');
  const ifsc = (t.toUpperCase().match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/) || [])[0];
  if (ifsc && V.isValidIFSC(ifsc)) out.ifsc_code = { value: ifsc, confidence: 0.9 };
  const acc = firstMatch(t, /(?:a\/c|account|खाता)\s*(?:no|number|सं(?:ख्या)?|नं)\.?\s*[:\-]?\s*(\d[\d\s]{8,20}\d)/i);
  if (acc) {
    const digits = acc.replace(/\s/g, '');
    if (digits.length >= 9 && digits.length <= 18) out.account_number = { value: digits, confidence: 0.8 };
  }
  const bank = t.match(/\b(state bank of india|punjab national bank|bank of baroda|bank of india|canara bank|union bank of india|central bank of india|indian bank|uco bank|icici bank|hdfc bank|axis bank|kotak mahindra bank|idbi bank|yes bank|au small finance bank|baroda rajasthan kshetriya gramin bank|rajasthan marudhara gramin bank|india post payments bank|bank of maharashtra|indian overseas bank|punjab (&|and) sind bank)\b/i);
  if (bank) out.bank_name = { value: V.titleCase(bank[1]), confidence: 0.85 };
  return out;
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Extract fields locally from OCR text.
 * @returns {{ fields: Object, meta: Object, evidence: Object, warnings: string[] }}
 */
function extractLocal(text, docType) {
  const fields = {};
  const meta = {};
  const warnings = [];
  const put = (key, res, extra = {}) => {
    if (!res || res.value === null || res.value === undefined || res.value === '') return;
    fields[key] = res.value;
    meta[key] = { confidence: res.confidence, method: 'local', validated: !!res.validated, ...extra };
  };

  const t = String(text || '');
  const aadhaar = extractAadhaar(t);
  // On other documents a 12-digit number is often a consumer/K number or an
  // account number — accept it as Aadhaar only if the checksum passes.
  if (aadhaar && (aadhaar.validated || docType === 'aadhaar' || docType === 'jan_aadhaar')) {
    put('id_number', aadhaar);
    if (aadhaar.warning) warnings.push(aadhaar.warning);
  }
  if (extractVID(t) && docType === 'aadhaar') warnings.push('vid_present');

  if (['pan', 'other', 'bank_passbook', 'income_certificate'].includes(docType) || /permanent account|आयकर/i.test(t)) {
    put('pan', extractPAN(t));
  }
  if (docType === 'voter_id') put('voter_id', extractEPIC(t));
  if (docType === 'driving_license') put('driving_license', extractDL(t));
  if (docType === 'passport') {
    const p = extractPassport(t);
    if (p) {
      put('passport_number', p);
      if (p.extra?.dob) put('dob', { value: p.extra.dob, confidence: 0.9, validated: true });
      if (p.extra?.gender) put('gender', { value: p.extra.gender, confidence: 0.9 });
      if (p.extra?.date_of_expiry) fields._date_of_expiry = p.extra.date_of_expiry;
    }
  }

  const name = extractApplicantName(t, docType);
  if (name) {
    put('name', name);
    const hi = extractHindiName(t, name.index);
    if (hi) put('name_hi', hi);
  }
  const rel = extractRelations(t);
  for (const [k, v] of Object.entries(rel)) put(k, v);

  if (!fields.dob) put('dob', extractDOB(t, docType));
  if (!fields.gender) put('gender', extractGender(t));

  const addr = extractAddress(t);
  if (addr) {
    put('address', addr);
    if (addr.hindi) put('address_hi', { value: addr.hindi, confidence: 0.55 });
    const comps = parseAddressComponents(addr.value);
    for (const [k, v] of Object.entries(comps)) put(k, { value: v, confidence: k === 'pincode' ? 0.85 : 0.6 });
  }
  if (!fields.pincode) put('pincode', extractPincode(t, addr?.value));

  const excludeDigits = [String(fields.id_number || '').replace(/\D/g, '')];
  put('phone', extractMobile(t, excludeDigits));

  if (docType === 'marksheet') {
    const mk = extractMarksheet(t);
    for (const [k, v] of Object.entries(mk)) put(`_marks_${k}`, v);
  }
  if (['caste_certificate', 'jan_aadhaar', 'ration_card', 'school_certificate', 'marksheet'].includes(docType)) {
    put('caste_category', extractCategory(t));
    const caste = afterLabel(t, /^(caste|जाति)\s*[:\-]/i, { sameLineOnly: true });
    if (caste && caste.length <= 30 && !/certificate|प्रमाण/i.test(caste)) put('caste', { value: V.titleCase(caste), confidence: 0.7 });
  }
  if (['income_certificate', 'jan_aadhaar', 'ration_card'].includes(docType)) put('annual_income', extractIncome(t));
  if (['bank_passbook'].includes(docType)) {
    for (const [k, v] of Object.entries(extractBank(t))) put(k, v);
  }
  if (docType === 'jan_aadhaar') {
    const ja = firstMatch(t, /(?:jan\s*-?\s*aadhaar|जन\s*-?\s*आधार)\s*(?:id|no\.?|number|संख्या|नंबर)?\s*[:\-]?\s*([A-Z0-9]{8,14})/i);
    if (ja) put('jan_aadhaar_id', { value: ja.toUpperCase(), confidence: 0.75 });
  }
  if (docType === 'ration_card') {
    const rc = firstMatch(t, /(?:ration\s*card\s*(?:no|number)|राशन\s*कार्ड\s*(?:सं|नं)[^\s:]*)\s*[:\-]?\s*([A-Z0-9/-]{6,20})/i);
    if (rc) put('ration_card_number', { value: rc.toUpperCase(), confidence: 0.75 });
  }
  if (docType === 'birth_certificate') {
    const pob = afterLabel(t, /(place\s*of\s*birth|जन्म\s*स्थान)/i, { sameLineOnly: true });
    if (pob && pob.length >= 3) put('birth_place', { value: pob.slice(0, 80), confidence: 0.75 });
  }

  // Evidence used by the residence check
  const evidence = {
    issue_date: extractIssueDate(t),
    bill_date: ['electricity_bill', 'water_bill'].includes(docType) ? extractBillDate(t) : null,
  };
  return { fields, meta, evidence, warnings };
}

module.exports = {
  detectDocType, extractLocal, parseAddressComponents, cleanPersonName,
  // exported for tests
  _internal: {
    extractAadhaar, extractPAN, extractEPIC, extractDL, extractPassport, extractDOB, extractGender,
    extractMobile, extractAddress, extractRelations, extractApplicantName, extractMarksheet,
    extractCategory, extractIncome, extractBank, extractIssueDate, extractBillDate,
  },
};
