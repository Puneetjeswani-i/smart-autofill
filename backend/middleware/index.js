/**
 * middleware/index.js — auth guards, upload handling, async errors.
 */

'use strict';

const multer = require('multer');
const { config } = require('../config');
const auth = require('../services/authService');
const { getExtensionKey } = require('../services/settingsService');
const { safeEqual } = require('../utils/crypto');

function requireAuth(req, res, next) {
  if (auth.validate(auth.tokenFrom(req))) return next();
  return res.status(401).json({ error: 'Please log in again', code: 'auth_required' });
}

function requireExtensionKey(req, res, next) {
  const key = req.headers['x-extension-key'];
  if (key && safeEqual(key, getExtensionKey())) return next();
  return res.status(401).json({ error: 'Extension is not paired with this shop', code: 'extension_not_paired' });
}

/** Wrap async route handlers so thrown errors reach the error handler. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const memoryUpload = multer({
  storage: multer.memoryStorage(), // files never touch the disk
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: config.maxFilesPerUpload, fields: 50 },
});

function fixName(file) {
  // busboy decodes file names as latin1 — convert back so Hindi names survive
  try { file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch { /* keep */ }
}

function uploadFiles(field) {
  const mw = memoryUpload.array(field, config.maxFilesPerUpload);
  return (req, res, next) => mw(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.maxUploadMb} MB)`
        : err.code === 'LIMIT_FILE_COUNT' ? `Too many files (max ${config.maxFilesPerUpload})`
          : err.message;
      return res.status(400).json({ error: msg, code: err.code || 'upload_error' });
    }
    (req.files || []).forEach(fixName);
    return next();
  });
}

function uploadSingle(field) {
  const mw = memoryUpload.single(field);
  return (req, res, next) => mw(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.maxUploadMb} MB)` : err.message, code: err.code || 'upload_error' });
    if (req.file) fixName(req.file);
    return next();
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err.stack || err.message);
  if (res.headersSent) return undefined;
  return res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server. Check the server window for details.' : err.message,
    code: err.code || (status >= 500 ? 'server_error' : 'error'),
    ...(err.retry_after ? { retry_after: err.retry_after } : {}),
  });
}

module.exports = { requireAuth, requireExtensionKey, wrap, uploadFiles, uploadSingle, errorHandler };
