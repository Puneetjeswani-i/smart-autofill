import React, { useState } from 'react';
import { api, setToken } from '../api';
import { useLang } from '../i18n';
import { Spinner } from './common';
import emitraLogo from '../emitra-logo.png';

export default function LoginScreen({ setupRequired, shopName, onLoggedIn, lang, onToggleLang }) {
  const { t } = useLang();
  const [name, setName] = useState(shopName || '');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (pin.length < 4) { setError(t('pinTooShort')); return; }
    if (setupRequired && pin !== pin2) { setError(t('pinMismatch')); return; }
    setBusy(true);
    try {
      const r = await api(setupRequired ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: { pin } });
      setToken(r.token);
      if (setupRequired && name.trim()) {
        await api('/api/settings/section/shop', { method: 'PUT', body: { name: name.trim() } }).catch(() => {});
      }
      onLoggedIn();
    } catch (err) {
      setError(err.message);
      setPin('');
      setPin2('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="row-between mb16">
          <div className="row">
            <div className="logo-icon"><img src={emitraLogo} alt="" className="emitra-logo-img" /></div>
            <div>
              <div style={{ fontWeight: 700 }}>{t('appTitle')}</div>
              <div className="tiny muted">{shopName || t('appSub')}</div>
            </div>
          </div>
          <button type="button" className="lang-toggle" style={{ margin: 0 }} onClick={onToggleLang}>
            {lang === 'hi' ? <><b>हिं</b> | EN</> : <>हिं | <b>EN</b></>}
          </button>
        </div>

        <h2 style={{ fontSize: 20, marginBottom: 6 }}>{setupRequired ? t('setPinTitle') : t('loginTitle')}</h2>
        {setupRequired && <p className="small dim mb16">{t('setPinSub')}</p>}

        <div className="col">
          {setupRequired && (
            <div className="field-group">
              <label className="field-label">{t('shopName')}</label>
              <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shree Krishna eMitra Kendra" maxLength={80} />
            </div>
          )}
          <div className="field-group">
            <label className="field-label">{t('pin')}</label>
            <input className="field-input pin-input" type="password" inputMode="numeric" autoFocus autoComplete={setupRequired ? 'new-password' : 'current-password'}
              value={pin} onChange={(e) => setPin(e.target.value)} maxLength={64} />
          </div>
          {setupRequired && (
            <div className="field-group">
              <label className="field-label">{t('confirmPin')}</label>
              <input className="field-input pin-input" type="password" inputMode="numeric" autoComplete="new-password"
                value={pin2} onChange={(e) => setPin2(e.target.value)} maxLength={64} />
            </div>
          )}
          {error && <div className="field-hint error">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !pin}>
            {busy ? <Spinner /> : '🔓'} {setupRequired ? t('startSetup') : t('login')}
          </button>
          {!setupRequired && <div className="tiny muted" style={{ textAlign: 'center' }}>{t('forgotPin')}</div>}
        </div>
      </form>
    </div>
  );
}
