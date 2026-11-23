/**
 * services/validators.js — format checks and normalisers for Indian documents.
 *
 * These run locally (no internet, no AI) and are used to:
 *   - pick out ID numbers from OCR text with high confidence
 *   - check values the AI returned
 *   - compare values across documents fairly (e.g. "AMIT  KUMAR" == "Amit Kumar")
 */

'use strict';

const { RAJASTHAN_DISTRICTS, PIN_PREFIX_STATE } = require('../config/catalog');

// ── Aadhaar (Verhoeff checksum) ─────────────────────────────────────────────

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function verhoeffValid(numStr) {
  const digits = String(numStr).replace(/\D/g, '');
  if (!digits) return false;
  let c = 0;
  const arr = digits.split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][arr[i]]];
  return c === 0;
}

/** Compute the Verhoeff check digit for a digit string (used to make test data). */
function verhoeffCheckDigit(numStr) {
  let c = 0;
  const arr = String(numStr).split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][arr[i]]];
  return VERHOEFF_INV[c];
}

function isValidAadhaar(value) {
  const d = String(value || '').replace(/\D/g, '');
  // Aadhaar numbers are 12 digits and never start with 0 or 1.
  return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d);
}

function formatAadhaar(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 12 ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : String(value || '').trim();
}

function maskAadhaar(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length >= 4 ? `XXXX XXXX ${d.slice(-4)}` : 'XXXX';
}

// ── Other IDs ───────────────────────────────────────────────────────────────

// 4th character = holder type; P = individual.
const PAN_RX = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;
function isValidPAN(value) {
  return PAN_RX.test(String(value || '').toUpperCase().replace(/\s/g, ''));
}
function isIndividualPAN(value) {
  const v = String(value || '').toUpperCase();
  return isValidPAN(v) && v[3] === 'P';
}

/** Fix the usual OCR confusions inside a PAN-shaped token (letters/digits by position). */
function repairPAN(token) {
  const t = String(token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 10) return null;
  const toLetter = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G' };
  const toDigit = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
  const chars = t.split('');
  for (let i = 0; i < 10; i++) {
    const letterPos = i < 5 || i === 9;
    if (letterPos && /\d/.test(chars[i])) chars[i] = toLetter[chars[i]] || chars[i];
    if (!letterPos && /[A-Z]/.test(chars[i])) chars[i] = toDigit[chars[i]] || chars[i];
  }
  const fixed = chars.join('');
  return isValidPAN(fixed) ? fixed : null;
}

// EPIC: modern format is 3 letters + 7 digits. Older cards use e.g. RJ/12/345/678901.
const EPIC_RX = /^[A-Z]{3}\d{7}$/;
const EPIC_OLD_RX = /^[A-Z]{2}\/\d{2}\/\d{3}\/\d{5,7}$/;
function isValidEPIC(value) {
  const v = String(value || '').toUpperCase().replace(/\s/g, '');
  return EPIC_RX.test(v) || EPIC_OLD_RX.test(v);
}

function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(normaliseMobile(value));
}
function normaliseMobile(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function isValidPincode(value) {
  return /^[1-9]\d{5}$/.test(String(value || '').replace(/\s/g, ''));
}

function isValidIFSC(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || '').toUpperCase().replace(/\s/g, ''));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/**
 * Parse common Indian date formats. Returns { d, m, y } or { y } (year only)
 * or null. Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD,
 * "15 Mar 1992", "Year of Birth: 1992".
 */
function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]+([A-Za-z]{3,9})[\s\-/,]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return validDate(+m[1], MONTHS[m[2].toLowerCase()], +m[3]);
  m = s.match(/^\D*((?:19|20)\d{2})\D*$/);
  if (m) {
    const y = +m[1];
    if (y >= 1900 && y <= new Date().getFullYear()) return { y };
  }
  return null;
}

function validDate(d, mo, y) {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null; // e.g. 31/02
  return { d, m: mo, y };
}

function formatDate(parsed) {
  if (!parsed) return null;
  if (!parsed.d) return String(parsed.y);
  return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
}

/** Normalise to DD/MM/YYYY (or YYYY if only the year is known). */
function normaliseDate(value) {
  return formatDate(parseDate(value)) || (value ? String(value).trim() : null);
}

function ageOn(dobValue, onDate = new Date()) {
  const p = parseDate(dobValue);
  if (!p) return null;
  if (!p.d) return onDate.getFullYear() - p.y; // year of birth only — approximate
  let age = onDate.getFullYear() - p.y;
  const beforeBirthday = onDate.getMonth() + 1 < p.m || (onDate.getMonth() + 1 === p.m && onDate.getDate() < p.d);
  if (beforeBirthday) age -= 1;
  return age;
}

