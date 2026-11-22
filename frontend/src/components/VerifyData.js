/**
 * VerifyData.js
 *
 * Parsed Data Verification form — lets the operator review and correct
 * every extracted field before proceeding to eligibility checks.
 *
 * Features:
 * - All profile fields in editable inputs, grouped by section
 * - Green border + ✅ if value parsed, yellow + ⚠️ if missing,
 *   red + ❌ if flagged by fraud detector
 * - Summary bar: parsed / missing / flagged counts + confidence %
 * - "Save Corrections" → PUT /api/profile/:sessionId
 * - "Proceed to Eligibility →" → navigates to eligibility tab
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Field definitions ─────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'personal',
    title: 'Personal Information',
    icon: '👤',
    fields: [
      { key: 'name',        label: 'Full Name',      type: 'text' },
      { key: 'father_name', label: "Father's Name",  type: 'text' },
      { key: 'mother_name', label: "Mother's Name",  type: 'text' },
      { key: 'dob',         label: 'Date of Birth',  type: 'text', placeholder: 'DD/MM/YYYY' },
      { key: 'gender',      label: 'Gender',         type: 'text' },
      { key: 'blood_group', label: 'Blood Group',    type: 'text' },
    ],
  },
  {
    id: 'identity',
    title: 'Identity Numbers',
    icon: '🪪',
    fields: [
      { key: 'id_number',        label: 'Aadhaar Number',    type: 'text' },
      { key: 'pan',              label: 'PAN Number',        type: 'text' },
      { key: 'voter_id',         label: 'Voter ID',          type: 'text' },
      { key: 'driving_license',  label: 'Driving Licence',   type: 'text' },
      { key: 'passport_number',  label: 'Passport Number',   type: 'text' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & Address',
    icon: '📍',
    fields: [
      { key: 'phone',    label: 'Phone / Mobile',    type: 'text' },
      { key: 'email',    label: 'Email Address',     type: 'email' },
      { key: 'address',  label: 'Full Address',      type: 'textarea' },
      { key: 'district', label: 'District',          type: 'text' },
      { key: 'state',    label: 'State',             type: 'text' },
      { key: 'pincode',  label: 'PIN Code',          type: 'text' },
    ],
  },
  {
    id: 'education',
    title: 'Education',
    icon: '🎓',
    fields: [
      { key: 'education_12th_school',     label: 'School / Institution',  type: 'text' },
      { key: 'education_12th_board',      label: 'Board / University',    type: 'text' },
      { key: 'education_12th_year',       label: 'Year of Passing',       type: 'text' },
      { key: 'education_12th_percentage', label: 'Percentage / Grade',    type: 'text' },
      { key: 'education_10th_school',     label: 'Class X School',        type: 'text' },
      { key: 'education_10th_board',      label: 'Class X Board',         type: 'text' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank Details',
    icon: '🏦',
    fields: [
      { key: 'account_number', label: 'Bank Account Number', type: 'text' },
      { key: 'ifsc_code',      label: 'IFSC Code',           type: 'text' },
    ],
  },
  {
    id: 'other',
    title: 'Other',
    icon: '📋',
    fields: [
      { key: 'caste',         label: 'Caste',          type: 'text' },
      { key: 'religion',      label: 'Religion',       type: 'text' },
      { key: 'annual_income', label: 'Annual Income',  type: 'text' },
    ],
  },
];

const ALL_FIELD_KEYS = SECTIONS.flatMap(s => s.fields.map(f => f.key));

// ── Helpers ───────────────────────────────────────────────────────────
function getFieldStatus(key, value, fraudFlags) {
  // Check if flagged by fraud detector
  const flagged = fraudFlags?.some(f =>
    f.check?.includes('name') && key === 'name' ||
    f.check?.includes('dob')  && key === 'dob'  ||
    f.check?.includes('aadhaar') && key === 'id_number' ||
    f.check?.includes('pan')  && key === 'pan'
  );
  if (flagged) return 'flagged';
  if (value && String(value).trim().length > 0) return 'ok';
  return 'missing';
}

function statusStyle(status) {
  switch (status) {
    case 'ok':      return { border: '1px solid rgba(74,222,128,0.5)',  background: 'rgba(74,222,128,0.04)' };
    case 'missing': return { border: '1px solid rgba(251,191,36,0.4)',  background: 'rgba(251,191,36,0.03)' };
    case 'flagged': return { border: '1px solid rgba(239,68,68,0.5)',   background: 'rgba(239,68,68,0.04)' };
    default:        return { border: '1px solid var(--border)' };
  }
}

function statusIcon(status) {
  switch (status) {
    case 'ok':      return <span style={{ color: '#4ade80', fontSize: 14 }}>✅</span>;
    case 'missing': return <span style={{ color: '#fbbf24', fontSize: 14 }}>⚠️</span>;
    case 'flagged': return <span style={{ color: '#f87171', fontSize: 14 }}>❌</span>;
    default:        return null;
  }
}

// ── Main Component ────────────────────────────────────────────────────
export default function VerifyData({ profile, sessionId, fraudReport, onSaved, onProceed }) {
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Initialise form from profile whenever profile changes
  useEffect(() => {
    if (!profile) return;
    const initial = {};
    ALL_FIELD_KEYS.forEach(key => {
      initial[key] = profile[key] != null ? String(profile[key]) : '';
    });
    setForm(initial);
  }, [profile]);

  const fraudFlags = fraudReport?.flags || [];

  // Compute summary stats
  const statuses = ALL_FIELD_KEYS.map(k => getFieldStatus(k, form[k], fraudFlags));
  const parsedCount  = statuses.filter(s => s === 'ok').length;
  const missingCount = statuses.filter(s => s === 'missing').length;
  const flaggedCount = statuses.filter(s => s === 'flagged').length;
  const total        = ALL_FIELD_KEYS.length;
  const confidence   = Math.round((parsedCount / total) * 100);
  const confColor    = confidence >= 80 ? '#4ade80' : confidence >= 50 ? '#fbbf24' : '#f87171';

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // Build update object — only send non-empty or changed fields
      const updates = {};
      ALL_FIELD_KEYS.forEach(key => {
        if (form[key] !== undefined) updates[key] = form[key] || null;
      });

      const res  = await fetch(`/api/profile/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg({ type: 'success', text: '✅ Corrections saved successfully!' });
        if (onSaved) onSaved(data.profile);
      } else {
        setSaveMsg({ type: 'error', text: '❌ ' + (data.error || 'Save failed') });
      }
    } catch (e) {
      setSaveMsg({ type: 'error', text: '❌ Could not connect to backend' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }, [form, sessionId, onSaved]);

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📂</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f0f0f5', marginBottom: 8 }}>No Profile Data</div>
        <div style={{ fontSize: 13, color: '#6b6b80', lineHeight: 1.7 }}>
          Upload documents using the <strong style={{ color: '#a5b4fc' }}>AI Scanner</strong> tab first,<br />
          then return here to verify the extracted fields.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">✅ Verify Parsed Data</h1>
        <p className="page-sub">Review and correct every extracted field before proceeding to eligibility checks</p>
      </div>

      {/* Summary bar */}
      <div style={{
        borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        background: '#111118', border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80' }}>{parsedCount}</div>
            <div style={{ fontSize: 10, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: 1 }}>Parsed</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24' }}>{missingCount}</div>
            <div style={{ fontSize: 10, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: 1 }}>Missing</div>
          </div>
          {flaggedCount > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f87171' }}>{flaggedCount}</div>
              <div style={{ fontSize: 10, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: 1 }}>Flagged</div>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b6b80', marginBottom: 5 }}>
            <span>Extraction Confidence</span>
            <span style={{ color: confColor, fontWeight: 700 }}>{confidence}%</span>
          </div>
          <div style={{ height: 6, background: '#1e1e2e', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${confidence}%`, height: '100%', background: confColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b6b80', marginTop: 4 }}>
            {confidence >= 80 ? '✓ High confidence — ready to proceed'
              : confidence >= 50 ? '⚠ Medium confidence — review highlighted fields'
              : '✗ Low confidence — many fields need manual entry'}
          </div>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(section => (
        <div key={section.id} style={{ marginBottom: 24 }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 14, paddingBottom: 10,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 18 }}>{section.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#f0f0f5' }}>{section.title}</span>
          </div>

          {/* Fields grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {section.fields.map(field => {
              const value  = form[field.key] || '';
              const status = getFieldStatus(field.key, value, fraudFlags);
              const style  = statusStyle(status);

              return (
                <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#9898a8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {field.label}
                    </label>
                    {statusIcon(status)}
                  </div>
                  <div style={{ position: 'relative' }}>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={value}
                        onChange={e => handleChange(field.key, e.target.value)}
                        rows={3}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        style={{
                          width: '100%', padding: '9px 12px',
                          borderRadius: 8, fontSize: 13,
                          color: '#f0f0f5', fontFamily: 'inherit',
                          resize: 'vertical', boxSizing: 'border-box',
                          outline: 'none', transition: 'border-color 0.2s',
                          ...style,
                        }}
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        value={value}
                        onChange={e => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        style={{
                          width: '100%', padding: '9px 12px',
                          borderRadius: 8, fontSize: 13,
                          color: '#f0f0f5', fontFamily: 'inherit',
                          boxSizing: 'border-box',
                          outline: 'none', transition: 'border-color 0.2s',
                          ...style,
                        }}
                      />
                    )}
                  </div>
                  {status === 'flagged' && (
                    <div style={{ fontSize: 10, color: '#f87171' }}>
                      ⚠ Flagged by fraud detector — verify manually
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Save message */}
      {saveMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: saveMsg.type === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${saveMsg.type === 'success' ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: saveMsg.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13, fontWeight: 600,
        }}>
          {saveMsg.text}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ minWidth: 180, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? (
            <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
          ) : '💾 Save Corrections'}
        </button>
        <button
          onClick={onProceed}
          className="btn btn-secondary"
          style={{ minWidth: 220, justifyContent: 'center' }}
        >
          Proceed to Eligibility →
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
