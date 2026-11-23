/**
 * routes/applications.js — application register (what was submitted, fees,
 * status). Mounted at /api/applications (operator login required).
 */

'use strict';

const express = require('express');
const db = require('../db');
const store = require('../services/customerStore');
const { getService, getServices } = require('../services/serviceCatalog');
const { APPLICATION_STATUSES } = require('../config/catalog');
const { randomId } = require('../utils/crypto');
const { wrap } = require('../middleware');

const router = express.Router();
const STATUS_IDS = APPLICATION_STATUSES.map((s) => s.id);

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDayParam(v, endOfDay = false) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function serviceName(id) {
  const s = getService(db.settings, id);
  return s ? s.name : { en: id, hi: id };
}

function decorate(app) {
  return { ...app, service_name: serviceName(app.service_id), total: money(app.govt_fee) + money(app.service_charge), customer_no: (store.summaryOf(app.customer_id) || {}).customer_no || null };
}

router.get('/', wrap(async (req, res) => {
  const list = db.applications.list({
    from: parseDayParam(req.query.from),
    to: parseDayParam(req.query.to, true),
    status: STATUS_IDS.includes(req.query.status) ? req.query.status : undefined,
    serviceId: req.query.service_id || undefined,
    customerId: req.query.customer_id || undefined,
    limit: req.query.limit,
  });
  const q = String(req.query.q || '').trim().toLowerCase();
  const filtered = q ? list.filter((a) => [a.ref_no, a.application_no, a.customer_name, a.customer_mobile]
    .some((v) => v && String(v).toLowerCase().includes(q))) : list;
  res.json({ applications: filtered.map(decorate) });
}));

router.get('/summary', wrap(async (req, res) => {
  const today = startOfLocalDay();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const followCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const pending = db.applications.list({ limit: 2000 })
    .filter((a) => ['submitted', 'in_process'].includes(a.status) && (a.submitted_at || a.created_at) < followCutoff)
    .slice(0, 50).map(decorate);
  res.json({
    today: db.applications.totalsBetween(today.toISOString(), tomorrow.toISOString()),
    month: db.applications.totalsBetween(monthStart.toISOString(), tomorrow.toISOString()),
    new_customers_today: db.customers.countCreatedBetween(today.toISOString(), tomorrow.toISOString()),
    customers_total: db.customers.count(),
    by_status: db.applications.countByStatus(),
    follow_up: pending,
  });
}));

router.get('/export.csv', wrap(async (req, res) => {
  const list = db.applications.list({
    from: parseDayParam(req.query.from), to: parseDayParam(req.query.to, true), limit: 5000,
  });
  const lang = req.query.lang === 'hi' ? 'hi' : 'en';
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const statusLabel = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s.id, s.label[lang]]));
  const header = ['Ref No', 'Date', 'Customer No', 'Customer', 'Mobile', 'Service', 'Application No', 'Status', 'Govt Fee', 'Service Charge', 'Total', 'Amount Paid', 'Payment Mode', 'Notes'];
  const rows = list.map((a) => {
    const d = decorate(a);
    return [a.ref_no, new Date(a.created_at).toLocaleString('en-IN'), d.customer_no || '', a.customer_name, a.customer_mobile,
      d.service_name[lang], a.application_no, statusLabel[a.status] || a.status, money(a.govt_fee), money(a.service_charge),
      d.total, money(a.amount_paid), a.payment_mode, a.notes].map(esc).join(',');
  });
  db.audit.log('applications_exported', null, null, { rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [header.join(','), ...rows].join('\r\n'));
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const summary = store.summaryOf(b.customer_id);
  if (!summary) return res.status(404).json({ error: 'Customer not found' });
  const service = getService(db.settings, b.service_id);
  if (!service) return res.status(400).json({ error: 'Unknown service' });
  const status = STATUS_IDS.includes(b.status) ? b.status : 'draft';
  const app = db.applications.insert({
    id: randomId('app'),
    customer_id: summary.id,
    service_id: service.id,
    status,
    application_no: b.application_no ? String(b.application_no).slice(0, 60) : null,
    govt_fee: b.govt_fee !== undefined ? money(b.govt_fee) : money(service.fees.govt_fee),
    service_charge: b.service_charge !== undefined ? money(b.service_charge) : money(service.fees.service_charge),
    amount_paid: money(b.amount_paid),
    payment_mode: b.payment_mode ? String(b.payment_mode).slice(0, 20) : null,
    submitted_at: status !== 'draft' ? new Date().toISOString() : null,
    customer_name: summary.name || '',
    customer_mobile: summary.phone || '',
    notes: b.notes ? String(b.notes).slice(0, 1000) : '',
  });
  db.audit.log('application_created', 'application', app.id, { service: service.id, status });
  res.status(201).json({ application: decorate(app) });
}));

router.patch('/:id', wrap(async (req, res) => {
  const app = db.applications.get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const b = req.body || {};
  const next = { ...app };
  if (b.status !== undefined) {
    if (!STATUS_IDS.includes(b.status)) return res.status(400).json({ error: 'Unknown status' });
    next.status = b.status;
    if (b.status !== 'draft' && !next.submitted_at) next.submitted_at = new Date().toISOString();
  }
  if (b.application_no !== undefined) next.application_no = b.application_no ? String(b.application_no).slice(0, 60) : null;
  for (const k of ['govt_fee', 'service_charge', 'amount_paid']) if (b[k] !== undefined) next[k] = money(b[k]);
  if (b.payment_mode !== undefined) next.payment_mode = b.payment_mode ? String(b.payment_mode).slice(0, 20) : null;
  if (b.notes !== undefined) next.notes = String(b.notes || '').slice(0, 1000);
  const saved = db.applications.update(next);
  db.audit.log('application_updated', 'application', saved.id, { status: saved.status });
  return res.json({ application: decorate(saved) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const ok = db.applications.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Application not found' });
  db.audit.log('application_deleted', 'application', req.params.id);
  return res.json({ ok: true });
}));

router.get('/meta/services', (req, res) => {
  res.json({ services: getServices(db.settings, { includeDisabled: true }).map((s) => ({ id: s.id, name: s.name })), statuses: APPLICATION_STATUSES });
});

module.exports = router;
