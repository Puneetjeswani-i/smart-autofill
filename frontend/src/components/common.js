/**
 * components/common.js — small shared UI pieces.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Modal({ title, icon, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
          <div className="modal-title">{title}</div>
          {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel, danger, onConfirm, onCancel, children }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} icon={danger ? '⚠️' : '❓'} onClose={onCancel}
      footer={<>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>{t('cancel')}</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {busy ? <Spinner /> : null}{confirmLabel || t('yes')}
        </button>
      </>}>
      <p className="dim">{message}</p>
      {children}
    </Modal>
  );
}

export function Empty({ icon = '📂', title, children }) {
  return (
    <div className="empty">
      <div className="e-icon">{icon}</div>
      {title && <div className="e-title">{title}</div>}
      <div className="small">{children}</div>
    </div>
  );
}

export function CopyButton({ value, small = true }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  const copy = async () => {
    const text = value === null || value === undefined ? '' : String(value);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return (
    <button type="button" className={`btn btn-secondary ${small ? 'btn-sm' : ''}`} onClick={copy} disabled={value === null || value === undefined || value === ''}>
      {done ? `✓ ${t('copied')}` : `⧉ ${t('copy')}`}
    </button>
  );
}

const STATUS_CLASS = { ready: 'good', needs_info: 'warn', not_eligible: 'bad' };
export function ServiceStatusPill({ status }) {
  const { t } = useLang();
  const label = status === 'ready' ? t('ready') : status === 'not_eligible' ? t('notEligible') : t('needsInfo');
  const icon = status === 'ready' ? '✓' : status === 'not_eligible' ? '✕' : '!';
  return <span className={`pill ${STATUS_CLASS[status] || 'neutral'}`}>{icon} {label}</span>;
}

export function ConfidenceChip({ source }) {
  const { L } = useLang();
  if (!source) return null;
  if (source.method === 'manual') return <span className="chip manual">✎ {L({ en: 'typed', hi: 'लिखा गया' })}</span>;
  const pct = Math.round((source.confidence || 0) * 100);
  const cls = source.method === 'ai' && source.grounded === false ? 'bad' : pct >= 80 ? 'good' : pct >= 55 ? 'warn' : 'bad';
  return (
    <span className={`chip ${cls}`} title={source.method === 'ai' ? 'AI' : 'Local reading'}>
      {source.method === 'ai' ? '✦' : '●'} {pct}%
    </span>
  );
}

export function DocTypeLabel({ type, docTypes }) {
  const { L } = useLang();
  if (!type) return null;
  if (type === 'manual') return <>{L({ en: 'Operator', hi: 'ऑपरेटर' })}</>;
  return <>{L((docTypes && docTypes[type]) || { en: type, hi: type })}</>;
}

/** Render children into #print-root and open the print dialog. */
export function PrintPortal({ children, onDone }) {
  const target = document.getElementById('print-root');
  useEffect(() => {
    const after = () => { if (onDone) onDone(); };
    window.addEventListener('afterprint', after);
    const timer = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, [onDone]);
  if (!target) return null;
  return createPortal(children, target);
}

export function formatINR(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatDateTime(iso, lang = 'en') {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export function formatDate(iso, lang = 'en') {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export function maskTail(value, keep = 4) {
  const s = String(value || '').replace(/\s/g, '');
  if (s.length <= keep) return s;
  return '•'.repeat(Math.min(8, s.length - keep)) + s.slice(-keep);
}
