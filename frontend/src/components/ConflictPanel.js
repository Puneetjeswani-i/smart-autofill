/**
 * ConflictPanel.js
 *
 * Document Conflict Detection — shows field-by-field mismatches
 * between uploaded documents (e.g. Aadhaar address vs Electricity Bill address).
 *
 * Data comes from the fraud report's flags + the structured profile's _sources.
 */

import React, { useState } from 'react';

const FIELD_LABELS = {
  'personal_info.name':                  'Full Name',
  'personal_info.father_name':           "Father's Name",
  'personal_info.dob':                   'Date of Birth',
  'personal_info.gender':                'Gender',
  'personal_info.nationality':           'Nationality',
  'personal_info.blood_group':           'Blood Group',
  'personal_info.phone':                 'Mobile Number',
  'residence.current_address':           'Current Address',
  'residence.pincode':                   'PIN Code',
  'residence.district':                  'District',
  'residence.state':                     'State',
  'residence.birth_place':               'Birth Place',
  'identity_documents.aadhaar_number':   'Aadhaar Number',
  'identity_documents.pan_number':       'PAN Number',
  'identity_documents.voter_id':         'Voter ID',
  'identity_documents.driving_license':  'Driving License',
  'identity_documents.passport_number':  'Passport Number',
  'education.class_12.school':           'Class XII School',
  'education.class_12.board':            'Class XII Board',
  'education.class_12.year':             'Class XII Year',
  'education.class_10.school':           'Class X School',
};

const DOC_COLORS = {
  aadhaar:          '#6366f1',
  pan:              '#f59e0b',
  passport:         '#3b82f6',
  driving_license:  '#10b981',
  voter_id:         '#8b5cf6',
  marksheet:        '#ec4899',
  electricity_bill: '#f97316',
  income_certificate: '#14b8a6',
  caste_certificate:  '#a855f7',
  bank_statement:   '#64748b',
  manual_edit:      '#94a3b8',
};

const DOC_ICONS = {
  aadhaar: '🪪', pan: '💳', passport: '📗', driving_license: '🚗',
  voter_id: '🗳️', marksheet: '📜', electricity_bill: '⚡',
  income_certificate: '💰', caste_certificate: '📋', bank_statement: '🏦',
  manual_edit: '✏️',
};

function docLabel(type) {
  return (type || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function docColor(type) { return DOC_COLORS[type] || '#94a3b8'; }
function docIcon(type)  { return DOC_ICONS[type]  || '📄'; }

/**
 * Build conflict list from structured profile _sources.
 * A conflict exists when the same field path has been seen from multiple
 * documents with different values.
 */
function buildConflicts(structuredProfile, fraudReport) {
  const conflicts = [];
  const sources = structuredProfile?._sources || {};

  // We need the raw per-document values — the _sources only stores the winner.
  // So we derive conflicts from the fraud report flags + address comparison.
  const flags = fraudReport?.flags || [];

  // ── 1. Name conflicts from fraud flags ──────────────────────────
  const nameFlag = flags.find(f => f.check === 'name_mismatch');
  if (nameFlag) {
    // Parse "Name inconsistency: "X" (doc1) vs "Y" (doc2)"
    const match = nameFlag.message.match(/"([^"]+)"\s*\(([^)]+)\)\s*vs\s*"([^"]+)"\s*\(([^)]+)\)/);
    if (match) {
      conflicts.push({
        field: 'personal_info.name',
        label: 'Full Name',
        severity: nameFlag.severity,
        values: [
          { doc: match[2], value: match[1] },
          { doc: match[4], value: match[3] },
        ],
        message: 'Name spelling differs between documents — may cause rejection',
        suggestion: 'Use the name exactly as printed on Aadhaar for all applications',
      });
    }
  }

  // ── 2. DOB conflicts ─────────────────────────────────────────────
  const dobFlag = flags.find(f => f.check === 'dob_mismatch');
  if (dobFlag) {
    const parts = dobFlag.message.replace('DOB inconsistency: ', '').split(' vs ');
    const vals = parts.map(p => {
      const m = p.match(/(.+)\s*\(([^)]+)\)/);
      return m ? { doc: m[2].trim(), value: m[1].trim() } : { doc: 'unknown', value: p };
    });
    conflicts.push({
      field: 'personal_info.dob',
      label: 'Date of Birth',
      severity: 'high',
      values: vals,
      message: 'Date of birth does not match across documents',
      suggestion: 'Verify DOB on each document — OCR may have misread a digit',
    });
  }

  // ── 3. Address conflicts from address_mismatches in residence report ──
  // These come from the fraud report's address_consistency check
  const addrCheck = fraudReport?.checks?.find(c => c.id === 'address_consistency');
  if (addrCheck && !addrCheck.passed) {
    conflicts.push({
      field: 'residence.current_address',
      label: 'Current Address',
      severity: 'medium',
      values: [], // Will be populated from residence report
      message: `Address mismatch detected between documents (similarity: ${addrCheck.detail || 'low'})`,
      suggestion: 'Ensure all documents show the same current address, or provide an address change affidavit',
      isAddress: true,
    });
  }

  // ── 4. Aadhaar checksum failure ──────────────────────────────────
  const aadhaarFlag = flags.find(f => f.check === 'invalid_aadhaar_checksum');
  if (aadhaarFlag) {
    conflicts.push({
      field: 'identity_documents.aadhaar_number',
      label: 'Aadhaar Number',
      severity: 'high',
      values: [{ doc: 'aadhaar', value: aadhaarFlag.message.match(/:\s*(.+?)\s*—/)?.[1] || 'Invalid' }],
      message: 'Aadhaar number fails checksum — may be OCR error or invalid number',
      suggestion: 'Re-upload a clearer Aadhaar image or verify the number manually',
    });
  }

  return conflicts;
}

