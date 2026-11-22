import React, { useState, useEffect, useCallback } from 'react';

const CATEGORY_COLORS = {
  domicile:    '#818cf8',
  income:      '#fbbf24',
  identity:    '#a78bfa',
  education:   '#38bdf8',
  civic:       '#94a3b8',
  transport:   '#fb923c',
  agriculture: '#4ade80',
  health:      '#f472b6',
  labour:      '#f97316',
};

const FIELD_DISPLAY = {
  name:                      'Full Name',
  father_name:               "Father's Name",
  dob:                       'Date of Birth',
  id_number:                 'Aadhaar Number',
  address:                   'Address',
  district:                  'District',
  pincode:                   'PIN Code',
  phone:                     'Mobile Number',
  state:                     'State',
  gender:                    'Gender',
  email:                     'Email',
  blood_group:               'Blood Group',
  caste:                     'Caste',
  education_12th_school:     'Class XII School',
  education_12th_board:      'Class XII Board',
  education_12th_percentage: 'Class XII Percentage',
  account_number:            'Bank Account No.',
  ifsc_code:                 'IFSC Code',
};

// ── Apply Modal ───────────────────────────────────────────────────────
function ApplyModal({ data, onClose }) {
  const { name, hint, deepLink, profileFields, schemeId } = data;

  function handleOpenPortal() {
    // Store pending autofill in chrome.storage.local for the extension
    if (window.chrome?.storage?.local) {
      window.chrome.storage.local.set({
        pendingAutofill: {
          schemeId,
          profileData: profileFields,
          timestamp: Date.now(),
        },
      });
    }
    // Also postMessage for any listening content scripts on the current page
    window.postMessage({
      type: 'SMART_AUTOFILL_APPLY',
      schemeId,
      profileData: profileFields,
    }, '*');
    window.open(deepLink, '_blank');
    onClose();
  }

  const fieldEntries = Object.entries(profileFields || {});
  const available    = fieldEntries.filter(([, v]) => v);
  const allKeys      = Object.keys(FIELD_DISPLAY);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#111118', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>🚀</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#f0f0f5', marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 12, color: '#6b6b80', lineHeight: 1.5 }}>
              You will be redirected to the official portal. The Smart Autofill extension will fill available fields automatically.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b6b80', fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0,
          }}>×</button>
        </div>

        {/* Hint */}
        <div style={{
          margin: '14px 24px 0',
          padding: '10px 14px',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10, fontSize: 12, color: '#a5b4fc', lineHeight: 1.6,
        }}>
          💡 {hint}
        </div>

        {/* Field checklist */}
        <div style={{ padding: '14px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Fields that will be autofilled ({available.length} available)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldEntries.map(([key, value]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: value ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${value ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)'}`,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{value ? '✅' : '⬜'}</span>
                <span style={{ fontSize: 12, color: value ? '#f0f0f5' : '#4b4b5a', flex: 1 }}>
                  {FIELD_DISPLAY[key] || key.replace(/_/g, ' ')}
                </span>
                {value && (
                  <span style={{ fontSize: 11, color: '#4ade80', fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(value).length > 20 ? String(value).substring(0, 18) + '…' : String(value)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {available.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: '#6b6b80' }}>
              No profile data available. Upload documents first to enable autofill.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          padding: '14px 24px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={handleOpenPortal}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Open Portal →
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px', borderRadius: 12,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9898a8', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ padding: 16, borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.08)', marginBottom: 10, background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <div className="skeleton-line" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-line" style={{ height: 14, width: '55%', marginBottom: 6 }} />
          <div className="skeleton-line" style={{ height: 11, width: '35%' }} />
        </div>
        <div className="skeleton-line" style={{ width: 70, height: 28, borderRadius: 20 }} />
      </div>
      <div className="skeleton-line" style={{ height: 10, width: '80%', marginBottom: 5 }} />
      <div className="skeleton-line" style={{ height: 10, width: '60%' }} />
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────
export default function EligibilityPanel({ sessionId, onApply, t, language = 'en' }) {
  const [loading,          setLoading]          = useState(true);
  const [eligibilityData,  setEligibilityData]  = useState(null);
  const [fetchError,       setFetchError]       = useState(null);
  const [showIneligible,   setShowIneligible]   = useState(false);
  const [expandedSchemeId, setExpandedSchemeId] = useState(null);
  const [applyModal,       setApplyModal]       = useState(null);  // { open, ...applyData }
  const [applyLoading,     setApplyLoading]     = useState(null);  // schemeId being loaded

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      setLoading(true); setFetchError(null);
      try {
        const res  = await fetch('/api/eligibility', { headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId || '' } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load eligibility');
        if (!cancelled) setEligibilityData(data);
      } catch (err) {
        if (!cancelled) { setFetchError(err.message || 'Could not connect to server'); setEligibilityData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadEligibility();
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleApply = useCallback(async (scheme) => {
    setApplyLoading(scheme.id);
    try {
      const res  = await fetch(`/api/apply/${scheme.id}`, { headers: { 'X-Session-ID': sessionId || '' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load apply info');
      setApplyModal(data);
    } catch (err) {
      alert('Could not load portal info: ' + err.message);
    } finally {
      setApplyLoading(null);
    }
  }, [sessionId, onApply]);

  const rawEligible   = eligibilityData?.eligible   || [];
  const rawIneligible = eligibilityData?.ineligible || [];

  // Mool Niwas always first
  const sortMoolFirst = (a, b) => {
    if (a.id === 'mool_niwas') return -1;
    if (b.id === 'mool_niwas') return  1;
    return 0;
  };
  const eligible   = [...rawEligible].sort(sortMoolFirst);
  const ineligible = [...rawIneligible].sort(sortMoolFirst);
  const profileName = eligibilityData?.profile_name;
  const apiError   = eligibilityData?.error;
  const noData     = !loading && !fetchError && (apiError || (eligible.length === 0 && ineligible.length === 0));

  // compute estimated benefit
  const estBenefit = eligible.reduce((sum, s) => {
    const m = (s.benefit_description || '').match(/[₹Rs\.]+\s*([\d,]+)/);
    return sum + (m ? parseInt(m[1].replace(/,/g,'')) : 0);
  }, 0);

  return (
    <div lang={language} style={{ animation:'fadeUp .4s ease' }}>
      <style>{`@keyframes shimmer{0%{opacity:.4}50%{opacity:.9}100%{opacity:.4}} .skel{border-radius:6px;background:rgba(255,255,255,0.06);animation:shimmer 1.5s ease infinite}`}</style>

      {applyModal && <ApplyModal data={applyModal} onClose={() => setApplyModal(null)} />}

      <div className="page-header">
        <div>
          <h1 className="page-title">My Eligibility</h1>
          <p className="page-sub">
            {!noData
              ? <>You qualify for <strong style={{color:'var(--green)'}}>{eligible.length} schemes</strong> based on your verified profile. {ineligible.length > 0 && <>{ineligible.length} more become available with additional documents.</>}</>
              : 'Upload documents or connect DigiLocker to see your eligibility'}
          </p>
        </div>
      </div>

      {loading && (
        <>
          <div className="stat-row" style={{marginBottom:24}}>
            {[1,2,3].map(i=><div key={i} className="stat-card"><div className="skel" style={{height:30,width:60,marginBottom:8}}/><div className="skel" style={{height:12,width:100}}/></div>)}
          </div>
          <SkeletonCard/><SkeletonCard/><SkeletonCard/>
        </>
      )}

      {!loading && fetchError && (
        <div className="card" style={{borderColor:'rgba(239,68,68,0.35)',background:'rgba(239,68,68,0.08)',color:'#fca5a5'}}>{fetchError}</div>
      )}

      {!loading && !fetchError && noData && (
        <div className="card" style={{textAlign:'center',padding:'52px 24px'}}>
          <div style={{fontSize:48,marginBottom:16}}>📋</div>
          <p className="page-sub" style={{margin:0}}>Upload documents or connect DigiLocker to see your eligibility</p>
        </div>
      )}

      {!loading && !fetchError && !noData && (<>

        {/* Stat row — matches Image 3 */}
        <div className="stat-row" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:28}}>
          <div className="stat-card" style={{'--stat-color':'var(--green)'}}>
            <div className="stat-num" style={{color:'var(--green)'}}>{eligible.length}</div>
            <div className="stat-label">Eligible Now</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--yellow)'}}>
            <div className="stat-num" style={{color:'var(--yellow)'}}>{ineligible.length}</div>
            <div className="stat-label">Needs More Docs</div>
          </div>
          {estBenefit > 0 && (
            <div className="stat-card" style={{'--stat-color':'var(--green)'}}>
              <div className="stat-num" style={{color:'var(--green)',fontSize:22}}>₹{(estBenefit/1000).toFixed(0)}K</div>
              <div className="stat-label">Est. Annual Benefit</div>
            </div>
          )}
        </div>

        {/* Eligible */}
        {eligible.length > 0 && (
          <section style={{marginBottom:28}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:14,fontFamily:'var(--font-mono)'}}>ELIGIBLE — APPLY NOW</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
              {eligible.map(scheme => {
                const accent = CATEGORY_COLORS[scheme.category] || 'var(--accent)';
                const isLoading = applyLoading === scheme.id;
                return (
                  <div key={scheme.id} style={{background:'var(--surface)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{scheme.name}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>
                          {scheme.category ? scheme.category.charAt(0).toUpperCase()+scheme.category.slice(1)+' Dept.' : 'Govt. Scheme'}
                        </div>
                      </div>
                      <span style={{fontSize:9,fontWeight:700,padding:'3px 8px',borderRadius:99,background:'rgba(16,185,129,0.15)',color:'var(--green)',border:'1px solid var(--green-border)',flexShrink:0,fontFamily:'var(--font-mono)'}}>ELIGIBLE</span>
                    </div>
                    <div style={{padding:'10px 12px',background:'var(--surface2)',borderRadius:8,fontSize:12,color:'var(--text-dim)'}}>{scheme.benefit_description}</div>
                    {scheme.matched_criteria?.slice(0,3).map((c,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--text-muted)'}}>
                        <span style={{color:'var(--green)',fontWeight:700}}>✓</span>{c}
                      </div>
                    ))}
                    <button className="btn btn-primary" disabled={isLoading} onClick={()=>handleApply(scheme)}
                      style={{background:'linear-gradient(135deg,#7c3aed,#6d28d9)',justifyContent:'center',marginTop:'auto'}}>
                      {isLoading ? <><span className="spinner" style={{width:14,height:14}}/> Loading…</> : 'Apply now →'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Ineligible */}
        {ineligible.length > 0 && (
          <section>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:14,fontFamily:'var(--font-mono)'}}>NOT YET ELIGIBLE</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
              {ineligible.map(scheme => {
                const isExpanded = expandedSchemeId === scheme.id;
                return (
                  <div key={scheme.id} style={{background:'var(--surface)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:'var(--text-dim)'}}>{scheme.name}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>
                          {scheme.category ? scheme.category.charAt(0).toUpperCase()+scheme.category.slice(1)+' Dept.' : 'Govt. Scheme'}
                        </div>
                      </div>
                      <span style={{fontSize:9,fontWeight:700,padding:'3px 8px',borderRadius:99,background:'rgba(239,68,68,0.12)',color:'var(--red)',border:'1px solid rgba(239,68,68,0.25)',flexShrink:0,fontFamily:'var(--font-mono)'}}>BLOCKED</span>
                    </div>
                    {scheme.benefit_description && (
                      <div style={{padding:'8px 12px',background:'var(--surface2)',borderRadius:8,fontSize:12,color:'var(--text-muted)'}}>{scheme.benefit_description}</div>
                    )}
                    {isExpanded && scheme.reasons?.slice(0,3).map((r,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:12,color:'var(--text-muted)',padding:'8px 12px',background:'rgba(245,158,11,0.06)',borderRadius:8,border:'1px solid rgba(245,158,11,0.15)'}}>
                        <span style={{color:'var(--yellow)',flexShrink:0}}>⚠</span>{r}
                      </div>
                    ))}
                    <button onClick={()=>setExpandedSchemeId(p=>p===scheme.id?null:scheme.id)}
                      className="btn btn-secondary" style={{justifyContent:'center',fontSize:12,color:'var(--text-muted)'}}>
                      {isExpanded ? '▲ Hide' : 'Why not eligible?'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </>)}
    </div>
  );
}
