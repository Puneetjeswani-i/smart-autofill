'use strict';

/**
 * OCR tests on generated images / scanned PDFs (fake data).
 * Skipped automatically when the OCR language data is not downloaded yet
 * (run `npm run ocr:download` once).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.OCR_DATA_DIR = process.env.OCR_DATA_DIR || path.join(__dirname, '..', 'ocr-data');
const hasData = fs.existsSync(path.join(process.env.OCR_DATA_DIR, 'eng.traineddata'));

const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { extractText, shutdown } = require('../utils/ocr');
const { pdfImages } = require('../utils/pdf');

async function textImage(lines) {
  const rows = lines.map((l, i) => `<text x="40" y="${80 + i * 56}" font-family="Arial" font-size="36" fill="#000">${l}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${120 + lines.length * 56}"><rect width="100%" height="100%" fill="#fff"/>${rows}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const LINES = ['Jaipur Vidyut Vitran Nigam Ltd', 'Name: Test Customer', 'Address: 45 Gandhi Nagar Bassi Jaipur 303301', 'Bill Date: 05/06/2012'];

async function pdfWith(embed) {
  const pdf = await PDFDocument.create();
  const png = await textImage(LINES);
  const img = embed === 'jpg' ? await pdf.embedJpg(await sharp(png).jpeg({ quality: 85 }).toBuffer()) : await pdf.embedPng(png);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return Buffer.from(await pdf.save());
}

test.after(async () => { await shutdown(); });

test('page images are pulled out of scanned PDFs (JPEG and Flate+predictor)', async () => {
  for (const kind of ['jpg', 'png']) {
    const { images, unsupported } = await pdfImages(await pdfWith(kind));
    assert.equal(images.length, 1, `${kind}: one page image`);
    assert.equal(unsupported.length, 0);
    const meta = await sharp(images[0]).metadata();
    assert.ok(meta.width > 1000, `${kind}: full-size image recovered`);
  }
});

test('OCR reads a photo of a document', { skip: !hasData && 'OCR data not downloaded' }, async () => {
  const r = await extractText({ buffer: await textImage(LINES), kind: 'image', langs: 'eng' });
  assert.equal(r.method, 'ocr');
  assert.match(r.text, /Gandhi Nagar/i);
  assert.match(r.text, /303301/);
});

test('OCR reads scanned PDFs (JPEG page and PNG page)', { skip: !hasData && 'OCR data not downloaded' }, async () => {
  for (const kind of ['jpg', 'png']) {
    const r = await extractText({ buffer: await pdfWith(kind), kind: 'pdf', langs: 'eng' });
    assert.equal(r.method, 'pdf-ocr', `${kind}: scanned path used`);
    assert.match(r.text, /Gandhi Nagar/i, `${kind}: text read`);
  }
});

test('digital PDF text is read without OCR', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont('Helvetica');
  const page = pdf.addPage([595, 842]);
  LINES.forEach((l, i) => page.drawText(l, { x: 40, y: 780 - i * 20, size: 12, font }));
  const r = await extractText({ buffer: Buffer.from(await pdf.save()), kind: 'pdf' });
  assert.equal(r.method, 'pdf-text');
  assert.match(r.text, /Bill Date: 05\/06\/2012/);
});
