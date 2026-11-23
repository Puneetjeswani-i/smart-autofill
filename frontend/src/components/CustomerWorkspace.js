import React, { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, Confirm, maskTail } from './common';
import DocumentsTab from './DocumentsTab';
import DetailsTab from './DetailsTab';
import ServicesTab from './ServicesTab';
import ApplyView from './ApplyView';
import ResidencePanel from './ResidencePanel';
import ChecksTab from './ChecksTab';
import ApplicationsPanel from './ApplicationsPanel';

export default function CustomerWorkspace({ customerId, tab, onTab, onFinish, onDeleted, onChanged }) {
  const { t, L } = useLang();
  const { notify } = useApp();
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState(null);
  const [error, setError] = useState(null);
  const [applyServiceId, setApplyServiceId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusField, setFocusField] = useState(null);

  const loadServices = useCallback(async () => {
    try {
      const r = await api(`/api/customers/${customerId}/services`);
      setServices(r.services);
    } catch { /* shown in tab */ }
  }, [customerId]);

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/customers/${customerId}`);
      setCustomer(r.customer);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [customerId]);

  useEffect(() => { load(); loadServices(); }, [load, loadServices]);

  /** Tabs call this with the customer returned by the API after a change. */
  const update = useCallback((next) => {
    setCustomer(next);
    loadServices();
    if (onChanged) onChanged();
  }, [loadServices, onChanged]);

  async function exportData() {
    try { await downloadFile(`/api/customers/${customerId}/export`, `customer-${customer.customer_no}.json`); } catch (err) { notify(err.message, 'error'); }
  }

  async function deleteCustomer() {
    try {
      await api(`/api/customers/${customerId}`, { method: 'DELETE' });
      notify(L({ en: 'Customer deleted', hi: 'ग्राहक हटाया गया' }), 'info');
      onDeleted();
    } catch (err) { notify(err.message, 'error'); }
  }

  if (error) return <div className="card danger">{error}</div>;
  if (!customer) return <div className="row muted"><Spinner /> {t('loading')}</div>;

  const s = customer.summary;
  const flat = customer.flat;
  const missingCount = services ? services.filter((x) => x.status === 'ready').length : null;
  const conflicts = customer.conflicts.filter((c) => !c.resolved).length;
  const consistency = customer.reports && customer.reports.consistency;
  const residence = customer.reports && customer.reports.residence;

  const TABS = [
    { id: 'documents', label: t('tabDocuments'), icon: '📄', badge: customer.documents.length || null },
    { id: 'details', label: t('tabDetails'), icon: '✏️', badge: conflicts ? `${conflicts} ⚠` : null, badgeClass: conflicts ? 'warn' : '' },
    { id: 'services', label: t('tabServices'), icon: '🎯', badge: missingCount ? `${missingCount} ✓` : null, badgeClass: 'good' },
    { id: 'residence', label: t('tabResidence'), icon: '🏠', badge: residence ? (residence.status === 'sufficient' ? '✓' : residence.evidence_years ? `${residence.evidence_years}y` : null) : null, badgeClass: residence && residence.status === 'sufficient' ? 'good' : 'warn' },
    { id: 'checks', label: t('tabChecks'), icon: '🛡️', badge: consistency && consistency.failed ? consistency.failed : null, badgeClass: consistency && consistency.level === 'problem' ? 'bad' : 'warn' },
    { id: 'applications', label: t('tabApplications'), icon: '🧾' },
  ];

  return (
    <div style={{ animation: 'fadeUp .25s ease' }}>
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <div className="row">
            <h1 className="page-title" style={{ marginBottom: 0 }}>{s.name || t('unnamed')}</h1>
            <span className="mono muted">#{s.customer_no}</span>
            {customer.consent_store ? <span className="pill good">🔒 {t('kept')}</span> : <span className="pill warn" title={t('consentHelp')}>⏳ {t('deletesTonight')}</span>}
          </div>
          <div className="row small dim mt8">
            {flat.name_hi && <span>{flat.name_hi}</span>}
            {s.phone && <span>📱 {s.phone}</span>}
            {s.aadhaar_last4 && <span className="mono">🪪 {maskTail(`00000000${s.aadhaar_last4}`)}</span>}
            {flat.dob && <span>🎂 {flat.dob}{flat.age !== null && flat.age !== undefined ? ` (${flat.age})` : ''}</span>}
            {(flat.village_city || flat.district) && <span>📍 {[flat.village_city, flat.district].filter(Boolean).join(', ')}</span>}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={exportData} title={t('exportData')}>⬇ {t('exportData')}</button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>🗑 {t('deleteCustomer')}</button>
          <button className="btn btn-green" onClick={onFinish}>✓ {t('doneNext')}</button>
        </div>
      </div>

      {applyServiceId ? (
        <ApplyView customer={customer} serviceId={applyServiceId} onBack={() => { setApplyServiceId(null); loadServices(); }} onCustomer={update} />
      ) : (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((tb) => (
              <button key={tb.id} role="tab" className={`tab ${tab === tb.id ? 'active' : ''}`} onClick={() => onTab(tb.id)}>
                <span>{tb.icon}</span>{tb.label}
                {tb.badge ? <span className={`tab-badge ${tb.badgeClass || ''}`}>{tb.badge}</span> : null}
              </button>
            ))}
          </div>

          {tab === 'documents' && <DocumentsTab customer={customer} onCustomer={update} onGoDetails={() => onTab('details')} />}
          {tab === 'details' && <DetailsTab customer={customer} onCustomer={update} focusField={focusField} onFocused={() => setFocusField(null)} />}
          {tab === 'services' && (
            <ServicesTab customer={customer} services={services} onCustomer={update} onReload={loadServices}
              onApply={(id) => setApplyServiceId(id)}
              onFillField={(key) => { setFocusField(key); onTab('details'); }} />
          )}
          {tab === 'residence' && <ResidencePanel report={residence} onGoDocuments={() => onTab('documents')} />}
          {tab === 'checks' && <ChecksTab customer={customer} onGoDetails={(key) => { setFocusField(key || null); onTab('details'); }} />}
          {tab === 'applications' && <ApplicationsPanel customerId={customerId} embedded />}
        </>
      )}

      {confirmDelete && (
        <Confirm title={t('deleteCustomer')} danger message={t('deleteCustomerConfirm')} confirmLabel={t('delete')}
          onCancel={() => setConfirmDelete(false)} onConfirm={deleteCustomer} />
      )}
    </div>
  );
}
