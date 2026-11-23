/**
 * utils/pdf.js — read PDFs without any extra native tools.
 *
 *   pdfText(buffer, password?)  text layer of digital PDFs (e-Aadhaar, DigiLocker
 *                               downloads, bills). Supports password-protected PDFs.
 *   pdfImages(buffer)           the scanned page images inside a scanned PDF
 *                               (what scanners / CamScanner / phone apps produce),
 *                               returned as JPEG/PNG buffers ready for OCR.
 *
 * Scanned PDFs almost always contain one JPEG (DCTDecode) or Flate image per
 * page, so pulling those images out is enough to OCR them — no PDF renderer
 * (poppler/ghostscript) needs to be installed on the shop computer.
 */

'use strict';

const zlib = require('zlib');

let PDFJS = null;
function pdfjs() {
  if (!PDFJS) {
    // pdf.js bundled inside the pdf-parse package (already a dependency)
    PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
    PDFJS.disableWorker = true;
  }
  return PDFJS;
}

class PdfPasswordError extends Error {
  constructor(incorrect) {
    super(incorrect ? 'Incorrect PDF password' : 'This PDF is password protected');
    this.code = incorrect ? 'pdf_password_incorrect' : 'pdf_password_required';
  }
}

/**
 * Extract the text layer of a PDF.
 * @returns {Promise<{ text: string, pages: number }>}
 */
async function pdfText(buffer, password) {
  const lib = pdfjs();
  let doc;
  try {
    const params = { data: new Uint8Array(buffer) };
    if (password) params.password = String(password);
    doc = await lib.getDocument(params);
  } catch (err) {
    if (err && (err.name === 'PasswordException' || /password/i.test(err.message || ''))) {
      throw new PdfPasswordError(err.code === 2 || /incorrect/i.test(err.message || ''));
    }
    throw err;
  }
  const pages = doc.numPages;
  const out = [];
  for (let i = 1; i <= Math.min(pages, 20); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    let lastY = null;
    let text = '';
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      else if (text && !text.endsWith(' ')) text += ' ';
      text += item.str;
      lastY = y;
    }
    out.push(text);
  }
  if (doc.destroy) await doc.destroy();
  return { text: out.join('\n\n').replace(/[ \t]+/g, ' ').trim(), pages };
}

// ── Embedded image extraction (pdf-lib) ──────────────────────────────────────

function num(obj) {
  if (!obj) return null;
  if (typeof obj.asNumber === 'function') return obj.asNumber();
  if (typeof obj.value === 'function') return obj.value();
  const n = Number(String(obj));
  return Number.isFinite(n) ? n : null;
}

function filtersOf(dict, lib) {
  const f = dict.lookup(lib.PDFName.of('Filter'));
  if (!f) return [];
  if (f instanceof lib.PDFArray) return f.asArray().map((x) => String(x));
  return [String(f)];
}

