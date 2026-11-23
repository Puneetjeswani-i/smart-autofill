/**
 * utils/ocr.js — text extraction from images and PDFs (Tesseract.js v5).
 *
 * Improvements over v5:
 *   - one Tesseract worker is created once and reused (was: a new worker for
 *     every document, which costs several seconds each time)
 *   - English + Hindi by default (Aadhaar, voter ID, marksheets are bilingual);
 *     falls back to English only if Hindi data cannot be loaded (offline)
 *   - images are cleaned first: EXIF rotation, resize to OCR-friendly size,
 *     greyscale, contrast stretch
 *   - sideways/upside-down photos are retried at 90/270/180 degrees
 *   - scanned PDFs are OCR'd page by page (images pulled out of the PDF)
 *   - password-protected PDFs (e-Aadhaar) can be opened with a password
 *
 * Language data (.traineddata) is cached in backend/ocr-data/ so the shop can
 * work offline after the first download (`npm run ocr:download`).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { pdfText, pdfImages, PdfPasswordError } = require('./pdf');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional */ }

const IDLE_MS = 10 * 60 * 1000;
const FAILED_RETRY_MS = 30 * 60 * 1000;

let workerPromise = null;
let workerLangs = null;
let idleTimer = null;
let queue = Promise.resolve();
const failedLangs = new Map(); // langs → timestamp of failure

function migrateLegacyTraineddata() {
  try {
    if (!fs.existsSync(config.ocrDataDir)) fs.mkdirSync(config.ocrDataDir, { recursive: true });
    const legacy = path.join(config.backendRoot, 'eng.traineddata');
    const target = path.join(config.ocrDataDir, 'eng.traineddata');
    if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.copyFileSync(legacy, target);
  } catch (err) {
    console.warn('[ocr] could not prepare language data folder:', err.message);
  }
}

function availableLanguages() {
  try {
    return fs.readdirSync(config.ocrDataDir).filter((f) => f.endsWith('.traineddata')).map((f) => f.replace('.traineddata', ''));
  } catch { return []; }
}

async function createWorkerFor(langs) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker(langs, 1, {
    cachePath: config.ocrDataDir,
    logger: () => {},
    errorHandler: () => {},
  });
  await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  return worker;
}

function effectiveLangs(requested) {
  const failedAt = failedLangs.get(requested);
  if (failedAt && Date.now() - failedAt < FAILED_RETRY_MS) return 'eng';
  return requested;
}

