/**
 * AI helper (Groq) — answers the operator's questions about the OPEN customer.
 * Identity numbers are masked on the server before anything is sent.
 */

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';

const STARTERS = [
  { en: 'Which services is this customer ready for?', hi: 'यह ग्राहक किन सेवाओं के लिए तैयार है?' },
  { en: 'What documents are still missing?', hi: 'कौन से दस्तावेज़ अभी बाकी हैं?' },
  { en: 'Explain the residence check in simple words', hi: 'निवास जाँच सरल शब्दों में समझाएँ' },
];

export default function AIChatbot({ customerId }) {
  const { L, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  useEffect(() => { setMessages([]); }, [customerId]);
  useEffect(() => { if (open && bottom.current) bottom.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  async function send(text) {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await api('/api/ai/ask', { method: 'POST', body: { question: q, customer_id: customerId, lang } });
      setMessages((m) => [...m, { role: 'assistant', text: r.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `⚠ ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(!open)} title="AI helper"
        style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 1000, width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.5)', fontSize: 22, color: '#fff' }}>
        {open ? '✕' : '✦'}
      </button>
      {open && (
        <div style={{ position: 'fixed', bottom: 84, right: 22, zIndex: 1000, width: 360, height: 480, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
            <div style={{ fontWeight: 700 }}>✦ {L({ en: 'AI helper', hi: 'AI सहायक' })}</div>
            <div className="tiny" style={{ opacity: 0.85 }}>{customerId ? L({ en: 'About the open customer · IDs are hidden from AI', hi: 'खुले ग्राहक के बारे में · पहचान संख्या AI से छिपी' }) : L({ en: 'Open a customer to ask about them', hi: 'पूछने के लिए कोई ग्राहक खोलें' })}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div className="col">
                <div className="small muted">{L({ en: 'Answers can be wrong — always confirm rules on the official portal.', hi: 'उत्तर गलत हो सकते हैं — नियम हमेशा आधिकारिक पोर्टल पर पुष्टि करें।' })}</div>
                {customerId && STARTERS.map((s, i) => <button key={i} className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => send(L(s))}>{L(s)}</button>)}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap', fontSize: 13, background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>{m.text}</div>
            ))}
            {busy && <div className="small muted">…</div>}
            <div ref={bottom} />
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input className="field-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={L({ en: 'Ask a question…', hi: 'प्रश्न पूछें…' })} disabled={busy} />
            <button className="btn btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
