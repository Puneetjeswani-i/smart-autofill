/**
 * db/index.js — SQLite storage (Node's built-in node:sqlite, no native build).
 *
 * Why SQLite instead of the old JSON file:
 *   - crash/power-cut safe (WAL journal + synchronous=FULL); the JSON file was
 *     rewritten completely on every save and could be left half-written
 *   - only changed pages are written, so it stays fast with thousands of customers
 *
 * Personal data is never stored in plain columns: every customer record and
 * the personal part of every application is AES-256-GCM encrypted (see
 * utils/crypto.js). Only non-personal bookkeeping columns (dates, status,
 * service, fees) are plain so the register can be filtered and totalled.
 */

'use strict';

const { encryptJSON, decryptJSON } = require('../utils/crypto');

// node:sqlite prints an "ExperimentalWarning" on load in Node 22. Hide that one
// warning only, so shop operators are not alarmed by it.
(function silenceSqliteWarning() {
  const original = process.emitWarning;
  process.emitWarning = function patchedEmitWarning(warning, ...args) {
    const msg = typeof warning === 'string' ? warning : warning && warning.message;
    const type = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].type) || (warning && warning.name);
    if (type === 'ExperimentalWarning' && /sqlite/i.test(msg || '')) return undefined;
    return original.call(process, warning, ...args);
  };
})();

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  throw new Error(
    `This app needs Node.js 22.13 or newer (built-in SQLite). You have ${process.version}. ` +
    'Install the current LTS from https://nodejs.org and run setup again.'
  );
}

let db = null;

