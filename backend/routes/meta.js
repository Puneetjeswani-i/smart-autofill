/**
 * routes/meta.js — static vocabulary for the dashboard (no personal data).
 * Also the AI helper. Mounted at /api/meta and /api/ai.
 */

'use strict';

const express = require('express');
const db = require('../db');
const { FIELD_GROUPS, FIELD_DEFS, DOC_TYPES, MANUAL_DOC_TYPES, APPLICATION_STATUSES } = require('../config/catalog');
const store = require('../services/customerStore');
const P = require('../services/profileEngine');
const { getServices } = require('../services/serviceCatalog');
const { evaluateAll } = require('../services/eligibilityEngine');
const { getSettings } = require('../services/settingsService');
const groq = require('../services/groqService');
const V = require('../services/validators');
const { wrap } = require('../middleware');

const meta = express.Router();

meta.get('/catalog', (req, res) => {
  res.json({
    field_groups: FIELD_GROUPS,
    fields: FIELD_DEFS.map(({ key, group, label, type, options, sensitive, validate }) => ({ key, group, label, type, options: options || null, sensitive: !!sensitive, validate: validate || null })),
    doc_types: Object.fromEntries(Object.entries(DOC_TYPES).filter(([k]) => k !== 'manual').map(([k, v]) => [k, v.label])),
    manual_doc_types: MANUAL_DOC_TYPES,
    application_statuses: APPLICATION_STATUSES,
  });
});

const ai = express.Router();

ai.get('/status', (req, res) => {
  const s = getSettings();
  res.json({ available: s.ai.available, enabled: s.ai.enabled, effective: s.ai.effective, model: s.ai.model });
});

/** Mask identifiers before anything goes to the AI. */
function maskedContext(customer) {
  const flat = P.flatten(customer);
  const SENSITIVE = ['id_number', 'aadhaar_digits', 'pan', 'voter_id', 'driving_license', 'passport_number', 'account_number', 'jan_aadhaar_id', 'ration_card_number', 'phone', 'email'];
  const safe = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v === null || v === undefined || v === '') continue;
    if (SENSITIVE.includes(k)) safe[k] = k === 'id_number' ? V.maskAadhaar(v) : `(${k} on file)`;
    else if (!['dob_iso'].includes(k)) safe[k] = v;
  }
  const services = evaluateAll(getServices(db.settings), customer, flat).map((s) => ({
    service: s.name.en, status: s.status,
    missing_fields: s.missing.fields.map((f) => f.label.en),
    missing_documents: s.missing.documents.map((d) => d.label.en),
    failed_rules: s.rules.filter((r) => r.status === 'fail').map((r) => r.label.en),
  }));
  return {
    customer: safe,
    documents: (customer.documents || []).map((d) => d.doc_type),
    residence: customer.reports && customer.reports.residence ? {
      status: customer.reports.residence.status, years_proved: customer.reports.residence.evidence_years,
      required: customer.reports.residence.min_years_required,
    } : null,
    services,
  };
}

ai.post('/ask', wrap(async (req, res) => {
  const s = getSettings();
  if (!s.ai.effective) return res.status(400).json({ error: 'AI helper is off. Turn it on in Settings (needs a Groq key).', code: 'ai_off' });
  const question = String((req.body && req.body.question) || '').trim();
  if (!question) return res.status(400).json({ error: 'Type a question' });
  const context = req.body.customer_id ? maskedContext(store.get(req.body.customer_id)) : { note: 'No customer selected' };
  const answer = await groq.askAssistant(question, context, req.body.lang === 'hi' ? 'hi' : 'en');
  db.audit.log('ai_question', 'customer', req.body.customer_id || null);
  return res.json({ answer });
}));

module.exports = { meta, ai };