function colorInfo(dict, context, lib) {
  let cs = dict.lookup(lib.PDFName.of('ColorSpace'));
  if (!cs) return { channels: 1, kind: 'gray' };
  if (cs instanceof lib.PDFRef) cs = context.lookup(cs);
  if (cs instanceof lib.PDFName) {
    const n = String(cs);
    if (n === '/DeviceRGB' || n === '/CalRGB') return { channels: 3, kind: 'rgb' };
    if (n === '/DeviceCMYK') return { channels: 4, kind: 'cmyk' };
    return { channels: 1, kind: 'gray' };
  }
  if (cs instanceof lib.PDFArray) {
    const arr = cs.asArray();
    const kind = String(arr[0]);
    if (kind === '/ICCBased') {
      const icc = context.lookup(arr[1]);
      const n = icc && icc.dict ? num(icc.dict.lookup(lib.PDFName.of('N'))) : 3;
      return { channels: n || 3, kind: n === 1 ? 'gray' : n === 4 ? 'cmyk' : 'rgb' };
    }
    if (kind === '/Indexed') {
      let base = arr[1];
      if (base instanceof lib.PDFRef) base = context.lookup(base);
      const baseChannels = String(base) === '/DeviceGray' ? 1 : String(base) === '/DeviceCMYK' ? 4 : 3;
      const hival = num(arr[2]);
      let lookup = arr[3];
      if (lookup instanceof lib.PDFRef) lookup = context.lookup(lookup);
      let bytes = null;
      if (lookup instanceof lib.PDFRawStream) bytes = Buffer.from(lib.decodePDFRawStream(lookup).decode());
      else if (lookup && typeof lookup.asBytes === 'function') bytes = Buffer.from(lookup.asBytes());
      return { channels: 1, kind: 'indexed', palette: { bytes, baseChannels, hival } };
    }
    if (kind === '/CalGray') return { channels: 1, kind: 'gray' };
    if (kind === '/CalRGB' || kind === '/Lab') return { channels: 3, kind: 'rgb' };
  }
  return { channels: 1, kind: 'gray' };
}

/** Undo PNG row predictors (DecodeParms /Predictor >= 10). */
function unpredictPng(data, width, colors, bpc) {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((width * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rowLen * rows);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const row = Buffer.from(data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1)));
    for (let i = 0; i < rowLen; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (type === 1) add = left;
      else if (type === 2) add = up;
      else if (type === 3) add = (left + up) >> 1;
      else if (type === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      row[i] = (row[i] + add) & 0xff;
    }
    row.copy(out, r * rowLen);
    prev = row;
  }
  return out;
}

function expandBits(data, width, height, invert) {
  const rowLen = Math.ceil(width / 8);
  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (data[y * rowLen + (x >> 3)] >> (7 - (x & 7))) & 1;
      out[y * width + x] = (bit ? 255 : 0) ^ (invert ? 255 : 0);
    }
  }
  return out;
}

