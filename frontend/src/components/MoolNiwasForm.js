import React, { useState, useEffect } from 'react';
import './MoolNiwasForm.css';

const EMPTY_FORM = {
  // Section I - Personal
  applicant_name: '',
  father_husband_name: '',
  current_address: '',
  father_native_place: '',
  father_occupation: '',
  father_occupation_address: '',
  birth_place: '',
  dob: '',
  // Education
  education_1_9_school: '',
  education_1_9_place: '',
  education_10th_school: '',
  education_10th_place: '',
  education_12th_school: '',
  education_12th_place: '',
  education_grad_school: '',
  education_grad_place: '',
  education_postgrad_school: '',
  education_postgrad_place: '',
  education_other: '',
  // More fields
  immovable_property: '',
  in_voter_list: '',
  voter_id_number: '',
  driving_license: '',
  years_in_rajasthan: '',
  mobile_number: '',
  // Section II - Women
  is_married: '',
  marriage_date_partner: '',
  husband_domicile: '',
  living_with_husband_since: '',
  // Affidavit
  applicant_native_of: '',
  oath_education: '',
};

// Map profile keys → form fields
const PROFILE_TO_FORM = {
  name: 'applicant_name',
  father_name: 'father_husband_name',
  husband_name: 'father_husband_name',
  address: 'current_address',
  native_place: 'father_native_place',
  father_occupation: 'father_occupation',
  father_occupation_address: 'father_occupation_address',
  birth_place: 'birth_place',
  dob: 'dob',
  education_10th_school: 'education_10th_school',
  education_10th_place: 'education_10th_place',
  education_12th_school: 'education_12th_school',
  education_12th_place: 'education_12th_place',
  education_grad_school: 'education_grad_school',
  education_grad_place: 'education_grad_place',
  phone: 'mobile_number',
  years_in_rajasthan: 'years_in_rajasthan',
  is_married: 'is_married',
  marriage_date: 'marriage_date_partner',
  district: 'birth_place',
  in_voter_list: 'in_voter_list',
  voter_id: 'voter_id_number',
  driving_license: 'driving_license',
};

