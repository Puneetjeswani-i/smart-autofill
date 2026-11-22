/**
 * ArchitectureModal.js
 *
 * Shows judges the full real DigiLocker integration architecture.
 * Explains that live API is pending APISetu approval and demo uses
 * a simulated flow with identical code paths.
 */

import React from 'react';

const FLOW_STEPS = [
  {
    icon: '👤',
    label: 'Citizen clicks\n"Login with DigiLocker"',
    color: '#6366f1',
  },
  {
    icon: '🔀',
    label: 'App redirects to\nMeriPehchaan OAuth',
    color: '#8b5cf6',
    api: 'GET /auth/digilocker',
  },
  {
    icon: '🏛️',
    label: 'DigiLocker verifies\nAadhaar + OTP',
    color: '#0057b8',
    api: 'APISetu OAuth 2.0',
  },
  {
    icon: '🎟️',
    label: 'Backend exchanges\ncode for token',
    color: '#059669',
    api: 'POST /oauth2/1/token',
  },
  {
    icon: '📂',
    label: 'Fetch issued\ndocuments list',
    color: '#d97706',
    api: 'GET /files/issued',
  },
  {
    icon: '⚡',
    label: 'Auto-fill profile\n& check eligibility',
    color: '#dc2626',
  },
];

export default function ArchitectureModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)', padding: 20,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720,
          background: 'var(--surface, #181825)',
          border: '1px solid var(--border, #313244)',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border, #313244)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(99,102,241,0.08)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              🏗️ DigiLocker Integration Architecture
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted, #6c7086)' }}>
              Official APISetu Requester API — OAuth 2.0 Authorization Code Flow
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ padding: '24px' }}>

          {/* API Approval notice */}
          <div style={{
            padding: '14px 18px', borderRadius: 10,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
            marginBottom: 24, fontSize: 13, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>
              📋 APISetu API Approval Pending
            </div>
            <div style={{ color: '#fde68a' }}>
              DigiLocker Requester API access requires approval from the APISetu team
              (typically 3–7 business days for hackathon accounts). The complete OAuth
              integration code is implemented and production-ready. This demo uses a
              simulated flow with <strong>identical backend code paths</strong> — only
              the live API credentials are pending.
            </div>
          </div>

          {/* Flow diagram */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--text-muted)' }}>
              REAL INTEGRATION FLOW (already implemented)
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 0, flexWrap: 'wrap', rowGap: 12,
            }}>
              {FLOW_STEPS.map((step, i) => (
                <React.Fragment key={i}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    minWidth: 90, flex: '1 1 90px',
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: step.color + '22',
                      border: `2px solid ${step.color}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, marginBottom: 6,
                    }}>{step.icon}</div>
                    <div style={{ fontSize: 10.5, textAlign: 'center', color: '#cdd6f4', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                      {step.label}
                    </div>
                    {step.api && (
                      <div style={{
                        marginTop: 4, fontSize: 9.5,
                        background: step.color + '22',
                        color: step.color,
                        padding: '2px 6px', borderRadius: 4,
                        fontFamily: 'monospace', textAlign: 'center',
                      }}>{step.api}</div>
                    )}
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0, padding: '0 2px', marginBottom: 20 }}>
                      →
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Implementation status */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>
              IMPLEMENTATION STATUS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { done: true,  label: 'OAuth 2.0 Authorization route' },
                { done: true,  label: 'CSRF state parameter (security)' },
                { done: true,  label: 'Authorization code → token exchange' },
                { done: true,  label: 'Token stored server-side (session)' },
                { done: true,  label: 'Issued documents API (/files/issued)' },
                { done: true,  label: 'Document fetch & stream (/pull/issued)' },
                { done: true,  label: 'Token expiry handling + auto-disconnect' },
                { done: true,  label: 'express-session (token never in browser)' },
                { done: false, label: 'Live APISetu credentials (pending approval)' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6,
                  background: item.done ? 'rgba(74,222,128,0.07)' : 'rgba(251,191,36,0.07)',
                  border: `1px solid ${item.done ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
                  fontSize: 12,
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{item.done ? '✅' : '⏳'}</span>
                  <span style={{ color: item.done ? '#4ade80' : '#fde68a' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tech stack */}
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid rgba(99,102,241,0.2)',
            fontSize: 12, lineHeight: 1.7,
          }}>
            <strong style={{ color: '#a5b4fc' }}>Backend files: </strong>
            <code style={{ color: '#c4b5fd' }}>routes/digilockerAuth.js</code> ·{' '}
            <code style={{ color: '#c4b5fd' }}>routes/digilockerApi.js</code>
            <br />
            <strong style={{ color: '#a5b4fc' }}>Frontend: </strong>
            <code style={{ color: '#c4b5fd' }}>hooks/useDigiLocker.js</code> ·{' '}
            <code style={{ color: '#c4b5fd' }}>components/DigiLockerPanel.js</code>
            <br />
            <strong style={{ color: '#a5b4fc' }}>Security: </strong>
            <span style={{ color: '#e2e8f0' }}>
              express-session · httpOnly cookies · CSRF state param · token never exposed to browser
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
