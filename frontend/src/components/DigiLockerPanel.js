import React, { useState, useEffect } from 'react';
import { useDigiLocker } from '../hooks/useDigiLocker';

function Spinner() {
  return <span className="spinner" />;
}

export default function DigiLockerPanel({ onStatusChange, onViewSchemes, onDemoLoad, t, language }) {
  t = t || (k => k);
  const { status, documents, profile, error, loading, isMock, connect, fetchDocuments, disconnect } = useDigiLocker();
  const [localError, setLocalError] = useState(null);
  const displayError = localError || error;

  useEffect(() => { if (onStatusChange) onStatusChange(status === 'connected'); }, [status, onStatusChange]);
  useEffect(() => {
    if (status === 'connected' && documents.length === 0 && !loading) fetchDocuments();
  }, [status]); // eslint-disable-line

  if (status === 'checking') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, gap:12, color:'var(--text-muted)' }}>
        <Spinner /> Checking DigiLocker session…
      </div>
    );
  }

  if (status === 'connected') {
    return (
      <div style={{ animation:'fadeUp .4s ease' }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Connect with DigiLocker</h1>
            <p className="page-sub">DigiLocker connected — {documents.length} document{documents.length !== 1 ? 's' : ''} found</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={fetchDocuments} disabled={loading} className="btn btn-secondary">
              {loading ? <Spinner /> : '↺'} Refresh
            </button>
            <button onClick={disconnect} className="btn btn-secondary" style={{ color:'var(--text-muted)' }}>Sign Out</button>
          </div>
        </div>
        {isMock && (
          <div style={{ marginBottom:20, padding:'12px 16px', borderRadius:8, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', fontSize:12, color:'#93c5fd', lineHeight:1.6 }}>
            🧪 <strong>Simulation Mode</strong> — Real DigiLocker OAuth is fully implemented. Integration activates after APISetu approval.
          </div>
        )}
        {documents.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {documents.map(doc => (
              <div key={doc.uri || doc.name} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8 }}>
                <span style={{ fontSize:22 }}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{doc.name}</div>
                  {doc.issuer && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{doc.issuer}</div>}
                </div>
                <span style={{ fontSize:11, background:'var(--green-soft)', color:'var(--green)', border:'1px solid var(--green-border)', borderRadius:99, padding:'2px 10px', fontWeight:600 }}>Issued</span>
              </div>
            ))}
          </div>
        )}
        {displayError && (
          <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, background:'var(--red-soft)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5', fontSize:13 }}>
            {displayError}
          </div>
        )}
        {onViewSchemes && (
          <button onClick={onViewSchemes} className="btn btn-green" style={{ width:'100%', justifyContent:'center', padding:'13px' }}>
            ✓ Check Scheme Eligibility →
          </button>
        )}
      </div>
    );
  }

  // ── NOT CONNECTED — matches Image 2 exactly ──
  return (
    <div style={{ animation:'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Connect with DigiLocker</h1>
          <p className="page-sub">Securely import your verified government documents in one click. Powered by Government of India.</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20, alignItems:'start' }}>
        {/* Left card */}
        <div className="card" style={{ padding:28 }}>
          {/* Header row */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:'rgba(124,58,237,0.15)', border:'1px solid rgba(124,58,237,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🔐</div>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>DigiLocker Single Sign-On</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Issued documents pulled directly from source authorities</div>
            </div>
          </div>

          {/* Feature checklist */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:28 }}>
            {[
              'Aadhaar verified identity',
              'PAN, Driving License, Voter ID',
              '10th / 12th Marksheets from CBSE & State boards',
              'Income, Caste & Residence certificates (where issued)',
            ].map(item => (
              <div key={item} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, fontSize:13 }}>
                <span style={{ color:'var(--green)', fontWeight:700, flexShrink:0 }}>✓</span>
                {item}
              </div>
            ))}
          </div>

          {status === 'expired' && (
            <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, background:'var(--yellow-soft)', border:'1px solid rgba(245,158,11,0.3)', color:'#fde68a', fontSize:13 }}>
              ⚠️ Your previous session expired. Please reconnect.
            </div>
          )}
          {displayError && (
            <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, background:'var(--red-soft)', border:'1px solid rgba(239,68,68,0.3)', color:'#fca5a5', fontSize:13 }}>
              {displayError}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display:'flex', gap:12 }}>
            <button className="btn btn-primary" onClick={connect} disabled={loading}
              style={{ flex:1, justifyContent:'center', padding:'12px', fontSize:14 }}>
              {loading ? <><Spinner /> Connecting…</> : <>🔐 {t('loginBtn')}</>}
            </button>
            {onDemoLoad && (
              <button className="btn btn-secondary" onClick={onDemoLoad} disabled={loading}
                style={{ padding:'12px 20px' }}>
                Load demo profile
              </button>
            )}
          </div>
        </div>

        {/* Right privacy card */}
        <div className="card" style={{ padding:24 }}>
          <div className="card-title">Privacy</div>
          <p style={{ fontSize:12.5, color:'var(--text-dim)', lineHeight:1.7, marginBottom:20 }}>
            We never store your DigiLocker credentials. The connection uses a one-time OAuth token scoped to the documents you explicitly consent to share. You can revoke access anytime from your DigiLocker dashboard.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { val:'AES-256', lbl:'Encryption', color:'var(--accent-light)' },
              { val:'Govt.', lbl:'of India', color:'var(--accent-light)' },
              { val:'0', lbl:'Third parties', color:'var(--text)' },
              { val:'100%', lbl:'Your control', color:'var(--text)' },
            ].map(item => (
              <div key={item.lbl} style={{ padding:'12px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8 }}>
                <div style={{ fontSize:15, fontWeight:700, color:item.color, marginBottom:2 }}>{item.val}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{item.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
