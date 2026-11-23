import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, CopyButton, ServiceStatusPill, ConfidenceChip, PrintPortal, formatINR } from './common';
import { ReviewSheet, Receipt } from './PrintTemplates';

export default function ApplyView({ customer, serviceId, onBack }) {
  const { t, L } = useLang();
  const { notify, settings, extensionPaired, catalog } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ application_no: '', status: 'submitted', govt_fee: '', service_charge: '', amount_paid: '', payment_mode: 'cash', notes: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [printing, setPrinting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api(`/api/customers/${customer.id}/services/${serviceId}`);
        if (cancelled) return;
        setData(r);
        const fees = r.evaluation.fees || {};
        const g = fees.govt_fee ?? '';
        const sc = fees.service_charge ?? '';
        setForm((f) => ({ ...f, govt_fee: g, service_charge: sc, amount_paid: g === '' && sc === '' ? '' : (Number(g) || 0) + (Number(sc) || 0) }));
        // tell the extension which customer + service is being filled
        await api('/api/customers/active', { method: 'POST', body: { customer_id: customer.id, service_id: serviceId } });
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [customer.id, customer.updated_at, serviceId]);

  if (error) return <div className="card danger">{error} <button className="btn btn-secondary btn-sm" onClick={onBack}>← {t('back')}</button></div>;
  if (!data) return <div className="row muted"><Spinner /> {t('loading')}</div>;

  const ev = data.evaluation;
  const fill = data.fill;
  const missingRequired = fill.filter((f) => f.required && (f.value === null || f.value === undefined || f.value === ''));
  const shop = settings && settings.settings.shop;
  const statuses = (catalog && catalog.application_statuses) || [];

  const allText = fill.filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
    .map((f) => `${L(f.label)}: ${f.value}`).join('\n');

  async function record() {
    setSaving(true);
    try {
      const r = await api('/api/applications', {
        method: 'POST',
        body: {
          customer_id: customer.id, service_id: serviceId, status: form.status,
          application_no: form.application_no || null,
          govt_fee: form.govt_fee === '' ? 0 : form.govt_fee,
          service_charge: form.service_charge === '' ? 0 : form.service_charge,
          amount_paid: form.amount_paid === '' ? 0 : form.amount_paid,
          payment_mode: form.payment_mode, notes: form.notes,
        },
      });
      setSaved(r.application);
      notify(t('recorded'));
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div className="row mb16">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← {t('back')}</button>
        <h2 style={{ fontSize: 20 }}>{L(ev.name)}</h2>
        <ServiceStatusPill status={ev.status} />
      </div>

      {ev.status !== 'ready' && (
        <div className="card warn small">
          ⚠ {L({ en: 'Not everything is ready:', hi: 'सब कुछ तैयार नहीं है:' })}{' '}
          {[...ev.missing.documents.map((d) => L(d.label)), ...ev.missing.fields.map((f) => L(f.label)), ...(ev.missing.answers.length ? [`${ev.missing.answers.length} ${t('askCustomer')}`] : [])].join(' · ')}
        </div>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="row-between mb12">
            <div className="card-title" style={{ marginBottom: 0 }}>1 · {t('valuesToFill')}</div>
            <CopyButton value={allText} />
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {fill.map((f) => {
                  const empty = f.value === null || f.value === undefined || f.value === '';
                  return (
                    <tr key={f.key} style={empty && f.required ? { background: 'var(--red-soft)' } : undefined}>
                      <td className="small muted" style={{ width: '38%' }}>{L(f.label)}{f.required ? '' : <span className="tiny"> ({t('optional')})</span>}</td>
                      <td style={{ fontWeight: 600, wordBreak: 'break-word' }}>{empty ? <span className="muted">—</span> : String(f.value)}</td>
                      <td style={{ width: 64 }}><ConfidenceChip source={f.source} /></td>
                      <td style={{ width: 80 }}><CopyButton value={empty ? '' : f.value} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {missingRequired.length > 0 && <div className="field-hint error mt8">✕ {missingRequired.length} {L({ en: 'required value(s) missing — fill them in the Details tab first.', hi: 'आवश्यक मान खाली — पहले विवरण टैब में भरें।' })}</div>}
        </div>

        <div>
          <div className="card">
            <div className="card-title">2 · {t('openPortal')}</div>
            <p className="small dim mb12">{L(ev.portal && ev.portal.steps)}</p>
            <div className="row">
              <a className="btn btn-primary" href={ev.portal && ev.portal.url} target="_blank" rel="noopener noreferrer">🌐 {t('openPortal')} ↗</a>
              <button className="btn btn-secondary" onClick={() => setPrinting('review')}>🖨 {t('printReview')}</button>
            </div>
            <div className={`small mt12 ${extensionPaired ? '' : 'muted'}`}>
              {extensionPaired ? `⚡ ${t('extensionReady')}` : L({ en: '⚡ Extension not connected — use the Copy buttons, or install it from "Browser extension".', hi: '⚡ एक्सटेंशन जुड़ा नहीं — कॉपी बटन उपयोग करें, या "ब्राउज़र एक्सटेंशन" से इंस्टॉल करें।' })}
            </div>
            <div className="field-hint warn mt8">🛈 {t('neverSubmits')}</div>
          </div>

          <div className="card">
            <div className="card-title">3 · {t('recordApplication')}</div>
            {saved ? (
              <div className="col">
                <div className="pill good" style={{ alignSelf: 'flex-start' }}>✓ {t('recorded')} — {saved.ref_no}</div>
                <div className="row">
                  <button className="btn btn-primary" onClick={() => setPrinting('receipt')}>🖨 {t('printReceipt')}</button>
                  <button className="btn btn-secondary" onClick={onBack}>← {t('back')}</button>
                </div>
              </div>
            ) : (
              <div className="col">
                <div className="field-group">
                  <label className="field-label">{t('applicationNo')}</label>
                  <input className="field-input" value={form.application_no} onChange={set('application_no')} placeholder="e.g. 2026-25-123456" />
                </div>
                <div className="grid2">
                  <div className="field-group">
                    <label className="field-label">{t('status')}</label>
                    <select className="field-input" value={form.status} onChange={set('status')}>
                      {statuses.map((s) => <option key={s.id} value={s.id}>{L(s.label)}</option>)}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">{t('paymentMode')}</label>
                    <select className="field-input" value={form.payment_mode} onChange={set('payment_mode')}>
                      <option value="cash">{t('cash')}</option>
                      <option value="upi">{t('upi')}</option>
                      <option value="other">{t('other')}</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">{t('feeGovt')} (₹)</label>
                    <input className="field-input" value={form.govt_fee} onChange={set('govt_fee')} inputMode="decimal" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">{t('feeService')} (₹)</label>
                    <input className="field-input" value={form.service_charge} onChange={set('service_charge')} inputMode="decimal" />
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">{t('amountPaid')} (₹) — {t('total')}: {formatINR((Number(form.govt_fee) || 0) + (Number(form.service_charge) || 0))}</label>
                  <input className="field-input" value={form.amount_paid} onChange={set('amount_paid')} inputMode="decimal" />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('notes')}</label>
                  <input className="field-input" value={form.notes} onChange={set('notes')} />
                </div>
                <button className="btn btn-green" onClick={record} disabled={saving}>{saving ? <Spinner /> : '💾'} {t('recordApplication')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {printing === 'review' && (
        <PrintPortal onDone={() => setPrinting(null)}>
          <ReviewSheet service={ev} fields={fill} customer={customer} shop={shop} />
        </PrintPortal>
      )}
      {printing === 'receipt' && saved && (
        <PrintPortal onDone={() => setPrinting(null)}>
          <Receipt application={saved} service={ev} shop={shop} />
        </PrintPortal>
      )}
    </div>
  );
}
