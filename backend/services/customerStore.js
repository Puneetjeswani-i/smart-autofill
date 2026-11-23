/**
 * services/customerStore.js — encrypted customer records + in-memory index.
 *
 * Records are decrypted once at startup to build a small search index
 * (name, mobile, Aadhaar last 4, district). The index lives only in memory.
 */

'use strict';

const db = require('../db');
const P = require('./profileEngine');
const { residenceReport } = require('./residenceEngine');
const { consistencyReport } = require('./consistency');
const { getServices } = require('./serviceCatalog');
const { getSettings } = require('./settingsService');
const { randomId } = require('../utils/crypto');

const index = new Map();
let activeContext = null; // { customer_id, service_id, set_at }

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function rebuildIndex() {
  index.clear();
  let broken = 0;
  for (const c of db.customers.all()) {
    if (c._decrypt_error) { broken += 1; continue; }
    index.set(c.id, P.summary(c));
  }
  activeContext = db.settings.get('active_context', null);
  if (activeContext && !index.has(activeContext.customer_id)) activeContext = null;
  return { customers: index.size, unreadable: broken };
}

function residenceYearsSetting() {
  const mool = getServices(db.settings, { includeDisabled: true }).find((s) => s.id === 'mool_niwas');
  let years = 10;
  const walk = (rules) => (rules || []).forEach((r) => {
    if (r.type === 'residence_years_min' && typeof r.value === 'number') years = r.value;
    if (r.rules) walk(r.rules);
  });
  if (mool) walk(mool.rules);
  return years;
}

function computeReports(customer) {
  const flat = P.flatten(customer);
  customer.reports = {
    residence: residenceReport(customer, flat, { minYears: residenceYearsSetting() }),
    consistency: consistencyReport(customer, flat),
    computed_at: new Date().toISOString(),
  };
  return customer;
}

function applyConsent(customer, consent) {
  customer.consent_store = !!consent;
  const s = getSettings();
  customer.delete_after = !customer.consent_store && s.privacy.auto_delete_unconsented ? endOfToday() : null;
}

function create({ consentStore, name, phone } = {}) {
  const customer = P.newCustomer({ id: randomId('cus'), consentStore, name, phone });
  applyConsent(customer, consentStore);
  customer.consent = { store: !!consentStore, at: new Date().toISOString() };
  computeReports(customer);
  const saved = db.customers.insert(customer);
  index.set(saved.id, P.summary(saved));
  db.audit.log('customer_created', 'customer', saved.id, { consent: !!consentStore });
  return saved;
}

function get(id) {
  const c = db.customers.get(id);
  if (!c) throw Object.assign(new Error('Customer not found'), { status: 404 });
  return c;
}

function save(customer) {
  computeReports(customer);
  const saved = db.customers.update(customer);
  index.set(saved.id, P.summary(saved));
  return saved;
}

function setConsent(customer, consent) {
  applyConsent(customer, consent);
  customer.consent = { store: !!consent, at: new Date().toISOString() };
  db.audit.log('consent_changed', 'customer', customer.id, { consent: !!consent });
}

function remove(id, reason = 'manual') {
  const existed = db.customers.delete(id);
  if (existed) {
    db.applications.anonymiseForCustomer(id);
    index.delete(id);
    if (activeContext && activeContext.customer_id === id) clearActive();
    db.audit.log('customer_deleted', 'customer', id, { reason });
  }
  return existed;
}

function search(q, limit = 50) {
  const all = [...index.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const query = String(q || '').trim().toLowerCase();
  if (!query) return all.slice(0, limit);
  const digits = query.replace(/\D/g, '');
  return all.filter((s) => {
    if (s.name && s.name.toLowerCase().includes(query)) return true;
    if (s.name_hi && s.name_hi.includes(q.trim())) return true;
    if (s.village_city && s.village_city.toLowerCase().includes(query)) return true;
    if (digits.length >= 3 && s.phone && s.phone.includes(digits)) return true;
    if (digits.length === 4 && s.aadhaar_last4 === digits) return true;
    if (/^#?\d+$/.test(query) && String(s.customer_no) === query.replace('#', '')) return true;
    return false;
  }).slice(0, limit);
}

function summaryOf(id) {
  return index.get(id) || null;
}

function setActive(customerId, serviceId = null) {
  if (!index.has(customerId)) throw Object.assign(new Error('Customer not found'), { status: 404 });
  activeContext = { customer_id: customerId, service_id: serviceId || null, set_at: new Date().toISOString() };
  db.settings.set('active_context', activeContext);
  return activeContext;
}

function getActive() {
  return activeContext;
}

function clearActive() {
  activeContext = null;
  db.settings.remove('active_context');
}

module.exports = { rebuildIndex, create, get, save, remove, search, summaryOf, setConsent, computeReports, setActive, getActive, clearActive };
