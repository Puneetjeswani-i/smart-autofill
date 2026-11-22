import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Modal, Spinner, Empty, formatDateTime, maskTail } from './common';

export function NewCustomerModal({ onClose, onCreated }) {
  const { t } = useLang();
  const { settings, notify } = useApp();
  const defaultConsent = !!(settings && settings.settings.privacy.default_consent);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(defaultConsent);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/customers', { method: 'POST', body: { name: name.trim() || undefined, phone: phone.trim() || undefined, consent_store: consent } });
      onCreated(r.customer);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={t('newCustomer')} icon="➕" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? <Spinner /> : '→'} {t('startSetup')}</button>
      </>}>
      <form className="col" onSubmit={create}>
        <div className="field-group">
          <label className="field-label">{t('nameOptional')}</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </div>
        <div className="field-group">
          <label className="field-label">{t('mobile')}</label>
          <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={14} placeholder="98XXXXXXXX" />
        </div>
        <label className="check-row mt8">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t('consentLabel')}</span>
        </label>
        {!consent && <div className="field-hint warn">{t('consentHelp')}</div>}
        <button type="submit" style={{ display: 'none' }} />
      </form>
    </Modal>
  );
}

export default function CustomersPanel({ onNewCustomer }) {
  const { t, L, lang } = useLang();
  const { openCustomer } = useApp();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);

  useEffect(() => {
    const h = setTimeout(() => {
      api(`/api/customers?limit=300${q.trim() ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setList(r.customers)).catch(() => setList([]));
    }, q ? 250 : 0);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 {t('customers')}</h1>
          <p className="page-sub">{L({ en: 'Everyone whose details are kept on this computer (encrypted).', hi: 'जिनका विवरण इस कंप्यूटर पर (एन्क्रिप्टेड) रखा है।' })}</p>
        </div>
        <button className="btn btn-primary" onClick={onNewCustomer}>➕ {t('newCustomer')}</button>
      </div>

      <input className="field-input mb16" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔎 ${t('searchHint')}`} autoFocus />

      {!list ? <div className="row muted"><Spinner /> {t('loading')}</div> : list.length === 0 ? (
        <div className="card"><Empty icon="👥" title={q ? L({ en: 'No match', hi: 'कोई मेल नहीं' }) : t('noCustomers')}>
          {!q && <button className="btn btn-primary mt12" onClick={onNewCustomer}>➕ {t('newCustomer')}</button>}
        </Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{L({ en: 'Name', hi: 'नाम' })}</th>
                <th>{t('mobile')}</th>
                <th>{L({ en: 'Aadhaar', hi: 'आधार' })}</th>
                <th>{L({ en: 'Place', hi: 'स्थान' })}</th>
                <th>{t('tabDocuments')}</th>
                <th>{L({ en: 'Last update', hi: 'अंतिम बदलाव' })}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => openCustomer(c.id, 'details')}>
                  <td className="mono muted">{c.customer_no}</td>
                  <td style={{ fontWeight: 600 }}>{c.name || <span className="muted">{t('unnamed')}</span>}{c.name_hi && c.name_hi !== c.name ? <div className="tiny muted">{c.name_hi}</div> : null}</td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td className="mono">{c.aadhaar_last4 ? maskTail(`00000000${c.aadhaar_last4}`) : '—'}</td>
                  <td>{c.village_city || c.district || '—'}</td>
                  <td>{c.documents}</td>
                  <td className="small muted">{formatDateTime(c.updated_at, lang)}</td>
                  <td>{c.consent_store ? <span className="pill good">{t('kept')}</span> : <span className="pill warn">{t('deletesTonight')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
