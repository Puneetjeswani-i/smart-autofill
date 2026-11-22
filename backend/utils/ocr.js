/**
 * utils/ocr.js
 *
 * OCR utility — extracts raw text from uploaded documents.
 *
 * - PDFs       : pdf-parse (text-layer extraction; fast, no OCR needed for digital PDFs)
 * - Images     : Tesseract.js v5 (jpg, jpeg, png, bmp, tiff, webp)
 *
 * Exports:
 *   runOCR(filePath)          → Promise<string>   raw extracted text
 *   parseDocumentText(text)   → Object            basic regex-parsed fields (legacy /api/upload path)
 *   deleteFile(filePath)      → void
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ─── PDF text extraction (pdf-parse) ─────────────────────────────────────────

async function runPDFExtraction(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer   = fs.readFileSync(filePath);
    const result   = await pdfParse(buffer, { max: 0 });
    return (result.text || '').trim();
  } catch (err) {
    console.error('[OCR] pdf-parse failed:', err.message);
    return '';
  }
}

// ─── Image OCR (Tesseract.js v5) ─────────────────────────────────────────────

async function runImageOCR(filePath) {
  try {
    const { createWorker } = require('tesseract.js');

    const worker = await createWorker('eng', 1, {
      // Suppress noisy Tesseract progress logs
      logger:       () => {},
      errorHandler: (e) => console.error('[Tesseract]', e),
    });

    // PSM 3 = Fully automatic page segmentation (best for documents)
    await worker.setParameters({
      tessedit_pageseg_mode:     '3',
      preserve_interword_spaces: '1',
    });

    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    return (text || '').trim();
  } catch (err) {
    console.error('[OCR] Tesseract failed:', err.message);
    return '';
  }
}

// ─── Main runOCR ─────────────────────────────────────────────────────────────

/**
 * Extract plain text from any supported document file.
 *
 * @param  {string}          filePath  Absolute path to the uploaded file
 * @returns {Promise<string>}          Raw extracted text (may be empty on failure)
 */
async function runOCR(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const pdfText = await runPDFExtraction(filePath);
    // If the PDF has a real text layer, use it directly (digital PDF)
    if (pdfText && pdfText.length > 30) {
      console.log(`[OCR] PDF text-layer extracted: ${pdfText.length} chars`);
      return pdfText;
    }
    // Scanned/image-only PDF — return whatever pdf-parse gave us (may be empty)
    // The calling code checks length and shows "Could not extract text" if too short
    console.warn('[OCR] PDF appears to be scanned/image-only — text layer empty');
    return pdfText;
  }

  // All image types
  console.log(`[OCR] Running Tesseract on: ${path.basename(filePath)}`);
  const text = await runImageOCR(filePath);
  console.log(`[OCR] Extracted ${text.length} chars from image`);
  return text;
}

// ─── Legacy regex-based field parser (non-Groq /api/upload path) ─────────────

/**
 * Parse common Indian document fields from raw OCR text using regex patterns.
 * Used by the classic /api/upload route (not the AI/Groq route).
 *
 * @param  {string} text  Raw OCR text
 * @returns {Object}      { doc_type, fields }
 */
function parseDocumentText(text) {
  if (!text || typeof text !== 'string') {
    return { doc_type: 'unknown', fields: {} };
  }

  const result = { doc_type: 'unknown', fields: {} };
  const upper  = text.toUpperCase();

  // ── Doc type detection ───────────────────────────────────────────────────
  if (/AADHAAR|UIDAI|UNIQUE\s+IDENTIFICATION/.test(upper))             result.doc_type = 'aadhaar';
  else if (/PERMANENT\s+ACCOUNT\s+NUMBER|INCOME\s+TAX\s+DEPARTMENT/.test(upper)) result.doc_type = 'pan';
  else if (/PASSPORT|REPUBLIC\s+OF\s+INDIA.*PASS/.test(upper))        result.doc_type = 'passport';
  else if (/DRIVING\s+LICEN/.test(upper))                             result.doc_type = 'driving_license';
  else if (/ELECTION\s+COMMISSION|VOTER|EPIC/.test(upper))            result.doc_type = 'voter_id';
  else if (/MARKSHEET|MARK\s+SHEET|CBSE|ICSE/.test(upper))           result.doc_type = 'marksheet';
  else if (/ELECTRICITY|CONSUMER\s+ID|METER\s+NO/.test(upper))       result.doc_type = 'electricity_bill';
  else if (/INCOME\s+CERTIFICATE|ANNUAL\s+INCOME/.test(upper))       result.doc_type = 'income_certificate';
  else if (/CASTE\s+CERTIFICATE|SCHEDULED\s+CASTE|OBC/.test(upper))  result.doc_type = 'caste_certificate';

  const f = {};

  // ── Name ─────────────────────────────────────────────────────────────────
  const nameRx = text.match(/(?:Name|NAME)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
  if (nameRx) f.name = nameRx[1].trim();

  // ── Date of Birth ─────────────────────────────────────────────────────────
  const dobRx = text.match(
    /(?:DOB|Date of Birth|D\.O\.B|BIRTH DATE)[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i
  );
  if (dobRx) f.dob = dobRx[1].replace(/-/g, '/');

  // ── Gender ────────────────────────────────────────────────────────────────
  const genderRx = text.match(/\b(Male|Female|MALE|FEMALE|M|F)\b/);
  if (genderRx) {
    const g = genderRx[1].toUpperCase();
    f.gender = g === 'M' ? 'Male' : g === 'F' ? 'Female' : genderRx[1];
  }

  // ── Aadhaar number ────────────────────────────────────────────────────────
  const aadhaarRx = text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
  if (aadhaarRx) f.id_number = aadhaarRx[1].replace(/\s/g, ' ');

  // ── PAN ───────────────────────────────────────────────────────────────────
  const panRx = text.match(/\b([A-Z]{5}\d{4}[A-Z])\b/);
  if (panRx) f.pan = panRx[1];

  // ── Pincode ───────────────────────────────────────────────────────────────
  const pincodeRx = text.match(/\b(\d{6})\b/);
  if (pincodeRx) f.pincode = pincodeRx[1];

  // ── Father name ───────────────────────────────────────────────────────────
  const fatherRx = text.match(
    /(?:Father|S\/O|D\/O|W\/O|C\/O)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i
  );
  if (fatherRx) f.father_name = fatherRx[1].trim();

  result.fields = f;
  return result;
}

// ─── File cleanup ─────────────────────────────────────────────────────────────

/**
 * Safely delete a temporary upload file.
 * Fails silently so cleanup errors never break API responses.
 *
 * @param {string} filePath  Path to delete
 */
function deleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // Cleanup failures are non-fatal
    console.warn('[OCR] deleteFile warning:', err.message);
  }
}

module.exports = { runOCR, parseDocumentText, deleteFile };
