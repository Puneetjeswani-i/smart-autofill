/**
 * Download OCR language data (English + Hindi) once, so the shop can scan
 * documents without internet afterwards.   npm run ocr:download
 */

'use strict';

const { ensureDirs, config } = require('../config');
const { preloadLanguages } = require('../utils/ocr');

(async () => {
  ensureDirs();
  console.log(`Downloading OCR language data into ${config.ocrDataDir} ...`);
  try {
    const langs = await preloadLanguages('eng+hin');
    console.log(`Done. Installed: ${langs.join(', ')}`);
    process.exit(0);
  } catch (err) {
    console.error(`Could not download language data: ${err.message || err}`);
    console.error('Check the internet connection and run "npm run ocr:download" again.');
    process.exit(1);
  }
})();