const MIGRATIONS = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS customers (
    id            TEXT PRIMARY KEY,
    customer_no   INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    consent_store INTEGER NOT NULL DEFAULT 0,
    delete_after  TEXT,
    data          TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_no ON customers(customer_no);

  CREATE TABLE IF NOT EXISTS applications (
    id             TEXT PRIMARY KEY,
    ref_no         TEXT NOT NULL,
    customer_id    TEXT NOT NULL,
    service_id     TEXT NOT NULL,
    status         TEXT NOT NULL,
    application_no TEXT,
    govt_fee       REAL NOT NULL DEFAULT 0,
    service_charge REAL NOT NULL DEFAULT 0,
    amount_paid    REAL NOT NULL DEFAULT 0,
    payment_mode   TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    submitted_at   TEXT,
    data           TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_app_ref ON applications(ref_no);
  CREATE INDEX IF NOT EXISTS idx_app_customer ON applications(customer_id);
  CREATE INDEX IF NOT EXISTS idx_app_created ON applications(created_at);
  CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);

  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    action    TEXT NOT NULL,
    entity    TEXT,
    entity_id TEXT,
    meta      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function open(file) {
  if (db) return db;
  db = new DatabaseSync(file);
  if (file !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
  migrate();
  return db;
}

function close() {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}

function conn() {
  if (!db) throw new Error('Database not opened');
  return db;
}

function migrate() {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function now() {
  return new Date().toISOString();
}

function transaction(fn) {
  const d = conn();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

// ── Customers ────────────────────────────────────────────────────────────────

function rowToCustomer(row) {
  if (!row) return null;
  const payload = decryptJSON(row.data, `customers:${row.id}`);
  return {
    ...payload,
    id: row.id,
    customer_no: row.customer_no,
    created_at: row.created_at,
    updated_at: row.updated_at,
    consent_store: !!row.consent_store,
    delete_after: row.delete_after || null,
  };
}

function stripCustomerMeta(customer) {
  // eslint-disable-next-line no-unused-vars
  const { id, customer_no, created_at, updated_at, consent_store, delete_after, ...payload } = customer;
  return payload;
}

const customers = {
  nextNumber() {
    const row = conn().prepare('SELECT COALESCE(MAX(customer_no), 0) + 1 AS n FROM customers').get();
    return row.n;
  },

  insert(customer) {
    const ts = now();
    const record = {
      ...customer,
      customer_no: customer.customer_no || customers.nextNumber(),
      created_at: customer.created_at || ts,
      updated_at: ts,
    };
    conn().prepare(`
      INSERT INTO customers (id, customer_no, created_at, updated_at, consent_store, delete_after, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.customer_no, record.created_at, record.updated_at,
      record.consent_store ? 1 : 0, record.delete_after || null,
      encryptJSON(stripCustomerMeta(record), `customers:${record.id}`),
    );
    return customers.get(record.id);
  },

  get(id) {
    return rowToCustomer(conn().prepare('SELECT * FROM customers WHERE id = ?').get(id));
  },

  update(customer) {
    const ts = now();
    const res = conn().prepare(`
      UPDATE customers SET updated_at = ?, consent_store = ?, delete_after = ?, data = ? WHERE id = ?
    `).run(
      ts, customer.consent_store ? 1 : 0, customer.delete_after || null,
      encryptJSON(stripCustomerMeta(customer), `customers:${customer.id}`),
      customer.id,
    );
    if (res.changes === 0) throw new Error(`Customer not found: ${customer.id}`);
    return customers.get(customer.id);
  },

  delete(id) {
    return conn().prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0;
  },

  all() {
    return conn().prepare('SELECT * FROM customers ORDER BY updated_at DESC').all().map((row) => {
      try { return rowToCustomer(row); } catch (err) {
        return { id: row.id, customer_no: row.customer_no, _decrypt_error: err.message };
      }
    });
  },

  dueForDeletion(isoNow) {
    return conn().prepare('SELECT id FROM customers WHERE delete_after IS NOT NULL AND delete_after <= ?')
      .all(isoNow).map((r) => r.id);
  },

  olderThan(isoCutoff) {
    return conn().prepare('SELECT id FROM customers WHERE updated_at < ?').all(isoCutoff).map((r) => r.id);
  },

  count() {
    return conn().prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  },

  countCreatedBetween(fromIso, toIso) {
    return conn().prepare('SELECT COUNT(*) AS n FROM customers WHERE created_at >= ? AND created_at < ?')
      .get(fromIso, toIso).n;
  },
};

// ── Applications ─────────────────────────────────────────────────────────────

const APP_COLUMNS = ['ref_no', 'customer_id', 'service_id', 'status', 'application_no', 'govt_fee',
  'service_charge', 'amount_paid', 'payment_mode', 'created_at', 'updated_at', 'submitted_at'];

function rowToApplication(row) {
  if (!row) return null;
  let personal = {};
  if (row.data) {
    try { personal = decryptJSON(row.data, `applications:${row.id}`) || {}; } catch { personal = { _decrypt_error: true }; }
  }
  const out = { id: row.id };
  for (const c of APP_COLUMNS) out[c] = row[c] === undefined ? null : row[c];
  return { ...out, ...personal };
}

const applications = {
  nextRefNo(year = new Date().getFullYear()) {
    const row = conn().prepare(`
      SELECT ref_no FROM applications WHERE ref_no LIKE ?
      ORDER BY CAST(substr(ref_no, 6) AS INTEGER) DESC LIMIT 1
    `).get(`${year}-%`);
    const last = row ? parseInt(String(row.ref_no).slice(5), 10) || 0 : 0;
    return `${year}-${String(last + 1).padStart(4, '0')}`;
  },

  insert(app) {
    const ts = now();
    const rec = {
      status: 'draft', govt_fee: 0, service_charge: 0, amount_paid: 0,
      ...app,
      ref_no: app.ref_no || applications.nextRefNo(),
      created_at: app.created_at || ts,
      updated_at: ts,
    };
    const personal = { customer_name: rec.customer_name || '', customer_mobile: rec.customer_mobile || '', notes: rec.notes || '' };
    conn().prepare(`
      INSERT INTO applications (id, ref_no, customer_id, service_id, status, application_no, govt_fee,
        service_charge, amount_paid, payment_mode, created_at, updated_at, submitted_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rec.id, rec.ref_no, rec.customer_id, rec.service_id, rec.status, rec.application_no || null,
      Number(rec.govt_fee) || 0, Number(rec.service_charge) || 0, Number(rec.amount_paid) || 0,
      rec.payment_mode || null, rec.created_at, rec.updated_at, rec.submitted_at || null,
      encryptJSON(personal, `applications:${rec.id}`),
    );
    return applications.get(rec.id);
  },

  get(id) {
    return rowToApplication(conn().prepare('SELECT * FROM applications WHERE id = ?').get(id));
  },

  update(app) {
    const personal = { customer_name: app.customer_name || '', customer_mobile: app.customer_mobile || '', notes: app.notes || '' };
    const res = conn().prepare(`
      UPDATE applications SET status = ?, application_no = ?, govt_fee = ?, service_charge = ?, amount_paid = ?,
        payment_mode = ?, updated_at = ?, submitted_at = ?, data = ?
      WHERE id = ?
    `).run(
      app.status, app.application_no || null, Number(app.govt_fee) || 0, Number(app.service_charge) || 0,
      Number(app.amount_paid) || 0, app.payment_mode || null, now(), app.submitted_at || null,
      encryptJSON(personal, `applications:${app.id}`), app.id,
    );
    if (res.changes === 0) throw new Error(`Application not found: ${app.id}`);
    return applications.get(app.id);
  },

  delete(id) {
    return conn().prepare('DELETE FROM applications WHERE id = ?').run(id).changes > 0;
  },

  list({ from, to, status, serviceId, customerId, limit = 500 } = {}) {
    const where = [];
    const params = [];
    if (from) { where.push('created_at >= ?'); params.push(from); }
    if (to) { where.push('created_at < ?'); params.push(to); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (serviceId) { where.push('service_id = ?'); params.push(serviceId); }
    if (customerId) { where.push('customer_id = ?'); params.push(customerId); }
    const sql = `SELECT * FROM applications ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC LIMIT ?`;
    params.push(Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000));
    return conn().prepare(sql).all(...params).map(rowToApplication);
  },

  /** Remove personal snapshot when the customer is deleted, keep the bookkeeping row. */
  anonymiseForCustomer(customerId) {
    const rows = conn().prepare('SELECT id FROM applications WHERE customer_id = ?').all(customerId);
    for (const { id } of rows) {
      conn().prepare('UPDATE applications SET data = ?, updated_at = ? WHERE id = ?')
        .run(encryptJSON({ customer_name: '', customer_mobile: '', notes: '', anonymised: true }, `applications:${id}`), now(), id);
    }
    return rows.length;
  },

  totalsBetween(fromIso, toIso) {
    return conn().prepare(`
      SELECT COUNT(*) AS count,
             COALESCE(SUM(govt_fee), 0) AS govt_fee,
             COALESCE(SUM(service_charge), 0) AS service_charge,
             COALESCE(SUM(amount_paid), 0) AS amount_paid
      FROM applications WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'
    `).get(fromIso, toIso);
  },

  countByStatus() {
    return conn().prepare('SELECT status, COUNT(*) AS n FROM applications GROUP BY status').all();
  },
};

// ── Settings (JSON values; secrets encrypted) ─────────────────────────────────

const settings = {
  get(key, fallback = null) {
    const row = conn().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  },
  set(key, value) {
    conn().prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
    return value;
  },
  remove(key) {
    conn().prepare('DELETE FROM settings WHERE key = ?').run(key);
  },
  getSecret(key) {
    const row = conn().prepare('SELECT value FROM settings WHERE key = ?').get(`secret:${key}`);
    if (!row) return null;
    try { return decryptJSON(JSON.parse(row.value), `settings:${key}`); } catch { return null; }
  },
  setSecret(key, value) {
    settings.set(`secret:${key}`, encryptJSON(value, `settings:${key}`));
  },
};

// ── Audit log (never store personal data in meta) ─────────────────────────────

const audit = {
  log(action, entity = null, entityId = null, meta = null) {
    try {
      conn().prepare('INSERT INTO audit_log (ts, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?)')
        .run(now(), action, entity, entityId, meta ? JSON.stringify(meta) : null);
    } catch (err) {
      console.warn('[audit] write failed:', err.message);
    }
  },
  list({ limit = 200, offset = 0 } = {}) {
    return conn().prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(Math.min(limit, 2000), Math.max(offset, 0))
      .map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
  },
  pruneOlderThan(isoCutoff) {
    return conn().prepare('DELETE FROM audit_log WHERE ts < ?').run(isoCutoff).changes;
  },
};

/** Consistent snapshot of the whole database into another file. */
function backupTo(file) {
  const escaped = String(file).replace(/'/g, "''");
  conn().exec(`VACUUM INTO '${escaped}'`);
}

module.exports = {
  open, close, conn, transaction, backupTo,
  customers, applications, settings, audit,
};
