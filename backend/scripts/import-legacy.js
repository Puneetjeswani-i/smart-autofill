/**
 * Import profiles saved by Smart Autofill v5 (backend/data/autofill.json)
 * into the new encrypted customer register.
 *
 *   npm run import-legacy            import
 *   npm run import-legacy -- --dry   only show what would be imported
 *
 * Imported values are marked "Imported from v5" with medium confidence so the
 * operator re-checks them. After importing, DELETE backend/data/autofill.json:
 * it stores personal data without real encryption.
 * Stop the running server first.
 */

'use strict';

const fs = require('fs');
const { bootstrap } = require('../server');
const { config } = require('../config');
const db = require('../db');
const store = require('../services/customerStore');
const P = require('../services/profileEngine');
const { FIELD_DEFS } = require('../config/catalog');
const { decryptProfile } = require('../utils/encryption');
const { randomId } = require('../utils/crypto');

const dry = process.argv.includes('--dry');

if (!fs.existsSync(config.legacyJsonDb)) {
  console.log(`No legacy file found at ${config.legacyJsonDb} — nothing to import.`);
  process.exit(0);
}

bootstrap();
const legacy = JSON.parse(fs.readFileSync(config.legacyJsonDb, 'utf8'));
const rows = Object.values(legacy.profiles || {});
let imported = 0;
let skipped = 0;

for (const row of rows) {
  let profile;
  try { profile = decryptProfile(JSON.parse(row.data)); } catch { skipped += 1; continue; }
  if (!profile || !profile.personal_info) { skipped += 1; continue; }
  const fields = {};
  const fieldMeta = {};
  for (const def of FIELD_DEFS) {
    const v = P.deepGet(profile, def.path);
    if (v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'object') {
      fields[def.key] = v;
      fieldMeta[def.key] = { confidence: 0.6, method: 'import' };
    }
  }
  if (!fields.name && !fields.id_number) { skipped += 1; continue; }
  if (dry) { imported += 1; continue; }
  const customer = store.create({ consentStore: true });
  P.addDocument(customer, {
    id: randomId('doc'), doc_type: 'other', file_label: 'Imported from Smart Autofill v5',
    uploaded_at: row.updated_at || new Date().toISOString(), kind: 'import', pages: 0,
    ocr: { method: 'import', confidence: 60 }, ai: { used: false },
    fields, field_meta: fieldMeta, evidence: { is_rajasthan: null, proves: 'address' }, warnings: [],
  });
  customer.notes = 'Imported from v5 — please re-check the details and re-upload documents.';
  store.save(customer);
  imported += 1;
}

db.close();
console.log(`${dry ? 'Would import' : 'Imported'} ${imported} profile(s); skipped ${skipped} empty/unreadable.`);
if (!dry) console.log(`Now delete ${config.legacyJsonDb} — it contains personal data in plain text.`);
