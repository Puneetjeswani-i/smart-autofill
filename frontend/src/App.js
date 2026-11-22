import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setToken, setUnauthorizedHandler } from './api';
import { LangProvider, makeT } from './i18n';
import { AppContext, BACKEND_ORIGIN } from './AppContext';
import LoginScreen from './components/LoginScreen';
import HomePanel from './components/HomePanel';
import CustomersPanel, { NewCustomerModal } from './components/CustomersPanel';
import CustomerWorkspace from './components/CustomerWorkspace';
import ApplicationsPanel from './components/ApplicationsPanel';
import ToolsPanel from './components/ToolsPanel';
import SettingsPanel from './components/SettingsPanel';
import ExtensionGuide from './components/ExtensionGuide';
import DigiLockerPanel from './components/DigiLockerPanel';
import AIChatbot from './components/AIChatbot';
import { Spinner } from './components/common';
import emitraLogo from './emitra-logo.png';
import './App.css';

const NAV = [
  { id: 'home', key: 'home', icon: '🏠' },
  { id: 'new', key: 'newCustomer', icon: '➕' },
  { id: 'customers', key: 'customers', icon: '👥' },
  { id: 'applications', key: 'applications', icon: '📋' },
  { id: 'tools', key: 'tools', icon: '🧰' },
  { id: 'settings', key: 'settings', icon: '⚙️' },
  { id: 'extension', key: 'extension', icon: '⚡' },
];

