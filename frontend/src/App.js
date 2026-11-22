import React, { useState, useEffect, useCallback } from 'react';
import ProfilePanel from './components/ProfilePanel';
import ExtensionGuide from './components/ExtensionGuide';
import VerifyPanel from './components/VerifyPanel';
import DigiLockerPanel from './components/DigiLockerPanel';
import EligibilityPanel from './components/EligibilityPanel';
import GroqUploadPanel from './components/GroqUploadPanel';
import VerifyData from './components/VerifyData';
import AIChatbot from './components/AIChatbot';
import emitraLogo from './emitra-logo.png';
import './App.css';

const TRANSLATIONS = {
  en: {
    appTitle: 'Citizen Services',
    appSub: 'e-Mitra Assistant',
    loginBtn: 'Login with DigiLocker',
    eligibilityTab: 'My Eligibility',
    applyBtn: 'Apply Now',
    whyNot: 'Why not eligible?',
    eligible: 'Eligible',
    ineligible: 'Not Eligible',
    submitBtn: 'Submit Application',
    autoFilled: 'Auto-filled from',
    demoBtn: 'Load Demo Profile',
    schemes: 'schemes',
    qualify: 'You qualify for',
    notQualify: 'Not eligible for',
  },
  hi: {
    appTitle: 'नागरिक सेवा',
    appSub: 'e-Mitra सहायक',
    loginBtn: 'DigiLocker से लॉगिन करें',
    eligibilityTab: 'मेरी पात्रता',
    applyBtn: 'अभी आवेदन करें',
    whyNot: 'अपात्र क्यों?',
    eligible: 'पात्र',
    ineligible: 'अपात्र',
    submitBtn: 'आवेदन जमा करें',
    autoFilled: 'स्वतः भरा गया —',
    demoBtn: 'डेमो प्रोफ़ाइल लोड करें',
    schemes: 'योजनाएं',
    qualify: 'आप पात्र हैं',
    notQualify: 'अपात्र हैं',
  },
};

const NAV = [
  { id: 'digilocker',  labelKey: 'loginBtn',       icon: '🔐' },
  { id: 'eligibility', labelKey: 'eligibilityTab',  icon: '📊', badge: 'NEW' },
  { id: 'ai-upload',   label: 'AI Scanner',          icon: '⚡', badge: 'AI' },
  { id: 'verify-data', label: 'Verify Data',         icon: '✅' },
  { id: 'verify',      label: 'Verify & Readiness', icon: '🛡️' },
  { id: 'profile',     label: 'My Profile',          icon: '◈' },
  { id: 'extension',   label: 'Extension',            icon: '⬡' },
];

// Session ID for non-DigiLocker parts of the app (upload, profile, verify)
function getOrCreateSessionId() {
  let id = sessionStorage.getItem('af_session_id');
  if (!id) {
    // Try localStorage as fallback (persists across tabs)
    id = localStorage.getItem('af_session_id');
  }
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  // Store in both so extension and other tabs can find it
  sessionStorage.setItem('af_session_id', id);
  localStorage.setItem('af_session_id', id);
  return id;
}

