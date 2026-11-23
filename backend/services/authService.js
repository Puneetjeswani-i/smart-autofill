/**
 * services/authService.js — operator PIN login.
 *
 * One shop PIN (or password) protects the dashboard. Sessions are random
 * tokens kept in memory: they end when the server restarts, after
 * `auto_lock_minutes` of inactivity, or after 12 hours.
 * Repeated wrong PINs lock the login for increasing periods.
 */

'use strict';

const db = require('../db');
const { hashPin, verifyPin, randomToken } = require('../utils/crypto');
const { getSettings } = require('./settingsService');

const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const lockout = { failures: 0, until: 0 };

function isSetup() {
  return !!db.settings.get('pin_hash');
}

function validatePinFormat(pin) {
  const s = String(pin || '');
  if (s.length < 4) return 'PIN must be at least 4 characters';
  if (s.length > 64) return 'PIN is too long';
  return null;
}

function createSession() {
  const token = randomToken(32);
  const now = Date.now();
  sessions.set(token, { created: now, lastSeen: now });
  return token;
}

function setupPin(pin) {
  if (isSetup()) throw Object.assign(new Error('PIN is already set'), { status: 409 });
  const problem = validatePinFormat(pin);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  db.settings.set('pin_hash', hashPin(pin));
  db.audit.log('pin_setup');
  return createSession();
}

function login(pin) {
  const now = Date.now();
  if (lockout.until > now) {
    const secs = Math.ceil((lockout.until - now) / 1000);
    throw Object.assign(new Error(`Too many wrong attempts. Try again in ${secs} seconds.`), { status: 429, retry_after: secs });
  }
  const ok = verifyPin(pin, db.settings.get('pin_hash'));
  if (!ok) {
    lockout.failures += 1;
    if (lockout.failures >= 5) {
      const secs = Math.min(15 * 60, 30 * 2 ** (lockout.failures - 5));
      lockout.until = now + secs * 1000;
    }
    db.audit.log('login_failed', null, null, { failures: lockout.failures });
    throw Object.assign(new Error('Wrong PIN'), { status: 401 });
  }
  lockout.failures = 0;
  lockout.until = 0;
  db.audit.log('login');
  return createSession();
}

function validate(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  const now = Date.now();
  const idleMin = Math.max(5, Number(getSettings().security.auto_lock_minutes) || 60);
  if (now - s.lastSeen > idleMin * 60 * 1000 || now - s.created > MAX_SESSION_MS) {
    sessions.delete(token);
    return false;
  }
  s.lastSeen = now;
  return true;
}

function logout(token) {
  sessions.delete(token);
}

function changePin(current, next) {
  if (!verifyPin(current, db.settings.get('pin_hash'))) throw Object.assign(new Error('Current PIN is wrong'), { status: 401 });
  const problem = validatePinFormat(next);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  db.settings.set('pin_hash', hashPin(next));
  sessions.clear();
  db.audit.log('pin_changed');
  return createSession();
}

function checkPin(pin) {
  return verifyPin(pin, db.settings.get('pin_hash'));
}

/** Used by `npm run reset-pin` (needs access to the shop computer). */
function resetPin() {
  db.settings.remove('pin_hash');
  sessions.clear();
  db.audit.log('pin_reset');
}

function tokenFrom(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

module.exports = { isSetup, setupPin, login, validate, logout, changePin, checkPin, resetPin, tokenFrom };
