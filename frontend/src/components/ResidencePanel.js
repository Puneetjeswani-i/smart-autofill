import React, { useState, useEffect, useRef } from 'react';

/* ── STATUS COLOURS ─────────────────────────────────────────── */
const STATUS = {
  eligible:     { bg:'rgba(16,185,129,0.08)', border:'#10b981', text:'#10b981', icon:'✅', label:'Likely Eligible' },
  partial:      { bg:'rgba(245,158,11,0.08)', border:'#f59e0b', text:'#f59e0b', icon:'⚠️', label:'Partial Evidence' },
  insufficient: { bg:'rgba(239,68,68,0.08)', border:'#ef4444', text:'#ef4444', icon:'❌', label:'Insufficient Proof' },
};

/* ── TIMELINE BAR ──────────────────────────────────────────── */
function TimelineBar({ timeline, earliestYear, latestYear }) {
  const span = (latestYear || new Date().getFullYear()) - (earliestYear || 2000);
  const totalSpan = Math.max(span, 10);
  const startYear = earliestYear || 2000;
  const curYear = new Date().getFullYear();
  const needYears = curYear - 8;

  return (
    <div style={{ margin: '20px 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6c7086', marginBottom:6 }}>
        <span>{startYear}</span>
        <span style={{ color:'#f87171', fontWeight:700 }}>← 8yr req: {needYears}</span>
        <span>{curYear}</span>
      </div>

      {/* Bar track */}
      <div style={{ position:'relative', height:40, background:'#181825', borderRadius:8, overflow:'visible', border:'1px solid #313244' }}>
        {/* 8-year requirement line */}
        <div style={{
          position:'absolute', left:`${Math.max(0,((needYears-startYear)/totalSpan)*100)}%`,
          top:0, bottom:0, width:2, background:'#ef4444', zIndex:5,
        }}>
          <div style={{ position:'absolute', top:-18, left:-20, fontSize:9, color:'#ef4444', whiteSpace:'nowrap', fontWeight:700 }}>8yr min</div>
        </div>

        {/* Evidence blocks */}
        {timeline.map((ev, i) => {
          const pct = Math.max(0, Math.min(98, ((ev.year - startYear) / totalSpan) * 100));
          const isMatch = ev.addressMatch === 'match' || ev.addressMatch === 'partial';
          const dotColor = ev.isRajasthan
            ? (isMatch ? '#4ade80' : '#fbbf24')
            : '#6c7086';
          return (
            <div key={i} title={`${ev.label} (${ev.year})`} style={{
              position:'absolute', left:`${pct}%`, top:'50%', transform:'translate(-50%,-50%)',
              width:14, height:14, borderRadius:'50%', background:dotColor,
              border:`2px solid ${isMatch ? '#22c55e' : '#f59e0b'}`,
              zIndex:10, cursor:'pointer',
              boxShadow:`0 0 8px ${dotColor}88`,
            }} />
          );
        })}

        {/* Residence span fill */}
        {timeline.length >= 2 && (() => {
          const fromPct = Math.max(0, ((timeline[0].year - startYear) / totalSpan) * 100);
          const toPct = Math.min(100, ((curYear - startYear) / totalSpan) * 100);
          return (
            <div style={{
              position:'absolute', left:`${fromPct}%`, width:`${toPct - fromPct}%`,
              top:'50%', transform:'translateY(-50%)',
              height:4, background:'linear-gradient(90deg,#4ade8044,#4ade80aa)',
              borderRadius:2, zIndex:4,
            }} />
          );
        })()}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginTop:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#a6adc8' }}>
          <div style={{ width:10,height:10,borderRadius:'50%',background:'#4ade80' }} />
          Rajasthan (address match)
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#a6adc8' }}>
          <div style={{ width:10,height:10,borderRadius:'50%',background:'#fbbf24' }} />
          Rajasthan (partial)
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#a6adc8' }}>
          <div style={{ width:10,height:10,borderRadius:'50%',background:'#6c7086' }} />
          Other / unverified
        </div>
      </div>
    </div>
  );
}

