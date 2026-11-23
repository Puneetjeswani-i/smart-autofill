import React, { useRef, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, Confirm, Empty, ConfidenceChip, formatDateTime } from './common';

const OK_EXT = ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'bmp', 'tif', 'tiff'];

const ERRORS = {
  unsupported_file: { en: 'This file type is not supported. Use JPG, PNG or PDF.', hi: 'यह फाइल प्रकार समर्थित नहीं है। JPG, PNG या PDF उपयोग करें।' },
  pdf_password_required: { en: 'This PDF is password protected. Enter the password and try again. (e-Aadhaar: first 4 letters of name in CAPITALS + birth year, e.g. SUNI1994)', hi: 'यह PDF पासवर्ड से सुरक्षित है। पासवर्ड डालकर फिर कोशिश करें। (ई-आधार: नाम के पहले 4 अक्षर कैपिटल में + जन्म वर्ष, जैसे SUNI1994)' },
  pdf_password_incorrect: { en: 'Wrong PDF password.', hi: 'PDF पासवर्ड गलत है।' },
  no_text_found: { en: 'No text could be read. Retake the photo: flat, well lit, no shadow, whole document in frame.', hi: 'कोई पाठ नहीं पढ़ा जा सका। फिर से फोटो लें: समतल, अच्छी रोशनी, बिना छाया, पूरा दस्तावेज़ फ्रेम में।' },
  pdf_no_readable_text: { en: 'This PDF has no readable text or scanned images. Try scanning it again as JPG.', hi: 'इस PDF में पढ़ने योग्य पाठ या स्कैन फोटो नहीं है। इसे JPG के रूप में फिर स्कैन करें।' },
  ocr_failed: { en: 'Reading failed. Try again; if it repeats, restart the app.', hi: 'पढ़ना विफल रहा। फिर कोशिश करें; बार-बार हो तो ऐप फिर से शुरू करें।' },
  processing_failed: { en: 'Something went wrong while reading this file.', hi: 'फाइल पढ़ते समय कुछ गलत हुआ।' },
};

const WARNINGS = {
  aadhaar_checksum_failed: { en: 'Aadhaar number did not pass the checksum — check the digits.', hi: 'आधार नंबर जाँच अंक में सही नहीं — अंक जाँचें।' },
  vid_present: { en: 'A 16-digit VID is printed — it is not the Aadhaar number.', hi: '16 अंकों का VID छपा है — यह आधार नंबर नहीं है।' },
  ai_failed: { en: 'Cloud AI was not reachable; values were read locally.', hi: 'क्लाउड AI उपलब्ध नहीं था; मान स्थानीय रूप से पढ़े गए।' },
  ai_values_not_in_text: { en: 'Some AI values were not found in the scanned text — check the ones marked ✦ red.', hi: 'कुछ AI मान स्कैन पाठ में नहीं मिले — लाल ✦ वाले जाँचें।' },
  marksheet_class_unknown: { en: 'Could not tell if this is a class 10 or 12 marksheet — fill education details manually.', hi: 'यह 10वीं या 12वीं की अंकतालिका है, पता नहीं चला — शिक्षा विवरण स्वयं भरें।' },
  pdf_pages_truncated: { en: 'Only the first 5 pages were read.', hi: 'केवल पहले 5 पेज पढ़े गए।' },
  pdf_image_format_unsupported: { en: 'This scanned PDF uses an image format that cannot be read. Scan as JPG.', hi: 'इस स्कैन PDF का फोटो प्रारूप पढ़ा नहीं जा सकता। JPG में स्कैन करें।' },
  pdf_no_text: { en: 'PDF has no text layer.', hi: 'PDF में पाठ परत नहीं है।' },
  pdf_text_failed: { en: 'PDF text could not be read directly; scanned images were used.', hi: 'PDF पाठ सीधे नहीं पढ़ा गया; स्कैन फोटो उपयोग किए गए।' },
  relation_name_ambiguous: { en: 'Licence shows "S/O, D/O, W/O" — confirm whether this is father or husband.', hi: 'लाइसेंस पर "S/O, D/O, W/O" है — पुष्टि करें कि पिता हैं या पति।' },
};

