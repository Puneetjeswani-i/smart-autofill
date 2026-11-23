/**
 * routes/settings.js — shop settings, service catalogue, backups, audit.
 * Mounted at /api/settings (operator login required).
 */

'use strict';

const express = require('express');
const db = require('../db');
const { config } = require('../config');
const S = require('../services/settingsService');
const catalog = require('../services/serviceCatalog');
const maintenance = require('../services/maintenance');
const store = require('../services/customerStore');
const auth = require('../services/authService');
const groq = require('../services/groqService');
const { availableLanguages } = require('../utils/ocr');
const { wrap } = require('../middleware');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    settings: S.getSettings(),
    services: catalog.getServices(db.settings, { includeDisabled: true }),
    last_backup: db.settings.get('last_backup', null),
    backups: maintenance.listBackups().slice(0, 20),
    ocr_languages_installed: availableLanguages(),
    version: config.version,
    demo_mode: config.demoMode,
    network: { host: config.host, port: config.port },
  });
});

router.put('/section/:section', wrap(async (req, res) => {
  const settings = S.updateSection(req.params.section, req.body || {});
  db.audit.log('settings_changed', 'settings', req.params.section);
  res.json({ settings });
}));

router.put('/services/:id', wrap(async (req, res) => {
  const service = catalog.updateServiceOverride(db.settings, req.params.id, req.body || {});
  db.audit.log('service_settings_changed', 'service', req.params.id);
  res.json({ service });
}));

router.post('/services/:id/reset', wrap(async (req, res) => {
  const service = catalog.resetServiceOverride(db.settings, req.params.id);
  db.audit.log('service_settings_reset', 'service', req.params.id);
  res.json({ service });
}));

router.get('/extension-key', (req, res) => {
  res.json({ key: S.getExtensionKey() });
});

router.post('/extension-key/regenerate', (req, res) => {
  const key = S.regenerateExtensionKey();
  db.audit.log('extension_key_regenerated');
  res.json({ key });
});

router.post('/backup', wrap(async (req, res) => {
  const b = maintenance.createBackup('manual');
  res.json({ ok: true, backup: b.name, folder: b.dir });
}));

router.get('/audit', (req, res) => {
  res.json({ entries: db.audit.list({ limit: Math.min(parseInt(req.query.limit, 10) || 200, 1000) }) });
});

router.post('/test-ai', wrap(async (req, res) => {
  res.json(await groq.testConnection());
}));

/** Delete data. Requires the PIN again. scope: "customers" | "all" */
router.post('/wipe', wrap(async (req, res) => {
  const { pin, scope, confirm } = req.body || {};
  if (confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm' });
  if (!auth.checkPin(pin)) return res.status(401).json({ error: 'Wrong PIN' });
  maintenance.createBackup('before_wipe');
  let customers = 0;
  for (const s of store.search('', 100000)) if (store.remove(s.id, 'wipe')) customers += 1;
  let applications = 0;
  if (scope === 'all') {
    applications = db.conn().prepare('DELETE FROM applications').run().changes;
  }
  db.audit.log('data_wiped', null, null, { scope: scope === 'all' ? 'all' : 'customers', customers, applications });
  return res.json({ ok: true, customers, applications });
}));

module.exports = router;
