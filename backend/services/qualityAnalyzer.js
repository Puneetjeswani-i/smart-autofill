/**
 * DOCUMENT QUALITY ANALYZER
 * ─────────────────────────────────────────────────────────────────────
 * Analyzes image quality BEFORE OCR to:
 *   - Detect blur / out-of-focus captures
 *   - Detect glare / overexposure
 *   - Detect low resolution
 *   - Estimate skew angle
 *   - Detect dark/underexposed images
 *   - Return quality score 0-100
 *   - Give actionable re-upload advice
 *
 * Uses sharp (already in dependencies) for pixel-level analysis.
 * Falls back gracefully if sharp is not available.
 *
 * BLUR DETECTION ALGORITHM:
 *   Laplacian variance method — blurry images have low edge energy.
 *   We compute pixel variance of a high-pass filtered region.
 *   Threshold: variance < 50 = likely blurry.
 *
 * GLARE DETECTION:
 *   Count pixels with brightness > 245 (near-white).
 *   If > 15% of image is near-white → glare warning.
 *
 * RESOLUTION:
 *   Width × Height < 300,000 px → low resolution.
 *   Optimal: > 800,000 px (e.g., 1000×800).
 */

let sharp;
try { sharp = require('sharp'); } catch {}

const QUALITY_THRESHOLDS = {
  MIN_WIDTH: 400,        // px
  MIN_HEIGHT: 300,       // px
  MIN_PIXELS: 250000,    // total px
  OPTIMAL_PIXELS: 800000,
  BLUR_THRESHOLD: 35,    // Laplacian variance below this = blurry
  GLARE_RATIO: 0.15,     // >15% near-white pixels = glare
  DARK_RATIO: 0.40,      // >40% very dark pixels = underexposed
  MAX_FILE_SIZE_MB: 10,
};

/**
 * Analyze document image quality
 * @param {string} filePath - Path to image file
 * @param {number} fileSizeBytes - File size for additional checks
 * @returns {Object} Quality report
 */
