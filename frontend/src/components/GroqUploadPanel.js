/**
 * components/GroqUploadPanel.js
 *
 * AI-powered document upload panel using Groq LLM backend.
 * Replaces/extends the existing UploadPanel for AI processing.
 *
 * Features:
 * - Drag & drop or click to upload
 * - Per-document type badges
 * - Live progress states
 * - Structured AI result cards
 * - Confidence indicators
 * - Green-highlighted auto-filled fields
 */

import React, { useState, useRef, useCallback } from 'react';

// ─── Document type metadata ───────────────────────────────────────────────────
const DOC_META = {
  aadhaar:             { label: 'Aadhaar Card',         icon: '🪪', color: '#6366f1' },
  pan:                 { label: 'PAN Card',              icon: '💳', color: '#f59e0b' },
  passport:            { label: 'Passport',              icon: '📗', color: '#3b82f6' },
  driving_license:     { label: 'Driving Licence',      icon: '🚗', color: '#10b981' },
  voter_id:            { label: 'Voter ID',              icon: '🗳️', color: '#8b5cf6' },
  marksheet:           { label: 'Marksheet',             icon: '📜', color: '#ec4899' },
  electricity_bill:    { label: 'Electricity Bill',     icon: '⚡', color: '#f97316' },
  income_certificate:  { label: 'Income Certificate',   icon: '💰', color: '#14b8a6' },
  caste_certificate:   { label: 'Caste Certificate',    icon: '📋', color: '#a855f7' },
  bank_statement:      { label: 'Bank Statement',       icon: '🏦', color: '#64748b' },
  unknown:             { label: 'Document',              icon: '📄', color: '#6c7086' },
};

function getDocMeta(type) {
  return DOC_META[type] || DOC_META.unknown;
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ value }) {
  const color = value >= 80 ? '#4ade80' : value >= 50 ? '#fbbf24' : '#f87171';
  const label = value >= 80 ? 'High' : value >= 50 ? 'Medium' : 'Low';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20,
      background: `${color}20`, border: `1px solid ${color}50`,
      color, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label} ({value}%)
    </span>
  );
}

// ─── Field row — highlighted green if AI-filled ────────────────────────────────
function FieldRow({ label, value }) {
  if (!value || value === 'null') return null;
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '7px 12px',
      background: 'rgba(74,222,128,0.05)',
      borderLeft: '2px solid rgba(74,222,128,0.4)',
      borderRadius: 4, marginBottom: 4,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#4ade80' }}>{String(value)}</span>
    </div>
  );
}

