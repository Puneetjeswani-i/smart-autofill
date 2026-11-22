import React, { useState, useEffect } from 'react';
import './ProfilePanel.css';

const FIELDS = [
  { key: 'name',        label: 'Full Name',      icon: '◈', type: 'text',     placeholder: 'e.g. Shruti Singh' },
  { key: 'dob',         label: 'Date of Birth',  icon: '◷', type: 'text',     placeholder: 'DD/MM/YYYY' },
  { key: 'gender',      label: 'Gender',         icon: '◉', type: 'select',   options: ['Male','Female','Other'] },
  { key: 'phone',       label: 'Mobile Number',  icon: '◎', type: 'tel',      placeholder: '10-digit number' },
  { key: 'email',       label: 'Email Address',  icon: '◈', type: 'email',    placeholder: 'you@example.com' },
  { key: 'id_number',   label: 'Aadhaar Number', icon: '▣', type: 'text',     placeholder: 'XXXX XXXX XXXX' },
  { key: 'pan',         label: 'PAN Number',     icon: '▣', type: 'text',     placeholder: 'ABCDE1234F' },
  { key: 'voter_id',    label: 'Voter ID',       icon: '▣', type: 'text',     placeholder: 'ABC1234567' },
  { key: 'address',     label: 'Address',        icon: '◫', type: 'textarea', placeholder: 'Full address with PIN code' },
  { key: 'father_name', label: "Father's Name",  icon: '◈', type: 'text',     placeholder: "Father's full name" },
  { key: 'mother_name', label: "Mother's Name",  icon: '◈', type: 'text',     placeholder: "Mother's full name" },
  { key: 'nationality', label: 'Nationality',    icon: '◉', type: 'text',     placeholder: 'e.g. Indian' },
  { key: 'pincode',     label: 'PIN Code',       icon: '◫', type: 'text',     placeholder: '6-digit PIN' },
  { key: 'district',    label: 'District',       icon: '◫', type: 'text',     placeholder: 'e.g. Jaipur' },
  { key: 'state',       label: 'State',          icon: '◫', type: 'text',     placeholder: 'e.g. Rajasthan' },
];

// P2.1: map profile flat keys → structured _sources path keys
const SOURCE_KEY_MAP = {
  name:        'personal_info.name',
  dob:         'personal_info.dob',
  gender:      'personal_info.gender',
  phone:       'personal_info.phone',
  email:       'personal_info.email',
  id_number:   'identity_documents.aadhaar_number',
  pan:         'identity_documents.pan_number',
  voter_id:    'identity_documents.voter_id',
  address:     'residence.current_address',
  pincode:     'residence.pincode',
  district:    'residence.district',
  state:       'residence.state',
  father_name: 'personal_info.father_name',
  mother_name: 'personal_info.mother_name',
  nationality: 'personal_info.nationality',
};

// P2.1: render a source confidence chip
function SourceChip({ fieldKey, sources }) {
  if (!sources) return null;
  const sourceKey = SOURCE_KEY_MAP[fieldKey];
  if (!sourceKey) return null;
  const src = sources[sourceKey];
  if (!src) return null;

  const conf     = src.confidence || 0;
  const docLabel = (src.doc_type || 'doc').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const pct      = Math.round(conf * 100);

  let chipStyle;
  if (conf >= 0.80) {
    chipStyle = { background: '#052e16', color: '#4ade80', border: '1px solid #166534' };
  } else if (conf >= 0.50) {
    chipStyle = { background: '#2a1a04', color: '#fbbf24', border: '1px solid #92400e' };
  } else {
    chipStyle = { background: '#2d0a0a', color: '#f87171', border: '1px solid #991b1b' };
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, padding: '2px 7px',
      borderRadius: 10, marginLeft: 6, lineHeight: 1.4,
      cursor: 'default', flexShrink: 0,
      ...chipStyle,
    }} title={`Extracted from ${src.doc_type} with ${pct}% confidence`}>
      {docLabel} {conf >= 0.80 ? '✓' : conf >= 0.50 ? '~' : '!'} {pct}%
    </span>
  );
}

export default function ProfilePanel({ profile, structuredProfile, completeness, onSave, onDelete }) {
  const [form, setForm]           = useState({});
  const [saving, setSaving]       = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // P2.1: pull _sources from the structured profile passed in from App.js
  const sources = structuredProfile?._sources || profile?._sources || null;

  useEffect(() => {
    if (profile) setForm({ ...profile });
    else setForm({});
  }, [profile]);

  function handleChange(key, value) {
    setForm(p => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const filledCount  = FIELDS.filter(f => form[f.key] && String(form[f.key]).trim()).length;
  const totalCount   = FIELDS.length;
  const pct          = Math.round((filledCount / totalCount) * 100);
  const barColor     = pct >= 75 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';

  // Count how many fields have source data
  const sourcedCount = sources
    ? FIELDS.filter(f => sources[SOURCE_KEY_MAP[f.key]]).length
    : 0;

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-sub">
            Your encrypted citizen profile. Edits sync to every form you autofill.
            {sourcedCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--accent-light)' }}>
                · {sourcedCount} field{sourcedCount !== 1 ? 's' : ''} extracted from documents
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Completeness bar */}
      <div className="completeness-card card">
        <div className="comp-header">
          <div>
            <div className="comp-title">Profile Completeness</div>
            <div className="comp-sub">{filledCount} of {totalCount} fields filled</div>
          </div>
          <div className="comp-percent" style={{ color: barColor }}>{pct}%</div>
        </div>
        <div className="comp-bar">
          <div className="comp-fill" style={{ width: `${pct}%`, background: barColor }} />
        </div>

        {/* P2.1: Source legend */}
        {sources && sourcedCount > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', fontSize: 11 }}>
            <span style={{ color: '#6c7086' }}>Source confidence:</span>
            <span style={{ color: '#4ade80' }}>● ≥80% High</span>
            <span style={{ color: '#fbbf24' }}>● 50–79% Medium</span>
            <span style={{ color: '#f87171' }}>● &lt;50% Low</span>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="profile-card card">
        <div className="profile-grid">
          {FIELDS.map(f => (
            <div key={f.key} className={`field-group ${f.type === 'textarea' ? 'full-width' : ''}`}>
              {/* P2.1: label row with source chip */}
              <label className="field-label" style={{ display: 'flex', alignItems: 'center' }}>
                {f.label}
                <SourceChip fieldKey={f.key} sources={sources} />
              </label>

              {f.type === 'textarea' ? (
                <textarea
                  className="field-input"
                  rows={3}
                  value={form[f.key] || ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              ) : f.type === 'select' ? (
                <select
                  className="field-input"
                  value={form[f.key] || ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                >
                  <option value="">Select {f.label}</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="field-input"
                  type={f.type}
                  value={form[f.key] || ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </div>

        <div className="profile-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner" />Saving…</> : 'Save changes'}
          </button>
          <button className="btn btn-secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(form, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'profile.json'; a.click();
            URL.revokeObjectURL(url);
          }}>
            Export as JSON
          </button>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)} style={{ marginLeft: 'auto' }}>
            Delete all my data
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">⚠</div>
            <h3 className="modal-title">Delete All Data?</h3>
            <p className="modal-text">This will permanently delete your profile and all extracted data. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => { onDelete(); setShowDelete(false); setForm({}); }}>
                Yes, Delete Everything
              </button>
              <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