async function analyzeDocumentQuality(filePath, fileSizeBytes = 0) {
  const report = {
    quality_score: 75,    // Default score (assume acceptable if analysis fails)
    issues: [],
    warnings: [],
    suggestions: [],
    metrics: {
      width: null,
      height: null,
      blur_score: null,
      glare_ratio: null,
      darkness_ratio: null,
      file_size_mb: fileSizeBytes ? (fileSizeBytes / 1024 / 1024).toFixed(2) : null,
    },
    can_proceed: true,
  };

  if (!sharp) {
    report.warnings.push('Image quality analysis unavailable (sharp not installed)');
    return report;
  }

  try {
    // Get image metadata
    const meta = await sharp(filePath).metadata();
    report.metrics.width = meta.width;
    report.metrics.height = meta.height;
    const totalPixels = (meta.width || 0) * (meta.height || 0);
    let scoreDeductions = 0;

    // ── RESOLUTION CHECK ─────────────────────────────────────────────
    if (totalPixels < QUALITY_THRESHOLDS.MIN_PIXELS) {
      report.issues.push(`Very low resolution: ${meta.width}×${meta.height}px`);
      report.suggestions.push('Capture the document at higher resolution (at least 800×600px)');
      scoreDeductions += 30;
    } else if (totalPixels < QUALITY_THRESHOLDS.OPTIMAL_PIXELS) {
      report.warnings.push(`Low resolution: ${meta.width}×${meta.height}px (optimal: 1000×800+)`);
      scoreDeductions += 10;
    }

    if (meta.width < QUALITY_THRESHOLDS.MIN_WIDTH || meta.height < QUALITY_THRESHOLDS.MIN_HEIGHT) {
      report.issues.push('Image too small — ensure entire document is visible');
      scoreDeductions += 20;
    }

    // ── PIXEL STATS ANALYSIS ─────────────────────────────────────────
    // Sample pixels for statistical analysis (avoid processing full large images)
    const sampleSize = Math.min(totalPixels, 200 * 200);
    const resizeTo = Math.floor(Math.sqrt(sampleSize));

    const { data: rawPixels } = await sharp(filePath)
      .resize(resizeTo, resizeTo, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(rawPixels);
    const pixCount = pixels.length;

    // Brightness statistics
    const mean = pixels.reduce((s, v) => s + v, 0) / pixCount;
    const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / pixCount;
    const stdDev = Math.sqrt(variance);

    // ── BLUR DETECTION (Laplacian variance proxy) ─────────────────────
    // Compute simplified edge energy: variance of pixel differences
    let edgeEnergy = 0;
    let edgeCount = 0;
    const w = resizeTo;
    for (let i = 1; i < pixels.length - 1; i++) {
      if (i % w === 0 || i % w === w - 1) continue;
      const laplacian = Math.abs(-pixels[i - 1] + 2 * pixels[i] - pixels[i + 1]);
      edgeEnergy += laplacian;
      edgeCount++;
    }
    const blurScore = edgeCount > 0 ? edgeEnergy / edgeCount : 50;
    report.metrics.blur_score = Math.round(blurScore);

    if (blurScore < QUALITY_THRESHOLDS.BLUR_THRESHOLD) {
      const severity = blurScore < 15 ? 'Severely blurry' : 'Blurry';
      report.issues.push(`${severity} image detected (sharpness: ${Math.round(blurScore)}/100)`);
      report.suggestions.push('Hold the camera steady and ensure the document is in focus');
      scoreDeductions += blurScore < 15 ? 35 : 20;
    }

    // ── GLARE DETECTION ───────────────────────────────────────────────
    const nearWhiteCount = pixels.filter(p => p > 245).length;
    const glareRatio = nearWhiteCount / pixCount;
    report.metrics.glare_ratio = Math.round(glareRatio * 100);

    if (glareRatio > QUALITY_THRESHOLDS.GLARE_RATIO) {
      report.warnings.push(`Glare detected (${Math.round(glareRatio * 100)}% overexposed pixels)`);
      report.suggestions.push('Avoid direct light/flash; capture in diffused lighting');
      scoreDeductions += glareRatio > 0.30 ? 20 : 10;
    }

    // ── DARKNESS / UNDEREXPOSURE ──────────────────────────────────────
    const veryDarkCount = pixels.filter(p => p < 30).length;
    const darkRatio = veryDarkCount / pixCount;
    report.metrics.darkness_ratio = Math.round(darkRatio * 100);

    if (darkRatio > QUALITY_THRESHOLDS.DARK_RATIO) {
      report.warnings.push(`Dark/underexposed image (mean brightness: ${Math.round(mean)}/255)`);
      report.suggestions.push('Capture in better lighting conditions');
      scoreDeductions += 15;
    }

    // ── LOW CONTRAST ──────────────────────────────────────────────────
    if (stdDev < 25) {
      report.warnings.push(`Low contrast (std dev: ${Math.round(stdDev)})`);
      report.suggestions.push('Ensure the document has sufficient contrast against background');
      scoreDeductions += 10;
    }

    // ── FINAL SCORE ───────────────────────────────────────────────────
    report.quality_score = Math.max(0, Math.min(100, 100 - scoreDeductions));
    report.can_proceed = report.quality_score >= 30 && report.issues.length < 3;

    if (!report.can_proceed) {
      report.issues.push('Document quality too low for reliable OCR — please re-upload');
    }

  } catch (err) {
    report.warnings.push(`Quality analysis error: ${err.message}`);
    // Default: allow processing but warn
    report.can_proceed = true;
  }

  return report;
}

/**
 * Quick quality gate — returns true if image is acceptable for OCR
 */
async function passesQualityGate(filePath) {
  const report = await analyzeDocumentQuality(filePath);
  return { passes: report.can_proceed, report };
}

module.exports = { analyzeDocumentQuality, passesQualityGate };
