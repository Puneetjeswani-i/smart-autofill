/**
 * ADDRESS NORMALIZATION & MATCHING ENGINE
 * ─────────────────────────────────────────────────────────────────────
 * Solves the core problem: Indian addresses appear in wildly different
 * formats across documents due to OCR artifacts and manual entry styles.
 *
 * Example:
 *   "123 Nyagaon Jaipur"
 *   "H.No 123, Nyagaon, Jaipur Rajasthan 302001"
 *   → Should be SAME address, similarity > 0.80
 *
 * MULTI-METRIC APPROACH (weighted ensemble):
 *   1. Jaccard similarity   (token set overlap)        weight: 0.35
 *   2. Cosine similarity    (TF-IDF token vectors)     weight: 0.25
 *   3. Levenshtein ratio    (character edit distance)  weight: 0.20
 *   4. PIN code match       (exact 6-digit match)      weight: 0.15
 *   5. City/district match  (Rajasthan geo lookup)     weight: 0.05
 *
 * WHY ENSEMBLE: No single metric handles all cases.
 *   - Jaccard handles word reordering ("Jaipur Nagar" vs "Nagar Jaipur")
 *   - Levenshtein handles OCR typos ("Shantinagrr" vs "Shantinagar")
 *   - PIN match is a hard anchor point
 *   - Cosine handles partial address subsets
 */

// ── ABBREVIATION DICTIONARY ───────────────────────────────────────────
const ABBREV_MAP = {
  // Directions
  'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
  // Road types
  'rd': 'road', 'st': 'street', 'ave': 'avenue', 'blvd': 'boulevard',
  'ln': 'lane', 'dr': 'drive', 'ct': 'court', 'pl': 'place',
  'marg': 'road', 'path': 'road',
  // House/building
  'h.no': 'house number', 'hno': 'house number', 'h/no': 'house number',
  'flat': 'flat', 'f/no': 'flat number', 'apt': 'apartment',
  'bldg': 'building', 'blk': 'block', 'flr': 'floor',
  'qtr': 'quarter', 'qtrs': 'quarters',
  // Area types  
  'nagar': 'nagar', 'ng': 'nagar',
  'colony': 'colony', 'col': 'colony', 'cly': 'colony',
  'vihar': 'vihar',
  'enclave': 'enclave', 'encl': 'enclave',
  'ext': 'extension', 'extn': 'extension',
  // Locations
  'rj': 'rajasthan', 'raj': 'rajasthan',
  'del': 'delhi', 'mh': 'maharashtra', 'mp': 'madhya pradesh',
  'up': 'uttar pradesh', 'hr': 'haryana', 'pb': 'punjab',
  'gj': 'gujarat', 'ka': 'karnataka', 'tn': 'tamil nadu',
  // Administrative
  'dist': 'district', 'distt': 'district',
  'teh': 'tehsil', 'tehsil': 'tehsil',
  'vill': 'village', 'vil': 'village', 'vpo': 'village post office',
  'po': 'post office', 'ps': 'police station',
  'near': 'near', 'opp': 'opposite', 'adj': 'adjacent',
  'sec': 'sector', 'ph': 'phase',
  'soc': 'society',
};

// ── STOP WORDS (ignored in matching) ─────────────────────────────────
const STOP_WORDS = new Set([
  'the','and','of','in','at','near','behind','opposite','beside','adjacent',
  'house','flat','plot','no','number','india','pin','code','pincode',
  'dist','district','tehsil','village','town','city','state',
  'w/o','s/o','d/o','c/o','r/o','h/no','vpo','po','ps','ward',
  'main','old','new','upper','lower','north','south','east','west',
  'first','second','third','floor','ground',
]);

// ── RAJASTHAN GEO INDEX ───────────────────────────────────────────────
const RAJ_DISTRICTS = new Set([
  'jaipur','jodhpur','udaipur','kota','bikaner','ajmer','alwar','bharatpur',
  'sikar','pali','barmer','churu','jhunjhunu','nagaur','tonk','bundi','baran',
  'jhalawar','karauli','dholpur','ganganagar','hanumangarh','dausa',
  'sawai madhopur','dungarpur','banswara','pratapgarh','jaisalmer','jalore',
  'sirohi','rajsamand','bhilwara','chittorgarh','sri ganganagar',
]);

const RAJ_LOCALITIES = new Set([
  'vaishali nagar','mansarovar','malviya nagar','jagatpura','sanganer',
  'shastri nagar','lal kothi','c scheme','bajaj nagar','shyam nagar',
  'tonk road','ajmer road','sikar road','delhi road','agra road',
  'vidhyadhar nagar','pratap nagar','murlipura','gopalpura','jawahar nagar',
  'nirman nagar','sodala','jhotwara','hasanpura','ramganj','khonagorn',
]);

// ── CORE TEXT NORMALIZATION ───────────────────────────────────────────