function fileExt(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function DocTypeSelect({ value, onChange, docTypes, includeAuto, disabled }) {
  const { L, t } = useLang();
  return (
    <select className="field-input" style={{ padding: '6px 8px', fontSize: 13 }} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {includeAuto && <option value="auto">🔎 {t('autoDetect')}</option>}
      {Object.entries(docTypes || {}).map(([k, lbl]) => <option key={k} value={k}>{L(lbl)}</option>)}
    </select>
  );
}

function fieldLabel(catalog, key, L) {
  const f = catalog && catalog.fields.find((x) => x.key === key);
  if (f) return L(f.label);
  return key.replace(/^_marks_/, '').replace(/_/g, ' ');
}

function DocumentCard({ doc, docTypes, catalog, onTypeChange, onRemove, busy }) {
  const { t, L, lang } = useLang();
  const [open, setOpen] = useState(false);
  const fields = Object.entries(doc.fields || {}).filter(([k, v]) => !k.startsWith('_') && v !== null && v !== '');
  const ev = doc.evidence || {};
  const ocrPct = doc.ocr && typeof doc.ocr.confidence === 'number' ? doc.ocr.confidence : null;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row-between">
        <div className="row" style={{ minWidth: 0 }}>
          <span style={{ fontSize: 22 }}>{doc.kind === 'pdf' ? '📑' : '🖼️'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{L(docTypes[doc.doc_type] || { en: doc.doc_type })}</div>
            <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{doc.file_label} · {formatDateTime(doc.uploaded_at, lang)}</div>
          </div>
        </div>
        <div className="row">
          {ocrPct !== null && <span className={`chip ${ocrPct >= 75 ? 'good' : ocrPct >= 55 ? 'warn' : 'bad'}`} title="OCR">{doc.ocr.method === 'pdf-text' ? 'PDF text' : `OCR ${ocrPct}%`}</span>}
          {doc.ai && doc.ai.used && <span className="chip">✦ AI</span>}
          {ev.year && <span className="chip">{t('docDate')}: {ev.date || ev.year}</span>}
          {ev.is_rajasthan === true && <span className="chip good">📍 {t('rajasthanAddress')}</span>}
          {ev.is_rajasthan === false && <span className="chip warn">📍 {L({ en: 'Outside Rajasthan', hi: 'राजस्थान के बाहर' })}</span>}
        </div>
      </div>

      <div className="row mt12">
        <div style={{ width: 240 }}>
          <DocTypeSelect value={doc.doc_type} docTypes={docTypes} onChange={(v) => onTypeChange(doc.id, v)} disabled={busy} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>{open ? '▲' : '▼'} {t('fieldsRead')} ({fields.length})</button>
        <span className="spacer" />
        <button className="btn btn-danger btn-sm" onClick={() => onRemove(doc.id)} disabled={busy}>🗑 {t('removeDoc')}</button>
      </div>

      {(doc.warnings || []).filter((w) => WARNINGS[w]).map((w) => (
        <div key={w} className="field-hint warn mt8">⚠ {L(WARNINGS[w])}</div>
      ))}

      {open && (
        <div className="mt12 table-wrap">
          <table className="table">
            <tbody>
              {fields.map(([k, v]) => {
                const meta = (doc.field_meta || {})[k] || {};
                return (
                  <tr key={k}>
                    <td className="muted" style={{ width: '40%' }}>{fieldLabel(catalog, k, L)}</td>
                    <td style={{ fontWeight: 600 }}>{String(v)}</td>
                    <td style={{ width: 90 }}><ConfidenceChip source={meta} /></td>
                  </tr>
                );
              })}
              {!fields.length && <tr><td className="muted">{L({ en: 'No values could be read from this document.', hi: 'इस दस्तावेज़ से कोई मान नहीं पढ़ा जा सका।' })}</td></tr>}
            </tbody>
          </table>
          {(doc.ungrounded_fields || []).length > 0 && <div className="field-hint warn mt8">✦ {t('aiNotInText')}: {doc.ungrounded_fields.map((k) => fieldLabel(catalog, k, L)).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

export default function DocumentsTab({ customer, onCustomer, onGoDetails }) {
  const { t, L } = useLang();
  const { catalog, notify, settings } = useApp();
  const docTypes = (catalog && catalog.doc_types) || {};
  const inputRef = useRef(null);
  const [queue, setQueue] = useState([]); // { id, file, type, password }
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(null); // { index, total, name }
  const [results, setResults] = useState([]);
  const [showText, setShowText] = useState(null);
  const [removeId, setRemoveId] = useState(null);
  const [busy, setBusy] = useState(false);

  function addFiles(list) {
    const files = Array.from(list || []).filter((f) => OK_EXT.includes(fileExt(f.name)));
    const skipped = Array.from(list || []).length - files.length;
    if (skipped) notify(L({ en: `${skipped} file(s) skipped — only JPG, PNG, PDF`, hi: `${skipped} फाइल छोड़ी गई — केवल JPG, PNG, PDF` }), 'error');
    setQueue((q) => [...q, ...files.map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, type: 'auto', password: '' }))].slice(0, 20));
  }

  async function readAll() {
    const items = queue.slice();
    if (!items.length) return;
    const out = [];
    let latest = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setRunning({ index: i + 1, total: items.length, name: item.file.name });
      const form = new FormData();
      form.append('documents', item.file, item.file.name);
      form.append('doc_types', JSON.stringify([item.type]));
      if (item.password) form.append('passwords', JSON.stringify([item.password]));
      try {
        const r = await api(`/api/customers/${customer.id}/documents`, { method: 'POST', form });
        latest = r.customer;
        const res = r.results[0];
        out.push({ ...res, queueItem: item });
        if (res.ok) setQueue((q) => q.filter((x) => x.id !== item.id));
      } catch (err) {
        out.push({ ok: false, error: 'processing_failed', message: err.message, file_label: item.file.name, queueItem: item });
      }
      setResults([...out]);
    }
    setRunning(null);
    if (latest) onCustomer(latest);
    const okCount = out.filter((r) => r.ok).length;
    notify(L({ en: `${okCount} of ${out.length} document(s) read`, hi: `${out.length} में से ${okCount} दस्तावेज़ पढ़े गए` }), okCount === out.length ? 'success' : 'error');
  }

  async function changeType(docId, type) {
    setBusy(true);
    try {
      const r = await api(`/api/customers/${customer.id}/documents/${docId}`, { method: 'PATCH', body: { doc_type: type } });
      onCustomer(r.customer);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  async function removeDoc() {
    const id = removeId;
    setRemoveId(null);
    setBusy(true);
    try {
      const r = await api(`/api/customers/${customer.id}/documents/${id}`, { method: 'DELETE' });
      onCustomer(r.customer);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  const ai = settings && settings.settings.ai;
  const failed = results.filter((r) => !r.ok);
  const docs = (customer.documents || []).slice().reverse();

  return (
    <div>
      <div className="card">
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current && inputRef.current.click()}
        >
          <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.webp,.bmp,.tif,.tiff" style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <div className="dz-icon">📤</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t('dropTitle')}</div>
          <div className="small muted mt8">{t('dropSub')}</div>
          <div className="tiny muted mt8">
            {ai && ai.effective
              ? L({ en: '✦ Cloud AI on — Aadhaar numbers are hidden before sending', hi: '✦ क्लाउड AI चालू — भेजने से पहले आधार नंबर छिपाए जाते हैं' })
              : L({ en: '● Reading on this computer only (cloud AI off)', hi: '● केवल इसी कंप्यूटर पर पढ़ा जा रहा है (क्लाउड AI बंद)' })}
          </div>
        </div>

        {queue.length > 0 && (
          <div className="mt12">
            {queue.map((q) => (
              <div key={q.id} className="list-item">
                <span>{fileExt(q.file.name) === 'pdf' ? '📑' : '🖼️'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.file.name}</div>
                  <div className="tiny muted">{Math.round(q.file.size / 1024)} KB</div>
                </div>
                <div style={{ width: 210 }}>
                  <DocTypeSelect includeAuto value={q.type} docTypes={docTypes} disabled={!!running}
                    onChange={(v) => setQueue((list) => list.map((x) => (x.id === q.id ? { ...x, type: v } : x)))} />
                </div>
                {fileExt(q.file.name) === 'pdf' && (
                  <input className="field-input" style={{ width: 170, padding: '6px 8px', fontSize: 13 }} type="password" placeholder={t('pdfPassword')}
                    value={q.password} disabled={!!running} onChange={(e) => setQueue((list) => list.map((x) => (x.id === q.id ? { ...x, password: e.target.value } : x)))} />
                )}
                <button className="btn btn-ghost btn-sm" disabled={!!running} onClick={() => setQueue((list) => list.filter((x) => x.id !== q.id))}>✕</button>
              </div>
            ))}
            <div className="row mt12">
              <button className="btn btn-primary btn-lg" onClick={readAll} disabled={!!running}>
                {running ? <><Spinner /> {t('reading')} {running.index} {t('of')} {running.total}…</> : <>⚡ {t('readDocuments')} ({queue.length})</>}
              </button>
              {running && <span className="small muted">{t('readingSlow')}</span>}
            </div>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <div className="card danger">
          {failed.map((r, i) => (
            <div key={i} className="mb8">
              <div style={{ fontWeight: 600 }}>❌ {r.file_label}</div>
              <div className="small dim">{L(ERRORS[r.error] || { en: r.message || r.error })}</div>
              {r.quality && (r.quality.issues || []).length > 0 && <div className="tiny muted">{r.quality.issues.join(' · ')}</div>}
            </div>
          ))}
          {queue.length > 0 && <div className="tiny muted">{L({ en: 'Failed files stay in the list above — fix (type / password) and press Read again.', hi: 'विफल फाइलें ऊपर सूची में रहती हैं — सुधारें (प्रकार / पासवर्ड) और फिर से पढ़ें दबाएँ।' })}</div>}
        </div>
      )}

      {results.some((r) => r.ok) && (
        <div className="card ok">
          <div className="row-between">
            <div style={{ fontWeight: 700 }}>✅ {L({ en: 'Read just now', hi: 'अभी पढ़े गए' })}: {results.filter((r) => r.ok).map((r) => L(docTypes[r.doc_type] || { en: r.doc_type })).join(', ')}</div>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowText(showText ? null : results.filter((r) => r.ok))}>{showText ? t('hideText') : t('showText')}</button>
              <button className="btn btn-primary btn-sm" onClick={onGoDetails}>✏️ {L({ en: 'Check details', hi: 'विवरण जाँचें' })} →</button>
            </div>
          </div>
          {showText && showText.map((r) => (
            <pre key={r.id} className="mono tiny dim mt12" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'var(--surface2)', padding: 10, borderRadius: 8 }}>{r.text_preview}</pre>
          ))}
        </div>
      )}

      <div className="card-title mt16">{t('uploadedDocs')} ({docs.length})</div>
      {docs.length === 0 ? <div className="card"><Empty icon="📄">{t('noDocs')}</Empty></div> : docs.map((d) => (
        <DocumentCard key={d.id} doc={d} docTypes={docTypes} catalog={catalog} busy={busy} onTypeChange={changeType} onRemove={setRemoveId} />
      ))}

      {removeId && <Confirm title={t('removeDoc')} danger message={t('removeDocConfirm')} confirmLabel={t('removeDoc')} onCancel={() => setRemoveId(null)} onConfirm={removeDoc} />}
    </div>
  );
}
