import React, { useState } from 'react';
import { useLang } from '../i18n';
import { Empty } from './common';

const LEVEL = {
  ok: { cls: 'ok', icon: '✅', label: { en: 'No problems found', hi: 'कोई समस्या नहीं मिली' } },
  review: { cls: 'warn', icon: '⚠️', label: { en: 'Please review the items below', hi: 'कृपया नीचे दिए बिंदु जाँचें' } },
  problem: { cls: 'danger', icon: '❌', label: { en: 'Important mismatch — fix before applying', hi: 'महत्वपूर्ण अंतर — आवेदन से पहले सुधारें' } },
};

const SEV = { high: 'bad', medium: 'warn', low: 'info', none: 'good' };

export default function ChecksTab({ customer, onGoDetails }) {
  const { L } = useLang();
  const [showPassed, setShowPassed] = useState(false);
  const rep = customer.reports && customer.reports.consistency;
  if (!rep || !rep.checks.length) {
    return <div className="card"><Empty icon="🛡️">{L({ en: 'Upload at least one document to run the checks.', hi: 'जाँच के लिए कम से कम एक दस्तावेज़ अपलोड करें।' })}</Empty></div>;
  }
  const lv = LEVEL[rep.level] || LEVEL.review;
  const failed = rep.checks.filter((c) => c.status === 'fail').sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity));
  const passed = rep.checks.filter((c) => c.status === 'pass');
  return (
    <div>
      <div className={`card ${lv.cls}`}>
        <div className="row">
          <span style={{ fontSize: 24 }}>{lv.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{L(lv.label)}</div>
            <div className="small dim">{rep.passed} {L({ en: 'passed', hi: 'सही' })} · {rep.failed} {L({ en: 'to review', hi: 'जाँचने योग्य' })}</div>
          </div>
        </div>
        <div className="tiny muted mt8">ℹ {L({ en: 'These checks find reading mistakes and mismatches between documents. They are not a verdict on the customer.', hi: 'ये जाँचें पढ़ने की गलतियाँ और दस्तावेज़ों के बीच अंतर ढूँढती हैं। यह ग्राहक पर कोई निर्णय नहीं है।' })}</div>
      </div>

      {failed.map((c, i) => (
        <div key={i} className="status-line fail">
          <span className="si">{c.severity === 'high' ? '✕' : '!'}</span>
          <div style={{ flex: 1 }}>
            <div>{L(c.message)}</div>
            <span className={`pill ${SEV[c.severity]}`} style={{ marginTop: 4 }}>{c.severity}</span>
          </div>
          {c.field && <button className="btn btn-secondary btn-sm" onClick={() => onGoDetails(c.field)}>✏️ {L({ en: 'Fix', hi: 'सुधारें' })}</button>}
        </div>
      ))}

      <button className="btn btn-ghost btn-sm mt12" onClick={() => setShowPassed(!showPassed)}>{showPassed ? '▲' : '▼'} {passed.length} {L({ en: 'checks passed', hi: 'जाँच सही' })}</button>
      {showPassed && passed.map((c, i) => (
        <div key={i} className="status-line pass"><span className="si">✓</span><span>{L(c.message)}</span></div>
      ))}
    </div>
  );
}
