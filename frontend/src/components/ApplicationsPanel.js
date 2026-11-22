import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, Empty, Confirm, Modal, formatINR, formatDateTime, PrintPortal } from './common';
import { Receipt } from './PrintTemplates';

function isoDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function range(period) {
  const now = new Date();
  if (period === 'today') return { from: isoDay(now), to: isoDay(now) };
  if (period === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { from: isoDay(s), to: isoDay(now) }; }
  if (period === 'month') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  return { from: '', to: '' };
}

const STATUS_CLS = { draft: 'neutral', submitted: 'info', in_process: 'warn', approved: 'good', rejected: 'bad', delivered: 'good', cancelled: 'neutral' };

function EditModal({ app, statuses, onClose, onSaved }) {
  const { t, L } = useLang();
  const { notify } = useApp();
  const [f, setF] = useState({
    application_no: app.application_no || '', status: app.status, govt_fee: app.govt_fee, service_charge: app.service_charge,
    amount_paid: app.amount_paid, payment_mode: app.payment_mode || 'cash', notes: app.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      const r = await api(`/api/applications/${app.id}`, { method: 'PATCH', body: f });
      onSaved(r.application);
    } catch (err) { notify(err.message, 'error'); setBusy(false); }
  }
  return (
    <Modal title={`${app.ref_no} · ${L(app.service_name)}`} icon="🧾" onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : '💾'} {t('save')}</button></>}>
      <div className="col">
        <div className="field-group"><label className="field-label">{t('applicationNo')}</label><input className="field-input" value={f.application_no} onChange={set('application_no')} /></div>
        <div className="grid2">
          <div className="field-group"><label className="field-label">{t('status')}</label>
            <select className="field-input" value={f.status} onChange={set('status')}>{statuses.map((s) => <option key={s.id} value={s.id}>{L(s.label)}</option>)}</select></div>
          <div className="field-group"><label className="field-label">{t('paymentMode')}</label>
            <select className="field-input" value={f.payment_mode} onChange={set('payment_mode')}>
              <option value="cash">{t('cash')}</option><option value="upi">{t('upi')}</option><option value="other">{t('other')}</option></select></div>
          <div className="field-group"><label className="field-label">{t('feeGovt')}</label><input className="field-input" value={f.govt_fee} onChange={set('govt_fee')} inputMode="decimal" /></div>
          <div className="field-group"><label className="field-label">{t('feeService')}</label><input className="field-input" value={f.service_charge} onChange={set('service_charge')} inputMode="decimal" /></div>
          <div className="field-group"><label className="field-label">{t('amountPaid')}</label><input className="field-input" value={f.amount_paid} onChange={set('amount_paid')} inputMode="decimal" /></div>
        </div>
        <div className="field-group"><label className="field-label">{t('notes')}</label><input className="field-input" value={f.notes} onChange={set('notes')} /></div>
      </div>
    </Modal>
  );
}

