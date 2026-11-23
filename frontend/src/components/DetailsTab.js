import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import { useApp } from '../AppContext';
import { Spinner, ConfidenceChip, DocTypeLabel } from './common';
import { fieldWarning } from '../validate';

function asText(v) {
  return v === null || v === undefined ? '' : String(v);
}

function FieldInput({ field, value, onChange, changed, warning, missing, inputRef }) {
  const { L } = useLang();
  const cls = `field-input ${changed ? 'changed' : ''} ${warning ? 'invalid' : ''} ${missing ? 'missing' : ''}`;
  if (field.type === 'select') {
    return (
      <select ref={inputRef} className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(field.options || []).map((o) => <option key={o} value={o}>{o === 'Yes' ? L({ en: 'Yes', hi: 'हाँ' }) : o === 'No' ? L({ en: 'No', hi: 'नहीं' }) : o}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return <textarea ref={inputRef} className={cls} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input ref={inputRef} className={cls} value={value} onChange={(e) => onChange(e.target.value)}
      inputMode={field.type === 'digits' || field.type === 'number' ? 'numeric' : undefined}
      placeholder={field.type === 'date' ? 'DD/MM/YYYY' : ''} />
  );
}

export default function DetailsTab({ customer, onCustomer, focusField, onFocused }) {
  const { t, L } = useLang();
  const { catalog, notify } = useApp();
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [showEmpty, setShowEmpty] = useState(true);
  const [notes, setNotes] = useState(customer.notes || '');
  const focusRef = useRef(null);

  const flat = customer.flat;
  const sources = customer.field_sources || {};
  const conflictsByKey = useMemo(() => Object.fromEntries((customer.conflicts || []).map((c) => [c.key, c])), [customer.conflicts]);
  const docTypes = (catalog && catalog.doc_types) || {};

  useEffect(() => { setDraft({}); setNotes(customer.notes || ''); }, [customer.id, customer.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focusField && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusRef.current.focus();
      setShowEmpty(true);
      if (onFocused) setTimeout(onFocused, 1500);
    }
  }, [focusField, onFocused]);

  if (!catalog) return <div className="row muted"><Spinner /> {t('loading')}</div>;

  const changedKeys = Object.keys(draft).filter((k) => asText(draft[k]) !== asText(flat[k]));
  const notesChanged = notes !== (customer.notes || '');

  async function save() {
    setSaving(true);
    try {
      const fields = {};
      for (const k of changedKeys) fields[k] = draft[k] === '' ? null : draft[k];
      const body = { fields };
      if (notesChanged) body.notes = notes;
      const r = await api(`/api/customers/${customer.id}`, { method: 'PATCH', body });
      onCustomer(r.customer);
      setDraft({});
      notify(t('saved'));
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function choose(key, docId) {
    try {
      const r = await api(`/api/customers/${customer.id}/choose`, { method: 'POST', body: { key, doc_id: docId } });
      onCustomer(r.customer);
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch (err) { notify(err.message, 'error'); }
  }

  async function resetField(key) {
    try {
      const r = await api(`/api/customers/${customer.id}`, { method: 'PATCH', body: { reset_fields: [key] } });
      onCustomer(r.customer);
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch (err) { notify(err.message, 'error'); }
  }

  async function setConsent(v) {
    try {
      const r = await api(`/api/customers/${customer.id}`, { method: 'PATCH', body: { consent_store: v } });
      onCustomer(r.customer);
    } catch (err) { notify(err.message, 'error'); }
  }

  const openConflicts = (customer.conflicts || []).filter((c) => !c.resolved);

  return (
    <div>
      {openConflicts.length > 0 && (
        <div className="card warn">
          <div style={{ fontWeight: 700 }}>⚠ {openConflicts.length} {L({ en: 'field(s) differ between documents — choose the correct value below (look for the yellow boxes).', hi: 'फ़ील्ड दस्तावेज़ों में अलग हैं — नीचे सही मान चुनें (पीले बॉक्स देखें)।' })}</div>
        </div>
      )}

      <div className="row-between mb12">
        <label className="check-row"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />{t('showEmpty')}</label>
        <label className="check-row">
          <input type="checkbox" checked={!!customer.consent_store} onChange={(e) => setConsent(e.target.checked)} />
          {t('consentLabel')}
        </label>
      </div>

      {catalog.field_groups.map((group) => {
        const fields = catalog.fields.filter((f) => f.group === group.id)
          .filter((f) => showEmpty || asText(flat[f.key]) !== '' || f.key in draft || conflictsByKey[f.key]);
        if (!fields.length) return null;
        return (
          <div className="card" key={group.id}>
            <div className="card-title">{L(group.label)}</div>
            <div className="grid2">
              {fields.map((f) => {
                const value = f.key in draft ? asText(draft[f.key]) : asText(flat[f.key]);
                const src = sources[f.key];
                const changed = f.key in draft && asText(draft[f.key]) !== asText(flat[f.key]);
                const warn = fieldWarning(f.key, value);
                const conflict = conflictsByKey[f.key];
                const isFocus = focusField === f.key;
                return (
                  <div key={f.key} className="field-group" style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                    <label className="field-label">
                      {L(f.label)}
                      {src && <ConfidenceChip source={src} />}
                      {src && src.method !== 'manual' && <span className="tiny muted">· <DocTypeLabel type={src.doc_type} docTypes={docTypes} /></span>}
                      {src && src.method === 'ai' && src.grounded === false && <span className="tiny" style={{ color: '#fca5a5' }}>· {t('aiNotInText')}</span>}
                    </label>
                    <FieldInput field={f} value={value} changed={changed} warning={!!warn} missing={isFocus && !value}
                      inputRef={isFocus ? focusRef : undefined}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                    {warn && <div className="field-hint error">{t(warn)}</div>}
                    {src && src.method === 'manual' && src.chosen_from === null && (customer.documents || []).length > 0 && conflict && (
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => resetField(f.key)}>↺ {t('undoEdit')}</button>
                    )}
                    {conflict && (
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: conflict.resolved ? 'var(--surface2)' : 'var(--yellow-soft)', border: `1px solid ${conflict.resolved ? 'var(--border)' : 'var(--yellow-border)'}` }}>
                        <div className="tiny" style={{ fontWeight: 700, color: conflict.resolved ? 'var(--text-muted)' : 'var(--yellow)' }}>{conflict.resolved ? '✓ ' : '⚠ '}{t('conflict')}</div>
                        {conflict.options.map((o, i) => (
                          <div key={i} className="row small mt8" style={{ gap: 8 }}>
                            <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(o.value)}</span>
                            <span className="tiny muted">{o.doc_types.map((d) => L(docTypes[d] || (d === 'manual' ? { en: t('typedByYou'), hi: t('typedByYou') } : { en: d }))).join(', ')}</span>
                            {o.doc_id && asText(o.value) !== asText(flat[f.key]) && <button className="btn btn-secondary btn-sm" onClick={() => choose(f.key, o.doc_id)}>{t('useThis')}</button>}
                            {asText(o.value) === asText(flat[f.key]) && <span className="chip good">✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="card">
        <div className="card-title">📝 {t('notes')}</div>
        <textarea className="field-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={L({ en: 'e.g. Will bring old electricity bill tomorrow', hi: 'जैसे: कल पुराना बिजली बिल लाएँगे' })} />
      </div>

      {(changedKeys.length > 0 || notesChanged) && (
        <div className="sticky-bar">
          <span className="small" style={{ color: 'var(--accent-light)' }}>● {t('unsaved')} ({changedKeys.length + (notesChanged ? 1 : 0)})</span>
          <span className="spacer" />
          <button className="btn btn-secondary" onClick={() => { setDraft({}); setNotes(customer.notes || ''); }} disabled={saving}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : '💾'} {t('saveChanges')}</button>
        </div>
      )}
    </div>
  );
}
