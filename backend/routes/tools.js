/**
 * routes/tools.js — document compressor / converter / photo resizer.
 * Mounted at /api/tools (operator login required). Files are processed in
 * memory and returned immediately; nothing is stored.
 */

'use strict';

const express = require('express');
const { sniffKind } = require('../services/documentPipeline');
const T = require('../services/docTools');
const { pdfImages } = require('../utils/pdf');
const { wrap, uploadFiles, uploadSingle } = require('../middleware');

const router = express.Router();

function sendFile(res, buffer, mime, name, extra = {}) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('X-Result-Size', String(buffer.length));
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, String(v));
  res.setHeader('Access-Control-Expose-Headers', 'X-Result-Size, X-Over-Limit, X-Pages, Content-Disposition');
  res.send(buffer);
}

function baseName(name) {
  return String(name || 'document').replace(/\.[^.]+$/, '').replace(/[^\w\-ऀ-ॿ]+/g, '_').slice(0, 40) || 'document';
}

router.post('/compress', uploadFiles('files'), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files received' });
  const maxKb = Math.min(Math.max(parseInt(req.body.max_kb, 10) || 200, 10), 10000);
  const grayscale = req.body.grayscale === 'true' || req.body.grayscale === true;
  const output = req.body.output === 'jpg' ? 'jpg' : 'pdf';

  const kinds = files.map((f) => sniffKind(f.buffer));
  if (kinds.some((k) => !k)) return res.status(400).json({ error: 'Only JPG, PNG, WEBP, BMP, TIFF images and PDF files are supported' });

  if (output === 'jpg') {
    if (files.length !== 1 || kinds[0] !== 'image') return res.status(400).json({ error: 'For JPG output, upload exactly one image' });
    const r = await T.compressImage(files[0].buffer, { maxKb, grayscale, maxWidth: parseInt(req.body.max_width, 10) || 2000 });
    return sendFile(res, r.buffer, 'image/jpeg', `${baseName(files[0].originalname)}_${Math.round(r.size / 1024)}kb.jpg`, { 'X-Over-Limit': r.over_limit ? 1 : 0 });
  }

  if (files.length === 1 && kinds[0] === 'pdf') {
    const r = await T.compressPdf(files[0].buffer, { maxKb, grayscale });
    return sendFile(res, r.buffer, 'application/pdf', `${baseName(files[0].originalname)}_${Math.round(r.size / 1024)}kb.pdf`, { 'X-Over-Limit': r.over_limit ? 1 : 0, 'X-Pages': r.pages || '' });
  }

  // several files (images and/or scanned PDFs) → one PDF
  const images = [];
  for (let i = 0; i < files.length; i++) {
    if (kinds[i] === 'image') images.push(files[i].buffer);
    else {
      const { images: pdfImgs } = await pdfImages(files[i].buffer, { maxPages: 20, minPixels: 40000 });
      if (!pdfImgs.length) return res.status(422).json({ error: `"${files[i].originalname}" is a digital PDF and cannot be merged as an image.` });
      images.push(...pdfImgs);
    }
  }
  const r = await T.imagesToPdf(images, { maxKb, grayscale });
  return sendFile(res, r.buffer, 'application/pdf', `${baseName(files[0].originalname)}_merged_${Math.round(r.size / 1024)}kb.pdf`, { 'X-Over-Limit': r.over_limit ? 1 : 0, 'X-Pages': r.pages });
}));

router.post('/resize', uploadSingle('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (sniffKind(req.file.buffer) !== 'image') return res.status(400).json({ error: 'Upload an image (JPG / PNG)' });
  const r = await T.resizeExact(req.file.buffer, {
    width: req.body.width, height: req.body.height,
    maxKb: Math.min(Math.max(parseInt(req.body.max_kb, 10) || 50, 5), 5000),
    fit: req.body.fit, grayscale: req.body.grayscale === 'true',
  });
  return sendFile(res, r.buffer, 'image/jpeg', `${baseName(req.file.originalname)}_${r.width}x${r.height}_${Math.round(r.size / 1024)}kb.jpg`, { 'X-Over-Limit': r.over_limit ? 1 : 0 });
}));

module.exports = router;
