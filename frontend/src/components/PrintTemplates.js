/**
 * PrintTemplates.js — A4 slips printed for the customer (always bilingual:
 * Hindi first, English second, so any customer can read them).
 */

import React from 'react';

const both = (o) => (o ? (o.hi && o.hi !== o.en ? `${o.hi} / ${o.en}` : o.en) : '');
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function ShopHeader({ shop, title }) {
  const s = shop || {};
  return (
    <div className="p-shop">
      <div>
        <h1>{s.name || 'eMitra Kendra'}</h1>
        {s.address && <small>{s.address}</small>}
        <small>{[s.phone && `📞 ${s.phone}`, s.kiosk_code && `Kiosk: ${s.kiosk_code}`].filter(Boolean).join('   ')}</small>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <small>{today()}</small>
      </div>
    </div>
  );
}

function maskAadhaar(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 12 ? `XXXX XXXX ${d.slice(-4)}` : v;
}

/** What the customer still needs to bring / tell. */
export function ChecklistSlip({ service, customer, shop }) {
  const name = (customer && (customer.summary.name || customer.flat.name_hi)) || '';
  const docs = service.documents.filter((d) => d.required || d.status !== 'optional');
  return (
    <div className="print-page">
      <ShopHeader shop={shop} title="दस्तावेज़ सूची / Document checklist" />
      <table>
        <tbody>
          <tr><th style={{ width: '30%' }}>सेवा / Service</th><td>{both(service.name)}</td></tr>
          <tr><th>ग्राहक / Customer</th><td>{name} {customer ? `(#${customer.customer_no})` : ''}</td></tr>
        </tbody>
      </table>

      <h2>आवश्यक दस्तावेज़ / Documents needed</h2>
      <table>
        <thead><tr><th style={{ width: 30 }} /><th>दस्तावेज़ / Document</th><th>इनमें से कोई एक / Any one of</th><th style={{ width: 90 }}>स्थिति / Status</th></tr></thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td><span className="p-check" />{d.status === 'have' || d.status === 'confirmed' ? '✓' : ''}</td>
              <td>{both(d.label)}{!d.required ? ' (वैकल्पिक / optional)' : ''}</td>
              <td style={{ fontSize: 11 }}>{d.any_of_labels.map(both).join('; ')}</td>
              <td>{d.status === 'have' || d.status === 'confirmed' ? 'जमा / Received' : 'लाएँ / Bring'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {service.missing.fields.length > 0 && (
        <>
          <h2>बताएँ / Information needed</h2>
          <ul style={{ paddingLeft: 18 }}>{service.missing.fields.map((f) => <li key={f.key}>{both(f.label)}</li>)}</ul>
        </>
      )}
      {service.residence && service.residence.status !== 'sufficient' && (
        <p className="p-note">
          राजस्थान में {service.residence.min_years_required} वर्ष के निवास के लिए {service.residence.need_proof_from_year} या उससे पहले का कोई दस्तावेज़ लाएँ (पुराना बिजली बिल, अंकतालिका, राशन कार्ड, जमाबंदी)।<br />
          For {service.residence.min_years_required} years of residence, bring any document from {service.residence.need_proof_from_year} or earlier (old electricity bill, marksheet, ration card, Jamabandi).
        </p>
      )}
      <p className="p-note">यह सूची मार्गदर्शन हेतु है; अंतिम आवश्यकता संबंधित विभाग तय करता है। / This list is guidance; the department decides the final requirements.</p>
      {shop && shop.receipt_footer && <p className="p-note">{shop.receipt_footer}</p>}
    </div>
  );
}

/** Every value that will go into the form — customer checks and signs. */
export function ReviewSheet({ service, fields, customer, shop }) {
  return (
    <div className="print-page">
      <ShopHeader shop={shop} title="विवरण जाँच पत्र / Review sheet" />
      <table>
        <tbody>
          <tr><th style={{ width: '30%' }}>सेवा / Service</th><td>{both(service.name)}</td></tr>
          <tr><th>ग्राहक क्रमांक / Customer no.</th><td>#{customer.customer_no}</td></tr>
        </tbody>
      </table>
      <h2>फॉर्म में भरे जाने वाले विवरण / Details to be filled in the form</h2>
      <table>
        <thead><tr><th style={{ width: '38%' }}>विवरण / Field</th><th>मान / Value</th><th style={{ width: 60 }}>सही? ✓</th></tr></thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key}>
              <td>{both(f.label)}</td>
              <td style={{ fontWeight: 600 }}>{f.value === null || f.value === undefined || f.value === '' ? '—' : (f.key === 'id_number' ? maskAadhaar(f.value) : String(f.value))}</td>
              <td><span className="p-check" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-note">
        मैंने ऊपर दिए गए सभी विवरण पढ़ लिए हैं और वे सही हैं। गलत जानकारी पर आवेदन अस्वीकृत हो सकता है।<br />
        I have read all the details above and they are correct. Wrong information can lead to rejection.
      </p>
      <div className="p-sign">
        <div>ग्राहक के हस्ताक्षर / Customer signature</div>
        <div>ऑपरेटर / Operator</div>
      </div>
    </div>
  );
}

/** Receipt for the customer after an application is recorded. */
export function Receipt({ application, service, shop }) {
  const a = application;
  const total = (Number(a.govt_fee) || 0) + (Number(a.service_charge) || 0);
  return (
    <div className="print-page">
      <ShopHeader shop={shop} title="रसीद / Receipt" />
      <table>
        <tbody>
          <tr><th style={{ width: '35%' }}>रसीद सं. / Receipt no.</th><td>{a.ref_no}</td></tr>
          <tr><th>दिनांक / Date</th><td>{new Date(a.created_at).toLocaleString('en-IN')}</td></tr>
          <tr><th>ग्राहक / Customer</th><td>{a.customer_name || '—'} {a.customer_mobile ? `(${a.customer_mobile})` : ''}</td></tr>
          <tr><th>सेवा / Service</th><td>{both(service ? service.name : a.service_name)}</td></tr>
          <tr><th>आवेदन सं. / Application no.</th><td>{a.application_no || '—'}</td></tr>
          <tr><th>सरकारी शुल्क / Govt fee</th><td>{money(a.govt_fee)}</td></tr>
          <tr><th>सेवा शुल्क / Service charge</th><td>{money(a.service_charge)}</td></tr>
          <tr><th>कुल / Total</th><td style={{ fontWeight: 700 }}>{money(total)}</td></tr>
          <tr><th>प्राप्त / Received</th><td>{money(a.amount_paid)} {a.payment_mode ? `(${a.payment_mode})` : ''}</td></tr>
        </tbody>
      </table>
      <p className="p-note">आवेदन की स्थिति आधिकारिक पोर्टल पर आवेदन संख्या से देखी जा सकती है। / Check the status on the official portal with the application number.</p>
      {shop && shop.receipt_footer && <p className="p-note">{shop.receipt_footer}</p>}
      <div className="p-sign"><div /><div>ऑपरेटर / Operator</div></div>
    </div>
  );
}
