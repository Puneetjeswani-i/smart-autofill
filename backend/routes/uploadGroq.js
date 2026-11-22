/**
 * routes/uploadGroq.js
 *
 * Enhanced upload route: Tesseract OCR → Groq AI → Structured Profile
 *
 * Mounts at: POST /api/upload-ai
 *
 * Extends the existing upload route by adding Groq AI post-processing.
 * The existing /api/upload route is preserved unchanged.
 *
 * Pipeline:
 *   File upload → Quality check → Tesseract OCR → Groq LLM parsing
 *   → Merge into profile → Eligibility check → Response
 */

require('dotenv').config();
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

// Existing services (preserved)
const { runOCR, deleteFile }              = require('../utils/ocr');
const { analyzeDocumentQuality }          = require('../services/qualityAnalyzer');
const { mergeDocumentIntoProfile, emptyProfile, flattenProfile, generateCompletenessReport }
                                          = require('../services/profileEngine');
const { suggestSchemes }                  = require('../services/schemeEngine');
const { verifyResidence, validateMoolNiwasEligibility }
                                          = require('../services/residenceEngine');
const { detectFraud }                     = require('../services/fraudDetector');
const { getDB }                           = require('../utils/database');
const { encryptProfile, decryptProfile }  = require('../utils/encryption');

// NEW: Groq AI service
const { parseDocumentWithGroq, detectDocumentType } = require('../services/groqService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProfileId(req) {
  const sid = req.headers['x-session-id'];
  return sid && sid.length > 8 ? `session_${sid}` : 'default_user_profile';
}

/**
 * Map Groq-parsed fields to the shape the existing profileEngine expects.
 * The profileEngine.mergeDocumentIntoProfile() accepts a "parsed" flat object
 * with keys like: name, dob, gender, address, id_number, pan, voter_id, etc.
 */
function normalizeGroqToProfileShape(groqParsed, docType) {
  if (!groqParsed) return {};

  const out = { doc_type: docType || groqParsed.doc_type || 'unknown' };

  // Personal info
  if (groqParsed.name)           out.name          = groqParsed.name;
  if (groqParsed.father_name)    out.father_name   = groqParsed.father_name;
  if (groqParsed.mother_name)    out.mother_name   = groqParsed.mother_name;
  if (groqParsed.dob)            out.dob           = groqParsed.dob;
  if (groqParsed.gender)         out.gender        = groqParsed.gender;
  if (groqParsed.blood_group)    out.blood_group   = groqParsed.blood_group;
  if (groqParsed.nationality)    out.nationality   = groqParsed.nationality;

  // IDs
  if (groqParsed.aadhaar_number) out.id_number     = groqParsed.aadhaar_number;
  if (groqParsed.pan_number)     out.pan           = groqParsed.pan_number;
  if (groqParsed.voter_id)       out.voter_id      = groqParsed.voter_id;
  if (groqParsed.dl_number)      out.driving_license = groqParsed.dl_number;
  if (groqParsed.passport_number) out.passport_number = groqParsed.passport_number;
  if (groqParsed.roll_number)    out.roll_number   = groqParsed.roll_number;

  // Address
  if (groqParsed.address)        out.address       = groqParsed.address;
  if (groqParsed.pincode)        out.pincode       = groqParsed.pincode;
  if (groqParsed.district)       out.district      = groqParsed.district;
  if (groqParsed.state)          out.state         = groqParsed.state;
  if (groqParsed.place_of_birth) out.birth_place   = groqParsed.place_of_birth;

  // Document dates (used by residence engine)
  if (groqParsed.date_of_issue)  out.date_of_issue = groqParsed.date_of_issue;
  if (groqParsed.date_of_expiry) out.date_of_expiry = groqParsed.date_of_expiry;
  if (groqParsed.valid_till)     out.valid_till    = groqParsed.valid_till;

  // Marksheet fields — map to class-specific education buckets
  if (groqParsed.school_college) out.school_college = groqParsed.school_college;
  if (groqParsed.board)          out.board          = groqParsed.board;
  if (groqParsed.class)          out.class_level    = String(groqParsed.class);
  if (groqParsed.year_of_passing) out.year_of_passing = groqParsed.year_of_passing;
  if (groqParsed.percentage)     out.percentage     = groqParsed.percentage;
  if (groqParsed.subjects)       out.subjects       = groqParsed.subjects;
  if (groqParsed.division)       out.division       = groqParsed.division;

  // Derive which education level this marksheet belongs to and set the right keys
  const classLevel = String(groqParsed.class || '').trim();
  if (classLevel === '10' || classLevel.toLowerCase().includes('10')) {
    if (groqParsed.school_college) out.education_10th_school = groqParsed.school_college;
    if (groqParsed.board) out.education_10th_board = groqParsed.board;
    if (groqParsed.year_of_passing) out.education_10th_year = groqParsed.year_of_passing;
    if (groqParsed.percentage) out.education_10th_percentage = groqParsed.percentage;
    out.education_10th_place = groqParsed.district || groqParsed.state || null;
  } else if (classLevel === '12' || classLevel.toLowerCase().includes('12')) {
    if (groqParsed.school_college) out.education_12th_school = groqParsed.school_college;
    if (groqParsed.board) out.education_12th_board = groqParsed.board;
    if (groqParsed.year_of_passing) out.education_12th_year = groqParsed.year_of_passing;
    if (groqParsed.percentage) out.education_12th_percentage = groqParsed.percentage;
    out.education_12th_place = groqParsed.district || groqParsed.state || null;
  } else if (['graduate', 'graduation', 'ug', 'b.a', 'b.sc', 'b.com', 'b.tech'].some(g => classLevel.toLowerCase().includes(g))) {
    if (groqParsed.school_college) out.education_grad_school = groqParsed.school_college;
    if (groqParsed.year_of_passing) out.education_grad_year = groqParsed.year_of_passing;
    out.education_grad_place = groqParsed.district || groqParsed.state || null;
  }

  // Income & caste
  if (groqParsed.annual_income)  out.annual_income = groqParsed.annual_income;
  if (groqParsed.caste)          out.caste         = groqParsed.caste;
  if (groqParsed.caste_category) out.caste_category = groqParsed.caste_category;

  // Electricity bill (for residence proof)
  if (groqParsed.consumer_id)    out.consumer_id   = groqParsed.consumer_id;
  if (groqParsed.billing_month)  out.billing_month = groqParsed.billing_month;
  if (groqParsed.bill_amount)    out.bill_amount   = groqParsed.bill_amount;

  return out;
}

