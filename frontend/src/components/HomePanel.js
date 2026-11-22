import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { formatINR, formatDateTime, Spinner } from './common';

function SetupChecklist({ settings, extensionPaired, onGo }) {
  const { L } = useLang();
  if (!settings) return null;
  const s = settings.settings;
  const services = settings.services || [];
  const feesSet = services.filter((x) => x.enabled && (x.fees.govt_fee !== null || x.fees.service_charge !== null)).length;
  const unverified = services.filter((x) => x.enabled).reduce((n, x) => n + (x.unverified_rules || 0), 0);
  const items = [
    { done: !!s.shop.name, label: { en: 'Add your shop name and phone (printed on receipts)', hi: 'दुकान का नाम व फोन जोड़ें (रसीद पर छपता है)' }, go: 'settings' },
    { done: feesSet > 0, label: { en: 'Set government fee and your service charge for your services', hi: 'अपनी सेवाओं का सरकारी शुल्क व सेवा शुल्क रखें' }, go: 'settings' },
    { done: unverified === 0, label: { en: `Verify eligibility rules against official notifications (${unverified} not verified)`, hi: `पात्रता नियमों की आधिकारिक अधिसूचना से पुष्टि करें (${unverified} असत्यापित)` }, go: 'settings' },
    { done: extensionPaired, label: { en: 'Install the ⚡ Chrome extension for autofill', hi: 'ऑटोफिल के लिए ⚡ क्रोम एक्सटेंशन इंस्टॉल करें' }, go: 'extension' },
    { done: (settings.ocr_languages_installed || []).includes('hin'), label: { en: 'Hindi OCR data downloaded (works offline)', hi: 'हिंदी OCR डेटा डाउनलोड (ऑफलाइन चलता है)' }, go: 'settings' },
    { done: !!settings.last_backup, label: { en: 'First backup created (daily backups are automatic)', hi: 'पहला बैकअप बना (रोज़ स्वतः बैकअप)' }, go: 'settings' },
  ];
  const left = items.filter((i) => !i.done);
  if (!left.length) return null;
  return (
    <div className="card warn">
      <div className="card-title">🚀 {L({ en: 'Getting started', hi: 'शुरुआत' })} — {items.length - left.length}/{items.length}</div>
      {items.map((i, idx) => (
        <div key={idx} className="row small" style={{ padding: '4px 0', cursor: i.done ? 'default' : 'pointer' }} onClick={() => !i.done && onGo(i.go)}>
          <span style={{ color: i.done ? 'var(--green)' : 'var(--yellow)', width: 18 }}>{i.done ? '✓' : '○'}</span>
          <span className={i.done ? 'muted' : ''} style={{ textDecoration: i.done ? 'line-through' : 'none' }}>{L(i.label)}</span>
          {!i.done && <span className="muted">→</span>}
        </div>
      ))}
    </div>
  );
}

export default function HomePanel({ onNewCustomer }) {
  const { t, L, lang } = useLang();
  const { openCustomer, settings, extensionPaired, go } = useApp();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    api('/api/applications/summary').then(setSummary).catch(() => setSummary({}));
    api('/api/customers?limit=8').then((r) => setRecent(r.customers)).catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return undefined; }
    const h = setTimeout(() => {
      api(`/api/customers?q=${encodeURIComponent(q)}&limit=8`).then((r) => setResults(r.customers)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const shopName = settings && settings.settings.shop.name;
  const today = summary && summary.today;
  const month = summary && summary.month;

  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">🙏 {t('greeting')}{shopName ? `, ${shopName}` : ''}</h1>
          <p className="page-sub">{new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={onNewCustomer}>➕ {t('newCustomer')}</button>
      </div>

      <div className="card">
        <div className="card-title">🔎 {t('findCustomer')}</div>
        <input className="field-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchHint')} />
        {results && (
          <div className="mt8">
            {results.length === 0 && <div className="small muted">{L({ en: 'No match', hi: 'कोई मेल नहीं' })}</div>}
            {results.map((c) => (
              <div key={c.id} className="list-item clickable" onClick={() => openCustomer(c.id, 'details')}>
                <span className="mono small muted">#{c.customer_no}</span>
                <span style={{ fontWeight: 600 }}>{c.name || t('unnamed')}</span>
                <span className="small muted">{c.phone || ''}</span>
                <span className="spacer" />
                <span className="small muted">{c.village_city || c.district || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <SetupChecklist settings={settings} extensionPaired={extensionPaired} onGo={go} />

      {!summary ? <div className="row muted"><Spinner /> {t('loading')}</div> : (
        <div className="stat-row">
          <div className="stat-card" style={{ '--stat-color': 'var(--accent-light)' }}>
            <div className="stat-num">{summary.new_customers_today ?? 0}</div>
            <div className="stat-label">{t('customersToday')}</div>
            <div className="stat-sub">{L({ en: 'Total on file', hi: 'कुल ग्राहक' })}: {summary.customers_total ?? 0}</div>
          </div>
          <div className="stat-card" style={{ '--stat-color': 'var(--green)' }}>
            <div className="stat-num">{today ? today.count : 0}</div>
            <div className="stat-label">{t('applicationsToday')}</div>
          </div>
          <div className="stat-card" style={{ '--stat-color': 'var(--yellow)' }}>
            <div className="stat-num">{formatINR(today ? today.amount_paid : 0)}</div>
            <div className="stat-label">{t('collectedToday')}</div>
            <div className="stat-sub">{L({ en: 'Service charges', hi: 'सेवा शुल्क' })}: {formatINR(today ? today.service_charge : 0)}</div>
          </div>
          <div className="stat-card" style={{ '--stat-color': 'var(--blue)' }}>
            <div className="stat-num">{month ? month.count : 0}</div>
            <div className="stat-label">{t('thisMonthApps')}</div>
            <div className="stat-sub">{formatINR(month ? month.amount_paid : 0)}</div>
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <div className="card-title">👥 {t('recentCustomers')}</div>
          {!recent ? <Spinner /> : recent.length === 0 ? <div className="small muted">{t('noCustomers')}</div> : recent.map((c) => (
            <div key={c.id} className="list-item clickable" onClick={() => openCustomer(c.id, 'details')}>
              <span className="mono small muted">#{c.customer_no}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || t('unnamed')}</div>
                <div className="tiny muted">{formatDateTime(c.updated_at, lang)} · {c.documents} {L({ en: 'docs', hi: 'दस्तावेज़' })}</div>
              </div>
              {!c.consent_store && <span className="pill warn">{t('deletesTonight')}</span>}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">⏰ {t('followUp')}</div>
          {!summary ? <Spinner /> : !(summary.follow_up || []).length ? (
            <div className="small muted">{L({ en: 'Nothing pending. 👍', hi: 'कुछ बाकी नहीं। 👍' })}</div>
          ) : summary.follow_up.map((a) => (
            <div key={a.id} className="list-item clickable" onClick={() => go('applications')}>
              <span className="mono small muted">{a.ref_no}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{a.customer_name || '—'}</div>
                <div className="tiny muted">{L(a.service_name)} · {a.application_no || ''}</div>
              </div>
              <span className="tiny muted">{formatDateTime(a.submitted_at || a.created_at, lang)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
