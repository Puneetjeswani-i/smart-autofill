/**
 * DigiLocker panel — DEMO_MODE only. Real DigiLocker access needs approved
 * APISetu partner credentials, which an individual shop normally does not have.
 */

import React, { useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { BACKEND_ORIGIN } from '../AppContext';
import { Spinner } from './common';

export default function DigiLockerPanel() {
  const { L } = useLang();
  const { openCustomer, notify } = useApp();
  const [busy, setBusy] = useState(false);

  async function demoCustomer() {
    setBusy(true);
    try {
      const r = await api('/api/demo/customer', { method: 'POST' });
      openCustomer(r.customer.id, 'details');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔐 DigiLocker — {L({ en: 'demo', hi: 'डेमो' })}</h1>
          <p className="page-sub">{L({ en: 'Shown only because DEMO_MODE=true. Not for real customers.', hi: 'केवल DEMO_MODE=true होने पर दिखता है। असली ग्राहकों के लिए नहीं।' })}</p>
        </div>
      </div>
      <div className="card warn small">
        {L({ en: 'Real DigiLocker integration requires approval as an APISetu "requester" (government partner). Until then this is a simulation for presentations.', hi: 'असली DigiLocker जोड़ने के लिए APISetu "requester" (सरकारी साझेदार) की मंज़ूरी चाहिए। तब तक यह प्रस्तुति हेतु सिमुलेशन है।' })}
      </div>
      <div className="grid2">
        <div className="card">
          <div className="card-title">{L({ en: 'Simulated OAuth flow', hi: 'नकली OAuth प्रक्रिया' })}</div>
          <a className="btn btn-secondary" href={`${BACKEND_ORIGIN}/auth/digilocker`}>{L({ en: 'Open simulated consent page', hi: 'नकली सहमति पेज खोलें' })} ↗</a>
        </div>
        <div className="card">
          <div className="card-title">{L({ en: 'Demo customer (fictional)', hi: 'डेमो ग्राहक (काल्पनिक)' })}</div>
          <p className="small dim mb12">{L({ en: 'Creates "Amit Kumar" from fake documents, run through the real extraction pipeline.', hi: 'नकली दस्तावेज़ों से "अमित कुमार" बनाता है, असली पढ़ने की प्रक्रिया से।' })}</p>
          <button className="btn btn-primary" onClick={demoCustomer} disabled={busy}>{busy ? <Spinner /> : '➕'} {L({ en: 'Create demo customer', hi: 'डेमो ग्राहक बनाएँ' })}</button>
        </div>
      </div>
    </div>
  );
}