export default function MoolNiwasForm({ profile, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [filledFields, setFilledFields] = useState(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [gender, setGender] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    if (profile) {
      autoFillFromProfile(profile);
      setGender(profile.gender || '');
    }
  }, [profile]);

  function autoFillFromProfile(p) {
    const newForm = { ...EMPTY_FORM };
    const filled = new Set();

    Object.entries(PROFILE_TO_FORM).forEach(([profileKey, formKey]) => {
      const val = p[profileKey];
      if (val && !newForm[formKey]) {
        newForm[formKey] = String(val);
        filled.add(formKey);
      }
    });

    // Special: applicant_native_of = birth_place or district
    if (p.birth_place) { newForm.applicant_native_of = p.birth_place; filled.add('applicant_native_of'); }
    if (p.highest_education) { newForm.oath_education = p.highest_education; filled.add('oath_education'); }

    // If husband_name exists AND person is married, use for father_husband_name
    if (p.husband_name && (p.is_married === 'Yes' || p.is_married === 'हाँ / Yes' || p.gender === 'Female')) {
      newForm.father_husband_name = p.husband_name;
      filled.add('father_husband_name');
    }

    setForm(newForm);
    setFilledFields(filled);
    if (filled.size > 0) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    }
  }

  function set(key, val) {
    setForm(p => ({ ...p, [key]: val }));
  }

  async function downloadPDF() {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/generate-pdf/mool-niwas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || 'PDF generation failed');
      }
      // Stream PDF blob → trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const name = (form.applicant_name || 'applicant').replace(/\s+/g, '_').toLowerCase();
      a.download = `mool_niwas_${name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  const totalFields = Object.keys(EMPTY_FORM).length;
  const filledCount = Object.values(form).filter(v => v.trim()).length;
  const pct = Math.round((filledCount / totalFields) * 100);

  function isAutofilled(key) { return filledFields.has(key) && form[key]; }

  function Field({ label, fkey, type = 'text', placeholder = '', half = false, full = false }) {
    return (
      <div className={`mn-field ${half ? 'half' : ''} ${full ? 'full' : ''}`}>
        <label className="mn-label">{label}</label>
        <div className="mn-input-wrap">
          <input
            type={type}
            className={`mn-input ${isAutofilled(fkey) ? 'autofilled' : ''}`}
            value={form[fkey]}
            onChange={e => set(fkey, e.target.value)}
            placeholder={placeholder}
          />
          {isAutofilled(fkey) && <span className="autofill-badge" title="Auto-filled from your documents">⚡</span>}
        </div>
      </div>
    );
  }

  function TextareaField({ label, fkey, rows = 2 }) {
    return (
      <div className="mn-field full">
        <label className="mn-label">{label}</label>
        <div className="mn-input-wrap">
          <textarea
            className={`mn-input ${isAutofilled(fkey) ? 'autofilled' : ''}`}
            rows={rows}
            value={form[fkey]}
            onChange={e => set(fkey, e.target.value)}
          />
          {isAutofilled(fkey) && <span className="autofill-badge textarea-badge" title="Auto-filled">⚡</span>}
        </div>
      </div>
    );
  }

  function SelectField({ label, fkey, options }) {
    return (
      <div className="mn-field half">
        <label className="mn-label">{label}</label>
        <div className="mn-input-wrap">
          <select
            className={`mn-input ${isAutofilled(fkey) ? 'autofilled' : ''}`}
            value={form[fkey]}
            onChange={e => set(fkey, e.target.value)}
          >
            <option value="">Select...</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {isAutofilled(fkey) && <span className="autofill-badge" title="Auto-filled">⚡</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="mn-wrapper">
      {/* Header */}
      <div className="mn-header">
        <div className="mn-header-left">
          <div className="mn-emblem">🏛</div>
          <div>
            <div className="mn-title-hi">मूल निवास प्रमाण पत्र हेतु आवेदन पत्र</div>
            <div className="mn-title-en">Application for Domicile Certificate — Government of Rajasthan</div>
          </div>
        </div>
        <div className="mn-photo-box">
          <div className="mn-photo-inner">Photo<br />(Passport Size)</div>
        </div>
      </div>

      {/* Progress */}
      <div className="mn-progress">
        <div className="mn-progress-info">
          <span className="mn-progress-label">Form Completion</span>
          <span className="mn-progress-pct">{pct}% ({filledCount}/{totalFields} fields)</span>
        </div>
        <div className="mn-progress-bar">
          <div className="mn-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {showSuccess && (
          <div className="mn-autofill-alert">
            ⚡ {filledFields.size} fields auto-filled from your uploaded documents!
          </div>
        )}
      </div>

      {/* SECTION I */}
      <div className="mn-section">
        <div className="mn-section-title">
          <span className="mn-section-num">I</span>
          आवेदक का विवरण — Applicant Details
        </div>

        <div className="mn-grid">
          <Field label="1. प्रार्थी का नाम / Applicant Name" fkey="applicant_name" placeholder="Full name as per Aadhaar" />
          <Field label="2. पिता / पति का नाम / Father / Husband Name" fkey="father_husband_name" placeholder="Father's or husband's name" />
          <TextareaField label="3. वर्तमान स्थायी पता / Current Permanent Address" fkey="current_address" rows={3} />
          <Field label="4. पिता / पति का मूल स्थान / Father's Native Place" fkey="father_native_place" placeholder="Village, District" />
          <Field label="5. पिता / पति का व्यवसाय / Father's Occupation" fkey="father_occupation" placeholder="e.g. Farmer, Government Service" />
          <TextareaField label="6. पिता / पति के व्यवसाय का पता / Father's Occupation Address" fkey="father_occupation_address" />
          <Field label="7. जन्म स्थान / Birth Place" fkey="birth_place" placeholder="Village / City" half />
          <Field label="8. जन्म दिनांक / Date of Birth" fkey="dob" type="text" placeholder="DD/MM/YYYY" half />
        </div>

        {/* Education */}
        <div className="mn-subsection">
          <div className="mn-subsection-title">9. शिक्षा विवरण / Education Details</div>
          <div className="mn-edu-table">
            <div className="mn-edu-header">
              <span>कक्षा / Class</span>
              <span>संस्थान का नाम / Institution Name</span>
              <span>स्थान / Place</span>
            </div>
            {[
              ['कक्षा 1 से 9 / Class 1–9', 'education_1_9_school', 'education_1_9_place'],
              ['10वीं / 10th', 'education_10th_school', 'education_10th_place'],
              ['12वीं / 12th', 'education_12th_school', 'education_12th_place'],
              ['स्नातक / Graduate', 'education_grad_school', 'education_grad_place'],
              ['स्नातकोत्तर / Post Graduate', 'education_postgrad_school', 'education_postgrad_place'],
            ].map(([cls, sk, pk]) => (
              <div key={cls} className="mn-edu-row">
                <span className="mn-edu-class">{cls}</span>
                <div className="mn-input-wrap">
                  <input className={`mn-input ${isAutofilled(sk) ? 'autofilled' : ''}`}
                    value={form[sk]} onChange={e => set(sk, e.target.value)} placeholder="School / College name" />
                  {isAutofilled(sk) && <span className="autofill-badge">⚡</span>}
                </div>
                <div className="mn-input-wrap">
                  <input className={`mn-input ${isAutofilled(pk) ? 'autofilled' : ''}`}
                    value={form[pk]} onChange={e => set(pk, e.target.value)} placeholder="City / Place" />
                  {isAutofilled(pk) && <span className="autofill-badge">⚡</span>}
                </div>
              </div>
            ))}
            <div className="mn-edu-row">
              <span className="mn-edu-class">अन्य / Other</span>
              <div className="mn-input-wrap" style={{ gridColumn: '2/4' }}>
                <input className="mn-input" value={form.education_other}
                  onChange={e => set('education_other', e.target.value)} placeholder="Other qualification details" />
              </div>
            </div>
          </div>
        </div>

        <div className="mn-grid">
          <TextareaField label="10. स्वयं / पिता की अचल संपत्ति / Immovable Property Details" fkey="immovable_property" />
          <SelectField label="11. क्या मतदाता सूची में नाम है? / In Voter List?" fkey="in_voter_list" options={['हाँ / Yes', 'नहीं / No']} />
          <Field label="वोटर आईडी नंबर / Voter ID Number" fkey="voter_id_number" placeholder="e.g. RJ/12/345/678901" half />
          <Field label="ड्राइविंग लाइसेंस / Driving License No." fkey="driving_license" placeholder="e.g. RJ0120230012345" half />
          <Field label="12. परिवार कितने वर्षों से राजस्थान में है? / Years in Rajasthan" fkey="years_in_rajasthan" placeholder="e.g. 20" half />
          <Field label="13. मोबाइल नंबर / Mobile Number" fkey="mobile_number" type="tel" placeholder="10-digit mobile" half />
        </div>
      </div>

      {/* SECTION II — Women only */}
      {(gender === 'Female' || gender === '') && (
        <div className="mn-section mn-section-women">
          <div className="mn-section-title">
            <span className="mn-section-num">II</span>
            महिला के लिए / For Women Only
            {gender !== 'Female' && <span className="mn-section-hint">(Fill if applicable)</span>}
          </div>
          <div className="mn-grid">
            <SelectField label="1. क्या आप विवाहित हैं? / Are you married?" fkey="is_married" options={['हाँ / Yes', 'नहीं / No']} />
            <Field label="2. विवाह कब और किसके साथ? / Marriage date & partner" fkey="marriage_date_partner" placeholder="Date and partner name" />
            <SelectField label="3. क्या पति राजस्थान के मूल निवासी हैं? / Is husband Rajasthan domicile?" fkey="husband_domicile" options={['हाँ / Yes', 'नहीं / No']} />
            <Field label="4. पति के साथ कब से और कहाँ रह रही हैं? / Living with husband since & where" fkey="living_with_husband_since" placeholder="Date and place" />
          </div>
        </div>
      )}

      {/* Affidavit */}
      <div className="mn-section mn-section-affidavit">
        <div className="mn-section-title">शपथ पत्र / Affidavit Details</div>
        <div className="mn-grid">
          <Field label="मेरा मूल निवास / My Native Place" fkey="applicant_native_of" placeholder="District, Rajasthan" />
          <Field label="समस्त शिक्षा / All Education completed at" fkey="oath_education" placeholder="Highest qualification" />
        </div>
      </div>

      {/* Legend */}
      <div className="mn-legend">
        <span className="mn-legend-item"><span className="mn-legend-dot autofilled-dot"></span>⚡ Auto-filled from uploaded documents</span>
        <span className="mn-legend-item"><span className="mn-legend-dot manual-dot"></span>Manually entered</span>
      </div>

      {/* Actions */}
      <div className="mn-actions">
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <button className="btn btn-primary" onClick={() => onSave && onSave(form)}>
            ✓ Save Profile Data
          </button>
          <button
            className="btn btn-success"
            onClick={downloadPDF}
            disabled={pdfLoading}
            style={{
              background: pdfLoading ? '#374151' : 'linear-gradient(135deg,#166534,#15803d)',
              color:'#fff', border:'none', borderRadius:10, padding:'10px 18px',
              cursor: pdfLoading ? 'not-allowed' : 'pointer',
              fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:8,
            }}
          >
            {pdfLoading
              ? <><span style={{width:14,height:14,border:'2px solid #6b7280',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite'}} />Generating PDF…</>
              : '⬇ Download PDF — Mool Niwas Form'}
          </button>
        </div>
        {pdfError && (
          <div style={{marginTop:10,padding:'8px 12px',background:'#2d0a0a',border:'1px solid #991b1b',borderRadius:8,color:'#f87171',fontSize:12}}>
            ⚠ PDF Error: {pdfError} — ensure backend is running and pdf-lib is installed (npm install)
          </div>
        )}
        <button className="btn btn-secondary" onClick={() => setForm(EMPTY_FORM)}>
          ↺ Clear All
        </button>
        <button className="btn btn-secondary" onClick={() => profile && autoFillFromProfile(profile)}>
          ⚡ Re-Autofill
        </button>
      </div>
    </div>
  );
}
