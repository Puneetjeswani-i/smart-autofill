/**
 * Smart Autofill v6 — eMitra / CSC shop assistant (backend + dashboard server)
 *
 *   http://localhost:3001        dashboard (frontend/build served from here)
 *   /api/auth/*                  PIN login
 *   /api/customers/*             customer register, documents, eligibility
 *   /api/applications/*          application register, CSV export
 *   /api/settings/*              shop settings, service rules, backups
 *   /api/tools/*                 compress / convert / resize documents
 *   /api/ext/*                   read-only API for the Chrome extension (paired key)
 *
 * Listens on 127.0.0.1 only (this computer) unless HOST is changed in .env.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { config, ensureDirs } = require('./config');
const db = require('./db');
const { loadOrCreateMasterKey } = require('./utils/crypto');
const { requireAuth, errorHandler } = require('./middleware');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (!req.path.startsWith('/auth/digilocker')) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "connect-src 'self'", "font-src 'self' data:",
      "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
    ].join('; '));
  }
  next();
}

function corsOptions() {
  const allowed = new Set(config.allowedOrigins);
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) return cb(null, true);
      if (allowed.has(origin.replace(/\/$/, ''))) return cb(null, true);
      return cb(Object.assign(new Error('Origin not allowed'), { status: 403 }));
    },
    credentials: true,
    exposedHeaders: ['X-Result-Size', 'X-Over-Limit', 'X-Pages', 'Content-Disposition'],
  };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(securityHeaders);
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok', version: config.version }));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/ext', require('./routes/extension'));

  app.use('/api/customers', requireAuth, require('./routes/customers'));
  app.use('/api/applications', requireAuth, require('./routes/applications'));
  app.use('/api/settings', requireAuth, require('./routes/settings'));
  app.use('/api/tools', requireAuth, require('./routes/tools'));
  const { meta, ai } = require('./routes/meta');
  app.use('/api/meta', requireAuth, meta);
  app.use('/api/ai', requireAuth, ai);

  if (config.demoMode) {
    const { createDemoCustomer } = require('./services/demoData');
    app.post('/api/demo/customer', requireAuth, (req, res, next) => {
      try { res.status(201).json({ customer: require('./routes/customers').view(createDemoCustomer()) }); } catch (e) { next(e); }
    });
  }
  if (config.demoMode || config.digilocker.enabled) {
    const session = require('express-session');
    app.use(session({
      secret: config.sessionSecret, resave: false, saveUninitialized: false, name: 'sa_dl',
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 2 * 3600 * 1000 },
    }));
    app.use('/auth/digilocker', require('./routes/digilockerAuth'));
    app.use('/api/digilocker', requireAuth, require('./routes/digilockerApi'));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));

  // Dashboard (production build)
  const indexHtml = path.join(config.frontendBuildDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendBuildDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(indexHtml));
  } else {
    app.get('/', (req, res) => res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Smart Autofill</title>
      <body style="font-family:Segoe UI,sans-serif;padding:40px;max-width:640px">
      <h2>Smart Autofill server is running</h2>
      <p>The dashboard has not been built yet. Run <b>setup.bat</b> (or <code>npm run build</code> in the <code>frontend</code> folder) and refresh this page.</p>
      <p>For development you can also run <code>npm start</code> in <code>frontend</code> and open http://localhost:3000.</p></body>`));
  }

  app.use(errorHandler);
  return app;
}

function bootstrap() {
  ensureDirs();
  const key = loadOrCreateMasterKey(config.keyFile);
  db.open(config.dbFile);
  const store = require('./services/customerStore');
  const idx = store.rebuildIndex();
  require('./utils/ocr').migrateLegacyTraineddata();
  return { keyCreated: key.created, index: idx };
}

function start() {
  const info = bootstrap();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    const { getSettings } = require('./services/settingsService');
    const s = getSettings();
    console.log('');
    console.log(`  Smart Autofill v${config.version} is running`);
    console.log(`  Open:  http://localhost:${config.port}`);
    console.log(`  Network: ${config.host === '127.0.0.1' ? 'this computer only (safe default)' : `listening on ${config.host} — other devices on the network can connect`}`);
    console.log(`  Customers on file: ${info.index.customers}${info.index.unreadable ? `  (${info.index.unreadable} unreadable — wrong master.key?)` : ''}`);
    console.log(`  Cloud AI (Groq): ${s.ai.available ? (s.ai.enabled ? `on (${config.groq.model})` : 'available but switched off') : 'not configured — local extraction only'}`);
    if (info.keyCreated) console.log(`  A new encryption key was created: ${config.keyFile}\n  It is included in backups. Do not lose it — without it the data cannot be read.`);
    if (config.demoMode) console.log('  DEMO_MODE is on (demo customer + simulated DigiLocker).');
    console.log('');
    require('./services/maintenance').startSchedules();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${config.port} is already in use — Smart Autofill may already be running. Open http://localhost:${config.port}\n`);
      process.exit(1);
    }
    throw err;
  });
  const shutdown = async () => {
    require('./services/maintenance').stopSchedules();
    await require('./utils/ocr').shutdown().catch(() => {});
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, bootstrap, start };