async function rawToPng(pixels, width, height, channels) {
  const sharp = require('sharp');
  if (channels === 4) {
    // CMYK raw → approximate RGB
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
      const k = pixels[i + 3] / 255;
      rgb[j] = 255 * (1 - pixels[i] / 255) * (1 - k);
      rgb[j + 1] = 255 * (1 - pixels[i + 1] / 255) * (1 - k);
      rgb[j + 2] = 255 * (1 - pixels[i + 2] / 255) * (1 - k);
    }
    return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

async function decodeImageStream(stream, context, lib) {
  const dict = stream.dict;
  const width = num(dict.lookup(lib.PDFName.of('Width')));
  const height = num(dict.lookup(lib.PDFName.of('Height')));
  if (!width || !height) return null;
  const filters = filtersOf(dict, lib);
  let data = Buffer.from(stream.contents);

  // JPEG (possibly wrapped in Flate)
  if (filters.includes('/DCTDecode')) {
    if (filters[0] === '/FlateDecode') data = zlib.inflateSync(data);
    return { buffer: data, width, height, format: 'jpeg' };
  }
  if (filters.some((f) => ['/JPXDecode', '/JBIG2Decode', '/CCITTFaxDecode'].includes(f))) {
    return { unsupported: filters.join(','), width, height };
  }
  // Flate / LZW / none → raw pixels
  try {
    data = filters.length ? Buffer.from(lib.decodePDFRawStream(stream).decode()) : data;
  } catch {
    return { unsupported: filters.join(',') || 'raw', width, height };
  }
  const isMask = String(dict.lookup(lib.PDFName.of('ImageMask')) || '') === 'true';
  const bpc = isMask ? 1 : (num(dict.lookup(lib.PDFName.of('BitsPerComponent'))) || 8);
  const color = isMask ? { channels: 1, kind: 'gray' } : colorInfo(dict, context, lib);

  let parms = dict.lookup(lib.PDFName.of('DecodeParms'));
  if (parms instanceof lib.PDFArray) parms = parms.asArray().find((p) => p instanceof lib.PDFDict);
  const predictor = parms instanceof lib.PDFDict ? num(parms.lookup(lib.PDFName.of('Predictor'))) : null;
  if (predictor && predictor >= 10) data = unpredictPng(data, width, color.channels, bpc);

  const decode = dict.lookup(lib.PDFName.of('Decode'));
  const invertDecode = decode instanceof lib.PDFArray && num(decode.asArray()[0]) === 1;

  if (bpc === 1 && color.channels === 1) {
    const px = expandBits(data, width, height, isMask ? !invertDecode : invertDecode);
    return { buffer: await rawToPng(px, width, height, 1), width, height, format: 'png' };
  }
  if (bpc !== 8) return { unsupported: `bpc=${bpc}`, width, height };

  if (color.kind === 'indexed' && color.palette && color.palette.bytes) {
    const { bytes, baseChannels } = color.palette;
    const out = Buffer.alloc(width * height * baseChannels);
    for (let i = 0; i < width * height; i++) {
      bytes.copy(out, i * baseChannels, data[i] * baseChannels, data[i] * baseChannels + baseChannels);
    }
    return { buffer: await rawToPng(out, width, height, baseChannels), width, height, format: 'png' };
  }
  const expected = width * height * color.channels;
  if (data.length < expected) return { unsupported: 'short-data', width, height };
  return { buffer: await rawToPng(data.subarray(0, expected), width, height, color.channels), width, height, format: 'png' };
}

function collectImageStreams(resources, context, lib, seen, out, depth = 0) {
  if (!resources || depth > 3) return;
  const xobjs = resources.lookup(lib.PDFName.of('XObject'), lib.PDFDict);
  if (!xobjs) return;
  for (const [, ref] of xobjs.entries()) {
    const key = String(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const obj = ref instanceof lib.PDFRef ? context.lookup(ref) : ref;
    if (!obj || !obj.dict) continue;
    const subtype = String(obj.dict.lookup(lib.PDFName.of('Subtype')) || '');
    if (subtype === '/Image' && obj instanceof lib.PDFRawStream) out.push(obj);
    else if (subtype === '/Form') {
      const inner = obj.dict.lookup(lib.PDFName.of('Resources'), lib.PDFDict);
      collectImageStreams(inner, context, lib, seen, out, depth + 1);
    }
  }
}

/**
 * Pull scanned page images out of a PDF. Returns the largest image of each
 * page (max `maxPages`), ignoring small logos/stamps.
 * @returns {Promise<{ images: Buffer[], unsupported: string[], pages: number }>}
 */
async function pdfImages(buffer, { maxPages = 10, minPixels = 120000 } = {}) {
  const lib = require('pdf-lib');
  const pdf = await lib.PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const pages = pdf.getPages();
  const images = [];
  const unsupported = [];
  for (const page of pages.slice(0, maxPages)) {
    const streams = [];
    collectImageStreams(page.node.Resources(), pdf.context, lib, new Set(), streams);
    let best = null;
    for (const s of streams) {
      const w = num(s.dict.lookup(lib.PDFName.of('Width'))) || 0;
      const h = num(s.dict.lookup(lib.PDFName.of('Height'))) || 0;
      if (w * h < minPixels) continue;
      if (!best || w * h > best.area) best = { stream: s, area: w * h };
    }
    if (!best) continue;
    try {
      const decoded = await decodeImageStream(best.stream, pdf.context, lib);
      if (decoded && decoded.buffer) images.push(decoded.buffer);
      else if (decoded && decoded.unsupported) unsupported.push(decoded.unsupported);
    } catch (err) {
      unsupported.push(err.message);
    }
  }
  return { images, unsupported, pages: pages.length };
}

module.exports = { pdfText, pdfImages, PdfPasswordError, _internal: { unpredictPng, expandBits } };
