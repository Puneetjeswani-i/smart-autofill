import React, { useRef, useState } from 'react';
import { downloadFile } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner } from './common';

const SIZE_PRESETS = [50, 100, 200, 300, 500, 1000];
const PHOTO_PRESETS = [
  { id: 'photo', label: { en: 'Passport photo (3.5 × 4.5)', hi: 'पासपोर्ट फोटो (3.5 × 4.5)' }, width: 350, height: 450, max_kb: 50 },
  { id: 'photo_small', label: { en: 'Small photo (200 × 230)', hi: 'छोटी फोटो (200 × 230)' }, width: 200, height: 230, max_kb: 20 },
  { id: 'signature', label: { en: 'Signature (wide)', hi: 'हस्ताक्षर (चौड़ा)' }, width: 300, height: 120, max_kb: 20 },
];

function FilePick({ multiple, accept, files, onFiles }) {
  const { t, L } = useLang();
  const ref = useRef(null);
  return (
    <div className="dropzone" style={{ padding: 18 }} onClick={() => ref.current && ref.current.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(Array.from(e.dataTransfer.files)); }}>
      <input ref={ref} type="file" multiple={multiple} accept={accept} style={{ display: 'none' }} onChange={(e) => { onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
      <div style={{ fontWeight: 600 }}>📂 {t('chooseFiles')}</div>
      {files.length > 0 ? (
        <div className="small dim mt8">{files.map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join(' · ')}</div>
      ) : <div className="tiny muted mt8">{L({ en: 'or drop here', hi: 'या यहाँ छोड़ें' })}</div>}
    </div>
  );
}

export default function ToolsPanel() {
  const { t, L } = useLang();
  const { notify } = useApp();
  const [files, setFiles] = useState([]);
  const [output, setOutput] = useState('pdf');
  const [maxKb, setMaxKb] = useState(200);
  const [gray, setGray] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const [photo, setPhoto] = useState([]);
  const [preset, setPreset] = useState(PHOTO_PRESETS[0]);
  const [dims, setDims] = useState({ width: 350, height: 450, max_kb: 50 });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoResult, setPhotoResult] = useState(null);

  async function compress() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    form.append('max_kb', String(maxKb));
    form.append('output', output);
    form.append('grayscale', String(gray));
    try {
      const r = await downloadFile('/api/tools/compress', output === 'jpg' ? 'document.jpg' : 'document.pdf', { method: 'POST', form });
      setResult(r);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  async function resize() {
    if (!photo.length) return;
    setPhotoBusy(true);
    setPhotoResult(null);
    const form = new FormData();
    form.append('file', photo[0], photo[0].name);
    form.append('width', String(dims.width));
    form.append('height', String(dims.height));
    form.append('max_kb', String(dims.max_kb));
    try {
      const r = await downloadFile('/api/tools/resize', 'photo.jpg', { method: 'POST', form });
      setPhotoResult(r);
    } catch (err) { notify(err.message, 'error'); } finally { setPhotoBusy(false); }
  }

  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">🧰 {t('tools')}</h1>
          <p className="page-sub">{t('localOnly')}</p>
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">🗜 {t('compressTitle')}</div>
          <FilePick multiple accept=".jpg,.jpeg,.png,.pdf,.webp,.bmp,.tif,.tiff" files={files} onFiles={(f) => { setFiles(f); setResult(null); }} />
          <div className="grid2 mt12">
            <div className="field-group">
              <label className="field-label">{t('outputFormat')}</label>
              <select className="field-input" value={output} onChange={(e) => setOutput(e.target.value)}>
                <option value="pdf">{t('onePdf')}</option>
                <option value="jpg">{t('jpgImage')}</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">{t('maxSize')}</label>
              <input className="field-input" type="number" min={10} max={10000} value={maxKb} onChange={(e) => setMaxKb(e.target.value)} />
            </div>
          </div>
          <div className="row mt8" style={{ gap: 6 }}>
            {SIZE_PRESETS.map((n) => <button key={n} className={`btn btn-sm ${Number(maxKb) === n ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMaxKb(n)}>{n} KB</button>)}
          </div>
          <label className="check-row mt12"><input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} />{t('grayscale')}</label>
          <button className="btn btn-primary mt12" onClick={compress} disabled={busy || !files.length}>{busy ? <Spinner /> : '⬇'} {t('makeFile')}</button>
          {result && (
            <div className={`mt12 small ${result.overLimit ? '' : ''}`}>
              {result.overLimit
                ? <span style={{ color: '#fcd34d' }}>⚠ {L({ en: `Could only reach ${Math.round(result.size / 1024)} KB — try black & white, fewer pages, or a higher limit.`, hi: `केवल ${Math.round(result.size / 1024)} KB तक छोटा हुआ — ब्लैक एंड व्हाइट, कम पेज या अधिक सीमा आज़माएँ।` })}</span>
                : <span style={{ color: 'var(--green)' }}>✓ {result.name} — {Math.round(result.size / 1024)} KB{result.pages ? ` · ${result.pages} ${L({ en: 'page(s)', hi: 'पेज' })}` : ''}</span>}
            </div>
          )}
          <div className="tiny muted mt12">{L({ en: 'Tip: for front + back of a card, choose both photos and "One PDF".', hi: 'सुझाव: कार्ड के आगे + पीछे के लिए दोनों फोटो चुनें और "एक PDF" चुनें।' })}</div>
        </div>

        <div className="card">
          <div className="card-title">🖼 {t('photoTitle')}</div>
          <FilePick accept=".jpg,.jpeg,.png,.webp" files={photo} onFiles={(f) => { setPhoto(f.slice(0, 1)); setPhotoResult(null); }} />
          <div className="row mt12" style={{ gap: 6 }}>
            {PHOTO_PRESETS.map((p) => (
              <button key={p.id} className={`btn btn-sm ${preset.id === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setPreset(p); setDims({ width: p.width, height: p.height, max_kb: p.max_kb }); }}>{L(p.label)}</button>
            ))}
          </div>
          <div className="grid3 mt12">
            <div className="field-group"><label className="field-label">{t('width')}</label><input className="field-input" type="number" value={dims.width} onChange={(e) => setDims({ ...dims, width: e.target.value })} /></div>
            <div className="field-group"><label className="field-label">{t('height')}</label><input className="field-input" type="number" value={dims.height} onChange={(e) => setDims({ ...dims, height: e.target.value })} /></div>
            <div className="field-group"><label className="field-label">{t('maxSize')}</label><input className="field-input" type="number" value={dims.max_kb} onChange={(e) => setDims({ ...dims, max_kb: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary mt12" onClick={resize} disabled={photoBusy || !photo.length}>{photoBusy ? <Spinner /> : '⬇'} {t('makeFile')}</button>
          {photoResult && <div className="mt12 small" style={{ color: photoResult.overLimit ? '#fcd34d' : 'var(--green)' }}>{photoResult.overLimit ? '⚠' : '✓'} {photoResult.name} — {Math.round(photoResult.size / 1024)} KB</div>}
          <div className="tiny muted mt12">{L({ en: 'Each portal has its own photo size rule — check the portal\'s instructions and adjust width, height and KB.', hi: 'हर पोर्टल का फोटो आकार नियम अलग होता है — पोर्टल के निर्देश देखकर चौड़ाई, ऊँचाई और KB बदलें।' })}</div>
        </div>
      </div>
    </div>
  );
}