export default function App() {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('sa_lang') || 'en'; } catch { return 'en'; } });
  const [auth, setAuth] = useState({ state: 'loading' });
  const [view, setView] = useState('home');
  const [customerId, setCustomerId] = useState(null);
  const [workspaceTab, setWorkspaceTab] = useState('documents');
  const [catalog, setCatalog] = useState(null);
  const [settingsData, setSettingsData] = useState(null);
  const [activeSummary, setActiveSummary] = useState(null);
  const [toast, setToast] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [extensionPaired, setExtensionPaired] = useState(false);
  const toastTimer = useRef(null);

  const { t } = makeT(lang);

  const toggleLang = () => {
    const next = lang === 'hi' ? 'en' : 'hi';
    setLang(next);
    try { localStorage.setItem('sa_lang', next); } catch { /* ignore */ }
  };

  const notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 3500);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const s = await api('/api/auth/status');
      if (s.setup_required) setAuth({ state: 'setup', shopName: s.shop_name, demo: s.demo_mode });
      else if (s.logged_in) setAuth({ state: 'ok', shopName: s.shop_name, demo: s.demo_mode, version: s.version });
      else setAuth({ state: 'login', shopName: s.shop_name, demo: s.demo_mode });
    } catch (err) {
      setAuth({ state: 'offline', error: err.message });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth((a) => (a.state === 'ok' ? { ...a, state: 'login' } : a)));
    checkAuth();
  }, [checkAuth]);

  const reloadSettings = useCallback(async () => {
    try {
      const s = await api('/api/settings');
      setSettingsData(s);
      return s;
    } catch { return null; }
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const r = await api('/api/customers/active');
      setActiveSummary(r.active && r.active.customer ? r.active.customer : null);
    } catch { /* ignore */ }
  }, []);

  // after login: vocabulary, settings, active customer, extension pairing
  useEffect(() => {
    if (auth.state !== 'ok') return undefined;
    api('/api/meta/catalog').then(setCatalog).catch(() => {});
    reloadSettings();
    refreshActive();
    let cancelled = false;
    api('/api/settings/extension-key').then((r) => {
      if (cancelled) return;
      window.postMessage({ type: 'SMART_AUTOFILL_PAIR', key: r.key, backend: BACKEND_ORIGIN }, window.location.origin);
    }).catch(() => {});
    const onMsg = (e) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'SMART_AUTOFILL_PAIRED') setExtensionPaired(true);
    };
    window.addEventListener('message', onMsg);
    return () => { cancelled = true; window.removeEventListener('message', onMsg); };
  }, [auth.state, reloadSettings, refreshActive]);

  const openCustomer = useCallback(async (id, tab = 'documents') => {
    setCustomerId(id);
    setWorkspaceTab(tab);
    setView('customer');
    try {
      const r = await api('/api/customers/active', { method: 'POST', body: { customer_id: id } });
      setActiveSummary(r.active.customer);
    } catch { /* ignore */ }
  }, []);

  const finishCustomer = useCallback(async () => {
    await api('/api/customers/active', { method: 'DELETE' }).catch(() => {});
    setActiveSummary(null);
    setCustomerId(null);
    setView('home');
  }, []);

  const go = useCallback((v) => {
    if (v === 'new') { setNewOpen(true); return; }
    if (v === 'customer' && !customerId) { setView('customers'); return; }
    setView(v);
  }, [customerId]);

  async function lock() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setAuth((a) => ({ ...a, state: 'login' }));
  }

  const ctx = useMemo(() => ({
    notify, catalog, settings: settingsData, reloadSettings, openCustomer, go,
    extensionPaired, refreshActive, lang,
  }), [notify, catalog, settingsData, reloadSettings, openCustomer, go, extensionPaired, refreshActive, lang]);

  if (auth.state === 'loading') {
    return <div className="login-wrap"><Spinner size={28} /></div>;
  }
  if (auth.state === 'offline') {
    return (
      <LangProvider lang={lang}>
        <div className="login-wrap">
          <div className="login-card">
            <h2 style={{ marginBottom: 8 }}>⚠️ Server not reachable</h2>
            <p className="dim small mb16">{auth.error}</p>
            <p className="small dim mb16">Start the app with <b>start-shop.bat</b> (or <code>npm start</code> in the backend folder), then retry.</p>
            <button className="btn btn-primary" onClick={() => { setAuth({ state: 'loading' }); checkAuth(); }}>↺ Retry</button>
          </div>
        </div>
      </LangProvider>
    );
  }
  if (auth.state === 'setup' || auth.state === 'login') {
    return (
      <LangProvider lang={lang}>
        <LoginScreen setupRequired={auth.state === 'setup'} shopName={auth.shopName} lang={lang} onToggleLang={toggleLang}
          onLoggedIn={() => { setAuth({ state: 'loading' }); checkAuth(); }} />
      </LangProvider>
    );
  }

  const shopName = (settingsData && settingsData.settings.shop.name) || auth.shopName || t('appSub');
  const navActive = view === 'customer' ? 'customers' : view;

  return (
    <LangProvider lang={lang}>
      <AppContext.Provider value={ctx}>
        <div className="app-shell" lang={lang}>
          <aside className="sidebar">
            <div className="sidebar-logo">
              <div className="logo-icon"><img src={emitraLogo} alt="eMitra" className="emitra-logo-img" /></div>
              <div style={{ minWidth: 0 }}>
                <div className="logo-title">{t('appTitle')}</div>
                <div className="logo-sub" title={shopName}>{shopName}</div>
              </div>
            </div>

            <button type="button" className="lang-toggle" onClick={toggleLang} aria-label="Language">
              {lang === 'hi' ? <><b>हिं</b> | EN</> : <>हिं | <b>EN</b></>}
            </button>

            {activeSummary && (
              <div className="active-customer" onClick={() => openCustomer(activeSummary.id, view === 'customer' ? workspaceTab : 'details')} title={t('workingOn')}>
                <div className="ac-label">{t('workingOn')}</div>
                <div className="ac-name">{activeSummary.name || t('unnamed')}</div>
                <div className="ac-sub">#{activeSummary.customer_no}{activeSummary.phone ? ` · ${activeSummary.phone}` : ''}</div>
              </div>
            )}

            <nav className="sidebar-nav">
              {NAV.map((item) => (
                <button key={item.id} className={`nav-item ${navActive === item.id ? 'active' : ''}`} onClick={() => go(item.id)}>
                  <span className="nav-icon">{item.icon}</span>
                  <span>{t(item.key)}</span>
                  {item.id === 'extension' && !extensionPaired && <span className="nav-count" title="Extension not connected">!</span>}
                </button>
              ))}
              {auth.demo && (
                <button className={`nav-item ${view === 'digilocker' ? 'active' : ''}`} onClick={() => setView('digilocker')}>
                  <span className="nav-icon">🔐</span><span>DigiLocker (demo)</span>
                </button>
              )}
            </nav>

            <div className="sidebar-footer">
              <div className="security-badge">
                <span>🔒</span>
                <div>
                  <div className="sec-title">{t('encrypted')}</div>
                  <div className="sec-sub">{t('encryptedSub')}</div>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm btn-block" onClick={lock}>🔒 {t('lock')}</button>
            </div>
          </aside>

          <main className="main-content">
            {toast && (
              <div className={`notification ${toast.type}`} role="status">
                <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>{toast.msg}
              </div>
            )}

            {view === 'home' && <HomePanel onNewCustomer={() => setNewOpen(true)} />}
            {view === 'customers' && <CustomersPanel onNewCustomer={() => setNewOpen(true)} />}
            {view === 'customer' && customerId && (
              <CustomerWorkspace key={customerId} customerId={customerId} tab={workspaceTab} onTab={setWorkspaceTab}
                onFinish={finishCustomer} onDeleted={() => { setActiveSummary(null); setCustomerId(null); setView('customers'); }}
                onChanged={refreshActive} />
            )}
            {view === 'applications' && <ApplicationsPanel />}
            {view === 'tools' && <ToolsPanel />}
            {view === 'settings' && <SettingsPanel />}
            {view === 'extension' && <ExtensionGuide />}
            {view === 'digilocker' && auth.demo && <DigiLockerPanel />}
          </main>

          {newOpen && (
            <NewCustomerModal onClose={() => setNewOpen(false)}
              onCreated={(c) => { setNewOpen(false); openCustomer(c.id, 'documents'); notify(`${t('newCustomer')} #${c.customer_no}`); }} />
          )}
          {settingsData && settingsData.settings.ai.effective && <AIChatbot customerId={view === 'customer' ? customerId : null} />}
        </div>
      </AppContext.Provider>
    </LangProvider>
  );
}
