/**
 * services/serviceCatalog.js — default services + the shop's own settings.
 *
 * Stored in the settings table:
 *   service_overrides: { [serviceId]: { enabled, govt_fee, service_charge, portal_url, notes,
 *                                       rules: { [ruleId]: { value, verified, verified_at } } } }
 *   custom_services:   [ full service definitions added by the shop (advanced) ]
 */

'use strict';

const DEFAULT_SERVICES = require('../config/services.default');

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function walkRules(rules, fn) {
  for (const r of rules || []) {
    fn(r);
    if (r.rules) walkRules(r.rules, fn);
  }
}

function leafRules(rules) {
  const out = [];
  walkRules(rules, (r) => { if (!r.rules) out.push(r); });
  return out;
}

function applyOverrides(service, o = {}) {
  service.enabled = o.enabled !== false;
  service.fees = {
    govt_fee: o.govt_fee === undefined || o.govt_fee === '' ? null : Number(o.govt_fee),
    service_charge: o.service_charge === undefined || o.service_charge === '' ? null : Number(o.service_charge),
  };
  if (o.portal_url) service.portal = { ...(service.portal || {}), url: o.portal_url };
  service.notes = o.notes || '';
  const ruleOverrides = o.rules || {};
  walkRules(service.rules, (r) => {
    const ro = ruleOverrides[r.id] || {};
    if (ro.value !== undefined && ro.value !== null && ro.value !== '' && r.value !== undefined) {
      r.default_value = r.value;
      r.value = typeof r.value === 'number' ? Number(ro.value) : ro.value;
    }
    r.verified = !!ro.verified;
    r.verified_at = ro.verified_at || null;
  });
  const leaves = leafRules(service.rules);
  service.unverified_rules = leaves.filter((r) => !r.verified).length;
  service.custom = !!service.custom;
  return service;
}

function getServices(settingsStore, { includeDisabled = false } = {}) {
  const overrides = settingsStore.get('service_overrides', {}) || {};
  const custom = (settingsStore.get('custom_services', []) || []).map((s) => ({ ...s, custom: true }));
  const all = [...DEFAULT_SERVICES, ...custom].map((s) => applyOverrides(clone(s), overrides[s.id]));
  return includeDisabled ? all : all.filter((s) => s.enabled);
}

function getService(settingsStore, id) {
  return getServices(settingsStore, { includeDisabled: true }).find((s) => s.id === id) || null;
}

function updateServiceOverride(settingsStore, id, patch) {
  const service = getService(settingsStore, id);
  if (!service) throw Object.assign(new Error('Unknown service'), { status: 404 });
  const all = settingsStore.get('service_overrides', {}) || {};
  const cur = all[id] || {};
  const next = { ...cur };
  for (const k of ['enabled', 'govt_fee', 'service_charge', 'portal_url', 'notes']) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (patch.rules && typeof patch.rules === 'object') {
    const validIds = new Set();
    walkRules(service.rules, (r) => validIds.add(r.id));
    next.rules = { ...(cur.rules || {}) };
    for (const [ruleId, ro] of Object.entries(patch.rules)) {
      if (!validIds.has(ruleId)) continue;
      const prev = next.rules[ruleId] || {};
      const merged = { ...prev };
      if (ro.value !== undefined) merged.value = ro.value;
      if (ro.verified !== undefined) {
        merged.verified = !!ro.verified;
        merged.verified_at = ro.verified ? new Date().toISOString() : null;
      }
      next.rules[ruleId] = merged;
    }
  }
  all[id] = next;
  settingsStore.set('service_overrides', all);
  return getService(settingsStore, id);
}

function resetServiceOverride(settingsStore, id) {
  const all = settingsStore.get('service_overrides', {}) || {};
  delete all[id];
  settingsStore.set('service_overrides', all);
  return getService(settingsStore, id);
}

module.exports = { getServices, getService, updateServiceOverride, resetServiceOverride, walkRules, leafRules, DEFAULT_SERVICES };
