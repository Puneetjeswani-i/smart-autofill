import React, { useState, useEffect } from 'react';

const SEVERITY_STYLES = {
  high:   { bg: '#2d0a0a', border: '#dc2626', text: '#f87171', icon: '🚨', label: 'HIGH' },
  medium: { bg: '#2a1a04', border: '#d97706', text: '#fbbf24', icon: '⚠️', label: 'MEDIUM' },
  low:    { bg: '#0d1f0d', border: '#16a34a', text: '#86efac', icon: '💡', label: 'LOW' },
};

const RISK_CONFIG = {
  Low:     { color: '#4ade80', bg: '#052e16', border: '#166534', barColor: '#22c55e', label: 'LOW RISK' },
  Medium:  { color: '#fbbf24', bg: '#2a1a04', border: '#92400e', barColor: '#f59e0b', label: 'MEDIUM RISK' },
  High:    { color: '#f87171', bg: '#2d0a0a', border: '#991b1b', barColor: '#ef4444', label: 'HIGH RISK' },
  unknown: { color: '#94a3b8', bg: '#1e293b', border: '#334155', barColor: '#64748b', label: 'UNKNOWN' },
};

function RiskGauge({ score, level }) {
  const cfg = RISK_CONFIG[level] || RISK_CONFIG.unknown;
  const angle = -135 + (score / 100) * 270; // -135deg to +135deg

  return (
    <div style={{ position: 'relative', width: 140, height: 90, flexShrink: 0 }}>
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Background arc */}
        <path d="M 15 90 A 55 55 0 1 1 125 90" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
        {/* Colored arc */}
        <path
          d="M 15 90 A 55 55 0 1 1 125 90"
          fill="none"
          stroke={cfg.barColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 172} 172`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
        {/* Needle */}
        <g transform={`translate(70,90) rotate(${angle})`}>
          <line x1="0" y1="0" x2="0" y2="-42" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="5" fill={cfg.color} />
        </g>
        {/* Score text */}
        <text x="70" y="76" textAnchor="middle" fontSize="22" fontWeight="800" fill={cfg.color}>{score}</text>
        <text x="70" y="90" textAnchor="middle" fontSize="9" fill="#64748b" letterSpacing="1">{cfg.label}</text>
      </svg>
    </div>
  );
}

export default function FraudPanel({ fraudReport: propReport }) {
  const [report, setReport] = useState(propReport || null);
  const [loading, setLoading] = useState(!propReport);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (propReport) { setReport(propReport); setLoading(false); return; }
    setLoading(true);
    fetch('/api/verify/fraud')
      .then(r => r.json())
      .then(d => { setReport(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [propReport]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: '#64748b', fontFamily: 'monospace' }}>
      <div style={{ width: 18, height: 18, border: '2px solid #1e293b', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Running fraud analysis...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!report || report.risk_level === undefined) return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
      <div style={{ fontSize: 15, color: '#cbd5e1', fontWeight: 600, marginBottom: 8, fontFamily: 'monospace' }}>NO FRAUD ANALYSIS</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>Upload documents to run automatic fraud detection</div>
    </div>
  );

  const cfg = RISK_CONFIG[report.risk_level] || RISK_CONFIG.unknown;

  return (
    <div style={{ fontFamily: '"IBM Plex Mono", "Fira Code", monospace', color: '#cbd5e1' }}>

      {/* ── RISK HEADER ────────────────────────────────────────── */}
      <div style={{
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <RiskGauge score={report.risk_score || 0} level={report.risk_level} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              background: cfg.color + '22', color: cfg.color,
              fontSize: 11, fontWeight: 700, padding: '3px 10px',
              border: `1px solid ${cfg.color}44`, borderRadius: 4, letterSpacing: 2,
            }}>
              {report.risk_level?.toUpperCase()} RISK
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {report.checks_passed ?? '?'}/{report.checks_total ?? '?'} checks passed
            </span>
          </div>
          <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>{report.summary}</div>

          {/* Progress bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
              <span>FRAUD RISK SCORE</span>
              <span>{report.risk_score}/100</span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${report.risk_score}%`,
                background: `linear-gradient(90deg, #22c55e, ${cfg.barColor})`,
                borderRadius: 3, transition: 'width 1s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── FLAGS ──────────────────────────────────────────────── */}
      {report.flags?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>
            ⚡ Active Flags ({report.flags.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.flags.map((flag, i) => {
              const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.low;
              return (
                <div key={i} style={{
                  background: s.bg, border: `1px solid ${s.border}44`,
                  borderLeft: `3px solid ${s.border}`,
                  borderRadius: 8, padding: '10px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{
                    background: s.border + '22', color: s.text,
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    border: `1px solid ${s.border}44`, borderRadius: 3,
                    letterSpacing: 1, flexShrink: 0, marginTop: 1,
                  }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>{flag.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CHECKS GRID ────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>
          ✓ Verification Checks
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {report.checks?.map((check, i) => (
            <div key={i} style={{
              background: check.passed ? '#0d1f0d' : '#1e0a0a',
              border: `1px solid ${check.passed ? '#166534' : '#7f1d1d'}`,
              borderRadius: 10, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{check.passed ? '✅' : '❌'}</span>
              <div>
                <div style={{ fontSize: 11, color: check.passed ? '#86efac' : '#f87171', fontWeight: 600 }}>
                  {check.name}
                </div>
                {check.detail && (
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{check.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── NOTICE ─────────────────────────────────────────────── */}
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: 10, padding: '12px 16px',
        fontSize: 11, color: '#64748b', lineHeight: 1.6,
      }}>
        🔒 <strong style={{ color: '#94a3b8' }}>Privacy Notice:</strong> Fraud analysis runs locally on the backend server.
        No document data is transmitted to external services. All uploads are deleted immediately after OCR processing.
      </div>
    </div>
  );
}
