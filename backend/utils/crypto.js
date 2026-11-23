/**
 * utils/crypto.js — encryption at rest + PIN hashing.
 *
 * - AES-256-GCM (authenticated encryption, Node built-in crypto).
 * - One random 256-bit master key, created on first start and stored in
 *   data/master.key. Every customer record is encrypted with it, and the
 *   record's table+id is bound in as "additional authenticated data" so an
 *   encrypted blob cannot be swapped onto another record unnoticed.
 * - PINs are hashed with scrypt + random salt (never stored in plain text).
 *
 * IMPORTANT: if master.key is lost, the encrypted data cannot be recovered.
 * Backups therefore copy the key together with the database.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORMAT_PREFIX = 'v1:';
let masterKey = null;

function loadOrCreateMasterKey(keyFile) {
  if (fs.existsSync(keyFile)) {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    const key = Buffer.from(hex, 'hex');
    if (key.length !== 32) {
      throw new Error(`Master key file is corrupted (expected 64 hex characters): ${keyFile}`);
    }
    masterKey = key;
    return { created: false };
  }
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  masterKey = key;
  return { created: true };
}

/** For tests only — use an in-memory key. */
function setMasterKeyForTests(buf) {
  masterKey = buf || crypto.randomBytes(32);
}

function requireKey() {
  if (!masterKey) throw new Error('Encryption key not loaded — call loadOrCreateMasterKey() at startup');
  return masterKey;
}

/**
 * Encrypt any JSON-serialisable value.
 * @param {*} value
 * @param {string} [aad] additional authenticated data (e.g. "customers:cus_abc")
 * @returns {string} "v1:" + base64(iv | tag | ciphertext)
 */
function encryptJSON(value, aad = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', requireKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(value === undefined ? null : value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return FORMAT_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a value produced by encryptJSON. Throws if the data was tampered
 * with, the AAD does not match, or the key is wrong.
 */
function decryptJSON(payload, aad = '') {
  if (typeof payload !== 'string' || !payload.startsWith(FORMAT_PREFIX)) {
    throw new Error('Unrecognised encrypted payload format');
  }
  const raw = Buffer.from(payload.slice(FORMAT_PREFIX.length), 'base64');
  if (raw.length < 28) throw new Error('Encrypted payload too short');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', requireKey(), iv);
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

// ── PIN hashing ───────────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), hash.toString('hex')].join('$');
}

function verifyPin(pin, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), expected.length, {
    N: parseInt(N, 10), r: parseInt(r, 10), p: parseInt(p, 10),
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function randomId(prefix, length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return `${prefix}_${out}`;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  loadOrCreateMasterKey,
  setMasterKeyForTests,
  encryptJSON,
  decryptJSON,
  hashPin,
  verifyPin,
  randomToken,
  randomId,
  safeEqual,
};