async function getWorker(requested) {
  const langs = effectiveLangs(requested || 'eng');
  if (workerPromise && workerLangs === langs) return workerPromise;
  if (workerPromise) {
    const old = await workerPromise.catch(() => null);
    if (old) await old.terminate().catch(() => {});
  }
  workerLangs = langs;
  workerPromise = createWorkerFor(langs).catch((err) => {
    if (langs !== 'eng') {
      console.warn(`[ocr] could not load "${langs}" (${err.message || err}); using English only`);
      failedLangs.set(langs, Date.now());
      workerLangs = 'eng';
      return createWorkerFor('eng');
    }
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

function scheduleIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { shutdown().catch(() => {}); }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

async function shutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  workerLangs = null;
  if (w) await w.terminate().catch(() => {});
}

/** Run jobs one at a time on the shared worker. */
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function recognize(buffer, langs) {
  return enqueue(async () => {
    const worker = await getWorker(langs);
    const { data } = await worker.recognize(buffer);
    scheduleIdleShutdown();
    return { text: (data.text || '').trim(), confidence: Math.round(data.confidence || 0), langs: workerLangs };
  });
}

// ── Image preparation ────────────────────────────────────────────────────────

async function prepareImage(buffer) {
  if (!sharp) return buffer;
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const swap = meta.orientation && meta.orientation >= 5;
    const w = swap ? meta.height : meta.width;
    const h = swap ? meta.width : meta.height;
    const longSide = Math.max(w || 0, h || 0);
    let resize = null;
    if (longSide && longSide < 1800) resize = Math.min(longSide * 3, 2200) / longSide;
    else if (longSide > 3200) resize = 3000 / longSide;
    let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
    if (resize && w && h) pipeline = pipeline.resize(Math.round(w * resize), Math.round(h * resize), { fit: 'fill' });
    return await pipeline.flatten({ background: '#ffffff' }).grayscale().normalize().sharpen({ sigma: 0.8 }).png().toBuffer();
  } catch (err) {
    console.warn('[ocr] image preparation failed, using original:', err.message);
    return buffer;
  }
}

function textScore(r) {
  const alnum = (r.text.match(/[A-Za-z0-9ऀ-ॿ]/g) || []).length;
  return (r.confidence || 1) * Math.log(1 + alnum);
}

function needsRotationRetry(r) {
  const alnum = (r.text.match(/[A-Za-z0-9ऀ-ॿ]/g) || []).length;
  return r.confidence < 50 || alnum < 40;
}

async function ocrImage(buffer, { langs = 'eng+hin', tryRotations = true } = {}) {
  const prepared = await prepareImage(buffer);
  let best = await recognize(prepared, langs);
  if (tryRotations && sharp && needsRotationRetry(best)) {
    for (const angle of [90, 270, 180]) {
      const rotated = await sharp(prepared).rotate(angle).png().toBuffer();
      const r = await recognize(rotated, langs);
      if (textScore(r) > textScore(best) * 1.15) best = { ...r, rotated: angle };
      if (!needsRotationRetry(best)) break;
    }
  }
  return best;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract text from an uploaded file.
 * @param {{ buffer: Buffer, kind: 'image'|'pdf', password?: string, langs?: string }} input
 * @returns {Promise<{ text, method, confidence, pages, langs, rotated?, warnings: string[] }>}
 */
async function extractText({ buffer, kind, password, langs = 'eng+hin' }) {
  const warnings = [];
  if (kind === 'pdf') {
    let textRes = null;
    try {
      textRes = await pdfText(buffer, password);
    } catch (err) {
      if (err instanceof PdfPasswordError) throw err;
      warnings.push('pdf_text_failed');
    }
    const meaningful = ((textRes && textRes.text) || '').replace(/\s/g, '').length;
    if (meaningful >= 60) {
      return { text: textRes.text, method: 'pdf-text', confidence: 95, pages: textRes.pages, langs: null, warnings };
    }
    let imgs;
    try {
      imgs = await pdfImages(buffer);
    } catch (err) {
      warnings.push('pdf_images_failed');
      return { text: (textRes && textRes.text) || '', method: 'pdf-text', confidence: 0, pages: (textRes && textRes.pages) || 0, langs: null, warnings };
    }
    if (!imgs.images.length) {
      warnings.push(imgs.unsupported.length ? 'pdf_image_format_unsupported' : 'pdf_no_text');
      return { text: (textRes && textRes.text) || '', method: 'pdf-text', confidence: 0, pages: imgs.pages, langs: null, warnings };
    }
    const parts = [];
    for (const img of imgs.images.slice(0, 5)) parts.push(await ocrImage(img, { langs }));
    if (imgs.images.length > 5) warnings.push('pdf_pages_truncated');
    const conf = Math.round(parts.reduce((s, p) => s + p.confidence, 0) / parts.length);
    return {
      text: parts.map((p) => p.text).join('\n\n'),
      method: 'pdf-ocr', confidence: conf, pages: imgs.pages, langs: parts[0].langs, warnings,
    };
  }
  const r = await ocrImage(buffer, { langs });
  return { text: r.text, method: 'ocr', confidence: r.confidence, pages: 1, langs: r.langs, rotated: r.rotated || 0, warnings };
}

/** Download language data now (used by `npm run ocr:download` and setup). */
async function preloadLanguages(langs = 'eng+hin') {
  migrateLegacyTraineddata();
  const worker = await createWorkerFor(langs);
  await worker.terminate();
  return availableLanguages();
}

module.exports = {
  extractText, ocrImage, prepareImage, shutdown, preloadLanguages,
  migrateLegacyTraineddata, availableLanguages, PdfPasswordError,
};
