/**
 * services/docTools.js — make documents fit portal upload limits.
 *
 * Every eMitra operator needs this many times a day: "photo must be under
 * 50 KB", "document must be a PDF under 200 KB", "merge front and back".
 * Everything runs locally with sharp + pdf-lib (no website upload).
 */

'use strict';

const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { pdfImages } = require('../utils/pdf');

const A4 = { w: 595.28, h: 841.89 };

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Re-encode an image as JPEG no larger than maxKb (binary search on quality,
 * then shrink dimensions if needed).
 */
async function compressImage(buffer, { maxKb = 200, maxWidth = 2000, grayscale = false, minQuality = 30 } = {}) {
  const target = Math.max(5, maxKb) * 1024;
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  let width = Math.min(meta.width || maxWidth, maxWidth);
  let attempt = 0;
  let best = null;
  while (attempt < 8) {
    attempt += 1;
    const render = (q) => {
      let p = sharp(buffer, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true }).flatten({ background: '#ffffff' });
      if (grayscale) p = p.grayscale();
      return p.jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
    };
    let lo = minQuality;
    let hi = 92;
    let found = null;
    while (lo <= hi) {
      const q = Math.floor((lo + hi) / 2);
      const out = await render(q);
      if (out.length <= target) { found = { buffer: out, quality: q }; lo = q + 1; } else hi = q - 1;
    }
    if (found) { best = { ...found, width }; break; }
    width = Math.round(width * 0.75);
    if (width < 200) break;
  }
  if (!best) {
    const out = await sharp(buffer, { failOn: 'none' }).rotate().resize({ width: 200 }).jpeg({ quality: minQuality }).toBuffer();
    best = { buffer: out, quality: minQuality, width: 200, over_limit: out.length > target };
  }
  const outMeta = await sharp(best.buffer).metadata();
  return { buffer: best.buffer, size: best.buffer.length, quality: best.quality, width: outMeta.width, height: outMeta.height, over_limit: !!best.over_limit };
}

/** Combine images into one PDF (one image per A4 page) under maxKb in total. */
async function imagesToPdf(buffers, { maxKb = 300, grayscale = false } = {}) {
  const n = buffers.length;
  if (!n) throw Object.assign(new Error('No images given'), { status: 400 });
  const overheadKb = 2 + n;
  let perImageKb = Math.max(8, Math.floor((maxKb - overheadKb) / n));
  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const pdf = await PDFDocument.create();
    for (const b of buffers) {
      const img = await compressImage(b, { maxKb: perImageKb, maxWidth: 1700, grayscale });
      const jpg = await pdf.embedJpg(img.buffer);
      const scale = Math.min((A4.w - 40) / jpg.width, (A4.h - 40) / jpg.height, 1.5);
      const w = jpg.width * scale;
      const h = jpg.height * scale;
      const page = pdf.addPage([A4.w, A4.h]);
      page.drawImage(jpg, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
    }
    const bytes = Buffer.from(await pdf.save({ useObjectStreams: true }));
    result = { buffer: bytes, size: bytes.length, pages: n, over_limit: bytes.length > maxKb * 1024 };
    if (!result.over_limit) break;
    perImageKb = Math.max(6, Math.floor(perImageKb * 0.7));
  }
  return result;
}

/** Shrink a scanned PDF by recompressing its page images. */
async function compressPdf(buffer, { maxKb = 300, grayscale = false } = {}) {
  if (buffer.length <= maxKb * 1024 && !grayscale) {
    return { buffer, size: buffer.length, unchanged: true };
  }
  const { images } = await pdfImages(buffer, { maxPages: 20, minPixels: 40000 });
  if (!images.length) {
    throw Object.assign(new Error('This PDF has no scanned images to compress (it is a digital PDF). Print it to PDF or take a photo instead.'), { status: 422, code: 'digital_pdf' });
  }
  return imagesToPdf(images, { maxKb, grayscale });
}

/**
 * Passport photo / signature: exact pixel size, cropped to fill, under maxKb.
 */
async function resizeExact(buffer, { width = 350, height = 450, maxKb = 50, fit = 'cover', background = '#ffffff', grayscale = false } = {}) {
  const w = clamp(parseInt(width, 10) || 350, 20, 3000);
  const h = clamp(parseInt(height, 10) || 450, 20, 3000);
  const base = await sharp(buffer, { failOn: 'none' }).rotate()
    .resize(w, h, { fit: fit === 'contain' ? 'contain' : 'cover', position: 'attention', background })
    .flatten({ background })
    .png().toBuffer();
  const out = await compressImage(base, { maxKb, maxWidth: w, grayscale, minQuality: 20 });
  return out;
}

module.exports = { compressImage, imagesToPdf, compressPdf, resizeExact };
