/**
 * services/documentPipeline.js — one uploaded file → one structured document.
 *
 *   sniff file type → quality check → OCR / PDF text → detect type
 *   → local extraction (always) → AI extraction (optional, masked, grounded)
 *   → merge best value per field → residence evidence (dates, Rajasthan?)
 *
 * The raw OCR text is returned to the caller once (to show the operator) and
 * is never written to the database.
 */

'use strict';

const { extractText, PdfPasswordError } = require('../utils/ocr');
const { analyzeDocumentQuality } = require('./qualityAnalyzer');
const { detectDocType, extractLocal } = require('./extractors');
const groq = require('./groqService');
const V = require('./validators');
const { DOC_TYPES } = require('../config/catalog');
const { config } = require('../config');
const { randomId } = require('../utils/crypto');

function sniffKind(buffer) {
  if (!buffer || buffer.length < 8) return null;
  const b = buffer;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'; // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image'; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image'; // PNG
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image'; // BMP
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'image'; // TIFF
  return null;
}

/** Combine local and AI results field by field. */
function mergeExtraction(local, ai) {
  const fields = { ...local.fields };
  const meta = { ...local.meta };
  if (!ai) return { fields, meta };
  for (const [key, value] of Object.entries(ai.fields)) {
    const aiMeta = ai.meta[key];
    const lm = local.meta[key];
    if (key === 'id_number') continue; // Aadhaar never comes from AI (it is masked)
    if (lm && lm.validated) continue; // strictly validated local value wins
    if (!(key in fields)) {
      fields[key] = value;
      meta[key] = aiMeta;
      continue;
    }
    if (aiMeta.grounded && (!lm || aiMeta.confidence >= lm.confidence)) {
      fields[key] = value;
      meta[key] = { ...aiMeta, local_value: local.fields[key] };
    }
  }
  return { fields, meta };
}

/** Move marksheet values (_marks_*) into the right class bucket. */
function mapMarksheet(fields, meta, warnings) {
  const cls = fields._marks_class_level;
  const bucket = cls === '10' ? '10th' : cls === '12' ? '12th' : cls === 'graduate' ? 'grad' : null;
  if (!bucket) {
    if (Object.keys(fields).some((k) => k.startsWith('_marks_'))) warnings.push('marksheet_class_unknown');
    return;
  }
  const move = (from, to) => {
    if (fields[from] === undefined) return;
    fields[to] = fields[from];
    meta[to] = meta[from] || { confidence: 0.6, method: 'local' };
  };
  if (bucket === 'grad') {
    move('_marks_school_college', 'education_grad_school');
    move('_marks_year_of_passing', 'education_grad_year');
  } else {
    move('_marks_school_college', `education_${bucket}_school`);
    move('_marks_board', `education_${bucket}_board`);
    move('_marks_year_of_passing', `education_${bucket}_year`);
    move('_marks_roll_number', `education_${bucket}_roll`);
    move('_marks_percentage', `education_${bucket}_percentage`);
  }
  const school = fields._marks_school_college;
  const place = fields._marks_school_place
    || (school && school.includes(',') ? school.split(',').map((s) => s.trim()).filter(Boolean).slice(-1)[0] : null);
  if (place) {
    fields[`education_${bucket}_place`] = V.titleCase(place);
    // inherit method/grounding from where the place came from (school_place or the school name)
    const from = fields._marks_school_place ? meta._marks_school_place : meta._marks_school_college;
    meta[`education_${bucket}_place`] = { ...(from || { method: 'local' }), confidence: 0.55 };
  }
}

const DATE_SOURCES = {
  electricity_bill: ['bill_date', 'billing_month', 'issue_date', 'date_of_issue'],
  water_bill: ['bill_date', 'billing_month', 'issue_date', 'date_of_issue'],
  voter_id: ['issue_date', 'date_of_issue'],
  driving_license: ['issue_date', 'date_of_issue'],
  passport: ['issue_date', 'date_of_issue'],
  ration_card: ['issue_date', 'date_of_issue'],
  rent_agreement: ['issue_date', 'date_of_issue'],
  domicile_certificate: ['issue_date', 'date_of_issue'],
  income_certificate: ['issue_date', 'date_of_issue'],
  caste_certificate: ['issue_date', 'date_of_issue'],
  school_certificate: ['issue_date', 'date_of_issue'],
  bank_passbook: ['account_opening_date', 'issue_date', 'date_of_issue'],
  aadhaar: ['issue_date', 'date_of_issue'],
  jan_aadhaar: ['issue_date', 'date_of_issue'],
};