export default function ApplicationsPanel({ customerId, embedded }) {
  const { t, L, lang } = useLang();
  const { catalog, notify, openCustomer, settings } = useApp();
  const [period, setPeriod] = useState(embedded ? 'all' : 'month');
  const [status, setStatus] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [printing, setPrinting] = useState(null);

  const statuses = (catalog && catalog.application_statuses) || [];
  const services = (settings && settings.services) || [];

  const load = useCallback(async () => {
    const { from, to } = range(period);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    if (serviceId) params.set('service_id', serviceId);
    if (customerId) params.set('customer_id', customerId);
    if (q.trim()) params.set('q', q.trim());
    try {
      const r = await api(`/api/applications?${params.toString()}`);
      setList(r.applications);
    } catch (err) { notify(err.message, 'error'); setList([]); }
  }, [period, status, serviceId, customerId, q, notify]);

  useEffect(() => { const h = setTimeout(load, q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);

  const totals = useMemo(() => (list || []).filter((a) => a.status !== 'cancelled').reduce((s, a) => ({
    count: s.count + 1, govt: s.govt + (a.govt_fee || 0), service: s.service + (a.service_charge || 0), paid: s.paid + (a.amount_paid || 0),
  }), { count: 0, govt: 0, service: 0, paid: 0 }), [list]);

  async function quickStatus(app, st) {
    try {
      const r = await api(`/api/applications/${app.id}`, { method: 'PATCH', body: { status: st } });
      setList((l) => l.map((x) => (x.id === app.id ? r.application : x)));
    } catch (err) { notify(err.message, 'error'); }
  }

  async function exportCsv() {
    const { from, to } = range(period);
    const params = new URLSearchParams({ lang });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try { await downloadFile(`/api/applications/export.csv?${params.toString()}`, 'applications.csv'); } catch (err) { notify(err.message, 'error'); }
  }

  async function remove() {
    const id = del.id;
    setDel(null);
    try {
      await api(`/api/applications/${id}`, { method: 'DELETE' });
      setList((l) => l.filter((x) => x.id !== id));
    } catch (err) { notify(err.message, 'error'); }
  }

  return (
    <div style={{ animation: embedded ? undefined : 'fadeUp .3s ease' }}>
      {!embedded && (
        <div className="page-header">
          <div>
            <h1 className="page-title">📋 {t('applications')}</h1>
            <p className="page-sub">{L({ en: 'Every application you submitted, with fees and status.', hi: 'आपके जमा किए सभी आवेदन, शुल्क और स्थिति सहित।' })}</p>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}>⬇ {t('exportCsv')}</button>
        </div>
      )}

      <div className="row mb12">
        {[['today', t('today')], ['week', t('thisWeek')], ['month', t('thisMonth')], ['all', t('allTime')]].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${period === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(id)}>{label}</button>
        ))}
        <select className="field-input" style={{ width: 170, padding: '6px 8px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('allStatuses')}</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{L(s.label)}</option>)}
        </select>
        {!embedded && (
          <select className="field-input" style={{ width: 220, padding: '6px 8px' }} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">{t('allServices')}</option>
            {services.map((s) => <option key={s.id} value={s.id}>{L(s.name)}</option>)}
          </select>
        )}
        {!embedded && <input className="field-input" style={{ width: 220, padding: '6px 8px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔎 ${L({ en: 'Name, mobile, app no.', hi: 'नाम, मोबाइल, आवेदन सं.' })}`} />}
      </div>

      {!list ? <div className="row muted"><Spinner /> {t('loading')}</div> : list.length === 0 ? (
        <div className="card"><Empty icon="🧾">{t('noApplications')}</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('refNo')}</th><th>{t('date')}</th>{!embedded && <th>{t('customer')}</th>}<th>{t('service')}</th>
                <th>{t('applicationNo')}</th><th>{t('status')}</th><th style={{ textAlign: 'right' }}>{t('total')}</th><th style={{ textAlign: 'right' }}>{L({ en: 'Paid', hi: 'प्राप्त' })}</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.ref_no}</td>
                  <td className="small">{formatDateTime(a.created_at, lang)}</td>
                  {!embedded && (
                    <td>
                      {a.customer_name ? <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => openCustomer(a.customer_id, 'applications')}>{a.customer_name}</button>
                        : <span className="muted small">{L({ en: '(deleted)', hi: '(हटाया गया)' })}</span>}
                      {a.customer_mobile && <div className="tiny muted">{a.customer_mobile}</div>}
                    </td>
                  )}
                  <td className="small">{L(a.service_name)}</td>
                  <td className="mono small">{a.application_no || '—'}</td>
                  <td>
                    <select className={`field-input`} style={{ padding: '3px 6px', fontSize: 12, width: 140 }} value={a.status} onChange={(e) => quickStatus(a, e.target.value)}>
                      {statuses.map((s) => <option key={s.id} value={s.id}>{L(s.label)}</option>)}
                    </select>
                    <div><span className={`pill ${STATUS_CLS[a.status] || 'neutral'}`} style={{ marginTop: 3 }}>{L((statuses.find((s) => s.id === a.status) || {}).label)}</span></div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatINR(a.total)}</td>
                  <td style={{ textAlign: 'right' }}>{formatINR(a.amount_paid)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" title={t('printReceipt')} onClick={() => setPrinting(a)}>🖨</button>
                    <button className="btn btn-ghost btn-sm" title={t('edit')} onClick={() => setEdit(a)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" title={t('delete')} onClick={() => setDel(a)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={embedded ? 5 : 6}>{t('total')}: {totals.count} · {t('feeGovt')} {formatINR(totals.govt)} · {t('feeService')} {formatINR(totals.service)}</td>
                <td style={{ textAlign: 'right' }}>{formatINR(totals.govt + totals.service)}</td>
                <td style={{ textAlign: 'right' }}>{formatINR(totals.paid)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {edit && <EditModal app={edit} statuses={statuses} onClose={() => setEdit(null)} onSaved={(a) => { setEdit(null); setList((l) => l.map((x) => (x.id === a.id ? a : x))); }} />}
      {del && <Confirm title={t('delete')} danger message={L({ en: `Delete application ${del.ref_no} from the register?`, hi: `आवेदन ${del.ref_no} रजिस्टर से हटाएँ?` })} confirmLabel={t('delete')} onCancel={() => setDel(null)} onConfirm={remove} />}
      {printing && (
        <PrintPortal onDone={() => setPrinting(null)}>
          <Receipt application={printing} shop={settings && settings.settings.shop} />
        </PrintPortal>
      )}
    </div>
  );
}