export default function App() {
  const [activeTab, setActiveTab]           = useState('ai-upload');  // AI Scanner is default
  const [language, setLanguage]             = useState('en');
  const [profile, setProfile]               = useState(null);
  const [completeness, setCompleteness]     = useState(null);
  const [notification, setNotification]     = useState(null);
  const [residenceReport, setResidenceReport] = useState(null);
  const [fraudReport, setFraudReport]       = useState(null);
  const [demoLoading, setDemoLoading]       = useState(false);
  const [activeMainView, setActiveMainView] = useState('digilocker');
  const [applyingScheme, setApplyingScheme] = useState(null);

  // DigiLocker connection status — updated by DigiLockerPanel via onStatusChange
  const [digilockerConnected, setDigilockerConnected] = useState(false);

  const sessionId = getOrCreateSessionId();
  const t = (key) => TRANSLATIONS[language]?.[key] ?? key;

  function sessionHeaders() {
    return { 'Content-Type': 'application/json', 'X-Session-ID': sessionId };
  }

  useEffect(() => { fetchProfile(); }, []); // eslint-disable-line

  async function fetchProfile() {
    try {
      const res  = await fetch('/api/profile', { headers: { 'X-Session-ID': sessionId } });
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        setCompleteness(data.completeness || null);
        setResidenceReport(data.residence_report || null);
        setFraudReport(data.fraud_report || null);
      }
    } catch {}
  }

  function notify(msg, type = 'success') {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }

  function handleNavChange(tabId) {
    setActiveTab(tabId);
    if (tabId === 'digilocker')        setActiveMainView('digilocker');
    else if (tabId === 'eligibility')  setActiveMainView('eligibility');
    else                               setActiveMainView('legacy');
  }

  async function saveProfile(updated) {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: sessionHeaders(),
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProfile();
        notify('Profile saved securely!');
      } else notify(data.error || 'Save failed', 'error');
    } catch { notify('Could not connect to backend', 'error'); }
  }

  async function loadDemoProfile() {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/demo-profile', {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setCompleteness(data.completeness || null);
        setResidenceReport(data.residence_report || null);
        setFraudReport(data.fraud_report || null);
        notify('Demo profile loaded — Amit Kumar, Jaipur, Rajasthan');
        setActiveMainView('eligibility');
        setActiveTab('eligibility');
      } else {
        notify(data.error || 'Failed to load demo profile', 'error');
      }
    } catch (e) {
      notify('Backend not reachable: ' + e.message, 'error');
    } finally {
      setDemoLoading(false);
    }
  }

  const score      = completeness?.score;
  const scoreColor = score >= 75 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="app-shell">
      <div className="ambient" />
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon emitra-logo-wrap">
            <img src={emitraLogo} alt="eMitra" className="emitra-logo-img" />
          </div>
          <div>
            <div className="logo-title">{t('appTitle')}</div>
            <div className="logo-sub">{t('appSub')}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLanguage(prev => prev === 'en' ? 'hi' : 'en')}
          style={{
            fontSize: 12,
            padding: '4px 14px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.07)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            margin: '0 auto 10px',
            display: 'block',
          }}
          aria-label="Toggle language"
        >
          <span style={{ color: language === 'hi' ? '#fff' : 'var(--text-muted)' }}>हिं</span>
          <span style={{ color: 'var(--text-muted)' }}> | </span>
          <span style={{ color: language === 'en' ? '#fff' : 'var(--text-muted)' }}>EN</span>
        </button>


        {profile && completeness && (
          <div className="sidebar-readiness">
            <div className="sr-label">Application Readiness</div>
            <div className="sr-row">
              <div className="sr-bar">
                <div className="sr-fill" style={{ width: `${score}%`, background: scoreColor }} />
              </div>
              <div className="sr-score" style={{ color: scoreColor }}>{score}%</div>
            </div>
            {completeness.missing_fields?.filter(f => f.required).length > 0 && (
              <div className="sr-missing">
                ⚠ {completeness.missing_fields.filter(f => f.required).length} required fields missing
              </div>
            )}
            {residenceReport && (
              <div className="sr-residence" style={{
                marginTop: 6, fontSize: 10,
                color: residenceReport.status === 'eligible' ? '#4ade80'
                     : residenceReport.status === 'partial'  ? '#fbbf24' : '#f87171',
              }}>
                🏠 Residence: {residenceReport.residence_years_estimated ?? '?'}yr est.
                {residenceReport.status === 'eligible' ? ' ✓' : ' ⚠'}
              </div>
            )}
          </div>
        )}

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <div key={item.id}>
              <button
                data-id={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => handleNavChange(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
                {item.badge && <span className="nav-new">{item.badge}</span>}
                {item.id === 'profile' && profile && <span className="nav-badge">●</span>}
                {item.id === 'digilocker' && digilockerConnected && (
                  <span className="nav-badge" style={{ color: '#4ade80' }}>●</span>
                )}
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="security-badge">
            <span>🔒</span>
            <div>
              <div className="sec-title">AES Encrypted</div>
              <div className="sec-sub">Data encrypted locally on your device</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content" data-main-view={activeMainView} lang={language}>
        {notification && (
          <div className={`notification ${notification.type}`}>
            <span>{notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'}</span>
            {notification.msg}
          </div>
        )}

        {activeTab === 'digilocker' && (
          // DigiLockerPanel now manages its own state via useDigiLocker hook.
          // onStatusChange lets App know whether to show the green dot in the nav.
          // onViewSchemes navigates to the eligibility tab.
          // onDemoLoad keeps the demo shortcut working.
          <DigiLockerPanel
            onStatusChange={setDigilockerConnected}
            onViewSchemes={() => {
              setActiveTab('eligibility');
              setActiveMainView('eligibility');
            }}
            onDemoLoad={loadDemoProfile}
            t={t}
            language={language}
          />
        )}

        {activeTab === 'eligibility' && (
          <EligibilityPanel
            sessionId={sessionId}
            onApply={(scheme) => {
              setApplyingScheme(scheme);
              // Mool Niwas and all schemes now handled via Apply Now → portal redirect
              notify('Opening application portal for ' + scheme.name);
            }}
            t={t}
            language={language}
          />
        )}

        {activeTab === 'ai-upload' && (
          <GroqUploadPanel
            sessionId={sessionId}
            onSuccess={(data) => {
              setProfile(data.data);
              if (data.completeness) setCompleteness(data.completeness);
              notify('AI extraction complete! ' + data.documents_successful + ' docs processed. Review the results below, then navigate to Verify & Readiness when ready.');
              fetchProfile();
              // No auto-redirect — user reviews results at their own pace
            }}
            onNavigateToVerify={() => setActiveTab('verify')}
            onProfileReset={() => {
              setProfile(null);
              setCompleteness(null);
              setResidenceReport(null);
              setFraudReport(null);
              setApplyingScheme(null);
              setDigilockerConnected(false);
              notify('Profile cleared — ready to scan a new person\'s documents', 'info');
            }}
            onError={(msg) => notify(msg, 'error')}
          />
        )}

        {activeTab === 'verify' && (
          <VerifyPanel
            profile={profile}
            completeness={completeness}
            residenceReport={residenceReport}
            fraudReport={fraudReport}
            structuredProfile={profile}
            sessionId={sessionId}
          />
        )}

        {activeTab === 'verify-data' && (
          <VerifyData
            profile={profile}
            sessionId={sessionId}
            fraudReport={fraudReport}
            onSaved={(updatedProfile) => {
              setProfile(updatedProfile);
              fetchProfile();
            }}
            onProceed={() => setActiveTab('eligibility')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePanel
            profile={profile}
            structuredProfile={profile}
            completeness={completeness}
            onSave={saveProfile}
            onDelete={async () => {
              await fetch('/api/profile', {
                method: 'DELETE',
                headers: { 'X-Session-ID': sessionId },
              });
              setProfile(null);
              setCompleteness(null);
              setResidenceReport(null);
              setFraudReport(null);
              setDigilockerConnected(false);
              setApplyingScheme(null);
              setActiveMainView('digilocker');
              notify('All data deleted', 'info');
            }}
          />
        )}

        {activeTab === 'extension' && <ExtensionGuide />}
      </main>

      {/* AI Chatbot - floats in corner */}
      <AIChatbot sessionId={sessionId} />
    </div>
  );
}
