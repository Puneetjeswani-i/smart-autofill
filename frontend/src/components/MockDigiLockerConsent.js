/**
 * MockDigiLockerConsent.js
 *
 * A realistic-looking DigiLocker consent screen shown during SIH demo.
 * Replaces the real OAuth redirect when API credentials are pending approval.
 *
 * Shown as a full-screen overlay when user clicks "Login with DigiLocker".
 * After the user clicks "Allow", it calls onSuccess() which triggers the
 * mock backend flow and populates the app with demo data.
 */

import React, { useState } from 'react';

const MOCK_DOCS_TO_SHARE = [
  { icon: '🪪', name: 'Aadhaar Card', issuer: 'UIDAI', required: true },
  { icon: '💳', name: 'PAN Card', issuer: 'Income Tax Department', required: false },
  { icon: '🚗', name: 'Driving Licence', issuer: 'MoRTH', required: false },
  { icon: '📄', name: 'Class X Marksheet', issuer: 'CBSE / State Board', required: false },
];

export default function MockDigiLockerConsent({ appName = 'Smart AutoFill', onSuccess, onCancel }) {
  const [step, setStep]       = useState('consent'); // consent | pin | loading | done
  const [pin, setPin]         = useState('');
  const [pinError, setPinError] = useState('');
  const [checked, setChecked] = useState({ 0: true, 1: false, 2: false, 3: false });

  function handleAllow() {
    setStep('pin');
  }

  function handlePinSubmit() {
    if (pin.length !== 6) {
      setPinError('Please enter your 6-digit Aadhaar OTP');
      return;
    }
    setPinError('');
    setStep('loading');
    // Simulate network delay
    setTimeout(() => {
      setStep('done');
      setTimeout(() => onSuccess(), 1000);
    }, 1800);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#fff', borderRadius: 16,
        overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1a1a2e',
      }}>

        {/* DigiLocker header */}
        <div style={{
          background: 'linear-gradient(135deg, #003087 0%, #0057b8 100%)',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, flexShrink: 0,
          }}>🔐</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: 0.3 }}>
              DigiLocker
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 1 }}>
              Ministry of Electronics &amp; IT, Govt. of India
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <div style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 20,
              padding: '3px 10px', fontSize: 10.5, color: '#fff',
            }}>🔒 Secure</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 20px' }}>

          {/* ── Consent step ───────────────────────────────────── */}
          {step === 'consent' && (<>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                <strong style={{ color: '#003087' }}>{appName}</strong> is requesting access to:
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                Powered by APISetu · DigiLocker Requester API
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {MOCK_DOCS_TO_SHARE.map((doc, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  background: checked[i] ? '#eef4ff' : '#f9f9f9',
                  border: `1.5px solid ${checked[i] ? '#0057b8' : '#e5e5e5'}`,
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={!!checked[i]}
                    onChange={e => setChecked(prev => ({ ...prev, [i]: e.target.checked }))}
                    disabled={doc.required}
                    style={{ width: 16, height: 16, accentColor: '#0057b8' }}
                  />
                  <div style={{ fontSize: 20, flexShrink: 0 }}>{doc.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>
                      {doc.name}
                      {doc.required && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#0057b8', fontWeight: 400 }}>
                          (required)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{doc.issuer}</div>
                  </div>
                  {checked[i] && <div style={{ color: '#0057b8', fontSize: 16 }}>✓</div>}
                </label>
              ))}
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fde68a',
              fontSize: 11.5, color: '#92400e', marginBottom: 20, lineHeight: 1.5,
            }}>
              ℹ️ Your documents will be fetched directly from DigiLocker's secure servers.
              {appName} will only receive the data you authorize above.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onCancel}
                style={{
                  flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer',
                  background: '#f3f4f6', border: '1.5px solid #e5e7eb',
                  fontWeight: 600, fontSize: 14, color: '#374151',
                }}
              >
                Deny
              </button>
              <button
                onClick={handleAllow}
                style={{
                  flex: 2, padding: '11px', borderRadius: 8, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #003087, #0057b8)',
                  border: 'none', fontWeight: 700, fontSize: 14, color: '#fff',
                  letterSpacing: 0.3,
                }}
              >
                Allow Access
              </button>
            </div>
          </>)}

          {/* ── OTP / PIN step ──────────────────────────────────── */}
          {step === 'pin' && (<>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📱</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                Verify with Aadhaar OTP
              </div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                An OTP has been sent to your Aadhaar-linked mobile number
                <br />
                <strong>+91 xxxxxxx210</strong>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <input
                type="number"
                value={pin}
                onChange={e => { setPin(e.target.value.slice(0, 6)); setPinError(''); }}
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                style={{
                  width: '100%', padding: '13px 16px', borderRadius: 8,
                  border: `1.5px solid ${pinError ? '#ef4444' : '#d1d5db'}`,
                  fontSize: 20, letterSpacing: 8, textAlign: 'center',
                  fontWeight: 700, color: '#1a1a2e',
                  boxSizing: 'border-box', outline: 'none',
                }}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              />
              {pinError && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{pinError}</div>
              )}
              <div style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'center' }}>
                Demo: enter any 6 digits (e.g. 123456)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep('consent')}
                style={{
                  flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer',
                  background: '#f3f4f6', border: '1.5px solid #e5e7eb',
                  fontWeight: 600, fontSize: 14, color: '#374151',
                }}
              >
                Back
              </button>
              <button
                onClick={handlePinSubmit}
                style={{
                  flex: 2, padding: '11px', borderRadius: 8, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #003087, #0057b8)',
                  border: 'none', fontWeight: 700, fontSize: 14, color: '#fff',
                }}
              >
                Verify &amp; Continue
              </button>
            </div>
          </>)}

          {/* ── Loading step ─────────────────────────────────────── */}
          {step === 'loading' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid #e5e7eb', borderTopColor: '#0057b8',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
              }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
                Fetching your documents…
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>
                Connecting to DigiLocker secure servers
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 16 }}>
                🔒 End-to-end encrypted · UIDAI authorised
              </div>
            </div>
          )}

          {/* ── Done step ─────────────────────────────────────────── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#d1fae5', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 28, margin: '0 auto 14px',
              }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: '#065f46' }}>
                Documents Fetched Successfully!
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>
                Redirecting back to {appName}…
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        {step === 'consent' && (
          <div style={{
            padding: '10px 24px 16px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <div style={{ fontSize: 10.5, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
              🔒 256-bit SSL encrypted
            </div>
            <div style={{ fontSize: 10.5, color: '#aaa' }}>·</div>
            <div style={{ fontSize: 10.5, color: '#aaa' }}>
              Powered by APISetu
            </div>
            <div style={{ fontSize: 10.5, color: '#aaa' }}>·</div>
            <div style={{ fontSize: 10.5, color: '#aaa' }}>
              Govt. of India
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
