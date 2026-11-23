'use strict';

/**
 * End-to-end API test against a throwaway data folder.
 * No cloud AI is used (GROQ_API_KEY is blanked for the test).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-test-'));
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.BACKUP_DIR = path.join(TMP, 'backups');
process.env.OCR_DATA_DIR = path.join(TMP, 'ocr');
process.env.FRONTEND_BUILD_DIR = path.join(TMP, 'no-build');
process.env.GROQ_API_KEY = '';
process.env.DEMO_MODE = 'false';

const { createApp, bootstrap } = require('../server');
const db = require('../db');
const F = require('./fixtures');

let server;
let base;
let token;
let customerId;
let applicationId;

async function api(method, url, { body, auth = true, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (auth && token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function makeTextPdf(text) {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 800;
  // Helvetica cannot draw Hindi, so keep only the ASCII part of each line
  for (const line of text.split('\n').map((l) => l.replace(/[^\x20-\x7e]/g, '').trim()).filter(Boolean)) {
    page.drawText(line, { x: 40, y, size: 12, font });
    y -= 18;
  }
  return Buffer.from(await pdf.save());
}

test.before(async () => {
  bootstrap();
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await require('../utils/ocr').shutdown();
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('first run: PIN setup required and API locked', async () => {
  const s = await api('GET', '/api/auth/status', { auth: false });
  assert.equal(s.data.setup_required, true);
  const locked = await api('GET', '/api/customers', { auth: false });
  assert.equal(locked.status, 401);
});

test('PIN setup, duplicate setup refused, login works, wrong PIN refused', async () => {
  const r = await api('POST', '/api/auth/setup', { auth: false, body: { pin: '4321' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  const again = await api('POST', '/api/auth/setup', { auth: false, body: { pin: '9999' } });
  assert.equal(again.status, 409);
  const bad = await api('POST', '/api/auth/login', { auth: false, body: { pin: '0000' } });
  assert.equal(bad.status, 401);
  const good = await api('POST', '/api/auth/login', { auth: false, body: { pin: '4321' } });
  assert.equal(good.status, 200);
  token = good.data.token;
});

test('create customer → becomes active', async () => {
  const r = await api('POST', '/api/customers', { body: { consent_store: true, name: 'Test Person Alpha', phone: '9876543210' } });
  assert.equal(r.status, 201);
  customerId = r.data.customer.id;
  assert.equal(r.data.customer.flat.name, 'Test Person Alpha');
  assert.equal(r.data.customer.flat.phone, '9876543210');
  const active = await api('GET', '/api/customers/active');
  assert.equal(active.data.active.customer_id, customerId);
});

test('upload a digital PDF → Aadhaar detected and number validated', async () => {
  const pdf = await makeTextPdf(`${F.AADHAAR_FRONT}\n${F.AADHAAR_BACK}`);
  const form = new FormData();
  form.append('documents', new Blob([pdf], { type: 'application/pdf' }), 'aadhaar.pdf');
  form.append('doc_types', JSON.stringify(['auto']));
  const r = await api('POST', `/api/customers/${customerId}/documents`, { body: form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const res = r.data.results[0];
  assert.equal(res.ok, true, res.error);
  assert.equal(res.doc_type, 'aadhaar');
  assert.equal(res.ocr.method, 'pdf-text');
  assert.equal(res.fields.id_number, F.FAKE_AADHAAR_SPACED);
  const flat = r.data.customer.flat;
  assert.equal(flat.name, 'Test Person Alpha', 'operator-typed name still wins');
  assert.equal(flat.pincode, '303301');
  assert.equal(flat.dob, '14/08/1994');
  assert.ok(r.data.customer.conflicts.find((c) => c.key === 'name'), 'typed name vs Aadhaar name is shown as a conflict');
});

test('unsupported file type is rejected politely', async () => {
  const form = new FormData();
  form.append('documents', new Blob([Buffer.from('hello world, not an image')], { type: 'text/plain' }), 'notes.txt');
  const r = await api('POST', `/api/customers/${customerId}/documents`, { body: form });
  assert.equal(r.status, 200);
  assert.equal(r.data.results[0].ok, false);
  assert.equal(r.data.results[0].error, 'unsupported_file');
});

test('edit fields, answer questions, tick documents', async () => {
  const r = await api('PATCH', `/api/customers/${customerId}`, {
    body: { fields: { father_name: 'Mohan Lal Sharma', years_in_rajasthan: '25' }, declared: { no_existing_pan: true }, manual_docs: { photo: true } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.customer.flat.father_name, 'Mohan Lal Sharma');
  assert.equal(r.data.customer.flat.years_in_rajasthan, 25);
  assert.equal(r.data.customer.declared.no_existing_pan, true);
  assert.equal(r.data.customer.manual_docs.photo, true);
});

test('eligibility for all services + fill data for one', async () => {
  const all = await api('GET', `/api/customers/${customerId}/services`);
  assert.equal(all.status, 200);
  assert.ok(all.data.services.length >= 10);
  for (const s of all.data.services) assert.ok(['ready', 'needs_info', 'not_eligible'].includes(s.status));
  const one = await api('GET', `/api/customers/${customerId}/services/pan_card`);
  assert.equal(one.status, 200);
  assert.ok(one.data.fill.find((f) => f.key === 'id_number' && f.value === F.FAKE_AADHAAR_SPACED));
  assert.equal(one.data.evaluation.rules[0].status, 'pass', 'no_existing_pan answered yes');
});

test('service settings: fees and verified rule value are applied', async () => {
  const r = await api('PUT', '/api/settings/services/mool_niwas', {
    body: { govt_fee: 40, service_charge: 50, rules: { residence_years: { value: 8, verified: true } } },
  });
  assert.equal(r.status, 200);
  const leaf = r.data.service.rules[1].rules[0];
  assert.equal(leaf.value, 8);
  assert.equal(leaf.verified, true);
  assert.equal(r.data.service.fees.govt_fee, 40);
  const ev = await api('GET', `/api/customers/${customerId}/services/mool_niwas`);
  assert.equal(ev.data.evaluation.rules[1].children[0].value, 8);
});

test('application register: create, update, summary, CSV', async () => {
  const c = await api('POST', '/api/applications', { body: { customer_id: customerId, service_id: 'mool_niwas', status: 'submitted', application_no: 'RJ-TEST-001', amount_paid: 90, payment_mode: 'cash' } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  applicationId = c.data.application.id;
  assert.match(c.data.application.ref_no, /^\d{4}-0001$/);
  assert.equal(c.data.application.govt_fee, 40, 'fee defaults from service settings');
  assert.equal(c.data.application.total, 90);
  const u = await api('PATCH', `/api/applications/${applicationId}`, { body: { status: 'approved' } });
  assert.equal(u.data.application.status, 'approved');
  const s = await api('GET', '/api/applications/summary');
  assert.equal(s.data.today.count, 1);
  assert.equal(s.data.today.amount_paid, 90);
  const csv = await api('GET', '/api/applications/export.csv', { raw: true });
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Excel-friendly UTF-8 BOM');
  const text = bytes.toString('utf8');
  assert.match(text, /RJ-TEST-001/);
  assert.match(text, /Test Person Alpha/);
});

test('extension API: needs paired key, returns only the active customer', async () => {
  const noKey = await api('GET', '/api/ext/active', { auth: false });
  assert.equal(noKey.status, 401);
  const k = await api('GET', '/api/settings/extension-key');
  const r = await api('GET', '/api/ext/active', { auth: false, headers: { 'X-Extension-Key': k.data.key } });
  assert.equal(r.status, 200);
  assert.equal(r.data.active.customer.id, customerId);
  assert.equal(r.data.values.id_number, F.FAKE_AADHAAR_SPACED);
  assert.equal(r.data.values.first_name, 'Test');
  assert.ok(r.data.fields.find((f) => f.key === 'name_hi'));
});

test('tools: compress an image under a size limit', async () => {
  const sharp = require('sharp');
  const noisy = Buffer.alloc(1200 * 900 * 3);
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 2654435761) % 251;
  const png = await sharp(noisy, { raw: { width: 1200, height: 900, channels: 3 } }).png().toBuffer();
  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'scan.png');
  form.append('max_kb', '60');
  form.append('output', 'jpg');
  const res = await api('POST', '/api/tools/compress', { body: form, raw: true });
  assert.equal(res.status, 200);
  const out = Buffer.from(await res.arrayBuffer());
  assert.ok(out.length <= 60 * 1024, `got ${out.length} bytes`);
  assert.equal(out[0], 0xff);
  assert.equal(out[1], 0xd8);
});

test('data at rest is encrypted: names and Aadhaar are not readable in the DB files', () => {
  const dir = process.env.DATA_DIR;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('shop.db'));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    assert.equal(bytes.includes(Buffer.from('Test Person Alpha')), false, `${f} contains the plain name`);
    assert.equal(bytes.includes(Buffer.from(F.FAKE_AADHAAR_SPACED)), false, `${f} contains the Aadhaar number`);
    assert.equal(bytes.includes(Buffer.from('9876543210')), false, `${f} contains the mobile`);
  }
});

test('backup creates database copy + key', async () => {
  const r = await api('POST', '/api/settings/backup');
  assert.equal(r.status, 200);
  const dir = path.join(process.env.BACKUP_DIR, r.data.backup);
  assert.ok(fs.existsSync(path.join(dir, 'shop.db')));
  assert.ok(fs.existsSync(path.join(dir, 'master.key')));
});

test('deleting a customer keeps the bookkeeping row but removes personal data', async () => {
  const d = await api('DELETE', `/api/customers/${customerId}`);
  assert.equal(d.status, 200);
  const list = await api('GET', '/api/applications');
  const app = list.data.applications.find((a) => a.id === applicationId);
  assert.ok(app, 'application row kept for accounts');
  assert.equal(app.customer_name, '');
  const gone = await api('GET', `/api/customers/${customerId}`);
  assert.equal(gone.status, 404);
});
