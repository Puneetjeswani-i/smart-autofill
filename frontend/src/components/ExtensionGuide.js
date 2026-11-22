import React from 'react';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';

export default function ExtensionGuide() {
  const { t, L } = useLang();
  const { extensionPaired } = useApp();

  const steps = [
    { en: 'Open Chrome (or Edge) and go to chrome://extensions (edge://extensions).', hi: 'Chrome (या Edge) खोलें और chrome://extensions (edge://extensions) पर जाएँ।' },
    { en: 'Turn on "Developer mode" (top-right switch).', hi: '"Developer mode" चालू करें (ऊपर दाईं ओर स्विच)।' },
    { en: 'Click "Load unpacked" and select the "extension" folder inside the Smart Autofill folder.', hi: '"Load unpacked" पर क्लिक करें और Smart Autofill फ़ोल्डर के अंदर "extension" फ़ोल्डर चुनें।' },
    { en: 'Pin the ⚡ Smart Autofill icon. Keep this dashboard open once — the extension connects by itself.', hi: '⚡ Smart Autofill आइकन पिन करें। यह डैशबोर्ड एक बार खुला रखें — एक्सटेंशन अपने आप जुड़ जाएगा।' },
  ];
  const usage = [
    { en: 'Open the customer here → Services → "Start application". This tells the extension which customer to fill.', hi: 'यहाँ ग्राहक खोलें → सेवाएँ → "आवेदन शुरू करें"। इससे एक्सटेंशन को पता चलता है कि किस ग्राहक का भरना है।' },
    { en: 'Open the form on the portal (SSO → eMitra → service). Click the ⚡ icon (or the small ⚡ button on the page).', hi: 'पोर्टल पर फॉर्म खोलें (SSO → eMitra → सेवा)। ⚡ आइकन (या पेज पर छोटा ⚡ बटन) दबाएँ।' },
    { en: 'A preview shows each value and the field it goes into. Correct anything, then press Fill.', hi: 'पूर्वावलोकन में हर मान और उसका फ़ील्ड दिखता है। कुछ गलत हो तो सुधारें, फिर Fill दबाएँ।' },
    { en: 'If a field is not recognised, use "Teach fields": click the field and choose what it is. The extension remembers it for that portal page.', hi: 'कोई फ़ील्ड न पहचाना जाए तो "Teach fields" उपयोग करें: फ़ील्ड पर क्लिक करें और बताएँ कि वह क्या है। एक्सटेंशन उस पोर्टल पेज के लिए याद रखता है।' },
    { en: 'Check every value on the portal yourself, then submit and pay there. The extension never clicks Submit or Pay.', hi: 'पोर्टल पर हर मान स्वयं जाँचें, फिर वहीं जमा और भुगतान करें। एक्सटेंशन कभी Submit या Pay नहीं दबाता।' },
  ];

  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚡ {t('extension')}</h1>
          <p className="page-sub">{L({ en: 'Fills the open customer\'s details into government portal forms — after you preview them.', hi: 'खुले ग्राहक का विवरण सरकारी पोर्टल फॉर्म में भरता है — आपके पूर्वावलोकन के बाद।' })}</p>
        </div>
        {extensionPaired
          ? <span className="pill good" style={{ fontSize: 13, padding: '6px 12px' }}>✓ {L({ en: 'Extension connected', hi: 'एक्सटेंशन जुड़ा है' })}</span>
          : <span className="pill warn" style={{ fontSize: 13, padding: '6px 12px' }}>! {L({ en: 'Extension not detected', hi: 'एक्सटेंशन नहीं मिला' })}</span>}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">1 · {L({ en: 'Install (one time)', hi: 'इंस्टॉल करें (एक बार)' })}</div>
          <ol style={{ paddingLeft: 18 }} className="small col">{steps.map((s, i) => <li key={i}>{L(s)}</li>)}</ol>
          {!extensionPaired && <div className="field-hint warn mt12">{L({ en: 'After installing, refresh this page (F5). The status at the top turns green when connected.', hi: 'इंस्टॉल के बाद यह पेज रीफ़्रेश करें (F5)। जुड़ने पर ऊपर की स्थिति हरी हो जाएगी।' })}</div>}
        </div>
        <div className="card">
          <div className="card-title">2 · {L({ en: 'Use on a portal', hi: 'पोर्टल पर उपयोग' })}</div>
          <ol style={{ paddingLeft: 18 }} className="small col">{usage.map((s, i) => <li key={i}>{L(s)}</li>)}</ol>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🔒 {L({ en: 'Safety', hi: 'सुरक्षा' })}</div>
        <ul style={{ paddingLeft: 18 }} className="small col">
          <li>{L({ en: 'The extension can read only the customer currently open in this dashboard — never the customer list.', hi: 'एक्सटेंशन केवल इस डैशबोर्ड में अभी खुले ग्राहक को पढ़ सकता है — ग्राहक सूची कभी नहीं।' })}</li>
          <li>{L({ en: 'It works on government sites (*.gov.in, *.nic.in) automatically; on other sites only when you click its icon.', hi: 'यह सरकारी साइटों (*.gov.in, *.nic.in) पर अपने आप चलता है; अन्य साइटों पर केवल आइकन दबाने पर।' })}</li>
          <li>{L({ en: 'Click "Done — next customer" after each customer so the next form is not filled with old data.', hi: 'हर ग्राहक के बाद "काम पूरा — अगला ग्राहक" दबाएँ ताकि अगले फॉर्म में पुराना डेटा न भरे।' })}</li>
        </ul>
      </div>
    </div>
  );
}
