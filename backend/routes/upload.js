const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { runOCR, parseDocumentText, deleteFile } = require('../utils/ocr');
const { mergeDocumentIntoProfile, emptyProfile, flattenProfile, generateCompletenessReport } = require('../services/profileEngine');
const { suggestSchemes } = require('../services/schemeEngine');
const { verifyResidence, validateMoolNiwasEligibility } = require('../services/residenceEngine');
const { detectFraud } = require('../services/fraudDetector');
const { analyzeDocumentQuality } = require('../services/qualityAnalyzer');
const { getDB } = require('../utils/database');
const { encryptProfile, decryptProfile } = require('../utils/encryption');

// P2.2: read session ID from header, fall back to default
function getProfileId(req) {
  const sessionId = req.headers['x-session-id'];
  return sessionId && sessionId.length > 8 ? `session_${sessionId}` : 'default_user_profile';
}

const uploadDir = path.join(__dirname, '../uploads_temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `doc_${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.bmp', '.tiff', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error(`Invalid file type: ${ext}`));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.array('documents', 10), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const PROFILE_ID = getProfileId(req);   // P2.2 session-scoped

  let structuredProfile = emptyProfile();
  try {
    const db = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (row) {
      const decrypted = decryptProfile(JSON.parse(row.data));
      if (decrypted.personal_info) structuredProfile = decrypted;
    }
  } catch {}

  const perDocResults = [];
  const residenceInputs = [];
  const fraudInputs = [];

  for (const file of files) {
    const filePath = file.path;
    const fileSize = file.size || 0;

    // Step 1: Quality gate
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
        quality: qualityReport,
      });
      deleteFile(filePath);
      continue;
    }

    // Step 2: OCR + parse
    try {
      const rawText = await runOCR(filePath);
      if (!rawText || rawText.trim().length < 10) {
        perDocResults.push({
          file: file.originalname,
          error: 'Could not extract text — ensure image is clear and well-lit',
          doc_type: 'unknown', fields_extracted: 0, confidence: 0,
          quality: qualityReport,
        });
        deleteFile(filePath);
        continue;
      }

      const { parsed, confidence, overall_confidence, fields_extracted } = parseDocumentText(rawText);
      const docType = parsed.doc_type || 'unknown';

      structuredProfile = mergeDocumentIntoProfile(structuredProfile, parsed, confidence, docType);
      residenceInputs.push({ parsedFields: parsed, rawText, docType });
      fraudInputs.push({ parsedFields: parsed, docType, confidence: overall_confidence, rawText });

      perDocResults.push({
        file: file.originalname,
        doc_type: docType,
        fields_extracted,
        confidence: overall_confidence,
        raw_fields: parsed,
        quality: qualityReport,
      });

      // P1.3: Fixed INSERT — matches the SimpleDB handler signature
      // SimpleDB.prepare('INSERT INTO EXTRACTIONS').run(id, raw_text, parsed_data, confidence)
      try {
        getDB().prepare('INSERT INTO EXTRACTIONS').run(
          uuidv4(),
          rawText.substring(0, 2000),
          JSON.stringify(parsed),
          JSON.stringify({ overall: overall_confidence })
        );
      } catch (dbErr) {
        // Non-fatal — extraction logging failure should not abort the request
        console.warn('Extraction log failed (non-critical):', dbErr.message);
      }

    } catch (err) {
      console.error(`OCR failed for ${file.originalname}:`, err.message);
      perDocResults.push({
        file: file.originalname, error: err.message,
        doc_type: 'unknown', fields_extracted: 0, confidence: 0,
        quality: qualityReport,
      });
    } finally {
      deleteFile(filePath);
    }
  }

  // Step 3: Residence + fraud analysis
  const residenceReport = verifyResidence(residenceInputs);
  const fraudReport = detectFraud(fraudInputs);
  const moolNiwasReport = validateMoolNiwasEligibility(perDocResults, structuredProfile);

  structuredProfile._residence_report = residenceReport;
  structuredProfile._fraud_report = fraudReport;
  structuredProfile._mool_niwas_report = moolNiwasReport;

  // Persist (session-scoped)
  try {
    const db = getDB();
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

  const flatProfile = flattenProfile(structuredProfile);
  const completeness = generateCompletenessReport(structuredProfile);
  const suggested_schemes = suggestSchemes(structuredProfile._doc_types_seen || []);
  const sources = structuredProfile._sources || {};
  const avgConf = Object.values(sources).length
    ? Math.round(Object.values(sources).reduce((a, b) => a + (b.confidence || 0), 0) / Object.values(sources).length * 100)
    : 0;
  const successCount = perDocResults.filter(r => !r.error).length;

  res.json({
    success: true,
    documents_processed: perDocResults.length,
    documents_successful: successCount,
    doc_types: [...new Set(perDocResults.filter(r => r.doc_type !== 'unknown').map(r => r.doc_type))],
    data: flatProfile,
    structured_profile: structuredProfile,
    confidence: { overall: avgConf, fields_extracted: Object.keys(sources).length },
    completeness,
    residence_report: residenceReport,
    mool_niwas_report: moolNiwasReport,
    fraud_report: fraudReport,
    suggested_schemes: suggested_schemes.slice(0, 3),
    per_document: perDocResults,
    message: successCount > 0
      ? `${successCount}/${perDocResults.length} docs processed. Readiness: ${completeness.score}%. Mool Niwas: ${moolNiwasReport.mool_niwas_score}%. Fraud: ${fraudReport.risk_level}.`
      : 'Could not process any documents.',
  });
});

module.exports = router;
