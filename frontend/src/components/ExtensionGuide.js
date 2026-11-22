import React from 'react';
import './ExtensionGuide.css';

const STEPS = [
  { n: 1, title: 'Install', desc: 'Add Smart Autofill to Chrome, Edge or Brave.' },
  { n: 2, title: 'Sign in', desc: 'Connect with your DigiLocker account once.' },
  { n: 3, title: 'Click ⚡', desc: 'On any supported form, hit the lightning button.' },
];

export default function ExtensionGuide() {
  return (
    <div className="ext-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Browser Extension</h1>
          <p className="page-sub">Autofill any government portal in one click. Works on emitra.rajasthan.gov.in, Jan Aadhaar portal, and 40+ central schemes.</p>
        </div>
      </div>

      {/* 3-step row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
        {STEPS.map(s => (
          <div key={s.n} className="card" style={{ marginBottom:0 }}>
            <div style={{
              width:34, height:34, borderRadius:9,
              background:'linear-gradient(135deg,var(--accent),var(--accent2))',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:700, fontSize:14, color:'#fff', marginBottom:16,
            }}>{s.n}</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>{s.title}</div>
            <div style={{ fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Install card */}
      <div className="card" style={{ display:'flex', alignItems:'center', gap:20 }}>
        <div style={{
          width:64, height:64, borderRadius:14,
          background:'linear-gradient(135deg,var(--accent),var(--accent2))',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:30, flexShrink:0,
        }}>⚡</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Smart Autofill for Chrome</div>
          <div style={{ fontSize:12.5, color:'var(--text-muted)', marginBottom:14 }}>
            v2.4.1 · 12,400+ users · 4.8 ★ on Chrome Web Store
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary">Add to Chrome</button>
            <button className="btn btn-secondary">View source on GitHub</button>
          </div>
        </div>
      </div>
    </div>
  );
}
