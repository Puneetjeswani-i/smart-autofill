/**
 * routes/extension.js — read-only API for the Chrome extension.
 * Mounted at /api/ext. Authenticated with the paired extension key
 * (X-Extension-Key header), not with the operator session.
 *
 * Only the ACTIVE customer (the one open in the dashboard) is ever returned,
 * so the extension cannot browse the customer register.
 */

'use strict';

const express = require('express');
const db = require('../db');
const store = require('../services/customerStore');
const P = require('../services/profileEngine');
const { getService } = require('../services/serviceCatalog');
const { getSettings } = require('../services/settingsService');
const { FIELD_DEFS } = require('../config/catalog');
const { requireExtensionKey, wrap } = require('../middleware');

const router = express.Router();
router.use(requireExtensionKey);

const DERIVED = [
  { key: 'first_name', label: { en: 'First name', hi: 'पहला नाम' } },
  { key: 'middle_name', label: { en: 'Middle name', hi: 'मध्य नाम' } },
  { key: 'last_name', label: { en: 'Last name / surname', hi: 'उपनाम' } },
  { key: 'father_or_husband_name', label: { en: "Father's / husband's name", hi: 'पिता / पति का नाम' } },
  { key: 'age', label: { en: 'Age (years)', hi: 'आयु (वर्ष)' } },
  { key: 'dob_iso', label: { en: 'Date of birth (YYYY-MM-DD)', hi: 'जन्म तिथि (YYYY-MM-DD)' } },
  { key: 'aadhaar_digits', label: { en: 'Aadhaar (12 digits, no spaces)', hi: 'आधार (12 अंक, बिना स्पेस)' } },
];

let lastLogged = { id: null, at: 0 };

router.get('/ping', (req, res) => {
  res.json({ ok: true, shop_name: getSettings().shop.name || '' });
});

router.get('/active', wrap(async (req, res) => {
  const ctx = store.getActive();
  if (!ctx) return res.json({ active: null });
  const customer = store.get(ctx.customer_id);
  const flat = P.flatten(customer);
  const service = ctx.service_id ? getService(db.settings, ctx.service_id) : null;
  if (lastLogged.id !== customer.id || Date.now() - lastLogged.at > 10 * 60 * 1000) {
    db.audit.log('extension_read', 'customer', customer.id, { service: ctx.service_id });
    lastLogged = { id: customer.id, at: Date.now() };
  }
  const values = {};
  for (const [k, v] of Object.entries(flat)) if (v !== null && v !== undefined && v !== '') values[k] = v;
  return res.json({
    active: {
      customer: { id: customer.id, customer_no: customer.customer_no, name: flat.name || flat.name_hi || '', aadhaar_last4: flat.aadhaar_last4 },
      service: service ? { id: service.id, name: service.name, fields: service.fields } : null,
      set_at: ctx.set_at,
    },
    values,
    fields: [...FIELD_DEFS.map((f) => ({ key: f.key, label: f.label, group: f.group, sensitive: !!f.sensitive })), ...DERIVED],
  });
}));

module.exports = router;
