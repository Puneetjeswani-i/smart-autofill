/**
 * services/maintenance.js — backups and data retention.
 *
 * Backups: backups/<timestamp>/ contains shop.db + master.key + README.txt.
 * A backup is as sensitive as the live data (it holds the key): keep it on a
 * USB drive or folder only the owner can access.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { config } = require('../config');
const { getSettings } = require('./settingsService');
const store = require('./customerStore');

const README = `Smart Autofill backup
=====================
This folder contains a complete copy of the shop database (shop.db) and the
encryption key (master.key). Keep it private — anyone with both files can read
customer data.

To restore:
 1. Close the Smart Autofill window / stop the server.
 2. Copy shop.db and master.key into  backend\\data\\  (replace the old files).
    Delete backend\\data\\shop.db-wal and shop.db-shm if present.
 3. Start the app again.
`;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(config.backupDir, e.name, 'shop.db')))
    .map((e) => {
      const file = path.join(config.backupDir, e.name, 'shop.db');
      return { name: e.name, size: fs.statSync(file).size, created_at: fs.statSync(file).mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function pruneBackups(keep) {
  const list = listBackups();
  for (const b of list.slice(Math.max(1, keep))) {
    fs.rmSync(path.join(config.backupDir, b.name), { recursive: true, force: true });
  }
}

function createBackup(reason = 'manual') {
  const name = stamp();
  const dir = path.join(config.backupDir, name);
  fs.mkdirSync(dir, { recursive: true });
  db.backupTo(path.join(dir, 'shop.db'));
  fs.copyFileSync(config.keyFile, path.join(dir, 'master.key'));
  fs.writeFileSync(path.join(dir, 'README.txt'), README);
  pruneBackups(getSettings().backup.keep || 14);
  db.settings.set('last_backup', { name, at: new Date().toISOString(), reason });
  db.audit.log('backup_created', null, null, { reason });
  return { name, dir };
}

function dailyBackupIfDue() {
  const s = getSettings();
  if (!s.backup.daily) return null;
  const last = db.settings.get('last_backup', null);
  const today = new Date().toISOString().slice(0, 10);
  if (last && String(last.at).slice(0, 10) === today) return null;
  if (db.customers.count() === 0 && !last) return null; // nothing to protect yet
  try { return createBackup('daily'); } catch (err) {
    console.warn('[backup] daily backup failed:', err.message);
    return null;
  }
}

/** Delete customers whose time is up. Returns counts only (no personal data). */
function runRetention() {
  const s = getSettings();
  const nowIso = new Date().toISOString();
  let unconsented = 0;
  let expired = 0;
  for (const id of db.customers.dueForDeletion(nowIso)) {
    if (store.remove(id, 'no_consent_end_of_day')) unconsented += 1;
  }
  const days = Number(s.privacy.retention_days) || 0;
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    for (const id of db.customers.olderThan(cutoff)) {
      if (store.remove(id, 'retention_period')) expired += 1;
    }
  }
  db.audit.pruneOlderThan(new Date(Date.now() - 2 * 365 * 86400000).toISOString());
  return { unconsented, expired };
}

let timer = null;
function startSchedules() {
  const tick = () => {
    try {
      const r = runRetention();
      if (r.unconsented || r.expired) console.log(`[privacy] auto-deleted ${r.unconsented} unconsented and ${r.expired} expired customer record(s)`);
      dailyBackupIfDue();
    } catch (err) {
      console.warn('[maintenance] failed:', err.message);
    }
  };
  tick();
  timer = setInterval(tick, 30 * 60 * 1000);
  if (timer.unref) timer.unref();
}

function stopSchedules() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { createBackup, listBackups, dailyBackupIfDue, runRetention, startSchedules, stopSchedules };
