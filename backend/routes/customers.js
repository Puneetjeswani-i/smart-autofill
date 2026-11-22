/**
 * routes/customers.js — customer register, documents, eligibility.
 * Mounted at /api/customers (operator login required).
 */

'use strict';

const express = require('express');
const db = require('../db');
const store = require('../services/customerStore');
const P = require('../services/profileEngine');
const { processDocument } = require('../services/documentPipeline');
const { getServices, getService } = require('../services/serviceCatalog');
const { evaluateAll, evaluateService } = require('../services/eligibilityEngine');
const { getSettings } = require('../services/settingsService');
const { FIELD_DEFS, FIELD_BY_KEY, DOC_TYPES } = require('../config/catalog');
const { wrap, uploadFiles } = require('../middleware');

const router = express.Router();

function fieldSources(customer) {
  const out = {};
  for (const def of FIELD_DEFS) {
    const s = customer.sources && customer.sources[def.path];
    if (s) out[def.key] = s;
  }
  return out;
}

function view(customer) {
  return {
    id: customer.id,
    customer_no: customer.customer_no,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    consent_store: !!customer.consent_store,
    delete_after: customer.delete_after || null,
    summary: P.summary(customer),
    flat: P.flatten(customer),
    field_sources: fieldSources(customer),
    documents: customer.documents || [],
    conflicts: P.findConflicts(customer),
    reports: customer.reports || {},
    declared: customer.declared || {},
    manual_docs: customer.manual_docs || {},
    notes: customer.notes || '',
  };
}

function parseJsonField(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ── list / create ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json({ customers: store.search(req.query.q, Math.min(parseInt(req.query.limit, 10) || 50, 500)) });
});

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const settings = getSettings();
  const consent = b.consent_store === undefined ? settings.privacy.default_consent : !!b.consent_store;
  const customer = store.create({ consentStore: consent, name: b.name, phone: b.phone });
  store.setActive(customer.id);
  res.status(201).json({ customer: view(customer) });
}));

// ── active customer (used by the browser extension) ─────────────────────────

router.get('/active', (req, res) => {
  const ctx = store.getActive();
  res.json({ active: ctx ? { ...ctx, customer: store.summaryOf(ctx.customer_id) } : null });
});

router.post('/active', wrap(async (req, res) => {
  const ctx = store.setActive(req.body.customer_id, req.body.service_id || null);
  db.audit.log('customer_activated', 'customer', ctx.customer_id, { service: ctx.service_id });
  res.json({ active: { ...ctx, customer: store.summaryOf(ctx.customer_id) } });
}));

router.delete('/active', (req, res) => {
  store.clearActive();
  res.json({ active: null });
});

// ── one customer ─────────────────────────────────────────────────────────────

router.get('/:id', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  db.audit.log('customer_viewed', 'customer', customer.id);
  res.json({ customer: view(customer) });
}));

router.patch('/:id', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  const b = req.body || {};
  const changed = [];
  if (b.fields && typeof b.fields === 'object') {
    for (const [key, value] of Object.entries(b.fields)) {
      if (!FIELD_BY_KEY[key]) continue;
      P.setManualValue(customer, key, value);
      changed.push(key);
    }
  }
  if (Array.isArray(b.reset_fields)) {
    for (const key of b.reset_fields) if (FIELD_BY_KEY[key]) { P.clearManualValue(customer, key); changed.push(key); }
  }
  if (b.declared && typeof b.declared === 'object') {
    customer.declared = { ...(customer.declared || {}) };
    for (const [k, v] of Object.entries(b.declared)) {
      if (v === null || v === undefined) delete customer.declared[k];
      else customer.declared[k] = !!v;
    }
  }
  if (b.manual_docs && typeof b.manual_docs === 'object') {
    customer.manual_docs = { ...(customer.manual_docs || {}) };
    for (const [k, v] of Object.entries(b.manual_docs)) {
      if (v) customer.manual_docs[k] = true;
      else delete customer.manual_docs[k];
    }
  }
  if (typeof b.notes === 'string') customer.notes = b.notes.slice(0, 2000);
  if (b.consent_store !== undefined) store.setConsent(customer, !!b.consent_store);
  const saved = store.save(customer);
  if (changed.length) db.audit.log('customer_edited', 'customer', saved.id, { fields: changed });
  res.json({ customer: view(saved) });
}));