function isFutureDate(value) {
  const p = parseDate(value);
  if (!p) return false;
  const dt = new Date(p.y, (p.m || 1) - 1, p.d || 1);
  return dt.getTime() > Date.now() + 24 * 3600 * 1000;
}

// ── Names & comparison helpers ───────────────────────────────────────────────

const HONORIFICS = /\b(shri|shree|sri|smt|shrimati|kumari|km|kum|mr|mrs|ms|miss|dr|late|sh|sushri|selvi)\b\.?/gi;

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(HONORIFICS, ' ')
    .replace(/[^a-zऀ-ॿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[\s\-.'])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase()).trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity for names; tolerant of word order and small OCR errors. */
function nameSimilarity(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tx = x.split(' ');
  const ty = y.split(' ');
  // token match with 1-edit tolerance for longer tokens
  const matched = tx.filter((t) => ty.some((u) => u === t || (t.length >= 4 && u.length >= 4 && levenshtein(t, u) <= 1))).length;
  const tokenScore = (2 * matched) / (tx.length + ty.length);
  const sx = tx.slice().sort().join(' ');
  const sy = ty.slice().sort().join(' ');
  const charScore = 1 - levenshtein(sx, sy) / Math.max(sx.length, sy.length);
  return Math.max(tokenScore, charScore);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Normalise any field value for cross-document comparison. */
function comparable(key, value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (['id_number', 'phone', 'pincode', 'account_number'].includes(key)) return digitsOnly(s);
  if (['pan', 'voter_id', 'driving_license', 'passport_number', 'ifsc_code'].includes(key)) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  if (key === 'dob') return normaliseDate(s) || s;
  if (/name/.test(key)) return normaliseName(s);
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── State / Rajasthan detection ──────────────────────────────────────────────

function stateFromPin(pin) {
  const d = digitsOnly(pin);
  if (d.length !== 6) return null;
  return PIN_PREFIX_STATE[parseInt(d.slice(0, 2), 10)] || null;
}

function isRajasthanPin(pin) {
  const d = digitsOnly(pin);
  return d.length === 6 && /^3[0-4]/.test(d);
}

function findPins(text) {
  return (String(text || '').match(/\b[1-8]\d{2}\s?\d{3}\b/g) || []).map((p) => p.replace(/\s/g, ''));
}

/**
 * Decide whether an address / text refers to Rajasthan.
 * Returns true / false / null (unknown).
 */
function looksRajasthan({ text = '', state = '', pincode = '' } = {}) {
  const combined = `${text} ${state}`.toLowerCase();
  if (/rajasthan|राजस्थान/.test(combined)) return true;
  const pins = [pincode, ...findPins(text)].filter(Boolean);
  if (pins.some(isRajasthanPin)) return true;
  if (state && state.trim()) return false; // state given and it is not Rajasthan
  if (pins.length && pins.every((p) => stateFromPin(p) && !isRajasthanPin(p))) return false;
  // district names are only a weak hint (some exist in other states too)
  if (RAJASTHAN_DISTRICTS.some((d) => new RegExp(`\\b${d}\\b`).test(combined))) return true;
  return null;
}

function findRajasthanDistrict(text) {
  const lower = String(text || '').toLowerCase();
  // prefer longest names first ("sawai madhopur" before "madhopur")
  const sorted = RAJASTHAN_DISTRICTS.slice().sort((a, b) => b.length - a.length);
  for (const d of sorted) {
    if (new RegExp(`\\b${d}\\b`).test(lower)) return titleCase(d);
  }
  return null;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).toLowerCase().replace(/,/g, '');
  const lakh = s.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|लाख)/);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 100000);
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : null;
}

const VALIDATORS = {
  aadhaar: isValidAadhaar,
  pan: isValidPAN,
  epic: isValidEPIC,
  mobile: isValidMobile,
  pincode: isValidPincode,
  ifsc: isValidIFSC,
  email: isValidEmail,
  date: (v) => !!parseDate(v),
};

module.exports = {
  verhoeffValid, verhoeffCheckDigit, isValidAadhaar, formatAadhaar, maskAadhaar,
  isValidPAN, isIndividualPAN, repairPAN, isValidEPIC,
  isValidMobile, normaliseMobile, isValidPincode, isValidIFSC, isValidEmail,
  parseDate, formatDate, normaliseDate, ageOn, isFutureDate,
  normaliseName, titleCase, levenshtein, nameSimilarity, digitsOnly, comparable,
  stateFromPin, isRajasthanPin, findPins, looksRajasthan, findRajasthanDistrict, parseAmount,
  VALIDATORS,
};
