import React, { useState, useRef } from 'react';
import './UploadPanel.css';

const DOC_HINTS = [
  { icon: '🪪', label: 'Aadhaar Card',    fields: 'Name, DOB, Address, Aadhaar No.' },
  { icon: '💳', label: 'PAN Card',         fields: 'Name, DOB, Father Name, PAN No.' },
  { icon: '🗳',  label: 'Voter ID',        fields: 'Name, Father Name, Address, Voter ID No.' },
  { icon: '📘', label: 'Passport',         fields: 'Name, DOB, Address, Passport No.' },
  { icon: '🚗', label: 'Driving License',  fields: 'Name, DOB, Address, DL No.' },
  { icon: '📄', label: 'Marksheet',        fields: '10th/12th School, Place, Year, Education Level' },
  { icon: '⚡', label: 'Utility Bill',     fields: 'Name, Address, Years of Residence' },
];

// All 27 parsed fields + extras
const FIELD_LABELS = {
  // Core identity (1-4)
  name:                     'Full Name',
  father_name:              "Father's Name",
  husband_name:             "Husband's Name",
  mother_name:              "Mother's Name",
  // Personal (9-12)
  dob:                      'Date of Birth',
  gender:                   'Gender',
  phone:                    'Mobile Number',
  email:                    'Email',
  // Location (5-8)
  address:                  'Address',
  pincode:                  'PIN Code',
  district:                 'District',
  state:                    'State',
  // IDs (13-17)
  id_number:                'Aadhaar Number',
  pan:                      'PAN Number',
  voter_id:                 'Voter ID',
  driving_license:          'Driving License',
  passport_number:          'Passport Number',
  // Origin & family (18-21)
  birth_place:              'Birth Place',
  native_place:             'Native Place',
  father_occupation:        "Father's Occupation",
  father_occupation_address:"Father's Occupation Address",
  // Education (22-25)
  education_10th_school:    '10th School',
  education_10th_place:     '10th School Place',
  education_12th_school:    '12th School/College',
  education_12th_place:     '12th School Place',
  // Domicile (26-27)
  years_in_rajasthan:       'Years in Rajasthan',
  highest_education:        'Highest Education',
  // Extras
  in_voter_list:            'In Voter List',
  is_married:               'Marital Status',
  doc_type:                 'Document Type',
};