// ─── Multer setup (same as existing upload route) ─────────────────────────────

const uploadDir = path.join(__dirname, '../uploads_temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `ai_${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.bmp', '.tiff', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error(`Invalid file type: ${ext}`));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── POST /api/upload-ai ──────────────────────────────────────────────────────

router.post('/', upload.array('documents', 10), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const PROFILE_ID = getProfileId(req);

  // Load existing profile from DB
  let structuredProfile = emptyProfile();
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (row) {
      const dec = decryptProfile(JSON.parse(row.data));
      if (dec.personal_info) structuredProfile = dec;
    }
  } catch {}

  const perDocResults  = [];
  const residenceInputs = [];
  const fraudInputs    = [];

  for (const file of files) {
    const filePath = file.path;
    const fileSize = file.size || 0;
    const docHint  = req.body?.doc_type_hint || null; // optional frontend hint

    // ── Step 1: Quality gate ──────────────────────────────────────────────────
    let qualityReport = { quality_score: 75, issues: [], warnings: [], can_proceed: true };
    try {
      if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
        qualityReport = await analyzeDocumentQuality(filePath, fileSize);
      }
    } catch {}

    if (!qualityReport.can_proceed) {
      perDocResults.push({
        file: file.originalname,
        error: 'Document quality too low: ' + (qualityReport.issues[0] || 'Re-upload a clearer image'),
        doc_type: 'unknown', fields_extracted: 0, confidence: 0,
        quality: qualityReport, groq_used: false,
      });
      deleteFile(filePath);
      continue;
    }

    // ── Step 2: Tesseract OCR ─────────────────────────────────────────────────
    let rawText = '';
    try {
      rawText = await runOCR(filePath);
    } catch (err) {
      console.error(`[OCR] Failed for ${file.originalname}:`, err.message);
    }

    if (!rawText || rawText.trim().length < 10) {
      perDocResults.push({
        file: file.originalname,
        error: 'Could not extract text — ensure image is clear and well-lit',
        doc_type: 'unknown', fields_extracted: 0, confidence: 0,
        quality: qualityReport, groq_used: false,
      });
      deleteFile(filePath);
      continue;
    }

    // ── Step 3: Groq AI parsing ───────────────────────────────────────────────
    let groqResult;
    try {
      // Quick pre-detect for logging
      const preDetect = detectDocumentType(rawText);
      console.log(`[Upload-AI] ${file.originalname}: pre-detected as ${preDetect.type}, sending to Groq...`);

      groqResult = await parseDocumentWithGroq(rawText, docHint);
    } catch (err) {
      console.error('[Groq] Processing failed:', err.message);
      groqResult = { parsed: null, docType: 'unknown', confidence: 0, groqUsed: false, error: err.message };
    }

    // ── Step 4: Merge into profile ────────────────────────────────────────────
    if (groqResult.parsed) {
      const normalized = normalizeGroqToProfileShape(groqResult.parsed, groqResult.docType);

      // Build per-field confidence map — use overall confidence for all extracted fields
      const fieldConfidence = {};
      Object.keys(normalized).forEach(k => {
        fieldConfidence[k] = (groqResult.confidence || 70) / 100;
      });

      structuredProfile = mergeDocumentIntoProfile(
        structuredProfile,
        normalized,
        fieldConfidence,
        groqResult.docType
      );

      residenceInputs.push({
        parsedFields: normalized,
        rawText,
        docType: groqResult.docType,
      });

      fraudInputs.push({
        parsedFields: normalized,
        docType: groqResult.docType,
        confidence: groqResult.confidence,
        rawText,
      });

      const fieldsExtracted = Object.keys(groqResult.parsed)
        .filter(k => groqResult.parsed[k] !== null && k !== 'doc_type').length;

      perDocResults.push({
        file:             file.originalname,
        doc_type:         groqResult.docType,
        fields_extracted: fieldsExtracted,
        confidence:       groqResult.confidence,
        raw_fields:       groqResult.parsed,      // Full Groq output
        normalized:       normalized,              // Mapped for profileEngine
        quality:          qualityReport,
        groq_used:        groqResult.groqUsed,
        groq_tokens:      groqResult.tokensUsed || 0,
        processing_ms:    groqResult.processingMs || 0,
        groq_error:       groqResult.error || null,
      });

      // Log to DB
      try {
        getDB().prepare('INSERT INTO EXTRACTIONS (id, raw_text, parsed_data, confidence) VALUES (?, ?, ?, ?)').run(
          uuidv4(),
          rawText.substring(0, 2000),
          JSON.stringify(groqResult.parsed),
          JSON.stringify({ overall: groqResult.confidence, groq: true })
        );
      } catch {}
    } else {
      perDocResults.push({
        file:          file.originalname,
        doc_type:      groqResult.docType || 'unknown',
        fields_extracted: 0,
        confidence:    0,
        error:         groqResult.error || 'Groq parsing returned no data',
        quality:       qualityReport,
        groq_used:     groqResult.groqUsed,
        groq_error:    groqResult.error,
      });
    }

    deleteFile(filePath);
  }

  // ── Step 5: Residence + Fraud + MoolNiwas analysis ───────────────────────────
  const residenceReport  = verifyResidence(residenceInputs);
  const fraudReport      = detectFraud(fraudInputs);
  const moolNiwasReport  = validateMoolNiwasEligibility(perDocResults, structuredProfile);

  structuredProfile._residence_report  = residenceReport;
  structuredProfile._fraud_report      = fraudReport;
  structuredProfile._mool_niwas_report = moolNiwasReport;

  // ── Step 6: Persist ──────────────────────────────────────────────────────────
  try {
    const db     = getDB();
    const toSave = encryptProfile(structuredProfile);
    const exists = db.prepare('SELECT id FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (exists) {
      db.prepare('UPDATE profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(toSave), PROFILE_ID);
    } else {
      db.prepare('INSERT INTO profiles (id, data) VALUES (?, ?)')
        .run(PROFILE_ID, JSON.stringify(toSave));
    }
  } catch (e) { console.warn('DB save failed:', e.message); }

  // ── Step 7: Build response ────────────────────────────────────────────────────
  const flatProfile      = flattenProfile(structuredProfile);
  const completeness     = generateCompletenessReport(structuredProfile);
  const suggested_schemes = suggestSchemes(structuredProfile._doc_types_seen || []);
  const successCount     = perDocResults.filter(r => !r.error).length;
  const groqSuccessCount = perDocResults.filter(r => r.groq_used && !r.groq_error).length;
  const totalTokens      = perDocResults.reduce((s, r) => s + (r.groq_tokens || 0), 0);

  res.json({
    success:               true,
    ai_powered:            true,
    documents_processed:   perDocResults.length,
    documents_successful:  successCount,
    groq_docs_parsed:      groqSuccessCount,
    total_groq_tokens:     totalTokens,
    doc_types:             [...new Set(perDocResults.filter(r => r.doc_type !== 'unknown').map(r => r.doc_type))],
    data:                  flatProfile,
    structured_profile:    structuredProfile,
    completeness,
    residence_report:      residenceReport,
    mool_niwas_report:     moolNiwasReport,
    fraud_report:          fraudReport,
    suggested_schemes:     suggested_schemes.slice(0, 3),
    per_document:          perDocResults,
    message: successCount > 0
      ? `✅ ${successCount}/${perDocResults.length} docs processed with Groq AI. Readiness: ${completeness.score}%.`
      : '❌ Could not process any documents.',
  });
});

module.exports = router;