/**
 * Build address comparison table from residence report.
 */
function buildAddressComparisons(residenceReport) {
  if (!residenceReport) return [];
  const ref = residenceReport.reference_address;
  if (!ref) return [];

  const rows = [];

  // Reference (usually Aadhaar)
  rows.push({ doc: 'aadhaar', address: ref, score: 100, isRef: true });

  // Matches
  for (const m of (residenceReport.address_matches || [])) {
    if (m.docType !== 'aadhaar') {
      rows.push({ doc: m.docType, address: m.address, score: m.confidence, isRef: false, matched_tokens: m.matched_tokens });
    }
  }

  // Mismatches
  for (const m of (residenceReport.address_mismatches || [])) {
    rows.push({ doc: m.docType, address: m.address, score: m.confidence, isRef: false, isMismatch: true });
  }

  return rows;
}

// ── COMPONENTS ────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const cfg = {
    high:   { bg: '#2d0a0a', border: '#dc2626', text: '#f87171', label: 'HIGH' },
    medium: { bg: '#2a1a04', border: '#d97706', text: '#fbbf24', label: 'MEDIUM' },
    low:    { bg: '#0d1f0d', border: '#16a34a', text: '#86efac', label: 'LOW' },
  }[severity] || { bg: '#1e293b', border: '#334155', text: '#94a3b8', label: 'INFO' };

  return (
    <span style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.text, fontSize: 9, fontWeight: 700,
      padding: '2px 7px', borderRadius: 4, letterSpacing: 1,
    }}>{cfg.label}</span>
  );
}

function DocChip({ docType }) {
  const color = docColor(docType);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: color + '18', border: `1px solid ${color}40`,
      color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 12,
    }}>
      {docIcon(docType)} {docLabel(docType)}
    </span>
  );
}