export default function UploadPanel({ onSuccess, onError, sessionId, onDemoLoad, demoLoading }) {
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [editedData, setEditedData] = useState(null);
  const fileRef = useRef();

  function addFiles(newFiles) {
    const allowed = ['.jpg','.jpeg','.png','.pdf','.bmp','.tiff','.webp'];
    const valid = Array.from(newFiles).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return allowed.includes(ext);
    });
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !existing.has(f.name))];
    });
    setResult(null);
    setEditedData(null);
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function processDocuments() {
    if (files.length === 0) return;
    setProcessing(true);
    setProgress(`Uploading ${files.length} document(s)...`);

    const formData = new FormData();
    files.forEach(f => formData.append('documents', f));

    try {
      setProgress('Running OCR analysis...');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-Session-ID': sessionId || '' },
        body: formData,
      });
      setProgress('Merging extracted data...');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');

      setResult(data);
      setEditedData({ ...data.data });
      // Pass completeness data up along with profile
      if (onSuccess && data.data) {
        // Attach completeness to data object for parent
        data.data.__completeness = data.completeness;
      }
    } catch (err) {
      onError(err.message || 'Failed to process documents');
    } finally {
      setProcessing(false);
      setProgress('');
    }
  }

  function getConfClass(score) {
    if (score >= 0.85) return 'confidence-high';
    if (score >= 0.6) return 'confidence-med';
    return 'confidence-low';
  }

  return (
    <div className="upload-page">
      <div className="page-header">
        <h1 className="page-title">Scan Documents</h1>
        <p className="page-sub">Upload multiple documents — data is merged automatically for the Mool Niwas form</p>
      </div>

      <div className="upload-layout">
        <div className="upload-section">
          {/* Drop Zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current.click()}
          >
            <input
              ref={fileRef} type="file" accept="image/*,.pdf" multiple
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
            {files.length === 0 ? (
              <div className="drop-content">
                <div className="drop-icon">⬆</div>
                <div className="drop-title">Drop your documents here</div>
                <div className="drop-sub">or click to browse · Multiple files supported · JPG, PNG, PDF up to 10MB each</div>
              </div>
            ) : (
              <div className="drop-content">
                <div className="drop-icon">📂</div>
                <div className="drop-title">{files.length} file{files.length > 1 ? 's' : ''} ready</div>
                <div className="drop-sub">Click to add more documents</div>
              </div>
            )}
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-chip">
                  <span className="file-chip-icon">
                    {f.name.endsWith('.pdf') ? '📄' : '🖼'}
                  </span>
                  <div className="file-chip-info">
                    <div className="file-chip-name">{f.name}</div>
                    <div className="file-chip-size">{(f.size/1024).toFixed(1)} KB</div>
                  </div>
                  <button className="file-chip-remove" onClick={e => { e.stopPropagation(); removeFile(i); }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Supported doc types */}
          <div className="doc-hints-title">Supported Document Types</div>
          <div className="doc-hints">
            {DOC_HINTS.map(d => (
              <div key={d.label} className="doc-hint">
                <span className="doc-hint-icon">{d.icon}</span>
                <div>
                  <div className="doc-hint-label">{d.label}</div>
                  <div className="doc-hint-fields">{d.fields}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary process-btn"
            onClick={processDocuments}
            disabled={files.length === 0 || processing}
          >
            {processing
              ? <><span className="spinner" />{progress || 'Processing...'}</>
              : `⚡ Extract Data from ${files.length || ''} Document${files.length !== 1 ? 's' : ''}`
            }
          </button>
          {processing && <div className="progress-bar"><div className="progress-fill" /></div>}

          {/* P1.1 Demo Profile Button */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border, #313244)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6c7086)', whiteSpace: 'nowrap' }}>OR skip OCR for demo</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border, #313244)' }} />
            </div>
            <button
              className="btn btn-secondary"
              onClick={onDemoLoad}
              disabled={demoLoading || processing}
              style={{ width: '100%', gap: 8, justifyContent: 'center', fontSize: 13 }}
            >
              {demoLoading
                ? <><span className="spinner" />Loading demo profile…</>
                : '⚡ Load Demo Profile — Amit Kumar, Jaipur'}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6c7086)', marginTop: 6, lineHeight: 1.5 }}>
              Bypasses OCR · Loads pre-seeded realistic Rajasthan citizen data instantly
            </div>
          </div>
        </div>

        {/* Results */}
        {result && editedData && (
          <div className="results-section">
            <div className="results-header">
              <div>
                <h2 className="results-title">Extracted Data</h2>
                <p className="results-sub">
                  {result.documents_processed} document(s) processed ·{' '}
                  {result.confidence.fields_extracted} fields extracted
                </p>
              </div>
              <div className={`confidence-pill ${getConfClass(result.confidence.overall / 100)}`}>
                {result.confidence.overall}% confidence
              </div>
              {result.completeness && (
                <div className={`confidence-pill ${result.completeness.score >= 75 ? 'confidence-high' : result.completeness.score >= 50 ? 'confidence-med' : 'confidence-low'}`}>
                  {result.completeness.score}% ready
                </div>
              )}
            </div>

            {/* Per-document breakdown */}
            {result.per_document?.some(d => d.quality?.issues?.length > 0) && (
              <div style={{background:'#2a1a04',border:'1px solid #f59e0b44',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:11,color:'#fbbf24'}}>
                ⚠ Some documents have quality issues. Results may be less accurate. Consider re-uploading clearer images.
              </div>
            )}
            {result.per_document && result.per_document.length > 1 && (
              <div className="per-doc-summary">
                {result.per_document.map((d, i) => (
                  <div key={i} className={`per-doc-item ${d.error ? 'error' : ''}`}>
                    <span className="per-doc-type">{d.doc_type || 'unknown'}</span>
                    <span className="per-doc-fields">
                      {d.error ? `⚠ ${d.error}` : `${d.fields_extracted} fields · ${d.confidence}% · quality ${d.quality?.quality_score ?? '?'}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="fields-grid">
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                if (editedData[key] === undefined) return null;
                const conf = result.confidence.fields && result.confidence.fields[key];
                return (
                  <div key={key} className={`field-group ${key === 'address' ? 'full-width' : ''}`}>
                    <div className="field-label-row">
                      <label className="field-label">{label}</label>
                      {conf && <span className={`confidence-pill mini ${getConfClass(conf)}`}>{Math.round(conf*100)}%</span>}
                    </div>
                    {key === 'address' ? (
                      <textarea className="field-input" rows={3}
                        value={editedData[key] || ''}
                        onChange={e => setEditedData(p => ({...p,[key]:e.target.value}))} />
                    ) : (
                      <input className="field-input"
                        value={editedData[key] || ''}
                        onChange={e => setEditedData(p => ({...p,[key]:e.target.value}))} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="results-actions">
              <button className="btn btn-primary" onClick={() => onSuccess(editedData)}>✓ Save & Open Mool Niwas Form</button>
              <button className="btn btn-secondary" onClick={() => { setResult(null); setFiles([]); }}>✕ Discard</button>
            </div>
            <div className="security-note">🔒 All uploaded files deleted immediately after OCR processing.</div>
          </div>
        )}
      </div>
    </div>
  );
}
