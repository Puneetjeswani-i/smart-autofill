/**
 * routes/auth.js — PIN setup, login, logout.   Mounted at /api/auth
 */

'use strict';

const express = require('express');
const auth = require('../services/authService');
const { getSettings } = require('../services/settingsService');
const { requireAuth, wrap } = require('../middleware');
const { config } = require('../config');

const router = express.Router();

router.get('/status', (req, res) => {
  const s = getSettings();
  res.json({
    setup_required: !auth.isSetup(),
    logged_in: auth.validate(auth.tokenFrom(req)),
    shop_name: s.shop.name || '',
    demo_mode: config.demoMode,
    version: config.version,
  });
});

router.post('/setup', wrap(async (req, res) => {
  const token = auth.setupPin(req.body && req.body.pin);
  res.json({ ok: true, token });
}));

router.post('/login', wrap(async (req, res) => {
  const token = auth.login(req.body && req.body.pin);
  res.json({ ok: true, token });
}));

router.post('/logout', (req, res) => {
  auth.logout(auth.tokenFrom(req));
  res.json({ ok: true });
});

router.post('/change-pin', requireAuth, wrap(async (req, res) => {
  const token = auth.changePin(req.body.current_pin, req.body.new_pin);
  res.json({ ok: true, token });
}));

module.exports = router;
