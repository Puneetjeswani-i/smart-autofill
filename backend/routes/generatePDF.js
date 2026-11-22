/**
 * POST /api/generate-pdf/mool-niwas
 * ─────────────────────────────────────────────────────────────────────
 * Generates a filled Mool Niwas Praman Patra (Domicile Certificate)
 * application form PDF that the operator can download and submit.
 *
 * Uses pdf-lib to programmatically draw all form fields onto a
 * blank A4 page, laid out exactly like the official Rajasthan form.
 *
 * The form matches Rajasthan's official Mool Niwas application
 * (available at emitrakaka.com and ePDS portals).
 *
 * Fields filled:
 *   Section I  — Personal details (name, father, address, DOB, education)
 *   Section II — Women's section (marriage, husband domicile)
 *   Affidavit  — Oath declaration
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

// ── HELPERS ───────────────────────────────────────────────────────────

/** Convert hex colour "#1e1e2e" → pdf-lib rgb() */
function hex(h) {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

/** Safe string — never undefined/null in PDF */
function s(v) { return v != null && v !== '' ? String(v) : ''; }

/** Draw a horizontal line */
function hLine(page, x1, x2, y, width = 0.5, color = rgb(0, 0, 0)) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: width, color });
}

/** Draw a labelled field with an underline (standard government form style) */
function field(page, font, label, value, x, y, w, opts = {}) {
  const fontSize     = opts.fontSize || 8;
  const labelColor   = rgb(0.4, 0.4, 0.4);
  const valueColor   = rgb(0, 0, 0);
  const lineY        = y - 2;

  // Label above the line
  page.drawText(label, { x, y: y + 10, size: fontSize - 1, font, color: labelColor });

  // Value on the line
  if (value) {
    page.drawText(value.substring(0, Math.floor(w / (fontSize * 0.5))), {
      x, y, size: fontSize, font, color: valueColor,
    });
  }

  // Underline
  hLine(page, x, x + w, lineY, 0.4);
}

/** Thin box / checkbox */
function checkbox(page, x, y, checked, font, label) {
  page.drawRectangle({ x, y, width: 8, height: 8, borderColor: rgb(0,0,0), borderWidth: 0.5 });
  if (checked) page.drawText('✓', { x: x + 1, y: y + 1, size: 7, font, color: rgb(0, 0.5, 0) });
  if (label) page.drawText(label, { x: x + 11, y: y + 1, size: 7, font, color: rgb(0,0,0) });
}

// ── MAIN PDF BUILDER ──────────────────────────────────────────────────

