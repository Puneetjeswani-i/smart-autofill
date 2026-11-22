import React, { useState, useEffect } from 'react';
import ResidencePanel from './ResidencePanel';
import FraudPanel from './FraudPanel';
import ConflictPanel from './ConflictPanel';
import './VerifyPanel.css';

const SCHEME_ICONS = {
  mool_niwas:'🏠', income_certificate:'💰', caste_certificate:'📜',
  scholarship:'🎓', voter_registration:'🗳', driving_license:'🚗',
};

const TABS = [
  { id:'residence', label:'Residence', icon:'🏠', desc:'8-Year Verification' },
  { id:'schemes',   label:'Schemes',   icon:'📋', desc:'Eligibility Check' },
  { id:'conflicts', label:'Conflicts', icon:'⚠️', desc:'Document Conflicts' },
  { id:'fraud',     label:'Fraud',     icon:'🛡️', desc:'Document Integrity' },
];

export default function VerifyPanel({ profile, completeness, residenceReport: propResidence, fraudReport: propFraud, structuredProfile }) {
  const [activeTab, setActiveTab] = useState('residence');
  const [schemes, setSchemes] = useState([]);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [schemeReport, setSchemeReport] = useState(null);
  const [schemeLoading, setSchemeLoading] = useState(false);
  const [residenceReport, setResidenceReport] = useState(propResidence || null);
  const [fraudReport, setFraudReport] = useState(propFraud || null);

  useEffect(() => {
    fetch('/api/verify/schemes').then(r=>r.json()).then(d=>setSchemes(d.schemes||[])).catch(()=>{});
    if (!propResidence) fetch('/api/verify/residence').then(r=>r.json()).then(d=>{if(d.status)setResidenceReport(d);}).catch(()=>{});
    if (!propFraud) fetch('/api/verify/fraud').then(r=>r.json()).then(d=>{if(d.risk_level)setFraudReport(d);}).catch(()=>{});
  }, []);

  useEffect(()=>{if(propResidence)setResidenceReport(propResidence);},[propResidence]);
  useEffect(()=>{if(propFraud)setFraudReport(propFraud);},[propFraud]);

  async function runSchemeCheck(schemeId) {
    setSelectedScheme(schemeId); setSchemeLoading(true); setSchemeReport(null);
    try { const r=await fetch(`/api/verify/${schemeId}`); setSchemeReport(await r.json()); }
    catch(e){ setSchemeReport({error:e.message}); }
    finally{ setSchemeLoading(false); }
  }

  const score = completeness?.score;
  const residenceYears = residenceReport?.residence_years_estimated;
  const fraudRisk = fraudReport?.risk_level;

  // Count conflicts for badge
  const conflictCount = (fraudReport?.flags || []).filter(f =>
    ['name_mismatch','dob_mismatch','major_address_mismatch','invalid_aadhaar_checksum'].includes(f.check)
  ).length;

  const rCol = y => y >= 8 ? '#4ade80' : y >= 5 ? '#fbbf24' : '#f87171';
  const sCol = s => s >= 75 ? '#4ade80' : s >= 50 ? '#fbbf24' : '#f87171';
  const fCol = l => l==='Low'?'#4ade80':l==='Medium'?'#fbbf24':l==='High'?'#f87171':'#6c7086';

  return (
    <div className="verify-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Verify &amp; Readiness</h1>
          <p className="page-sub">Final pre-submission audit. Fix the warnings below to maximise approval probability.</p>
        </div>
      </div>

      {!profile && (
        <div style={{textAlign:'center',padding:'60px 24px',color:'var(--text-muted)'}}>
          <div style={{fontSize:48,marginBottom:16}}>📂</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:8,color:'var(--text-dim)'}}>No Documents Uploaded</div>
          <div style={{fontSize:13,maxWidth:360,margin:'0 auto',lineHeight:1.7}}>
            Upload documents on the <strong style={{color:'var(--accent-light)'}}>AI Scanner</strong> tab first.
          </div>
        </div>
      )}

      {profile && (<>
        {/* Stats — matches Image 4 */}
        <div className="stat-row" style={{marginBottom:24}}>
          <div className="stat-card" style={{'--stat-color':residenceReport?.status==='eligible'?'var(--green)':'var(--yellow)'}}>
            <div className="stat-num">{residenceReport?.checks_passed??'—'}</div>
            <div className="stat-label">Checks Passed</div>
            <div className="stat-sub">All identity &amp; residency cleared</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--yellow)'}}>
            <div className="stat-num" style={{color:'var(--yellow)'}}>{completeness?.missing_fields?.filter(f=>f.required).length??'—'}</div>
            <div className="stat-label">Open Warnings</div>
            <div className="stat-sub">Optional uploads unlock more schemes</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--green)'}}>
            <div className="stat-num" style={{color:'var(--green)'}}>{score!=null?`${score}%`:'—'}</div>
            <div className="stat-label">Approval Probability</div>
            <div className="stat-sub">Based on 1.2k similar profiles</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--accent-light)'}}>
            <div className="stat-num" style={{color:'var(--accent-light)'}}>{residenceReport?.documents_analyzed??'—'}</div>
            <div className="stat-label">Schemes Ready</div>
            <div className="stat-sub">+4 if optional docs added</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="verify-tabs">
          {TABS.map(tab => {
            const badge = tab.id==='fraud'&&fraudRisk==='High'?'HIGH'
              :tab.id==='fraud'&&fraudRisk==='Medium'?'REVIEW'
              :tab.id==='conflicts'&&conflictCount>0?String(conflictCount)
              :tab.id==='residence'&&residenceReport?.status==='eligible'?'✓':null;
            return (
              <button key={tab.id} className={`verify-tab ${activeTab===tab.id?'active':''}`} onClick={()=>setActiveTab(tab.id)}>
                <span style={{fontSize:16}}>{tab.icon}</span>
                <div style={{textAlign:'left'}}>
                  <div>{tab.label}</div>
                  <div style={{fontSize:10,color:'#6c7086',fontWeight:400}}>{tab.desc}</div>
                </div>
                {badge && <span style={{marginLeft:'auto',background:badge==='✓'?'#052e16':badge==='HIGH'?'#2d0a0a':'#2a1a04',color:badge==='✓'?'#4ade80':badge==='HIGH'?'#f87171':'#fbbf24',border:`1px solid ${badge==='✓'?'#166534':badge==='HIGH'?'#991b1b':'#92400e'}`,fontSize:9,fontWeight:800,padding:'2px 7px',borderRadius:4,letterSpacing:0.8}}>{badge}</span>}
              </button>
            );
          })}
        </div>

        <div className="tab-content">
          {activeTab==='residence' && <ResidencePanel residenceReport={residenceReport} />}

          {activeTab==='schemes' && (
            <div>
              <div className="scheme-grid" style={{marginBottom:20}}>
                {schemes.map(s=>(
                  <button key={s.id} className={`scheme-card ${selectedScheme===s.id?'active':''} ${s.suggested?'suggested':''}`} onClick={()=>runSchemeCheck(s.id)}>
                    <div className="scheme-icon">{SCHEME_ICONS[s.id]||'📄'}</div>
                    <div className="scheme-name">{s.name.split('(')[0].trim()}</div>
                    {s.suggested&&<div className="suggested-tag">Suggested</div>}
                  </button>
                ))}
              </div>
              {schemeLoading&&<div className="verify-loading"><div className="spinner"/><span>Checking requirements…</span></div>}
              {schemeReport&&!schemeReport.error&&(
                <div className="report-card">
                  <div className="report-score" style={{borderColor:schemeReport.status==='ready'?'#4ade80':schemeReport.status==='partial'?'#fbbf24':'#f38ba8'}}>
                    <div className="score-circle" style={{color:schemeReport.status==='ready'?'#4ade80':schemeReport.status==='partial'?'#fbbf24':'#f38ba8'}}>{schemeReport.readiness_score}%</div>
                    <div><div className="score-title">{schemeReport.scheme_name}</div><div className="score-rec">{schemeReport.recommendation}</div></div>
                  </div>
                  <div className="report-section"><div className="rs-title">📎 Required Documents</div>
                    {schemeReport.documents?.map((d,i)=>(
                      <div key={i} className={`check-row ${d.status}`}><span className="check-icon">{d.status==='provided'?'✅':'❌'}</span><span className="check-label">{d.label}</span>{d.found_doc&&<span className="check-found">({d.found_doc})</span>}</div>
                    ))}
                  </div>
                  <div className="report-section"><div className="rs-title">📝 Required Fields</div>
                    {schemeReport.required_fields?.map((f,i)=>{
                      // P3.1: color border based on source confidence from profile._sources
                      const srcKey = {
                        name:'personal_info.name', dob:'personal_info.dob',
                        id_number:'identity_documents.aadhaar_number',
                        address:'residence.current_address', father_name:'personal_info.father_name',
                        pincode:'residence.pincode', voter_id:'identity_documents.voter_id',
                        pan:'identity_documents.pan_number', phone:'personal_info.phone',
                        education_12th_school:'education.class_12.school',
                      }[f.field];
                      const src = profile?._sources?.[srcKey];
                      const conf = src?.confidence;
                      const borderColor = !src ? '#45475a'
                        : conf >= 0.80 ? '#22c55e'
                        : conf >= 0.50 ? '#f59e0b' : '#ef4444';
                      return (
                        <div key={i}
                          className={`check-row ${f.present?'provided':'missing'}`}
                          style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 8 }}
                        >
                          <span className="check-icon">{f.present?'✅':'⚠️'}</span>
                          <span className="check-label">{f.label}</span>
                          {f.value&&<span className="check-found">{f.value}</span>}
                          {src && (
                            <span style={{
                              fontSize:9, fontWeight:700, marginLeft:'auto', padding:'1px 6px',
                              borderRadius:10, flexShrink:0,
                              background: conf>=0.80?'#052e16':conf>=0.50?'#2a1a04':'#2d0a0a',
                              color: conf>=0.80?'#4ade80':conf>=0.50?'#fbbf24':'#f87171',
                            }}>
                              {Math.round(conf*100)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {schemeReport.predicted_rejections?.length>0&&(
                    <div className="report-section rejection-section"><div className="rs-title">⚠️ Predicted Rejections</div>
                      {schemeReport.predicted_rejections.map((r,i)=><div key={i} className="rejection-row"><span>⚡</span><span>{r}</span></div>)}
                    </div>
                  )}
                </div>
              )}
              {schemeReport?.error&&<div className="verify-error">⚠️ {schemeReport.error}</div>}
            </div>
          )}

          {activeTab==='fraud' && <FraudPanel fraudReport={fraudReport} />}

          {activeTab==='conflicts' && (
            <ConflictPanel
              structuredProfile={structuredProfile}
              fraudReport={fraudReport}
              residenceReport={residenceReport}
            />
          )}
        </div>
      </>)}
    </div>
  );
}
