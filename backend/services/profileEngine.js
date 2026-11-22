/**
 * services/profileEngine.js — one customer = one structured, source-tracked profile.
 *
 * For every field we keep ALL candidate values found on every document
 * (`customer.values[path]`), not only the winner. That allows:
 *   - real conflict detection ("DOB on PAN differs from Aadhaar")
 *   - one-click "use this value" for the operator
 *   - removing a wrongly uploaded document cleanly
 *
 * Winner per field: operator-entered value > highest (confidence × document trust).
 */

'use strict';

const { FIELD_DEFS, FIELD_BY_KEY, FIELD_BY_PATH, DOC_TYPES } = require('../config/catalog');
const V = require('./validators');
const { compareAddresses } = require('./addressEngine');

function deepGet(obj, path) {
  return path.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

function deepSet(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function emptyProfile() {
  const p = {};
  for (const def of FIELD_DEFS) deepSet(p, def.path, null);
  return p;
}

function newCustomer({ id, consentStore = false, name, phone } = {}) {
  const c = {
    id,
    consent_store: !!consentStore,
    profile: emptyProfile(),
    sources: {},
    values: {},
    documents: [],
    declared: {},
    manual_docs: {},
    notes: '',
    reports: {},
  };
  if (name) setManualValue(c, 'name', name);
  if (phone) setManualValue(c, 'phone', phone);
  return c;
}

function candidateScore(c) {
  if (c.method === 'manual') return 1e6;
  const trust = DOC_TYPES[c.doc_type] ? DOC_TYPES[c.doc_type].trust : 40;
  const groundingPenalty = c.method === 'ai' && c.grounded === false ? 0.5 : 1;
  return (c.confidence || 0) * trust * groundingPenalty;
}

/** Clean operator / document input according to the field type. */
function normaliseFieldValue(key, value) {
  if (value === null || value === undefined) return null;
  let s = typeof value === 'number' ? value : String(value).trim();
  if (s === '') return null;
  switch (key) {
    case 'id_number': return V.formatAadhaar(s);
    case 'phone': return V.normaliseMobile(s) || s;
    case 'pincode': return V.digitsOnly(s) || s;
    case 'pan': case 'voter_id': case 'ifsc_code': return String(s).toUpperCase().replace(/\s+/g, '');
    case 'dob': return V.normaliseDate(s);
    case 'annual_income': { const n = V.parseAmount(s); return n === null ? s : n; }
    case 'years_in_rajasthan': { const n = parseInt(s, 10); return Number.isFinite(n) ? n : s; }
    default: return s;
  }
}

function recompute(customer) {
  customer.sources = {};
  for (const def of FIELD_DEFS) {
    const list = (customer.values[def.path] || []).filter(Boolean);
    if (!list.length) {
      deepSet(customer.profile, def.path, null);
      continue;
    }
    const best = list.reduce((a, b) => (candidateScore(b) > candidateScore(a) ? b : a));
    deepSet(customer.profile, def.path, best.value === undefined ? null : best.value);
    customer.sources[def.path] = {
      value: best.value,
      doc_id: best.doc_id || null,
      doc_type: best.doc_type,
      confidence: best.confidence,
      method: best.method,
      grounded: best.grounded,
      validated: best.validated,
      chosen_from: best.chosen_from || null,
    };
  }
  return customer;
}

function addCandidate(customer, path, cand) {
  const list = customer.values[path] || (customer.values[path] = []);
  const idx = list.findIndex((c) => c.doc_id && c.doc_id === cand.doc_id);
  if (idx >= 0) list[idx] = cand;
  else list.push(cand);
}

function documentSummary(doc) {
  return {
    id: doc.id,
    doc_type: doc.doc_type,
    detected_type: doc.detected_type,
    file_label: doc.file_label,
    uploaded_at: doc.uploaded_at,
    kind: doc.kind,
    pages: doc.pages,
    ocr: doc.ocr,
    ai: doc.ai ? { used: !!doc.ai.used, model: doc.ai.model || null } : { used: false },
    quality_score: doc.quality ? doc.quality.score : null,
    fields: doc.fields,
    field_meta: doc.field_meta,
    evidence: doc.evidence,
    warnings: doc.warnings || [],
    ungrounded_fields: doc.ungrounded_fields || [],
  };
}

/** Add a processed document (from documentPipeline) to the customer. */
function addDocument(customer, doc) {
  customer.documents = (customer.documents || []).filter((d) => d.id !== doc.id);
  customer.documents.push(documentSummary(doc));
  for (const [key, value] of Object.entries(doc.fields || {})) {
    if (key.startsWith('_')) continue;
    const def = FIELD_BY_KEY[key];
    if (!def) continue;
    const meta = (doc.field_meta && doc.field_meta[key]) || {};
    const v = normaliseFieldValue(key, value);
    if (v === null) continue;
    addCandidate(customer, def.path, {
      value: v,
      doc_id: doc.id,
      doc_type: doc.doc_type,
      confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
      method: meta.method || 'local',
      grounded: meta.grounded,
      validated: meta.validated,
      at: doc.uploaded_at,
    });
  }
  return recompute(customer);
}

/** Change the type of an uploaded document (operator correction). */
function setDocumentType(customer, docId, newType) {
  const doc = (customer.documents || []).find((d) => d.id === docId);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (!DOC_TYPES[newType]) throw Object.assign(new Error('Unknown document type'), { status: 400 });
  doc.doc_type = newType;
  for (const list of Object.values(customer.values)) {
    for (const c of list) if (c.doc_id === docId) c.doc_type = newType;
  }
  return recompute(customer);
}

function removeDocument(customer, docId) {
  customer.documents = (customer.documents || []).filter((d) => d.id !== docId);
  for (const path of Object.keys(customer.values)) {
    customer.values[path] = customer.values[path].filter((c) => c.doc_id !== docId);
    if (!customer.values[path].length) delete customer.values[path];
  }
  return recompute(customer);
}

/**
 * Operator sets a field. An empty value is recorded as an explicit "cleared"
 * entry, so document values do not silently come back.
 */
function setManualValue(customer, key, value, extra = {}) {
  const def = FIELD_BY_KEY[key];
  if (!def) throw Object.assign(new Error(`Unknown field: ${key}`), { status: 400 });
  const list = (customer.values[def.path] || []).filter((c) => c.method !== 'manual');
  const v = normaliseFieldValue(key, value);
  const hasDocValues = list.length > 0;
  if (v !== null || hasDocValues) {
    list.push({ value: v, doc_id: null, doc_type: 'manual', confidence: 1, method: 'manual', at: new Date().toISOString(), ...extra });
  }
  if (list.length) customer.values[def.path] = list;
  else delete customer.values[def.path];
  return recompute(customer);
}

/** Remove the operator's value so the best document value is used again. */
function clearManualValue(customer, key) {
  const def = FIELD_BY_KEY[key];
  if (!def) throw Object.assign(new Error(`Unknown field: ${key}`), { status: 400 });
  const list = (customer.values[def.path] || []).filter((c) => c.method !== 'manual');
  if (list.length) customer.values[def.path] = list;
  else delete customer.values[def.path];
  return recompute(customer);
}

/** Operator picks one of the document values for a field. */
function chooseCandidate(customer, key, docId) {
  const def = FIELD_BY_KEY[key];
  if (!def) throw Object.assign(new Error(`Unknown field: ${key}`), { status: 400 });
  const cand = (customer.values[def.path] || []).find((c) => c.doc_id === docId);
  if (!cand) throw Object.assign(new Error('Value not found'), { status: 404 });
  return setManualValue(customer, key, cand.value, { chosen_from: { doc_id: cand.doc_id, doc_type: cand.doc_type } });
}

// ── Flat views ───────────────────────────────────────────────────────────────

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { first_name: parts[0], middle_name: null, last_name: null };
  return { first_name: parts[0], middle_name: parts.slice(1, -1).join(' ') || null, last_name: parts[parts.length - 1] };
}

/** Flat key → value map (+ derived values used by forms and the extension). */
function flatten(customer) {
  const flat = {};
  for (const def of FIELD_DEFS) flat[def.key] = deepGet(customer.profile, def.path) ?? null;
  const names = splitName(flat.name);
  Object.assign(flat, names);
  const p = V.parseDate(flat.dob);
  flat.dob_iso = p && p.d ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null;
  flat.age = V.ageOn(flat.dob);
  const digits = V.digitsOnly(flat.id_number);
  flat.aadhaar_last4 = digits.length >= 4 ? digits.slice(-4) : null;
  flat.aadhaar_digits = digits.length === 12 ? digits : null;
  const marriedWoman = flat.gender === 'Female' && flat.is_married === 'Yes' && flat.husband_name;
  flat.father_or_husband_name = marriedWoman ? flat.husband_name : (flat.father_name || flat.husband_name || null);
  flat.relation_type = marriedWoman ? 'W/O' : flat.father_name ? (flat.gender === 'Female' ? 'D/O' : 'S/O') : null;
  return flat;
}

function summary(customer) {
  const flat = flatten(customer);
  return {
    id: customer.id,
    customer_no: customer.customer_no,
    name: flat.name || flat.name_hi || null,
    name_hi: flat.name_hi || null,
    phone: flat.phone || null,
    aadhaar_last4: flat.aadhaar_last4,
    district: flat.district || null,
    village_city: flat.village_city || null,
    documents: (customer.documents || []).length,
    consent_store: !!customer.consent_store,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

// ── Conflicts ────────────────────────────────────────────────────────────────

function sameValue(key, a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (/name/.test(key) && !/_hi$/.test(key)) return V.nameSimilarity(a, b) >= 0.9;
  if (key === 'address' || key === 'permanent_address') return compareAddresses(String(a), String(b)).score >= 0.75;
  if (key === 'dob') {
    const pa = V.parseDate(a);
    const pb = V.parseDate(b);
    if (pa && pb && (!pa.d || !pb.d)) return pa.y === pb.y; // year-only vs full date
  }
  return V.comparable(key, a) === V.comparable(key, b);
}

/**
 * Fields where documents disagree with each other, or with what the operator
 * typed. A conflict counts as resolved once the operator confirmed a value
 * AFTER the latest document for that field arrived.
 */
function findConflicts(customer) {
  const out = [];
  for (const def of FIELD_DEFS) {
    const all = customer.values[def.path] || [];
    const docs = all.filter((c) => c.method !== 'manual' && c.value !== null && c.value !== undefined);
    if (!docs.length) continue;
    const manual = all.find((c) => c.method === 'manual');
    const pool = manual && manual.value !== null && manual.value !== undefined ? [...docs, manual] : docs;
    if (pool.length < 2) continue;
    const groups = [];
    for (const c of pool) {
      const g = groups.find((grp) => sameValue(def.key, grp[0].value, c.value));
      if (g) g.push(c);
      else groups.push([c]);
    }
    if (groups.length < 2) continue;
    const latestDocAt = docs.reduce((m, c) => (String(c.at || '') > m ? String(c.at || '') : m), '');
    const src = customer.sources[def.path] || {};
    out.push({
      key: def.key,
      label: def.label,
      resolved: !!manual && String(manual.at || '') >= latestDocAt,
      current: src.value ?? null,
      options: groups.map((g) => {
        const fromDoc = g.find((c) => c.method !== 'manual');
        return {
          value: g[0].value,
          doc_id: fromDoc ? fromDoc.doc_id : null,
          doc_types: [...new Set(g.map((c) => c.doc_type))],
          typed_by_operator: g.some((c) => c.method === 'manual'),
          confidence: Math.max(...g.map((c) => c.confidence || 0)),
        };
      }),
    });
  }
  return out;
}

function fieldPresent(flat, key) {
  const v = flat[key];
  return v !== null && v !== undefined && String(v).trim() !== '';
}

module.exports = {
  emptyProfile, newCustomer, addDocument, removeDocument, setDocumentType,
  setManualValue, clearManualValue, chooseCandidate, recompute,
  flatten, summary, findConflicts, fieldPresent, normaliseFieldValue,
  deepGet, deepSet, splitName, FIELD_BY_PATH,
};
