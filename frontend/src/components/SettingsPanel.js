import React, { useEffect, useState } from 'react';
import { api, setToken } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, Confirm, CopyButton, formatDateTime } from './common';

function Section({ title, children }) {
  return <div className="card"><div className="card-title">{title}</div>{children}</div>;
}

function ShopSection({ s, onSave }) {
  const { L, t } = useLang();
  const [f, setF] = useState(s.shop);
  useEffect(() => setF(s.shop), [s.shop]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fields = [
    ['name', { en: 'Shop name', hi: 'दुकान का नाम' }], ['owner', { en: 'Owner / operator name', hi: 'मालिक / ऑपरेटर' }],
    ['phone', { en: 'Shop phone', hi: 'दुकान फोन' }], ['kiosk_code', { en: 'eMitra kiosk code', hi: 'ई-मित्र कियोस्क कोड' }],
  ];
  return (
    <Section title={`🏪 ${L({ en: 'Shop details (printed on slips and receipts)', hi: 'दुकान विवरण (पर्ची व रसीद पर छपता है)' })}`}>
      <div className="grid2">
        {fields.map(([k, label]) => (
          <div className="field-group" key={k}><label className="field-label">{L(label)}</label><input className="field-input" value={f[k] || ''} onChange={set(k)} /></div>
        ))}
      </div>
      <div className="field-group mt12"><label className="field-label">{L({ en: 'Address', hi: 'पता' })}</label><input className="field-input" value={f.address || ''} onChange={set('address')} /></div>
      <div className="field-group mt12"><label className="field-label">{L({ en: 'Receipt footer (e.g. timings, thanks)', hi: 'रसीद के नीचे (जैसे समय, धन्यवाद)' })}</label><input className="field-input" value={f.receipt_footer || ''} onChange={set('receipt_footer')} /></div>
      <button className="btn btn-primary mt12" onClick={() => onSave('shop', f)}>💾 {t('save')}</button>
    </Section>
  );
}

function RuleEditor({ rule, draft, setDraft, depth = 0 }) {
  const { L, t } = useLang();
  const d = draft[rule.id] || {};
  if (rule.rules) {
    return (
      <div style={{ marginLeft: depth * 16 }}>
        <div className="small" style={{ fontWeight: 600, marginTop: 8 }}>{L(rule.label).replace(/\{value\}/g, '…')}</div>
        {rule.source_note && <div className="tiny muted">ℹ {L(rule.source_note)}</div>}
        {rule.rules.map((r) => <RuleEditor key={r.id} rule={r} draft={draft} setDraft={setDraft} depth={depth + 1} />)}
      </div>
    );
  }
  const value = d.value !== undefined ? d.value : rule.value;
  const verified = d.verified !== undefined ? d.verified : rule.verified;
  return (
    <div className="status-line" style={{ marginLeft: depth * 16, marginTop: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small" style={{ fontWeight: 600 }}>{L(rule.label).replace(/\{value\}/g, rule.value ?? '')}</div>
        {rule.question && <div className="tiny muted">🗣 {L(rule.question)}</div>}
        {rule.source_note && <div className="tiny muted">ℹ {L(rule.source_note)}</div>}
        {rule.verified_at && <div className="tiny muted">✓ {formatDateTime(rule.verified_at)}</div>}
      </div>
      {typeof rule.value === 'number' && (
        <input className="field-input" type="number" style={{ width: 110, padding: '5px 8px' }} value={value}
          onChange={(e) => setDraft({ ...draft, [rule.id]: { ...d, value: e.target.value } })} />
      )}
      <label className="check-row small"><input type="checkbox" checked={!!verified} onChange={(e) => setDraft({ ...draft, [rule.id]: { ...d, verified: e.target.checked } })} />{t('ruleVerified')}</label>
    </div>
  );
}

function ServiceEditor({ service, onSaved }) {
  const { L, t } = useLang();
  const { notify } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ enabled: service.enabled, govt_fee: service.fees.govt_fee ?? '', service_charge: service.fees.service_charge ?? '', portal_url: service.portal ? service.portal.url : '', notes: service.notes || '' });
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await api(`/api/settings/services/${service.id}`, { method: 'PUT', body: { ...f, rules: draft } });
      setDraft({});
      onSaved(r.service);
      notify(t('saved'));
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }
  async function reset() {
    try {
      const r = await api(`/api/settings/services/${service.id}/reset`, { method: 'POST' });
      onSaved(r.service);
      setF({ enabled: r.service.enabled, govt_fee: '', service_charge: '', portal_url: r.service.portal.url, notes: '' });
      setDraft({});
    } catch (err) { notify(err.message, 'error'); }
  }

  return (
    <div className="card" style={{ padding: 14, opacity: f.enabled ? 1 : 0.6 }}>
      <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div className="row">
          <span style={{ fontWeight: 700 }}>{L(service.name)}</span>
          {service.unverified_rules > 0 ? <span className="chip warn">{service.unverified_rules} {t('ruleUnverified')}</span> : service.rules.length ? <span className="chip good">✓ {t('ruleVerified')}</span> : null}
          {!f.enabled && <span className="chip">{L({ en: 'hidden', hi: 'छिपा' })}</span>}
        </div>
        <div className="row small dim">
          {(service.fees.govt_fee !== null || service.fees.service_charge !== null) && <span>₹{service.fees.govt_fee || 0} + ₹{service.fees.service_charge || 0}</span>}
          <span>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="mt12">
          <label className="check-row mb12"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{L({ en: 'Show this service', hi: 'यह सेवा दिखाएँ' })}</label>
          <div className="grid3">
            <div className="field-group"><label className="field-label">{t('feeGovt')} (₹)</label><input className="field-input" value={f.govt_fee} onChange={(e) => setF({ ...f, govt_fee: e.target.value })} inputMode="decimal" /></div>
            <div className="field-group"><label className="field-label">{t('feeService')} (₹)</label><input className="field-input" value={f.service_charge} onChange={(e) => setF({ ...f, service_charge: e.target.value })} inputMode="decimal" /></div>
            <div className="field-group"><label className="field-label">{L({ en: 'Portal link', hi: 'पोर्टल लिंक' })}</label><input className="field-input" value={f.portal_url} onChange={(e) => setF({ ...f, portal_url: e.target.value })} /></div>
          </div>
          <div className="field-group mt12"><label className="field-label">{L({ en: 'Note shown to operator', hi: 'ऑपरेटर हेतु नोट' })}</label><input className="field-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          {service.rules.length > 0 && (
            <div className="mt12">
              <div className="small" style={{ fontWeight: 700 }}>{t('rulesTitle')}</div>
              <div className="tiny muted">{t('unverifiedNote')}</div>
              {service.rules.map((r) => <RuleEditor key={r.id} rule={r} draft={draft} setDraft={setDraft} />)}
            </div>
          )}
          <div className="row mt12">
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : '💾'} {t('save')}</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>↺ {L({ en: 'Reset to default', hi: 'मूल पर लौटें' })}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecuritySection({ s, onSave }) {
  const { L, t } = useLang();
  const { notify } = useApp();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [key, setKey] = useState(null);
  const [mins, setMins] = useState(s.security.auto_lock_minutes);

  async function changePin() {
    try {
      const r = await api('/api/auth/change-pin', { method: 'POST', body: { current_pin: cur, new_pin: next } });
      setToken(r.token);
      setCur(''); setNext('');
      notify(L({ en: 'PIN changed', hi: 'पिन बदला गया' }));
    } catch (err) { notify(err.message, 'error'); }
  }
  async function showKey(regen) {
    try {
      const r = await api(regen ? '/api/settings/extension-key/regenerate' : '/api/settings/extension-key', { method: regen ? 'POST' : 'GET' });
      setKey(r.key);
      if (regen) notify(L({ en: 'New key created — the extension pairs again automatically when the dashboard is open.', hi: 'नई कुंजी बनी — डैशबोर्ड खुला होने पर एक्सटेंशन अपने आप फिर जुड़ जाएगा।' }));
    } catch (err) { notify(err.message, 'error'); }
  }
  return (
    <Section title={`🔐 ${L({ en: 'Security', hi: 'सुरक्षा' })}`}>
      <div className="grid3">
        <div className="field-group"><label className="field-label">{L({ en: 'Current PIN', hi: 'वर्तमान पिन' })}</label><input className="field-input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="field-group"><label className="field-label">{L({ en: 'New PIN', hi: 'नया पिन' })}</label><input className="field-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <div className="field-group" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={changePin} disabled={!cur || next.length < 4}>{L({ en: 'Change PIN', hi: 'पिन बदलें' })}</button></div>
      </div>
      <div className="row mt12">
        <label className="field-label">{L({ en: 'Lock after inactivity (minutes)', hi: 'निष्क्रियता के बाद लॉक (मिनट)' })}</label>
        <input className="field-input" type="number" min={5} max={720} style={{ width: 100 }} value={mins} onChange={(e) => setMins(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => onSave('security', { auto_lock_minutes: mins })}>{t('save')}</button>
      </div>
      <div className="mt16">
        <div className="small" style={{ fontWeight: 700 }}>⚡ {L({ en: 'Extension key', hi: 'एक्सटेंशन कुंजी' })}</div>
        <div className="tiny muted">{L({ en: 'The extension pairs automatically while this dashboard is open. Use this key only if you paste it manually in the extension.', hi: 'डैशबोर्ड खुला होने पर एक्सटेंशन अपने आप जुड़ता है। यह कुंजी केवल हाथ से डालने के लिए है।' })}</div>
        <div className="row mt8">
          {key ? <><code className="mono small" style={{ background: 'var(--surface2)', padding: '4px 8px', borderRadius: 6 }}>{key}</code><CopyButton value={key} /></> : <button className="btn btn-secondary btn-sm" onClick={() => showKey(false)}>{L({ en: 'Show key', hi: 'कुंजी दिखाएँ' })}</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => showKey(true)}>↺ {L({ en: 'New key (unpairs old)', hi: 'नई कुंजी (पुराना हटेगा)' })}</button>
        </div>
      </div>
    </Section>
  );
}

function DangerZone() {
  const { L } = useLang();
  const { notify } = useApp();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [scope, setScope] = useState('customers');
  async function wipe() {
    try {
      const r = await api('/api/settings/wipe', { method: 'POST', body: { pin, confirm, scope } });
      notify(L({ en: `Deleted ${r.customers} customers${r.applications ? ` and ${r.applications} applications` : ''}. A backup was made first.`, hi: `${r.customers} ग्राहक${r.applications ? ` और ${r.applications} आवेदन` : ''} हटाए गए। पहले बैकअप बनाया गया।` }));
      setOpen(false); setPin(''); setConfirm('');
    } catch (err) { notify(err.message, 'error'); }
  }
  return (
    <div className="card danger">
      <div className="card-title">⚠️ {L({ en: 'Delete data', hi: 'डेटा हटाएँ' })}</div>
      <p className="small dim mb12">{L({ en: 'Use after testing, or when you stop using this computer. A backup is created first.', hi: 'परीक्षण के बाद या यह कंप्यूटर छोड़ते समय उपयोग करें। पहले बैकअप बनता है।' })}</p>
      <button className="btn btn-danger" onClick={() => setOpen(true)}>🗑 {L({ en: 'Delete all customer data…', hi: 'सारा ग्राहक डेटा हटाएँ…' })}</button>
      {open && (
        <Confirm title={L({ en: 'Delete data', hi: 'डेटा हटाएँ' })} danger confirmLabel={L({ en: 'Delete', hi: 'हटाएँ' })}
          message={L({ en: 'This cannot be undone (except from a backup).', hi: 'इसे वापस नहीं किया जा सकता (बैकअप के अलावा)।' })}
          onCancel={() => setOpen(false)} onConfirm={wipe}>
          <div className="col mt12">
            <label className="check-row"><input type="radio" checked={scope === 'customers'} onChange={() => setScope('customers')} />{L({ en: 'Customers only (keep application register for accounts)', hi: 'केवल ग्राहक (हिसाब हेतु आवेदन रजिस्टर रखें)' })}</label>
            <label className="check-row"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />{L({ en: 'Everything (customers + applications)', hi: 'सब कुछ (ग्राहक + आवेदन)' })}</label>
            <input className="field-input" type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
            <input className="field-input" placeholder={L({ en: 'Type DELETE', hi: 'DELETE लिखें' })} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </Confirm>
      )}
    </div>
  );
}

export default function SettingsPanel() {
  const { t, L, lang } = useLang();
  const { settings, reloadSettings, notify } = useApp();
  const [tab, setTab] = useState('shop');
  const [services, setServices] = useState(null);
  const [audit, setAudit] = useState(null);
  const [aiTest, setAiTest] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => { if (settings) setServices(settings.services); }, [settings]);
  useEffect(() => {
    if (tab === 'log' && !audit) api('/api/settings/audit?limit=300').then((r) => setAudit(r.entries)).catch(() => setAudit([]));
  }, [tab, audit]);

  if (!settings || !services) return <div className="row muted"><Spinner /> {t('loading')}</div>;
  const s = settings.settings;

  async function saveSection(section, patch) {
    try {
      await api(`/api/settings/section/${section}`, { method: 'PUT', body: patch });
      await reloadSettings();
      notify(t('saved'));
    } catch (err) { notify(err.message, 'error'); }
  }

  async function testAi() {
    setAiTest({ busy: true });
    try { setAiTest(await api('/api/settings/test-ai', { method: 'POST' })); } catch (err) { setAiTest({ ok: false, error: err.message }); }
  }

  async function backupNow() {
    setBackupBusy(true);
    try {
      const r = await api('/api/settings/backup', { method: 'POST' });
      notify(L({ en: `Backup created: ${r.backup}`, hi: `बैकअप बना: ${r.backup}` }));
      reloadSettings();
    } catch (err) { notify(err.message, 'error'); } finally { setBackupBusy(false); }
  }

  const TABS = [
    ['shop', L({ en: 'Shop', hi: 'दुकान' })], ['services', L({ en: 'Services & fees', hi: 'सेवाएँ व शुल्क' })],
    ['ai', L({ en: 'AI & scanning', hi: 'AI व स्कैनिंग' })], ['privacy', L({ en: 'Privacy', hi: 'गोपनीयता' })],
    ['security', L({ en: 'Security', hi: 'सुरक्षा' })], ['backup', L({ en: 'Backup', hi: 'बैकअप' })], ['log', L({ en: 'Activity log', hi: 'गतिविधि लॉग' })],
  ];

  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ {t('settings')}</h1>
          <p className="page-sub">Smart Autofill v{settings.version} · {settings.network.host === '127.0.0.1' ? L({ en: 'Only this computer can open the app', hi: 'केवल यही कंप्यूटर ऐप खोल सकता है' }) : `⚠ ${L({ en: 'Open to the network', hi: 'नेटवर्क के लिए खुला' })} (${settings.network.host})`}</p>
        </div>
      </div>
      <div className="tabs">{TABS.map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</div>

      {tab === 'shop' && <ShopSection s={s} onSave={saveSection} />}

      {tab === 'services' && (
        <div>
          <div className="card warn small">⚠ {t('unverifiedNote')}</div>
          {services.map((sv) => (
            <ServiceEditor key={sv.id} service={sv} onSaved={(n) => { setServices((list) => list.map((x) => (x.id === n.id ? n : x))); reloadSettings(); }} />
          ))}
        </div>
      )}

      {tab === 'ai' && (
        <>
          <Section title={`✦ ${L({ en: 'Cloud AI (Groq) — optional', hi: 'क्लाउड AI (Groq) — वैकल्पिक' })}`}>
            <p className="small dim mb12">{L({ en: 'AI improves reading of names and addresses. Before anything is sent, Aadhaar numbers, VIDs and long numbers are hidden. Turn it off to keep all text on this computer.', hi: 'AI नाम व पते बेहतर पढ़ता है। भेजने से पहले आधार नंबर, VID और लंबे नंबर छिपाए जाते हैं। सारा पाठ इसी कंप्यूटर पर रखने के लिए इसे बंद करें।' })}</p>
            {!s.ai.available ? (
              <div className="small" style={{ color: '#fcd34d' }}>⚠ {L({ en: 'No Groq key configured. Add GROQ_API_KEY to backend\\.env and restart (optional).', hi: 'Groq कुंजी नहीं है। backend\\.env में GROQ_API_KEY जोड़कर फिर शुरू करें (वैकल्पिक)।' })}</div>
            ) : (
              <>
                <label className="check-row"><input type="checkbox" checked={s.ai.enabled} onChange={(e) => saveSection('ai', { enabled: e.target.checked })} />{L({ en: 'Use cloud AI for document reading and the helper', hi: 'दस्तावेज़ पढ़ने और सहायक के लिए क्लाउड AI उपयोग करें' })}</label>
                <div className="row mt12">
                  <span className="small dim">{L({ en: 'Model', hi: 'मॉडल' })}: <span className="mono">{s.ai.model}</span></span>
                  <button className="btn btn-secondary btn-sm" onClick={testAi} disabled={aiTest && aiTest.busy}>{aiTest && aiTest.busy ? <Spinner /> : '⚡'} {L({ en: 'Test connection', hi: 'कनेक्शन जाँचें' })}</button>
                  {aiTest && !aiTest.busy && <span className="small" style={{ color: aiTest.ok ? 'var(--green)' : '#fca5a5' }}>{aiTest.ok ? '✓ OK' : `✕ ${aiTest.error}`}</span>}
                </div>
              </>
            )}
          </Section>
          <Section title={`🔤 ${L({ en: 'Document scanning (OCR)', hi: 'दस्तावेज़ स्कैनिंग (OCR)' })}`}>
            <div className="row">
              <select className="field-input" style={{ width: 260 }} value={s.ocr.languages} onChange={(e) => saveSection('ocr', { languages: e.target.value })}>
                <option value="eng+hin">{L({ en: 'English + Hindi (recommended)', hi: 'अंग्रेज़ी + हिंदी (अनुशंसित)' })}</option>
                <option value="eng">{L({ en: 'English only (faster)', hi: 'केवल अंग्रेज़ी (तेज़)' })}</option>
              </select>
              <span className="small dim">{L({ en: 'Installed', hi: 'इंस्टॉल' })}: {(settings.ocr_languages_installed || []).join(', ') || '—'}</span>
            </div>
            {!(settings.ocr_languages_installed || []).includes('hin') && <div className="tiny muted mt8">{L({ en: 'Hindi data downloads automatically on first scan (needs internet once), or run "npm run ocr:download" in the backend folder.', hi: 'हिंदी डेटा पहली स्कैन पर अपने आप डाउनलोड होता है (एक बार इंटरनेट चाहिए), या backend फ़ोल्डर में "npm run ocr:download" चलाएँ।' })}</div>}
          </Section>
        </>
      )}

      {tab === 'privacy' && (
        <>
          <Section title={`🛡 ${L({ en: 'Privacy', hi: 'गोपनीयता' })}`}>
            <div className="col">
              <label className="check-row"><input type="checkbox" checked={s.privacy.default_consent} onChange={(e) => saveSection('privacy', { default_consent: e.target.checked })} />{L({ en: 'Tick "keep details" by default for new customers (still ask them!)', hi: 'नए ग्राहकों के लिए "विवरण रखें" पहले से टिक (फिर भी पूछें!)' })}</label>
              <label className="check-row"><input type="checkbox" checked={s.privacy.auto_delete_unconsented} onChange={(e) => saveSection('privacy', { auto_delete_unconsented: e.target.checked })} />{L({ en: 'Delete customers without consent automatically at the end of the day', hi: 'बिना सहमति वाले ग्राहक दिन के अंत में अपने आप हटाएँ' })}</label>
              <div className="row">
                <span className="small">{L({ en: 'Delete kept customers not seen for (days, 0 = never)', hi: 'इतने दिन न आने पर रखे ग्राहक हटाएँ (दिन, 0 = कभी नहीं)' })}</span>
                <input className="field-input" type="number" min={0} style={{ width: 100 }} defaultValue={s.privacy.retention_days} onBlur={(e) => saveSection('privacy', { retention_days: e.target.value })} />
              </div>
              <div className="tiny muted">{L({ en: 'Scanned images and raw text are never stored — only the values read from them, encrypted.', hi: 'स्कैन फोटो और कच्चा पाठ कभी सेव नहीं होता — केवल पढ़े गए मान, एन्क्रिप्टेड।' })}</div>
            </div>
          </Section>
          <DangerZone />
        </>
      )}

      {tab === 'security' && <SecuritySection s={s} onSave={saveSection} />}

      {tab === 'backup' && (
        <Section title={`💾 ${L({ en: 'Backup', hi: 'बैकअप' })}`}>
          <p className="small dim mb12">{L({ en: 'A backup is made automatically every day (last 14 kept) in backend\\backups. Each backup contains the database AND the encryption key — copy it to a USB drive and keep it safe.', hi: 'हर दिन backend\\backups में अपने आप बैकअप बनता है (अंतिम 14 रखे जाते हैं)। हर बैकअप में डेटाबेस और एन्क्रिप्शन कुंजी दोनों हैं — USB ड्राइव में कॉपी कर सुरक्षित रखें।' })}</p>
          <div className="row mb12">
            <button className="btn btn-primary" onClick={backupNow} disabled={backupBusy}>{backupBusy ? <Spinner /> : '💾'} {L({ en: 'Backup now', hi: 'अभी बैकअप लें' })}</button>
            {settings.last_backup && <span className="small dim">{L({ en: 'Last', hi: 'अंतिम' })}: {formatDateTime(settings.last_backup.at, lang)}</span>}
          </div>
          {(settings.backups || []).map((b) => (
            <div key={b.name} className="list-item small"><span className="mono">{b.name}</span><span className="spacer" /><span className="muted">{Math.round(b.size / 1024)} KB</span></div>
          ))}
          <div className="tiny muted mt12">{L({ en: 'To restore: close the app, copy shop.db and master.key from a backup folder into backend\\data, start again (see README in the backup folder).', hi: 'वापस लाने के लिए: ऐप बंद करें, बैकअप फ़ोल्डर से shop.db और master.key को backend\\data में कॉपी करें, फिर शुरू करें (बैकअप फ़ोल्डर का README देखें)।' })}</div>
        </Section>
      )}

      {tab === 'log' && (
        <Section title={`🕑 ${L({ en: 'Activity log (no personal data)', hi: 'गतिविधि लॉग (व्यक्तिगत डेटा नहीं)' })}`}>
          {!audit ? <Spinner /> : (
            <div className="table-wrap" style={{ maxHeight: 520, overflow: 'auto' }}>
              <table className="table">
                <thead><tr><th>{t('date')}</th><th>{L({ en: 'Action', hi: 'क्रिया' })}</th><th>{L({ en: 'Item', hi: 'वस्तु' })}</th><th>{L({ en: 'Details', hi: 'विवरण' })}</th></tr></thead>
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.id}><td className="small">{formatDateTime(e.ts, lang)}</td><td className="mono small">{e.action}</td><td className="mono tiny muted">{e.entity ? `${e.entity} ${e.entity_id || ''}` : ''}</td><td className="tiny muted">{e.meta ? JSON.stringify(e.meta) : ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