function yearOf(value) {
  if (!value) return null;
  const p = V.parseDate(value);
  if (p) return p.y;
  const m = String(value).match(/\b(19[5-9]\d|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** What this document says about where the person lived, and when. */
function buildEvidence(docType, fields, localEv, aiEv) {
  const all = { ...(aiEv || {}), ...(localEv || {}) };
  const ev = {
    address: fields.address || null,
    district: fields.district || null,
    state: fields.state || null,
    pincode: fields.pincode || null,
    date: null,
    year: null,
    date_source: null,
    is_rajasthan: null,
    proves: 'address',
  };
  for (const key of DATE_SOURCES[docType] || []) {
    if (all[key]) { ev.date = all[key]; ev.date_source = key; break; }
  }
  if (docType === 'marksheet') {
    ev.proves = 'study';
    const y = fields.education_10th_year || fields.education_12th_year || fields.education_grad_year || fields._marks_year_of_passing;
    if (y) { ev.date = String(y); ev.date_source = 'year_of_passing'; }
  }
  if (docType === 'birth_certificate') {
    ev.proves = 'birth';
    if (fields.dob) { ev.date = fields.dob; ev.date_source = 'dob'; }
  }
  const y = yearOf(ev.date);
  const current = new Date().getFullYear();
  if (y && y >= 1950 && y <= current) ev.year = y;

  const textForState = [fields.address, fields.district, fields.state, fields.birth_place, fields.education_10th_place, fields.education_12th_place].filter(Boolean).join(', ');
  ev.is_rajasthan = V.looksRajasthan({ text: textForState, state: fields.state || '', pincode: fields.pincode || '' });
  if (docType === 'marksheet') {
    const board = fields.education_10th_board || fields.education_12th_board || fields._marks_board || '';
    if (/rajasthan/i.test(board)) ev.is_rajasthan = true;
  }
  if (docType === 'driving_license' && ev.is_rajasthan === null && /^RJ/i.test(fields.driving_license || '')) ev.is_rajasthan = true;
  return ev;
}

function qualitySummary(q) {
  if (!q) return null;
  return {
    score: q.quality_score,
    issues: q.issues || [],
    warnings: q.warnings || [],
    suggestions: q.suggestions || [],
  };
}

function safeLabel(name) {
  return String(name || 'document').replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 80);
}

/**
 * Process one file.
 * @param {{ buffer: Buffer, originalName: string, hintType?: string, password?: string,
 *           settings: { ai: { enabled: boolean }, ocr: { languages: string } } }} input
 */
async function processDocument({ buffer, originalName, hintType, password, settings }) {
  const kind = sniffKind(buffer);
  const base = {
    id: randomId('doc'),
    file_label: safeLabel(originalName),
    uploaded_at: new Date().toISOString(),
    kind,
  };
  if (!kind) {
    return { ...base, ok: false, error: 'unsupported_file', doc_type: hintType || 'other' };
  }

  const warnings = [];
  let quality = null;
  if (kind === 'image') {
    try { quality = await analyzeDocumentQuality(buffer, buffer.length); } catch { /* optional */ }
  }

  let ocr;
  try {
    ocr = await extractText({ buffer, kind, password, langs: settings.ocr.languages || 'eng+hin' });
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      return { ...base, ok: false, error: err.code, doc_type: hintType || 'other' };
    }
    console.error('[pipeline] OCR failed:', err.message);
    return { ...base, ok: false, error: 'ocr_failed', doc_type: hintType || 'other', quality: qualitySummary(quality) };
  }
  warnings.push(...ocr.warnings);

  const textChars = ocr.text.replace(/\s/g, '').length;
  if (textChars < 15) {
    return {
      ...base, ok: false, error: kind === 'pdf' ? 'pdf_no_readable_text' : 'no_text_found',
      doc_type: hintType || 'other', quality: qualitySummary(quality), warnings,
      ocr: { method: ocr.method, confidence: ocr.confidence, pages: ocr.pages, langs: ocr.langs },
    };
  }

  const detected = detectDocType(ocr.text);
  let docType = hintType && hintType !== 'auto' && DOC_TYPES[hintType] ? hintType : detected.type;
  let local = extractLocal(ocr.text, docType);

  let ai = null;
  let aiInfo = { used: false };
  const aiAllowed = settings.ai && settings.ai.enabled && config.groq.apiKey;
  if (aiAllowed) {
    try {
      ai = await groq.parseWithAi(ocr.text, docType);
      aiInfo = { used: true, model: ai.model, tokens: ai.tokens, ms: ai.ms };
      const aiType = ai.detectedType && String(ai.detectedType).toLowerCase().replace(/[\s-]+/g, '_');
      if ((!hintType || hintType === 'auto') && detected.confidence < 0.5 && aiType && DOC_TYPES[aiType] && aiType !== docType) {
        docType = aiType;
        local = extractLocal(ocr.text, docType);
        ai = await groq.parseWithAi(ocr.text, docType).catch(() => ai);
      }
    } catch (err) {
      aiInfo = { used: false, error: err.message, code: err.code };
      warnings.push('ai_failed');
    }
  } else if (settings.ai && settings.ai.enabled && !config.groq.apiKey) {
    aiInfo = { used: false, error: 'AI key not configured', code: 'no_key' };
  }

  const { fields, meta } = mergeExtraction(local, ai);
  warnings.push(...local.warnings);
  if (docType === 'marksheet') mapMarksheet(fields, meta, warnings);
  const evidence = buildEvidence(docType, fields, local.evidence, ai && ai.evidence);

  const ungrounded = Object.entries(meta).filter(([k, m]) => !k.startsWith('_') && m && m.method === 'ai' && !m.grounded).map(([k]) => k);
  if (ungrounded.length) warnings.push('ai_values_not_in_text');

  return {
    ...base,
    ok: true,
    doc_type: docType,
    detected_type: detected.type,
    detection_confidence: detected.confidence,
    pages: ocr.pages,
    ocr: { method: ocr.method, confidence: ocr.confidence, langs: ocr.langs, rotated: ocr.rotated || 0, chars: textChars },
    ai: aiInfo,
    quality: qualitySummary(quality),
    fields,
    field_meta: meta,
    evidence,
    warnings: [...new Set(warnings)],
    ungrounded_fields: ungrounded,
    text_preview: ocr.text.slice(0, 4000),
  };
}

module.exports = { processDocument, sniffKind, mergeExtraction, buildEvidence, mapMarksheet };