// ─── Per-document result card ──────────────────────────────────────────────────
function DocResultCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getDocMeta(result.doc_type);

  if (result.error) {
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 8, marginBottom: 10,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>❌</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{result.file}</span>
        </div>
        <div style={{ fontSize: 13, color: '#fca5a5' }}>{result.error}</div>
      </div>
    );
  }

  const parsed = result.raw_fields || {};
  const keyFields = Object.entries(parsed)
    .filter(([k, v]) => v !== null && v !== undefined && k !== 'doc_type' && typeof v !== 'object')
    .slice(0, expanded ? 999 : 6);

  const nestedFields = Object.entries(parsed)
    .filter(([k, v]) => v !== null && typeof v === 'object' && !Array.isArray(v));

  return (
    <div style={{
      borderRadius: 10, marginBottom: 12, overflow: 'hidden',
      border: `1px solid ${meta.color}40`,
      background: 'var(--surface2, #1e1e2e)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: `linear-gradient(135deg, ${meta.color}15 0%, transparent 100%)`,
        borderBottom: `1px solid ${meta.color}25`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{meta.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{result.file}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {result.groq_used && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontWeight: 600,
            }}>⚡ Groq AI</span>
          )}
          <ConfidenceBadge value={result.confidence || 0} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {result.fields_extracted} fields
          </span>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: '12px 16px' }}>
        {keyFields.map(([k, v]) => (
          <FieldRow key={k}
            label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            value={String(v)}
          />
        ))}

        {nestedFields.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {k.replace(/_/g, ' ')}
            </div>
            {Object.entries(v).filter(([, val]) => val !== null).map(([sk, sv]) => (
              <FieldRow key={sk}
                label={sk.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                value={String(sv)}
              />
            ))}
          </div>
        ))}

        {/* Subjects table for marksheet */}
        {Array.isArray(parsed.subjects) && parsed.subjects.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Subjects</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Subject', 'Marks', 'Max'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.subjects.map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 8px' }}>{s.subject}</td>
                    <td style={{ padding: '4px 8px', color: '#4ade80' }}>{s.marks_obtained}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{s.max_marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Show more toggle */}
        {Object.keys(parsed).filter(k => parsed[k] !== null && k !== 'doc_type' && typeof parsed[k] !== 'object').length > 6 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
              color: meta.color, fontSize: 12, padding: 0,
            }}
          >
            {expanded ? '▲ Show less' : `▼ Show all ${result.fields_extracted} fields`}
          </button>
        )}

        {/* Footer stats */}
        <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          {result.processing_ms > 0 && <span>⏱ {result.processing_ms}ms</span>}
          {result.groq_tokens > 0 && <span>🔤 {result.groq_tokens} tokens</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main GroqUploadPanel ─────────────────────────────────────────────────────

export default function GroqUploadPanel({ sessionId, onSuccess, onError, onNavigateToVerify, onProfileReset }) {
  const [files,       setFiles]       = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [results,     setResults]     = useState(null);
  const [isDragging,  setIsDragging]  = useState(false);
  const [groqStatus,  setGroqStatus]  = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [resetting,   setResetting]   = useState(false);
  const fileInputRef = useRef(null);

  // Use empty string in development so CRA proxy handles requests (avoids CORS)
  // Only use explicit URL in production builds
  const API_BASE = process.env.NODE_ENV === 'production' ? (process.env.REACT_APP_BACKEND_URL || '') : '';

  // Check Groq status on mount
  React.useEffect(() => {
    fetch(`${API_BASE}/api/groq/status`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => setGroqStatus(d))
      .catch((e) => setGroqStatus({ ok: false, error: 'Backend not reachable: ' + e.message }));
  }, []); // eslint-disable-line

  // Clear current profile so a new person's documents can be scanned fresh
  async function handleNewPerson() {
    if (!window.confirm('This will clear the current profile so you can scan documents for a new person. Continue?')) return;
    setResetting(true);
    try {
      await fetch(`${API_BASE}/api/profile/reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Session-ID': sessionId || 'default' },
      });
      setResults(null);
      setFiles([]);
      setUploadError(null);
      if (onProfileReset) onProfileReset();
    } catch (e) {
      alert('Could not reset profile: ' + e.message);
    } finally {
      setResetting(false);
    }
  }

  const addFiles = useCallback((newFiles) => {
    const valid = Array.from(newFiles).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'pdf', 'bmp', 'tiff', 'webp'].includes(ext);
    });
    setFiles(prev => [...prev, ...valid].slice(0, 10));
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setResults(null);
    setUploadError(null);

    const formData = new FormData();
    files.forEach(f => formData.append('documents', f));

    try {
      const res = await fetch(`${API_BASE}/api/upload-ai`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Session-ID': sessionId || 'default' },
        body: formData,
      });

      // Guard against non-JSON error responses (e.g. 500 HTML page)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (HTTP ${res.status}) — check that the backend is running.`);
      }

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || `Server responded with HTTP ${res.status}`;
        setUploadError(msg);
        if (onError) onError(msg);
        return;
      }

      if (data.success) {
        setResults(data);
        setFiles([]);
        if (onSuccess) onSuccess(data);
      } else {
        const msg = data.error || 'Processing failed — no data returned.';
        setUploadError(msg);
        if (onError) onError(msg);
      }
    } catch (err) {
      const msg = err.message.includes('Failed to fetch')
        ? 'Cannot reach backend — make sure the server is running on port 3001.'
        : 'Upload failed: ' + err.message;
      setUploadError(msg);
      if (onError) onError(msg);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const docCount = results?.documents_successful ?? files.length;
  const fieldCount = results?.per_document?.reduce((s,d)=>s+(d.fields_extracted||0),0);
  const avgAccuracy = results?.per_document?.length
    ? Math.round(results.per_document.reduce((s,d)=>s+(d.confidence||0),0)/results.per_document.length)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Document Scanner</h1>
          <p className="page-sub">Upload your documents — we'll extract, verify, and autofill any government form in seconds.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleNewPerson}
            disabled={resetting}
            className="btn btn-danger"
            style={{ fontSize: 12, padding: '6px 14px' }}
            title="Clear current profile and scan documents for a new person"
          >
            {resetting ? '⏳' : '👤'} New Person
          </button>
          {groqStatus && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              background: groqStatus.ok ? 'var(--green-soft)' : 'var(--red-soft)',
              border: `1px solid ${groqStatus.ok ? 'var(--green-border)' : 'rgba(239,68,68,0.3)'}`,
              fontSize: 12,
              color: groqStatus.ok ? 'var(--green)' : '#fca5a5',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: groqStatus.ok ? 'var(--green)' : '#f87171', display: 'inline-block' }} />
              {groqStatus.ok ? `Groq AI (${groqStatus.model || 'llama3'})` : 'Groq offline'}
            </div>
          )}
        </div>
      </div>

      {/* Stat row — shown once results exist */}
      {results && (
        <div className="stat-row">
          <div className="stat-card" style={{'--stat-color':'var(--green)'}}>
            <div className="stat-num">{docCount}</div>
            <div className="stat-label">Documents</div>
            <div className="stat-sub">{results.doc_types?.join(', ') || '—'}</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--accent-light)'}}>
            <div className="stat-num">{fieldCount ?? '—'}</div>
            <div className="stat-label">Fields Extracted</div>
            <div className="stat-sub">{results.per_document?.length || 0} docs processed</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--green)'}}>
            <div className="stat-num" style={{color:'var(--green)'}}>{avgAccuracy!=null?`${avgAccuracy}%`:'—'}</div>
            <div className="stat-label">Avg Accuracy</div>
            <div className="stat-sub">Cross-checked vs DigiLocker</div>
          </div>
          <div className="stat-card" style={{'--stat-color':'var(--yellow)'}}>
            <div className="stat-num" style={{color:'var(--yellow)'}}>{results.processing_time_s ? `${results.processing_time_s}s` : '—'}</div>
            <div className="stat-label">Avg Processing</div>
            <div className="stat-sub">OCR + entity linking</div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: results ? '380px 1fr' : '1fr', gap:20, alignItems:'start' }}>
      <div className="card" style={{marginBottom:0}}>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${isDragging ? 'var(--accent-light)' : 'var(--border2)'}`,
          borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
          background: isDragging ? 'var(--accent-soft)' : 'var(--surface2)',
          transition: 'all 0.2s', marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.pdf,.bmp,.tiff,.webp"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
        <div style={{ fontSize: 40, marginBottom: 10 }}>
          {isDragging ? '📂' : '📤'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
          {isDragging ? 'Drop files here' : 'Drop documents here'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          PDF, JPG, PNG — up to 10 files
        </div>
        <button type="button" className="btn btn-primary" style={{ pointerEvents:'none' }}>Browse files</button>
      </div>

      {/* Supported document chips — 2x2 grid like Image 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        {[
          { type:'aadhaar', sub:'12-digit UID + address' },
          { type:'pan', sub:'Income tax identity' },
          { type:'electricity_bill', sub:'Address proof' },
          { type:'marksheet', sub:'Education proof' },
        ].map(({type,sub}) => {
          const meta = getDocMeta(type);
          return (
            <div key={type} style={{ padding:'10px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18 }}>{meta.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>{meta.label}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {files.length} file{files.length > 1 ? 's' : ''} ready
          </div>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', marginBottom: 6,
              background: 'var(--surface2, #1e1e2e)', borderRadius: 6,
              border: '1px solid var(--border, #313244)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{f.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatFileSize(f.size)}</div>
                </div>
              </div>
              <button
                onClick={() => removeFile(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
        className="btn btn-primary"
        style={{
          width: '100%', justifyContent: 'center', marginBottom: 12,
          padding: '13px', fontSize: 15,
          background: files.length === 0 ? undefined : '#6366f1',
          opacity: files.length === 0 ? 0.5 : 1,
        }}
      >
        {uploading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 18, height: 18,
              border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
              borderRadius: '50%', animation: 'dl-spin 0.7s linear infinite', display: 'inline-block',
            }} />
            Extracting with Groq AI…
          </span>
        ) : (
          `⚡ Extract with Groq AI (${files.length} file${files.length !== 1 ? 's' : ''})`
        )}
      </button>

      {/* Inline error banner */}
      {uploadError && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#fca5a5', marginBottom: 2 }}>
              Upload Error
            </div>
            <div style={{ fontSize: 12, color: '#fca5a5', opacity: 0.85 }}>{uploadError}</div>
            {uploadError.includes('backend') || uploadError.includes('port 3001') ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Run <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>
                  cd backend &amp;&amp; npm install &amp;&amp; node server.js
                </code> to start the server.
              </div>
            ) : null}
          </div>
          <button
            onClick={() => setUploadError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}
      </div>{/* end left column card */}

      {/* RIGHT COLUMN — Extracted Profile, matches Image 1 */}
      {results && (
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Extracted Profile</div>
              <div style={{ fontSize:11.5, color:'var(--text-muted)' }}>
                {docCount} documents · {fieldCount ?? 0} fields · verified against DigiLocker
              </div>
            </div>
            {avgAccuracy!=null && (
              <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:'var(--green-soft)', color:'var(--green)', border:'1px solid var(--green-border)' }}>
                {avgAccuracy}% match
              </span>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            {[
              { label:'Full Name', value: results.data?.name, conf:'HIGH' },
              { label:'Aadhaar Number', value: results.data?.id_number, conf:'HIGH' },
              { label:'Date of Birth', value: results.data?.dob, conf:'HIGH' },
              { label:"Father's Name", value: results.data?.father_name, conf:'MED' },
              { label:'Mobile', value: results.data?.phone, conf: results.data?.phone ? 'HIGH' : null, full:true },
            ].filter(f=>f.value || f.label==='Mobile').map(f => (
              <div key={f.label} className="field-group" style={f.full?{gridColumn:'1 / -1'}:{}}>
                <label className="field-label" style={{display:'flex',alignItems:'center',gap:6}}>
                  {f.label}
                  {f.conf && <span className={f.conf==='HIGH'?'conf-high':'conf-med'}>{f.conf}</span>}
                </label>
                <input className="field-input" defaultValue={f.value || ''} placeholder={f.label==='Mobile' ? '+91 9XXXXXXXXX' : ''} />
              </div>
            ))}
            <div className="field-group" style={{ gridColumn:'1 / -1' }}>
              <label className="field-label">Address</label>
              <textarea className="field-input" rows={2} defaultValue={results.data?.address || ''} />
            </div>
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <button className="btn btn-primary" onClick={onNavigateToVerify}>Continue to Verification →</button>
            <button className="btn btn-secondary">Save profile</button>
            <button className="btn btn-danger" onClick={handleNewPerson} style={{ marginLeft:'auto' }}>Clear all</button>
          </div>

          <div style={{ padding:'10px 14px', background:'var(--green-soft)', border:'1px solid var(--green-border)', borderRadius:8, fontSize:11.5, color:'var(--green)' }}>
            🔒 All extracted data is encrypted with AES-256 and stored only in your session. Nothing is sent to third parties.
          </div>
        </div>
      )}
      </div>{/* end two-column grid */}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 24 }}>
          {/* Summary bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, padding: '12px 16px',
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
            borderRadius: 8, flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ fontWeight: 600, color: '#4ade80', fontSize: 14 }}>
              ✅ {results.documents_successful}/{results.documents_processed} docs processed
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              {results.groq_docs_parsed > 0 && <span>⚡ {results.groq_docs_parsed} AI-parsed</span>}
              {results.total_groq_tokens > 0 && <span>🔤 {results.total_groq_tokens} tokens used</span>}
              <span>📊 {results.completeness?.score || 0}% profile complete</span>
            </div>
          </div>

          {/* Mobile number notice — marksheets/IDs rarely contain phone numbers */}
          <div style={{
            marginBottom: 14, padding: '10px 14px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 8, fontSize: 12, color: '#fcd34d',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ flexShrink: 0 }}>📱</span>
            <span>
              <strong>Mobile number</strong> is not printed on marksheets or most ID documents — please enter it manually in the Mool Niwas Form.
              Upload an Aadhaar card or voter ID if you want other personal details auto-filled too.
            </span>
          </div>

          {/* Document type pills */}
          {results.doc_types?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {results.doc_types.map(type => {
                const meta = getDocMeta(type);
                return (
                  <span key={type} style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 20,
                    background: `${meta.color}20`, border: `1px solid ${meta.color}40`, color: meta.color,
                  }}>
                    {meta.icon} {meta.label} ✓
                  </span>
                );
              })}
            </div>
          )}

          {/* Per-document cards */}
          {results.per_document?.map((doc, i) => (
            <DocResultCard key={i} result={doc} />
          ))}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                const el = document.createElement('a');
                el.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results.data, null, 2));
                el.download = 'extracted-profile.json';
                el.click();
              }}
              className="btn btn-secondary"
              style={{ fontSize: 13, padding: '7px 16px' }}
            >
              ⬇ Export JSON
            </button>
            {onNavigateToVerify && (
              <button
                onClick={onNavigateToVerify}
                className="btn btn-primary"
                style={{ fontSize: 13, padding: '7px 16px' }}
              >
                ✅ Go to Verify &amp; Readiness →
              </button>
            )}
          </div>

          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8, fontSize: 12,
            color: 'var(--text-muted)',
          }}>
            💡 Review the extracted fields above. When you're satisfied the data is correct, click <strong style={{ color: '#a5b4fc' }}>Go to Verify &amp; Readiness</strong> to continue.
          </div>
        </div>
      )}
    </div>
  );
}