/* ── SCORE ARC ─────────────────────────────────────────────── */
function ScoreArc({ score, color }) {
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="128" height="80" viewBox="0 0 128 128" style={{ overflow:'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e2e" strokeWidth="12" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition:'stroke-dasharray 1s ease' }}
      />
      <text x={cx} y={cy+8} textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>{score}</text>
      <text x={cx} y={cy+24} textAnchor="middle" fontSize="10" fill="#6c7086">/ 100</text>
    </svg>
  );
}

/* ── MAIN COMPONENT ────────────────────────────────────────── */
export default function ResidencePanel({ residenceReport: propReport }) {
  const [report, setReport] = useState(propReport || null);
  const [loading, setLoading] = useState(!propReport);

  useEffect(() => {
    if (propReport) { setReport(propReport); setLoading(false); return; }
    setLoading(true);
    fetch('/api/verify/residence')
      .then(r => r.json())
      .then(d => { setReport(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [propReport]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:32, color:'#6c7086' }}>
      <div style={{ width:20,height:20,border:'2px solid #313244',borderTopColor:'#6c5ce7',borderRadius:'50%',animation:'spin 0.7s linear infinite' }} />
      Analyzing residence evidence...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!report || report.status === undefined) return (
    <div style={{ textAlign:'center', padding:'48px 20px', color:'#6c7086' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>🏠</div>
      <div style={{ fontSize:15, marginBottom:8, color:'#cdd6f4' }}>No Residence Analysis Yet</div>
      <div style={{ fontSize:13 }}>Upload documents to automatically verify 8-year residence requirement</div>
    </div>
  );

  const st = STATUS[report.status] || STATUS.insufficient;
  const score = report.readiness_score || 0;
  const years = report.residence_years_estimated || 0;
  const curYear = new Date().getFullYear();

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color:'#cdd6f4' }}>

      {/* ── HERO STATUS CARD ──────────────────────────────────── */}
      <div style={{
        background:`linear-gradient(135deg, ${st.bg}, #11111b)`,
        border:`1px solid ${st.border}55`,
        borderRadius:16, padding:'24px 28px', marginBottom:20,
        display:'flex', alignItems:'center', gap:24, flexWrap:'wrap',
      }}>
        <ScoreArc score={score} color={st.text} />
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <span style={{ fontSize:20 }}>{st.icon}</span>
            <span style={{ fontSize:18, fontWeight:800, color:st.text }}>{st.label}</span>
            <span style={{
              background:`${st.text}22`, color:st.text, fontSize:11, fontWeight:700,
              padding:'3px 10px', borderRadius:20, border:`1px solid ${st.text}44`,
            }}>
              {report.confidence}% confidence
            </span>
          </div>
          <div style={{ fontSize:14, color:'#a6adc8', marginBottom:12, lineHeight:1.5 }}>
            {report.verdict}
          </div>
          {/* Key stats row */}
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color: years >= 8 ? '#4ade80' : '#f87171' }}>{years}</div>
              <div style={{ fontSize:10, color:'#6c7086', textTransform:'uppercase', letterSpacing:0.5 }}>Years Est.</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#89b4fa' }}>8</div>
              <div style={{ fontSize:10, color:'#6c7086', textTransform:'uppercase', letterSpacing:0.5 }}>Required</div>
            </div>
            {report.earliest_proof_year && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:800, color:'#cba6f7' }}>{report.earliest_proof_year}</div>
                <div style={{ fontSize:10, color:'#6c7086', textTransform:'uppercase', letterSpacing:0.5 }}>Since</div>
              </div>
            )}
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#74c7ec' }}>{report.documents_analyzed || 0}</div>
              <div style={{ fontSize:10, color:'#6c7086', textTransform:'uppercase', letterSpacing:0.5 }}>Docs</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADVISORY MESSAGES ─────────────────────────────────── */}
      {report.advisories?.length > 0 && (
        <div style={{ marginBottom:20, display:'flex', flexDirection:'column', gap:6 }}>
          {report.advisories.map((adv, i) => {
            const styles = {
              success: { bg:'#0d2818', border:'#22c55e', text:'#4ade80', icon:'✓' },
              warning: { bg:'#2a1e05', border:'#f59e0b', text:'#fbbf24', icon:'⚠' },
              error:   { bg:'#2a0d0d', border:'#ef4444', text:'#f87171', icon:'✕' },
            };
            const s = styles[adv.type] || styles.warning;
            return (
              <div key={i} style={{
                background:s.bg, border:`1px solid ${s.border}44`,
                borderLeft:`3px solid ${s.border}`, borderRadius:8,
                padding:'10px 14px', display:'flex', alignItems:'flex-start', gap:10, fontSize:13,
              }}>
                <span style={{ color:s.text, fontWeight:700, flexShrink:0 }}>{s.icon}</span>
                <span style={{ color:'#cdd6f4' }}>{adv.msg}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TIMELINE ──────────────────────────────────────────── */}
      {report.timeline?.length > 0 && (
        <div style={{ background:'#181825', border:'1px solid #313244', borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:'#6c7086', marginBottom:4 }}>
            📅 Residence Timeline
          </div>
          <TimelineBar
            timeline={report.timeline}
            earliestYear={report.earliest_proof_year || 2000}
            latestYear={curYear}
          />
          {/* Timeline items */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:12 }}>
            {report.timeline.map((ev, i) => {
              const matchColor = ev.isRajasthan
                ? (ev.addressMatch === 'match' ? '#4ade80' : ev.addressMatch === 'partial' ? '#fbbf24' : '#f87171')
                : '#6c7086';
              const matchLabel = ev.addressMatch === 'match' ? 'Address match'
                : ev.addressMatch === 'partial' ? 'Partial match'
                : ev.isRajasthan ? 'Rajasthan (addr unverified)' : 'Outside Rajasthan';
              return (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'9px 12px', background:'#11111b',
                  borderRadius:8, border:`1px solid #313244`,
                }}>
                  <div style={{ width:8,height:8,borderRadius:'50%',background:matchColor,flexShrink:0 }} />
                  <div style={{ fontWeight:700, fontSize:16, color:'#89b4fa', minWidth:48 }}>{ev.year}</div>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:13, color:'#cdd6f4' }}>{ev.label}</span>
                    {ev.district && <span style={{ fontSize:11, color:'#6c7086', marginLeft:8 }}>📍 {ev.district}</span>}
                  </div>
                  <div style={{
                    fontSize:10, color:matchColor, background:`${matchColor}18`,
                    padding:'2px 8px', borderRadius:12, fontWeight:600,
                  }}>{matchLabel}</div>
                  {ev.addressScore > 0 && (
                    <div style={{ fontSize:10, color:'#6c7086' }}>{ev.addressScore}% sim</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>

        {/* ── ADDRESS MATCHES ──────────────────────────────────── */}
        {report.address_matches?.length > 0 && (
          <div style={{ background:'#0d2818', border:'1px solid #22c55e33', borderRadius:14, padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:'#4ade80', marginBottom:12 }}>
              ✓ Address Matches ({report.address_matches.length})
            </div>
            {report.address_matches.map((m, i) => (
              <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom: i < report.address_matches.length-1 ? '1px solid #22c55e22' : 'none' }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#cdd6f4', marginBottom:3 }}>{m.label}</div>
                <div style={{ fontSize:11, color:'#6c7086', marginBottom:4, wordBreak:'break-word' }}>{m.address?.substring(0,80)}...</div>
                <div style={{ fontSize:10, color:'#4ade80' }}>{Math.round(m.similarity*100)}% similarity</div>
              </div>
            ))}
          </div>
        )}

        {/* ── ADDRESS MISMATCHES ───────────────────────────────── */}
        {report.address_mismatches?.length > 0 && (
          <div style={{ background:'#2a0d0d', border:'1px solid #ef444433', borderRadius:14, padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:'#f87171', marginBottom:12 }}>
              ⚠ Address Mismatches ({report.address_mismatches.length})
            </div>
            {report.address_mismatches.map((m, i) => (
              <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom: i < report.address_mismatches.length-1 ? '1px solid #ef444422' : 'none' }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#cdd6f4', marginBottom:3 }}>{m.label}</div>
                <div style={{ fontSize:11, color:'#6c7086', wordBreak:'break-word' }}>{m.address?.substring(0,80)}...</div>
                <div style={{ fontSize:10, color:'#f87171', marginTop:4 }}>{Math.round(m.similarity*100)}% — Verify this document</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MISSING DOCUMENTS ─────────────────────────────────── */}
      {report.missing_docs?.length > 0 && (
        <div style={{ background:'#1e1e2e', border:'1px solid #313244', borderRadius:14, padding:'16px 18px', marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:'#f9e2af', marginBottom:12 }}>
            📋 Documents That Would Strengthen Your Case
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {report.missing_docs.map((d, i) => (
              <div key={i} style={{
                background: d.importance === 'critical' ? '#2a1205' : d.importance === 'high' ? '#1e1a05' : '#181825',
                border: `1px solid ${d.importance === 'critical' ? '#f97316' : d.importance === 'high' ? '#f59e0b' : '#313244'}55`,
                borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:8,
              }}>
                <span style={{ fontSize:16 }}>
                  {d.type==='aadhaar'?'🪪':d.type==='voter_id'?'🗳':d.type==='electricity_bill'?'⚡':d.type==='marksheet'?'📄':d.type==='bank_statement'?'🏦':'📋'}
                </span>
                <div>
                  <div style={{ fontSize:12, color:'#cdd6f4', fontWeight:600 }}>{d.label}</div>
                  <div style={{ fontSize:10, color: d.importance === 'critical' ? '#f97316' : d.importance === 'high' ? '#f9e2af' : '#6c7086' }}>
                    {d.importance === 'critical' ? '⚡ Critical' : d.importance === 'high' ? '↑ Recommended' : 'Optional'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── REFERENCE ADDRESS ─────────────────────────────────── */}
      {report.reference_address && (
        <div style={{ background:'#181825', border:'1px solid #313244', borderRadius:12, padding:'14px 18px' }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:'#6c7086', marginBottom:8 }}>
            📍 Reference Address (Highest-Trust Document)
          </div>
          <div style={{ fontSize:13, color:'#cdd6f4', lineHeight:1.6 }}>{report.reference_address}</div>
        </div>
      )}
    </div>
  );
}