router.post('/:id/choose', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  P.chooseCandidate(customer, req.body.key, req.body.doc_id);
  const saved = store.save(customer);
  db.audit.log('customer_edited', 'customer', saved.id, { fields: [req.body.key], chosen: true });
  res.json({ customer: view(saved) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const ok = store.remove(req.params.id, 'operator');
  if (!ok) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ ok: true });
}));

router.get('/:id/export', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  db.audit.log('customer_exported', 'customer', customer.id);
  const data = { exported_at: new Date().toISOString(), ...view(customer) };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="customer-${customer.customer_no}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

// ── documents ────────────────────────────────────────────────────────────────

function publicResult(r) {
  return {
    id: r.id,
    ok: r.ok,
    error: r.error || null,
    file_label: r.file_label,
    doc_type: r.doc_type,
    detected_type: r.detected_type || null,
    detection_confidence: r.detection_confidence || null,
    pages: r.pages || null,
    ocr: r.ocr || null,
    ai: r.ai || null,
    quality: r.quality || null,
    fields: r.fields || {},
    field_meta: r.field_meta || {},
    evidence: r.evidence || null,
    warnings: r.warnings || [],
    ungrounded_fields: r.ungrounded_fields || [],
    text_preview: r.text_preview || '',
  };
}

router.post('/:id/documents', uploadFiles('documents'), wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files received' });
  const types = parseJsonField(req.body.doc_types, []);
  const passwords = parseJsonField(req.body.passwords, []);
  const settings = getSettings();
  const pipelineSettings = { ai: { enabled: settings.ai.effective }, ocr: settings.ocr };

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const hint = (Array.isArray(types) ? types[i] : null) || req.body.doc_type || 'auto';
    const password = (Array.isArray(passwords) ? passwords[i] : null) || req.body.password || undefined;
    let r;
    try {
      r = await processDocument({ buffer: f.buffer, originalName: f.originalname, hintType: hint, password, settings: pipelineSettings });
    } catch (err) {
      console.error('[documents] processing failed:', err.message);
      r = { ok: false, error: 'processing_failed', file_label: f.originalname, doc_type: hint };
    }
    f.buffer = null; // release memory early
    if (r.ok) P.addDocument(customer, r);
    results.push(publicResult(r));
  }
  const saved = store.save(customer);
  db.audit.log('documents_added', 'customer', saved.id, {
    count: files.length,
    ok: results.filter((r) => r.ok).length,
    types: results.map((r) => r.doc_type),
    ai: results.some((r) => r.ai && r.ai.used),
  });
  return res.json({ customer: view(saved), results });
}));

router.patch('/:id/documents/:docId', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  if (req.body.doc_type) P.setDocumentType(customer, req.params.docId, req.body.doc_type);
  const saved = store.save(customer);
  res.json({ customer: view(saved) });
}));

router.delete('/:id/documents/:docId', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  P.removeDocument(customer, req.params.docId);
  const saved = store.save(customer);
  db.audit.log('document_removed', 'customer', saved.id);
  res.json({ customer: view(saved) });
}));

// ── services / eligibility ───────────────────────────────────────────────────

router.get('/:id/services', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  const flat = P.flatten(customer);
  res.json({ services: evaluateAll(getServices(db.settings), customer, flat) });
}));

function buildFill(service, customer, flat) {
  const keys = [...service.fields, ...(service.optional_fields || []).filter((k) => P.fieldPresent(flat, k))];
  return keys.filter((k) => FIELD_BY_KEY[k]).map((k) => {
    const def = FIELD_BY_KEY[k];
    const src = customer.sources[def.path];
    return {
      key: k,
      label: def.label,
      value: flat[k],
      required: service.fields.includes(k),
      sensitive: !!def.sensitive,
      source: src ? { doc_type: src.doc_type, method: src.method, confidence: src.confidence, grounded: src.grounded } : null,
    };
  });
}

router.get('/:id/services/:serviceId', wrap(async (req, res) => {
  const customer = store.get(req.params.id);
  const service = getService(db.settings, req.params.serviceId);
  if (!service) return res.status(404).json({ error: 'Unknown service' });
  const flat = P.flatten(customer);
  return res.json({
    evaluation: evaluateService(service, customer, flat),
    fill: buildFill(service, customer, flat),
    doc_types: Object.fromEntries(Object.entries(DOC_TYPES).map(([k, v]) => [k, v.label])),
  });
}));

module.exports = router;
module.exports.view = view;
