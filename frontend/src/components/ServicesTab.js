import React, { useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, ServiceStatusPill, formatINR, PrintPortal } from './common';
import { ChecklistSlip } from './PrintTemplates';

function RuleLine({ rule, onAnswer, depth = 0 }) {
  const { t, L } = useLang();
  const icon = rule.status === 'pass' ? '✓' : rule.status === 'fail' ? '✕' : '?';
  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div className={`status-line ${rule.status}`}>
        <span className="si">{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{L(rule.label)}</span>
            {!rule.children && (rule.verified
              ? <span className="chip good">✓ {t('ruleVerified')}</span>
              : <span className="chip warn" title={rule.source_note ? L(rule.source_note) : ''}>{t('ruleUnverified')}</span>)}
          </div>
          {rule.detail && <div className="small dim">{L(rule.detail)}</div>}
          {rule.source_note && <div className="tiny muted">ℹ {L(rule.source_note)}</div>}
          {rule.type === 'confirm' && (
            <div className="row mt8">
              <span className="small">🗣 {L(rule.question || (rule.needs && rule.needs.answer && rule.needs.answer.question))}</span>
              <button className={`btn btn-sm ${rule.answer === true ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onAnswer(rule.id, true)}>{t('yes')}</button>
              <button className={`btn btn-sm ${rule.answer === false ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onAnswer(rule.id, false)}>{t('no')}</button>
              {rule.answer !== undefined && <button className="btn btn-ghost btn-sm" onClick={() => onAnswer(rule.id, null)}>↺</button>}
            </div>
          )}
        </div>
      </div>
      {(rule.children || []).map((c) => <RuleLine key={c.id} rule={c} onAnswer={onAnswer} depth={depth + 1} />)}
    </div>
  );
}

function ServiceCard({ s, open, onToggle, onAnswer, onManualDoc, onApply, onFillField, onPrint }) {
  const { t, L } = useLang();
  const barColor = s.status === 'ready' ? 'var(--green)' : s.status === 'not_eligible' ? 'var(--red)' : 'var(--yellow)';
  return (
    <div className="card" style={{ padding: 16, borderColor: s.status === 'ready' ? 'var(--green-border)' : s.status === 'not_eligible' ? 'var(--red-border)' : undefined }}>
      <div className="row-between" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{L(s.name)}</span>
            <ServiceStatusPill status={s.status} />
            {s.unverified_rules > 0 && <span className="chip warn" title={t('unverifiedNote')}>{s.unverified_rules} {t('ruleUnverified')}</span>}
          </div>
          <div className="tiny muted mt8">{L(s.department)}</div>
        </div>
        <div className="row">
          {(s.fees.govt_fee !== null || s.fees.service_charge !== null) && (
            <span className="small dim">{formatINR((s.fees.govt_fee || 0) + (s.fees.service_charge || 0))}</span>
          )}
          <div style={{ width: 90 }}>
            <div className="bar"><div style={{ width: `${s.readiness}%`, background: barColor }} /></div>
            <div className="tiny muted" style={{ textAlign: 'right' }}>{s.readiness}%</div>
          </div>
          <span className="muted">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {!open && (s.missing.documents.length > 0 || s.missing.fields.length > 0 || s.missing.answers.length > 0) && (
        <div className="tiny muted mt8">
          {s.missing.documents.length > 0 && <>📄 {s.missing.documents.map((d) => L(d.label)).join(' · ')} </>}
          {s.missing.fields.length > 0 && <>✏️ {s.missing.fields.map((f) => L(f.label)).join(', ')} </>}
          {s.missing.answers.length > 0 && <>🗣 {s.missing.answers.length} {t('askCustomer')}</>}
        </div>
      )}

      {open && (
        <div className="mt12">
          <div className="grid2">
            <div>
              <div className="card-title">{t('rulesTitle')}</div>
              {s.rules.length === 0 && <div className="small muted">{L({ en: 'No eligibility conditions — documents and details only.', hi: 'कोई पात्रता शर्त नहीं — केवल दस्तावेज़ और विवरण।' })}</div>}
              {s.rules.map((r) => <RuleLine key={r.id} rule={r} onAnswer={onAnswer} />)}
            </div>
            <div>
              <div className="card-title">{t('docsTitle')}</div>
              {s.documents.map((d) => (
                <div key={d.id} className={`status-line ${d.status === 'have' || d.status === 'confirmed' ? 'pass' : d.status === 'missing' ? 'fail' : 'unknown'}`}>
                  <span className="si">{d.status === 'have' || d.status === 'confirmed' ? '✓' : d.status === 'missing' ? '✕' : '○'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{L(d.label)} {!d.required && <span className="tiny muted">({t('optional')})</span>}</div>
                    <div className="tiny muted">{d.any_of_labels.map((x) => L(x)).join(' / ')}</div>
                  </div>
                  {d.status !== 'have' && (
                    <label className="check-row tiny" title={L({ en: 'Tick when you have seen the original / it is ready', hi: 'मूल देख लिया / तैयार हो तो टिक करें' })}>
                      <input type="checkbox" checked={d.status === 'confirmed'} onChange={(e) => onManualDoc(d.key, e.target.checked)} />
                      {t('seenPhysical')}
                    </label>
                  )}
                </div>
              ))}
              {s.missing.fields.length > 0 && (
                <>
                  <div className="card-title mt12">{t('missingFields')}</div>
                  <div className="row" style={{ gap: 6 }}>
                    {s.missing.fields.map((f) => (
                      <button key={f.key} className="btn btn-secondary btn-sm" onClick={() => onFillField(f.key)}>✏️ {L(f.label)}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {s.notes && <div className="small dim mt12">📌 {s.notes}</div>}

          <div className="row mt16">
            <button className="btn btn-primary" onClick={() => onApply(s.id)} disabled={s.status === 'not_eligible'}>🚀 {t('startApplication')}</button>
            <button className="btn btn-secondary" onClick={() => onPrint(s)}>🖨 {t('printChecklist')}</button>
            {s.status === 'not_eligible' && <span className="small" style={{ color: '#fca5a5' }}>{L({ en: 'A rule failed — check the reason above before applying.', hi: 'एक नियम पूरा नहीं हुआ — आवेदन से पहले ऊपर कारण देखें।' })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ServicesTab({ customer, services, onCustomer, onReload, onApply, onFillField }) {
  const { t, L } = useLang();
  const { notify, settings } = useApp();
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [printing, setPrinting] = useState(null);

  if (!services) return <div className="row muted"><Spinner /> {t('loading')}</div>;

  async function patch(body) {
    try {
      const r = await api(`/api/customers/${customer.id}`, { method: 'PATCH', body });
      onCustomer(r.customer);
    } catch (err) { notify(err.message, 'error'); }
  }

  const counts = {
    ready: services.filter((s) => s.status === 'ready').length,
    needs_info: services.filter((s) => s.status === 'needs_info').length,
    not_eligible: services.filter((s) => s.status === 'not_eligible').length,
  };
  const shown = filter === 'all' ? services : services.filter((s) => s.status === filter);

  return (
    <div>
      <div className="row mb12">
        {[['all', L({ en: 'All', hi: 'सभी' }), services.length, 'neutral'], ['ready', t('ready'), counts.ready, 'good'], ['needs_info', t('needsInfo'), counts.needs_info, 'warn'], ['not_eligible', t('notEligible'), counts.not_eligible, 'bad']].map(([id, label, n, cls]) => (
          <button key={id} className={`btn btn-sm ${filter === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(id)}>
            {label} <span className={`pill ${cls}`} style={{ padding: '0 6px' }}>{n}</span>
          </button>
        ))}
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onReload}>↺</button>
      </div>
      <div className="small muted mb12">ℹ {t('unverifiedNote')}</div>

      {shown.map((s) => (
        <ServiceCard key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)}
          onAnswer={(ruleId, v) => patch({ declared: { [ruleId]: v } })}
          onManualDoc={(key, v) => patch({ manual_docs: { [key]: v } })}
          onApply={onApply} onFillField={onFillField} onPrint={setPrinting} />
      ))}

      {printing && (
        <PrintPortal onDone={() => setPrinting(null)}>
          <ChecklistSlip service={printing} customer={customer} shop={settings && settings.settings.shop} />
        </PrintPortal>
      )}
    </div>
  );
}
