/**
 * config/index.js — single source of runtime configuration.
 *
 * Everything that used to be read ad-hoc from process.env lives here, so the
 * rest of the code never calls dotenv itself. The .env file is always loaded
 * from the backend folder, so starting the server from any directory works.
 *
 * Secrets that are missing or still set to placeholder values are NOT used:
 *   - the database encryption key is generated once and stored in a key file
 *   - the session secret is generated per start (sessions are in-memory anyway)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BACKEND_ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') });

const PLACEHOLDER_RX = /^(change[-_ ]?(this|me)|your[_-]|xxx|placeholder|fallback)/i;

function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  const v = String(value).trim();
  return v === '' || PLACEHOLDER_RX.test(v);
}

function envStr(name, def) {
  const v = process.env[name];
  return v === undefined || String(v).trim() === '' ? def : String(v).trim();
}

function envInt(name, def) {
  const n = parseInt(envStr(name, ''), 10);
  return Number.isFinite(n) ? n : def;
}

function envBool(name, def) {
  const v = envStr(name, '');
  if (v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
}

function resolveFromBackend(p) {
  return path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
}

const dataDir = resolveFromBackend(envStr('DATA_DIR', 'data'));

const config = {
  version: '6.0.0',
  backendRoot: BACKEND_ROOT,
  nodeEnv: envStr('NODE_ENV', 'development'),

  // Network — bind to this computer only unless the shop explicitly opts in.
  port: envInt('PORT', 3001),
  host: envStr('HOST', '127.0.0.1'),

  // Storage
  dataDir,
  dbFile: path.join(dataDir, 'shop.db'),
  keyFile: resolveFromBackend(envStr('MASTER_KEY_FILE', path.join(dataDir, 'master.key'))),
  legacyJsonDb: path.join(dataDir, 'autofill.json'),
  backupDir: resolveFromBackend(envStr('BACKUP_DIR', 'backups')),
  ocrDataDir: resolveFromBackend(envStr('OCR_DATA_DIR', 'ocr-data')),
  frontendBuildDir: resolveFromBackend(envStr('FRONTEND_BUILD_DIR', '../frontend/build')),

  // Upload limits
  maxUploadMb: envInt('MAX_UPLOAD_MB', 15),
  maxFilesPerUpload: envInt('MAX_FILES_PER_UPLOAD', 10),

  // Demo / hackathon features (simulated DigiLocker, demo customer)
  demoMode: envBool('DEMO_MODE', false),

  groq: {
    apiKey: isPlaceholder(process.env.GROQ_API_KEY) ? null : String(process.env.GROQ_API_KEY).trim(),
    model: envStr('GROQ_MODEL', 'llama-3.3-70b-versatile'),
    url: envStr('GROQ_API_URL', 'https://api.groq.com/openai/v1/chat/completions'),
    timeoutMs: envInt('GROQ_TIMEOUT_MS', 30000),
  },

  digilocker: {
    clientId: isPlaceholder(process.env.DIGILOCKER_CLIENT_ID) ? null : process.env.DIGILOCKER_CLIENT_ID,
    clientSecret: isPlaceholder(process.env.DIGILOCKER_CLIENT_SECRET) ? null : process.env.DIGILOCKER_CLIENT_SECRET,
    redirectUri: envStr('DIGILOCKER_REDIRECT_URI', ''),
    env: envStr('DIGILOCKER_ENV', 'sandbox'),
  },

  // Extra browser origins allowed to call the API (comma-separated). The
  // dashboard is normally served by this same server, so this is only needed
  // for development (React dev server on :3000).
  extraOrigins: envStr('ALLOWED_ORIGINS', '')
    .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
};

config.sessionSecret = isPlaceholder(process.env.SESSION_SECRET)
  ? require('crypto').randomBytes(32).toString('hex')
  : process.env.SESSION_SECRET;

config.allowedOrigins = [
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...config.extraOrigins,
];

config.digilocker.enabled = !!(config.digilocker.clientId && config.digilocker.clientSecret);

function ensureDirs() {
  for (const dir of [config.dataDir, config.backupDir, config.ocrDataDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { config, ensureDirs, isPlaceholder };