/**
 * Full address normalization pipeline:
 * 1. Lowercase
 * 2. Remove noise characters
 * 3. Expand abbreviations
 * 4. Collapse whitespace
 * 5. Remove pure stop words
 */
function normalizeForMatching(addr) {
  if (!addr || typeof addr !== 'string') return '';

  let s = addr.toLowerCase();

  // Remove OCR garbage chars
  s = s.replace(/[^\w\s,.\-\/()#&]/g, ' ');

  // Replace common separators with space
  s = s.replace(/[,.\-\/\\|]+/g, ' ');

  // Expand abbreviations (word boundary aware)
  const tokens = s.split(/\s+/).map(tok => {
    const clean = tok.replace(/[^a-z0-9]/g, '');
    return ABBREV_MAP[clean] || tok;
  });
  s = tokens.join(' ');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Tokenize normalized address into meaningful tokens
 * Removes stop words, returns array of significant tokens
 */
function tokenize(normalizedAddr) {
  return normalizedAddr
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t) && !/^\d{1,2}$/.test(t));
}

/**
 * Extract PIN code from raw address
 */
function extractPIN(addr) {
  const m = addr && addr.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

/**
 * Extract house/flat number from address
 */
function extractHouseNumber(addr) {
  const m = addr && addr.match(/\b(?:h\.?no\.?|flat|plot|f\.?no\.?|#|house)\s*[:\-]?\s*(\d+[a-z]?)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Extract district from address using geo index
 */
function extractDistrict(addr) {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  for (const dist of RAJ_DISTRICTS) {
    if (lower.includes(dist)) return dist;
  }
  return null;
}

// ── SIMILARITY METRICS ────────────────────────────────────────────────

/**
 * Jaccard similarity on token sets
 * |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Cosine similarity using simple TF vectors
 * Good for partial address subsets
 */
function cosineSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Build TF vectors
  const tfA = {};
  const tfB = {};
  tokensA.forEach(t => { tfA[t] = (tfA[t] || 0) + 1; });
  tokensB.forEach(t => { tfB[t] = (tfB[t] || 0) + 1; });

  // Dot product
  let dot = 0;
  const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  allTerms.forEach(t => { dot += (tfA[t] || 0) * (tfB[t] || 0); });

  // Magnitudes
  const magA = Math.sqrt(Object.values(tfA).reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(Object.values(tfB).reduce((s, v) => s + v * v, 0));

  return magA && magB ? dot / (magA * magB) : 0;
}

/**
 * Levenshtein distance between two strings
 * Efficient DP implementation
 */
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Levenshtein similarity ratio: 1 - (dist / maxLen)
 */
function levenshteinRatio(s1, s2) {
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

// ── MAIN MATCHING FUNCTION ────────────────────────────────────────────

/**
 * Compare two raw addresses using multi-metric ensemble.
 *
 * @param {string} addr1 - Raw address from document A
 * @param {string} addr2 - Raw address from document B (reference)
 * @returns {Object} {
 *   score: 0-1,
 *   confidence: 0-100,
 *   status: 'match'|'partial'|'mismatch',
 *   metrics: { jaccard, cosine, levenshtein, pin_match, city_match },
 *   matched_tokens: [],
 *   missing_tokens: [],
 *   normalized_a: string,
 *   normalized_b: string,
 *   explanation: string
 * }
 */
function compareAddresses(addr1, addr2) {
  if (!addr1 || !addr2) {
    return {
      score: 0, confidence: 0, status: 'insufficient_data',
      metrics: {}, matched_tokens: [], missing_tokens: [],
      normalized_a: addr1 || '', normalized_b: addr2 || '',
      explanation: 'One or both addresses missing'
    };
  }

  const norm1 = normalizeForMatching(addr1);
  const norm2 = normalizeForMatching(addr2);
  const tokens1 = tokenize(norm1);
  const tokens2 = tokenize(norm2);

  // Metric 1: Jaccard
  const jaccard = jaccardSimilarity(tokens1, tokens2);

  // Metric 2: Cosine
  const cosine = cosineSimilarity(tokens1, tokens2);

  // Metric 3: Levenshtein (on normalized strings, truncated for performance)
  const lev = levenshteinRatio(
    norm1.substring(0, 150),
    norm2.substring(0, 150)
  );

  // Metric 4: PIN code match
  const pin1 = extractPIN(addr1);
  const pin2 = extractPIN(addr2);
  const pinMatch = pin1 && pin2 ? (pin1 === pin2 ? 1 : 0) : 0.5; // 0.5 = unknown

  // Metric 5: District/city match
  const dist1 = extractDistrict(addr1);
  const dist2 = extractDistrict(addr2);
  const cityMatch = dist1 && dist2 ? (dist1 === dist2 ? 1 : 0) : 0.5;

  // Metric 6: House number match (hard anchor)
  const hno1 = extractHouseNumber(addr1);
  const hno2 = extractHouseNumber(addr2);
  const hnoMatch = hno1 && hno2 ? (hno1 === hno2 ? 1 : hno1 !== hno2 ? -0.3 : 0.5) : 0;

  // ── WEIGHTED ENSEMBLE ─────────────────────────────────────────────
  const weights = { jaccard: 0.35, cosine: 0.25, levenshtein: 0.20, pin: 0.15, city: 0.05 };
  let score = (
    jaccard    * weights.jaccard +
    cosine     * weights.cosine +
    lev        * weights.levenshtein +
    (pinMatch === 0.5 ? (jaccard + cosine) / 2 : pinMatch) * weights.pin +
    (cityMatch === 0.5 ? jaccard * 0.8 : cityMatch) * weights.city
  );

  // Apply house number penalty if numbers clearly differ
  if (hnoMatch < 0) score = Math.max(0, score + hnoMatch * 0.2);

  // Hard boost: exact PIN match is strong evidence
  if (pin1 && pin2 && pin1 === pin2) score = Math.min(1, score + 0.15);

  // Hard penalty: PIN codes both present but different
  if (pin1 && pin2 && pin1 !== pin2) score = Math.max(0, score - 0.25);

  score = Math.max(0, Math.min(1, score));
  const confidence = Math.round(score * 100);

  // Status thresholds
  const status = score >= 0.60 ? 'match' : score >= 0.35 ? 'partial' : 'mismatch';

  // Token analysis for explanation
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const matchedTokens = tokens1.filter(t => set2.has(t));
  const missingFrom2 = tokens2.filter(t => !set1.has(t));

  // Human explanation
  let explanation = '';
  if (status === 'match') {
    explanation = pin1 && pin1 === pin2
      ? `Strong match: PIN codes identical (${pin1}), ${matchedTokens.length} shared tokens`
      : `Good match: ${matchedTokens.length}/${tokens2.length} tokens match`;
  } else if (status === 'partial') {
    explanation = `Partial match: ${matchedTokens.length}/${tokens2.length} tokens match`;
    if (pin1 && pin2 && pin1 !== pin2) explanation += ` (PIN mismatch: ${pin1} vs ${pin2})`;
  } else {
    explanation = `Low similarity: only ${matchedTokens.length} common tokens`;
    if (hnoMatch < 0) explanation += `, house numbers differ`;
  }

  return {
    score,
    confidence,
    status,
    metrics: {
      jaccard: Math.round(jaccard * 100),
      cosine: Math.round(cosine * 100),
      levenshtein: Math.round(lev * 100),
      pin_match: pin1 && pin2 ? pin1 === pin2 : null,
      city_match: dist1 && dist2 ? dist1 === dist2 : null,
    },
    matched_tokens: matchedTokens,
    missing_tokens: missingFrom2,
    extra_tokens: tokens1.filter(t => !set2.has(t)),
    normalized_a: norm1,
    normalized_b: norm2,
    pin_a: pin1, pin_b: pin2,
    district_a: dist1, district_b: dist2,
    explanation,
  };
}

/**
 * Normalize and clean a single address for storage/display
 */
function normalizeAddress(raw) {
  if (!raw) return null;
  return raw
    .replace(/\n+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/[^\w\s,.\-\/()#&]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 300);
}

/**
 * Find the best matching address from a list
 */
function findBestMatch(queryAddr, candidateList) {
  if (!queryAddr || !candidateList?.length) return null;
  let best = null, bestScore = -1;
  for (const candidate of candidateList) {
    const result = compareAddresses(queryAddr, candidate.address);
    if (result.score > bestScore) {
      bestScore = result.score;
      best = { ...candidate, match_result: result };
    }
  }
  return best;
}

/**
 * Cluster addresses that refer to the same location
 * Used to find the dominant/most-common address across documents
 */
function clusterAddresses(addressList) {
  if (!addressList?.length) return [];
  const THRESHOLD = 0.50;
  const clusters = [];

  for (const item of addressList) {
    let placed = false;
    for (const cluster of clusters) {
      const result = compareAddresses(item.address, cluster.representative);
      if (result.score >= THRESHOLD) {
        cluster.members.push({ ...item, similarity: result.score });
        // Update representative to longest address (usually most complete)
        if (item.address && item.address.length > cluster.representative.length) {
          cluster.representative = item.address;
        }
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        representative: item.address,
        members: [{ ...item, similarity: 1.0 }],
      });
    }
  }

  // Sort clusters by size (most-attested address first)
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

module.exports = {
  compareAddresses,
  normalizeAddress,
  normalizeForMatching,
  tokenize,
  extractPIN,
  extractDistrict,
  clusterAddresses,
  findBestMatch,
  jaccardSimilarity,
  levenshteinRatio,
  cosineSimilarity,
};
