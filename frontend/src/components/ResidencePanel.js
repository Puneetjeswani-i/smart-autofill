import React from 'react';
import { useLang } from '../i18n';
import { Empty } from './common';

const STATUS = {
  sufficient: { cls: 'good', icon: '✅', label: { en: 'Documents prove the required residence', hi: 'दस्तावेज़ आवश्यक निवास साबित करते हैं' } },
  partial: { cls: 'warn', icon: '⚠️', label: { en: 'Partly proved — more old documents needed', hi: 'आंशिक प्रमाण — और पुराने दस्तावेज़ चाहिए' } },
  insufficient: { cls: 'bad', icon: '❌', label: { en: 'Not proved yet', hi: 'अभी प्रमाणित नहीं' } },
};

const ADV = { success: 'pass', warning: 'unknown', error: 'fail', info: 'unknown' };

export default function ResidencePanel({ report, onGoDocuments }) {
  const { L } = useLang();
  if (!report) return <div className="card"><Empty icon="🏠">{L({ en: 'Upload documents to check residence.', hi: 'निवास जाँच के लिए दस्तावेज़ अपलोड करें।' })}</Empty></div>;

  const st = STATUS[report.status] || STATUS.insufficient;
  const now = new Date().getFullYear();
  const years = report.timeline.map((e) => e.year);
  const start = Math.min(report.need_proof_from_year, ...(years.length ? years : [now])) - 1;
  const span = Math.max(1, now - start);
  const pos = (y) => `${Math.max(0, Math.min(100, ((y - start) / span) * 100))}%`;

  return (
    <div>
      <div className={`card ${st.cls === 'good' ? 'ok' : st.cls === 'bad' ? 'danger' : 'warn'}`}>
        <div className="row-between">
          <div className="row">
            <span style={{ fontSize: 26 }}>{st.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{L(st.label)}</div>
              <div className="small dim">{L({ en: 'Rajasthan residence from documents (for Mool Niwas and similar services)', hi: 'दस्तावेज़ों से राजस्थान निवास (मूल निवास व समान सेवाओं हेतु)' })}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <div style={{ textAlign: 'center' }}><div className="stat-num" style={{ color: report.evidence_years >= report.min_years_required ? 'var(--green)' : 'var(--yellow)' }}>{report.evidence_years}</div><div className="stat-label">{L({ en: 'Years proved', hi: 'सिद्ध वर्ष' })}</div></div>
            <div style={{ textAlign: 'center' }}><div className="stat-num">{report.min_years_required}</div><div className="stat-label">{L({ en: 'Required', hi: 'आवश्यक' })}</div></div>
            <div style={{ textAlign: 'center' }}><div className="stat-num">{report.earliest_proof_year || '—'}</div><div className="stat-label">{L({ en: 'Since', hi: 'से' })}</div></div>
            <div style={{ textAlign: 'center' }}><div className="stat-num">{report.declared_years ?? '—'}</div><div className="stat-label">{L({ en: 'Customer says', hi: 'ग्राहक अनुसार' })}</div></div>
          </div>
        </div>
        <div className="tiny muted mt8">ℹ {L({ en: `Required years (${report.min_years_required}) comes from Settings → Services → Mool Niwas. Confirm it with the official notification.`, hi: `आवश्यक वर्ष (${report.min_years_required}) सेटिंग्स → सेवाएँ → मूल निवास से आता है। आधिकारिक अधिसूचना से पुष्टि करें।` })}</div>
      </div>

      <div className="card">
        <div className="card-title">📅 {L({ en: 'Timeline of dated documents', hi: 'तारीख वाले दस्तावेज़ों की समयरेखा' })}</div>
        <div className="timeline">
          <div className="tl-need" style={{ left: pos(report.need_proof_from_year) }}><span>{L({ en: 'need proof from', hi: 'प्रमाण चाहिए' })} {report.need_proof_from_year}</span></div>
          {report.timeline.map((e, i) => (
            <div key={i} className="tl-dot" title={`${e.year} — ${L(e.label)}`} style={{ left: pos(e.year), background: e.is_rajasthan ? 'var(--green)' : e.is_rajasthan === false ? 'var(--text-muted)' : 'var(--yellow)' }} />
          ))}
        </div>
        <div className="row-between tiny muted"><span>{start}</span><span>{now}</span></div>
        <div className="mt12">
          {report.timeline.length === 0 && <div className="small muted">{L({ en: 'No document with a readable date yet.', hi: 'अभी तारीख वाला कोई दस्तावेज़ नहीं।' })}</div>}
          {report.timeline.map((e, i) => (
            <div key={i} className="list-item">
              <span className="mono" style={{ fontWeight: 700, width: 48 }}>{e.year}</span>
              <span style={{ flex: 1 }}>{L(e.label)}{e.district ? <span className="tiny muted"> · {e.district}</span> : null}</span>
              {e.is_rajasthan === true && <span className="chip good">📍 Rajasthan</span>}
              {e.is_rajasthan === false && <span className="chip">📍 {L({ en: 'Outside', hi: 'बाहर' })}</span>}
              {e.is_rajasthan === null && <span className="chip warn">📍 ?</span>}
            </div>
          ))}
        </div>
      </div>

      {report.advisories.length > 0 && (
        <div className="card">
          <div className="card-title">💬 {L({ en: 'Findings', hi: 'निष्कर्ष' })}</div>
          {report.advisories.map((a, i) => (
            <div key={i} className={`status-line ${ADV[a.type] || 'unknown'}`}>
              <span className="si">{a.type === 'success' ? '✓' : a.type === 'error' ? '✕' : a.type === 'info' ? 'ℹ' : '!'}</span>
              <span>{L(a)}</span>
            </div>
          ))}
        </div>
      )}

      {report.suggestions.length > 0 && (
        <div className="card warn">
          <div className="card-title">📌 {L({ en: 'Ask the customer to bring any of these', hi: 'ग्राहक से इनमें से कोई लाने को कहें' })}</div>
          <ul style={{ paddingLeft: 18 }} className="small">
            {report.suggestions.map((s, i) => <li key={i}>{L(s)}</li>)}
          </ul>
          <button className="btn btn-secondary btn-sm mt12" onClick={onGoDocuments}>📤 {L({ en: 'Upload more documents', hi: 'और दस्तावेज़ अपलोड करें' })}</button>
        </div>
      )}
    </div>
  );
}
