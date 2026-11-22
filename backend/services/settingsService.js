/**
 * services/settingsService.js — shop settings with safe defaults.
 */

'use strict';

const db = require('../db');
const { config } = require('../config');
const { randomToken } = require('../utils/crypto');

const DEFAULTS = {
  shop: { name: '', owner: '', address: '', phone: '', kiosk_code: '', receipt_footer: '' },
  ai: { enabled: true },
  ocr: { languages: 'eng+hin' },
  privacy: {
    default_consent: false,          // tick "keep details for future visits" by default?
    auto_delete_unconsented: true,   // delete customers without consent at the end of the day
    retention_days: 0,               // 0 = keep consented customers until deleted
  },
  security: { auto_lock_minutes: 60 },
  backup: { keep: 14, daily: true },
};

const ALLOWED = {
  shop: { name: 'string', owner: 'string', address: 'string', phone: 'string', kiosk_code: 'string', receipt_footer: 'string' },
  ai: { enabled: 'boolean' },
  ocr: { languages: ['eng+hin', 'eng'] },
  privacy: { default_consent: 'boolean', auto_delete_unconsented: 'boolean', retention_days: 'number' },
  security: { auto_lock_minutes: 'number' },
  backup: { keep: 'number', daily: 'boolean' },
};

function merged() {
  const stored = db.settings.get('app_settings', {}) || {};
  const out = {};
  for (const [section, defs] of Object.entries(DEFAULTS)) out[section] = { ...defs, ...(stored[section] || {}) };
  return out;
}

function getSettings() {
  const s = merged();
  s.ai.available = !!config.groq.apiKey;
  s.ai.effective = s.ai.enabled && s.ai.available;
  s.ai.model = require('./groqService').effectiveModel();
  s.ai.configured_model = config.groq.model;
  return s;
}

function updateSection(section, patch) {
  const rules = ALLOWED[section];
  if (!rules) throw Object.assign(new Error(`Unknown settings section: ${section}`), { status: 400 });
  const stored = db.settings.get('app_settings', {}) || {};
  const cur = { ...DEFAULTS[section], ...(stored[section] || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    const rule = rules[k];
    if (!rule) continue;
    if (Array.isArray(rule)) { if (rule.includes(v)) cur[k] = v; continue; }
    if (rule === 'boolean') cur[k] = !!v;
    else if (rule === 'number') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 100000) cur[k] = Math.round(n);
    } else if (rule === 'string') cur[k] = String(v || '').slice(0, 300);
  }
  stored[section] = cur;
  db.settings.set('app_settings', stored);
  return getSettings();
}

function getExtensionKey() {
  let key = db.settings.getSecret('extension_key');
  if (!key) {
    key = randomToken(24);
    db.settings.setSecret('extension_key', key);
  }
  return key;
}

function regenerateExtensionKey() {
  const key = randomToken(24);
  db.settings.setSecret('extension_key', key);
  return key;
}

module.exports = { getSettings, updateSection, getExtensionKey, regenerateExtensionKey, DEFAULTS };