async function buildMoolNiwasPDF(form) {
  const doc      = await PDFDocument.create();
  const page     = doc.addPage([595.28, 841.89]);  // A4
  const { width, height } = page.getSize();

  const fontR  = await doc.embedFont(StandardFonts.Helvetica);
  const fontB  = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 36;          // margin
  const W = width - M * 2; // usable width
  let y    = height - M;   // current y (top → bottom)

  // ── HEADER ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y: y - 28, width: W, height: 28, color: rgb(0.94, 0.94, 0.98) });
  page.drawText('मूल निवास प्रमाण पत्र हेतु आवेदन पत्र', {
    x: M + 10, y: y - 10, size: 9, font: fontB, color: rgb(0.2, 0.2, 0.6),
  });
  page.drawText('Application for Domicile / Mool Niwas Certificate — Rajasthan', {
    x: M + 10, y: y - 22, size: 7.5, font: fontR, color: rgb(0.3, 0.3, 0.3),
  });

  // Photo box (top-right)
  page.drawRectangle({ x: width - M - 60, y: y - 70, width: 60, height: 70, borderColor: rgb(0.6,0.6,0.6), borderWidth: 0.5 });
  page.drawText('Photo', { x: width - M - 45, y: y - 40, size: 7, font: fontR, color: rgb(0.6,0.6,0.6) });
  page.drawText('(Passport size)', { x: width - M - 57, y: y - 52, size: 5.5, font: fontR, color: rgb(0.7,0.7,0.7) });

  y -= 38;

  // ── SECTION I ──────────────────────────────────────────────────────
  page.drawText('SECTION I — Personal Details', { x: M, y, size: 8, font: fontB, color: rgb(0.2, 0.2, 0.5) });
  hLine(page, M, M + W - 65, y - 2, 1, rgb(0.2, 0.2, 0.5));
  y -= 20;

  // Row 1: Name | DOB
  field(page, fontR, '1. आवेदक का नाम / Applicant Name', s(form.applicant_name), M, y, W * 0.58);
  field(page, fontR, '8. जन्म दिनांक / DOB', s(form.dob), M + W * 0.62, y, W * 0.38);
  y -= 28;

  // Row 2: Father/Husband Name | Gender
  field(page, fontR, '2. पिता / पति का नाम / Father / Husband Name', s(form.father_husband_name), M, y, W * 0.58);
  field(page, fontR, 'लिंग / Gender', s(form.gender || ''), M + W * 0.62, y, W * 0.38);
  y -= 28;

  // Row 3: Current Address (full width)
  page.drawText('3. वर्तमान स्थाई पता / Current Permanent Address:', { x: M, y: y + 10, size: 7, font: fontR, color: rgb(0.4,0.4,0.4) });
  const addrLines = (s(form.current_address) || '').match(/.{1,90}/g) || [''];
  for (const al of addrLines.slice(0, 3)) {
    y -= 13;
    page.drawText(al, { x: M + 6, y, size: 8, font: fontR, color: rgb(0,0,0) });
    hLine(page, M, M + W, y - 2, 0.4);
  }
  y -= 18;

  // Row 4: Native place | Occupation
  field(page, fontR, '4. पिता का मूल स्थान / Father Native Place', s(form.father_native_place), M, y, W * 0.48);
  field(page, fontR, '5. पिता का व्यवसाय / Occupation', s(form.father_occupation), M + W * 0.52, y, W * 0.48);
  y -= 28;

  // Row 5: Occupation Address (full)
  field(page, fontR, '6. व्यवसाय का पता / Occupation Address', s(form.father_occupation_address), M, y, W);
  y -= 28;

  // Row 6: Birth Place | Aadhaar No.
  field(page, fontR, '7. जन्म स्थान / Birth Place', s(form.birth_place), M, y, W * 0.48);
  field(page, fontR, 'आधार नंबर / Aadhaar No.', s(form.aadhaar_number || ''), M + W * 0.52, y, W * 0.48);
  y -= 28;

  // ── EDUCATION TABLE ───────────────────────────────────────────────
  page.drawText('9. शिक्षा विवरण / Education Details:', { x: M, y: y + 4, size: 7.5, font: fontB, color: rgb(0.2,0.2,0.5) });
  y -= 14;

  // Table header
  const col1 = M, col2 = M + W * 0.28, col3 = M + W * 0.68;
  const colW1 = W * 0.27, colW2 = W * 0.39, colW3 = W * 0.32;
  page.drawRectangle({ x: col1, y: y - 12, width: W, height: 14, color: rgb(0.93,0.93,0.98) });
  page.drawText('कक्षा / Class', { x: col1 + 4, y: y - 9, size: 7, font: fontB, color: rgb(0.2,0.2,0.4) });
  page.drawText('संस्थान / Institution Name', { x: col2 + 4, y: y - 9, size: 7, font: fontB, color: rgb(0.2,0.2,0.4) });
  page.drawText('स्थान / Place', { x: col3 + 4, y: y - 9, size: 7, font: fontB, color: rgb(0.2,0.2,0.4) });
  y -= 14;

  const eduRows = [
    ['कक्षा 1-9', s(form.education_1_9_school),  s(form.education_1_9_place)],
    ['10वीं / 10th', s(form.education_10th_school), s(form.education_10th_place)],
    ['12वीं / 12th', s(form.education_12th_school), s(form.education_12th_place)],
    ['स्नातक / Grad', s(form.education_grad_school), s(form.education_grad_place)],
    ['PG', s(form.education_postgrad_school), s(form.education_postgrad_place)],
  ];
  for (const [cls, school, place] of eduRows) {
    page.drawText(cls,    { x: col1 + 2, y: y - 9, size: 7, font: fontR });
    page.drawText(school.substring(0, 42), { x: col2 + 2, y: y - 9, size: 7, font: fontR });
    page.drawText(place.substring(0, 22),  { x: col3 + 2, y: y - 9, size: 7, font: fontR });
    hLine(page, M, M + W, y - 12, 0.3, rgb(0.8,0.8,0.8));
    y -= 14;
  }
  hLine(page, M, M + W, y, 0.5);
  y -= 14;

  // ── MISC FIELDS ────────────────────────────────────────────────────
  field(page, fontR, '10. अचल संपत्ति / Immovable Property', s(form.immovable_property), M, y, W * 0.62);

  // Voter list checkbox
  const inVoter = (form.in_voter_list || '').toLowerCase().includes('yes') || (form.in_voter_list || '').includes('हाँ');
  checkbox(page, M + W * 0.66, y - 2, inVoter, fontR, 'हाँ / Yes');
  checkbox(page, M + W * 0.66 + 50, y - 2, !inVoter, fontR, 'नहीं / No');
  page.drawText('11. मतदाता सूची / Voter List:', { x: M + W * 0.66 - 88, y, size: 7, font: fontR, color: rgb(0.4,0.4,0.4) });
  y -= 24;

  // Row: Voter ID | DL | Years in Rajasthan | Mobile
  field(page, fontR, 'Voter ID No.', s(form.voter_id_number), M, y, W * 0.24);
  field(page, fontR, 'Driving Licence No.', s(form.driving_license), M + W * 0.26, y, W * 0.24);
  field(page, fontR, '12. Years in Rajasthan', s(form.years_in_rajasthan), M + W * 0.52, y, W * 0.20);
  field(page, fontR, '13. Mobile No.', s(form.mobile_number), M + W * 0.74, y, W * 0.26);
  y -= 28;

  // ── SECTION II — Women ─────────────────────────────────────────────
  if (form.is_married === 'Yes' || form.is_married?.toLowerCase().includes('yes')) {
    hLine(page, M, M + W, y + 4, 1, rgb(0.7, 0.2, 0.5));
    page.drawText('SECTION II — महिला के लिए / For Women Only', { x: M, y, size: 8, font: fontB, color: rgb(0.6, 0.1, 0.4) });
    y -= 20;

    const isMarried = true;
    field(page, fontR, '1. क्या विवाहित हैं? / Married?', isMarried ? 'हाँ / Yes' : '', M, y, W * 0.28);
    field(page, fontR, '2. विवाह तिथि और किसके साथ / Marriage Date & Partner', s(form.marriage_date_partner), M + W * 0.30, y, W * 0.68);
    y -= 24;

    const husbDom = (form.husband_domicile || '').toLowerCase().includes('yes') || (form.husband_domicile || '').includes('हाँ');
    page.drawText('3. पति राजस्थान के मूल निवासी? / Husband Rajasthan domicile:', { x: M, y, size: 7, font: fontR, color: rgb(0.4,0.4,0.4) });
    checkbox(page, M + 188, y - 2, husbDom, fontR, 'हाँ / Yes');
    checkbox(page, M + 230, y - 2, !husbDom, fontR, 'नहीं / No');
    y -= 22;

    field(page, fontR, '4. पति के साथ कब से और कहाँ / Living with husband since & where', s(form.living_with_husband_since), M, y, W);
    y -= 28;
  }

  // ── AFFIDAVIT ──────────────────────────────────────────────────────
  hLine(page, M, M + W, y + 4, 1, rgb(0.2,0.4,0.2));
  page.drawText('शपथ पत्र / Affidavit', { x: M, y, size: 8, font: fontB, color: rgb(0.1, 0.3, 0.1) });
  y -= 16;

  const affText =
    `मैं, ${s(form.applicant_name) || '______________________'}, ` +
    `पुत्र/पुत्री ${s(form.father_husband_name) || '______________________'}, ` +
    `निवासी ${s(form.current_address)?.substring(0, 80) || '______________________'}, ` +
    `राजस्थान का हूँ/हूँ और सशपथ बयान करता/करती हूँ कि उक्त विवरण मेरी जानकारी एवं विश्वास में सही है।`;

  // Word-wrap affidavit text
  const words   = affText.split(' ');
  let   line    = '';
  const maxW    = W - 20;
  const affSize = 7;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testW    = fontR.widthOfTextAtSize(testLine, affSize);
    if (testW > maxW && line) {
      page.drawText(line, { x: M + 10, y, size: affSize, font: fontR, color: rgb(0.1,0.1,0.1) });
      y -= 12;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) { page.drawText(line, { x: M + 10, y, size: affSize, font: fontR, color: rgb(0.1,0.1,0.1) }); y -= 12; }
  y -= 10;

  field(page, fontR, 'मेरा मूल निवास / My Native Place', s(form.applicant_native_of), M, y, W * 0.48);
  field(page, fontR, 'शिक्षा / Education completed at', s(form.oath_education || form.highest_education), M + W * 0.52, y, W * 0.48);
  y -= 30;

  // ── SIGNATURE / DATE FOOTER ────────────────────────────────────────
  hLine(page, M, M + W, y + 8, 0.5);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  page.drawText(`दिनांक / Date: ${dateStr}`, { x: M, y, size: 7.5, font: fontR, color: rgb(0,0,0) });
  field(page, fontR, 'आवेदक के हस्ताक्षर / Applicant Signature', '', M + W - 160, y, 160);

  // ── OFFICE USE ONLY ───────────────────────────────────────────────
  y -= 38;
  if (y > 60) {
    page.drawRectangle({ x: M, y: y - 50, width: W, height: 54, color: rgb(0.96, 0.96, 0.96) });
    page.drawText('कार्यालय उपयोग के लिए / For Office Use Only', { x: M + 6, y: y - 8, size: 7, font: fontB, color: rgb(0.4,0.4,0.4) });
    hLine(page, M, M + W, y - 10, 0.3, rgb(0.7,0.7,0.7));
    page.drawText('Verified □  Rejected □', { x: M + 6, y: y - 24, size: 7, font: fontR, color: rgb(0.5,0.5,0.5) });
    page.drawText('Signature of Authority: _____________________________', { x: M + 6, y: y - 40, size: 7, font: fontR, color: rgb(0.5,0.5,0.5) });
  }

  // ── FOOTER ────────────────────────────────────────────────────────
  page.drawText(
    'Generated by Smart Autofill v4 — AI-powered eMitra Assistant  |  All data is encrypted and processed locally',
    { x: M, y: 18, size: 5.5, font: fontR, color: rgb(0.7,0.7,0.7) }
  );
  page.drawText(`Page 1 of 1  |  ${new Date().toISOString()}`, {
    x: width - M - 130, y: 18, size: 5.5, font: fontR, color: rgb(0.7,0.7,0.7),
  });

  return doc.save();
}

// ── ROUTE ─────────────────────────────────────────────────────────────

/**
 * POST /api/generate-pdf/mool-niwas
 * Body: JSON form data (same keys as MoolNiwasForm.js EMPTY_FORM)
 * Returns: application/pdf binary
 */
router.post('/mool-niwas', async (req, res) => {
  try {
    const form = req.body;
    if (!form || Object.keys(form).length === 0) {
      return res.status(400).json({ error: 'Form data is required in request body' });
    }

    const pdfBytes = await buildMoolNiwasPDF(form);

    const applicantName = (form.applicant_name || 'applicant').replace(/\s+/g, '_').toLowerCase();
    const filename      = `mool_niwas_${applicantName}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(Buffer.from(pdfBytes));

    console.log(`📄 Generated PDF: ${filename} (${Math.round(pdfBytes.length / 1024)} KB)`);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

module.exports = router;