function ConflictCard({ conflict, index }) {
  const [expanded, setExpanded] = useState(false);
  const severityBorder = {
    high: '#dc2626', medium: '#d97706', low: '#16a34a',
  }[conflict.severity] || '#334155';

  return (
    <div style={{
      borderRadius: 12, marginBottom: 12, overflow: 'hidden',
      border: `1px solid ${severityBorder}40`,
      borderLeft: `3px solid ${severityBorder}`,
      background: '#111118',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          background: `${severityBorder}08`,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#f0f0f5' }}>{conflict.label}</span>
            <SeverityBadge severity={conflict.severity} />
          </div>
          <div style={{ fontSize: 12, color: '#9898a8' }}>{conflict.message}</div>
        </div>
        <span style={{ color: '#6b6b80', fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${severityBorder}20` }}>
          {/* Values from different docs */}
          {conflict.values?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#6b6b80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Values Found
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conflict.values.map((v, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: '#1a1a24', border: '1px solid #2a2a3a',
                  }}>
                    <DocChip docType={v.doc} />
                    <span style={{ fontSize: 13, color: '#f0f0f5', fontFamily: 'monospace' }}>{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion */}
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            fontSize: 12, color: '#a5b4fc',
            display: 'flex', gap: 8,
          }}>
            <span>💡</span>
            <span>{conflict.suggestion}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressComparisonTable({ rows }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: '#6b6b80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        📍 Address Comparison Across Documents
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, i) => {
          const color = row.score >= 80 ? '#4ade80' : row.score >= 50 ? '#fbbf24' : '#f87171';
          const bg    = row.score >= 80 ? '#052e16' : row.score >= 50 ? '#2a1a04' : '#2d0a0a';
          return (
            <div key={i} style={{
              borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${docColor(row.doc)}30`,
              background: '#111118',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: `${docColor(row.doc)}10`,
                borderBottom: `1px solid ${docColor(row.doc)}20`,
              }}>
                <DocChip docType={row.doc} />
                {row.isRef && (
                  <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '1px 7px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.3)' }}>
                    Reference
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 60, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${row.score}%`, height: '100%', background: color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32 }}>{row.score}%</span>
                </div>
              </div>
              <div style={{ padding: '8px 14px', fontSize: 12, color: '#9898a8', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {row.address || <span style={{ color: '#4b4b5a', fontStyle: 'italic' }}>No address extracted</span>}
              </div>
              {row.isMismatch && (
                <div style={{ padding: '6px 14px 10px', fontSize: 11, color: '#f87171' }}>
                  ⚠ Address does not match reference — may cause application rejection
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────

export default function ConflictPanel({ structuredProfile, fraudReport, residenceReport }) {
  const conflicts = buildConflicts(structuredProfile, fraudReport);
  const addressRows = buildAddressComparisons(residenceReport);

  const highCount   = conflicts.filter(c => c.severity === 'high').length;
  const medCount    = conflicts.filter(c => c.severity === 'medium').length;
  const hasConflicts = conflicts.length > 0;

  // Check if address has mismatches
  const hasAddressMismatch = (residenceReport?.address_mismatches?.length || 0) > 0;

  return (
    <div style={{ fontFamily: 'var(--font-body, sans-serif)', color: 'var(--text, #f0f0f5)' }}>

      {/* ── SUMMARY BANNER ─────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, padding: '16px 20px', marginBottom: 20,
        background: hasConflicts ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
        border: `1px solid ${hasConflicts ? 'rgba(239,68,68,0.25)' : 'rgba(74,222,128,0.25)'}`,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 32 }}>{hasConflicts ? '⚠️' : '✅'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: hasConflicts ? '#f87171' : '#4ade80' }}>
            {hasConflicts
              ? `${conflicts.length} Conflict${conflicts.length !== 1 ? 's' : ''} Detected`
              : 'No Conflicts Detected'}
          </div>
          <div style={{ fontSize: 13, color: '#9898a8' }}>
            {hasConflicts
              ? `${highCount} high severity, ${medCount} medium severity — review before submitting`
              : 'All document fields are consistent across uploaded documents'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {highCount > 0 && (
            <div style={{ textAlign: 'center', padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f87171' }}>{highCount}</div>
              <div style={{ fontSize: 10, color: '#f87171' }}>HIGH</div>
            </div>
          )}
          {medCount > 0 && (
            <div style={{ textAlign: 'center', padding: '8px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>{medCount}</div>
              <div style={{ fontSize: 10, color: '#fbbf24' }}>MEDIUM</div>
            </div>
          )}
          {!hasConflicts && (
            <div style={{ textAlign: 'center', padding: '8px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>✓</div>
              <div style={{ fontSize: 10, color: '#4ade80' }}>CLEAN</div>
            </div>
          )}
        </div>
      </div>

      {/* ── CONFLICT CARDS ─────────────────────────────────────── */}
      {hasConflicts && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: '#6b6b80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            🔍 Field Conflicts
          </div>
          {conflicts.map((c, i) => (
            <ConflictCard key={i} conflict={c} index={i} />
          ))}
        </div>
      )}

      {/* ── ADDRESS COMPARISON ─────────────────────────────────── */}
      {addressRows.length > 1 && (
        <AddressComparisonTable rows={addressRows} />
      )}

      {/* ── NO DATA STATE ──────────────────────────────────────── */}
      {!structuredProfile && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, color: '#f0f0f5', fontWeight: 600, marginBottom: 8 }}>No Documents Uploaded</div>
          <div style={{ fontSize: 13, color: '#6b6b80' }}>Upload at least 2 documents to detect conflicts between them</div>
        </div>
      )}

      {/* ── HOW IT WORKS ───────────────────────────────────────── */}
      <div style={{
        marginTop: 8, padding: '14px 16px', borderRadius: 10,
        background: '#111118', border: '1px solid #1e1e2e',
        fontSize: 12, color: '#6b6b80', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600, color: '#9898a8', marginBottom: 6 }}>ℹ How Conflict Detection Works</div>
        <div>• <strong style={{ color: '#a5b4fc' }}>Name check</strong> — compares name across all documents using fuzzy matching</div>
        <div>• <strong style={{ color: '#a5b4fc' }}>DOB check</strong> — flags if date of birth differs between Aadhaar, PAN, Passport</div>
        <div>• <strong style={{ color: '#a5b4fc' }}>Address check</strong> — compares addresses using token overlap and PIN code matching</div>
        <div>• <strong style={{ color: '#a5b4fc' }}>ID validation</strong> — validates Aadhaar checksum and PAN format</div>
      </div>
    </div>
  );
}
