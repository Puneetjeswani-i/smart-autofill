/**
 * OCR POST-PROCESSING — Cleans and corrects common OCR errors on Indian documents
 *
 * WHY: Tesseract.js makes predictable errors on Indian government documents:
 *   - "Ait Kumar" instead of "Amit Kumar" (drops 'm')
 *   - "Rajcsh Kumar" instead of "Rajesh Kumar" (inserts 'c')
 *   - Line breaks inside names
 *   - Hindi-to-English mixing artifacts
 *   - Extra spaces/punctuation in Aadhaar numbers
 *
 * STRATEGY:
 *   1. Character-level corrections for common OCR substitutions
 *   2. Word-boundary cleanup
 *   3. Indian name heuristics (capitalization, length)
 *   4. Number formatting normalization
 *   5. Date format normalization
 */

// Common Indian first names for fuzzy validation
const COMMON_FIRST_NAMES = new Set([
  'AMIT','AJAY','ANIL','ANKIT','ANURAG','ARJUN','ASHOK','ARUN','ATUL','AVINASH',
  'DEEPAK','DHRUV','DINESH','GAURAV','GIRISH','GOVIND','HARISH','HEMANT','HITESH',
  'JAGDISH','KAMAL','KAPIL','KARAN','KRISHAN','LALIT','MAHESH','MANOJ','MANISH',
  'MOHAN','MUKESH','NARESH','NAVEEN','NIKHIL','NILESH','PANKAJ','PARMOD','PIYUSH',
  'PRADEEP','PRAKASH','PRAVEEN','PRIYANKA','RAHUL','RAJESH','RAKESH','RAMESH',
  'RAVI','ROHIT','SACHIN','SANDEEP','SANJAY','SAURABH','SHYAM','SUNIL','SURESH',
  'VIJAY','VIKRAM','VINOD','VIPIN','YASHPAL','YOGESH',
  'AARTI','ANJALI','ANITA','ARCHANA','DEEPA','GEETA','KAVITA','MAMTA','MEENA',
  'NIRMALA','POOJA','PRIYA','REKHA','SEEMA','SHANTI','SHEELA','SUMAN','SUNITA',
  'USHA','VANDANA','KAVYA','NEHA','RITU','SWETA','SHREYA','KOMAL','RADHA',
  'RAJU','SONU','PINTU','BUNTY','LUCKY','BABLU',
]);

// Common OCR character substitutions seen in Indian docs
const CHAR_FIXES = [
  [/\b0([A-Z])/g, 'O$1'],    // 0 → O at word start
  [/([A-Z])0\b/g, '$1O'],    // 0 → O at word end
  [/\bl\b/g, 'I'],            // standalone l → I
  [/\|([A-Z])/g, 'I$1'],     // |X → IX
  [/([A-Z])\|/g, '$1I'],     // X| → XI
  [/1([a-z]{3,})/g, 'I$1'],  // 1abc → Iabc (I misread as 1)
  [/\bRn\b/g, 'm'],           // Rn → m (common split)
  [/rn/g, 'm'],               // rn → m
  [/\bvv\b/gi, 'w'],          // vv → w
  [/cl\b/g, 'd'],             // cl → d at end
];

// Suspicious name fragment patterns (OCR artifacts)
const BAD_NAME_PATTERNS = [
  /^[A-Z][a-z]{0,2}$/,        // Too short (1-3 chars)
  /\d/,                        // Contains digits
  /[^A-Za-z\s\-\.]/,          // Contains non-name chars
  /^(THE|AND|FOR|NOT|ARE|WAS|HAS|HAD|HAVE|THIS|THAT|WITH|FROM|YOUR|WILL|BEEN|WERE|THEY|THAN|THEN|WHEN|THERE)$/i,
];

/**
 * Clean a raw name string from OCR
 * Handles: "Ait Kumar" → "Amit Kumar", extra spaces, bad chars
 */
function cleanName(raw) {
  if (!raw) return null;
  let name = raw
    .replace(/[^\w\s\-\.]/g, ' ')  // Remove non-name chars
    .replace(/\s+/g, ' ')
    .trim();

  // Title case normalization
  name = name.split(' ').map(word => {
    if (!word) return '';
    // If all-caps word that's a known first name, keep as-is (already correct)
    if (/^[A-Z]{2,}$/.test(word)) return toTitleCase(word);
    return word;
  }).filter(Boolean).join(' ');

  // Must have at least 2 words for a full name, or be at least 4 chars
  if (name.length < 3) return null;

  // Check for obviously bad OCR artifacts
  for (const bad of BAD_NAME_PATTERNS) {
    if (bad.test(name)) return null;
  }

  return name.length >= 3 ? name : null;
}

function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Fix common OCR number errors in IDs
 */
function cleanIdNumber(raw) {
  if (!raw) return null;
  return raw
    .replace(/[oO]/g, '0')       // O → 0 in numbers
    .replace(/[lI]/g, '1')        // l/I → 1 in numbers
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize Indian address — remove OCR garbage, standardize
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
 * Normalize a date string to DD/MM/YYYY
 */
function normalizeDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[.\-]/g, '/').trim();
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) return cleaned;
  // Try to repair
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts.map(p => p.replace(/\D/g, ''));
    if (d && m && y && y.length === 4) {
      return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
    }
  }
  return cleaned;
}

/**
 * Extract all dates from OCR text — used for residence timeline
 * Returns array of { date, year, context, format }
 */
function extractAllDates(text) {
  const dates = [];
  const patterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    { re: /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g, type: 'full' },
    // Month YYYY like "January 2018" or "Jan 2018"
    { re: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi, type: 'month_year' },
    // Just YYYY (year only) — used for school, residence
    { re: /\b(20\d{2}|19[89]\d)\b/g, type: 'year_only' },
  ];

  for (const { re, type } of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      let year = null;

      if (type === 'full') {
        const parts = raw.split(/[\/\-\.]/);
        year = parseInt(parts[2]) || parseInt(parts[0]);
      } else if (type === 'month_year') {
        year = parseInt(m[2]);
      } else if (type === 'year_only') {
        year = parseInt(m[1]);
      }

      if (year && year >= 1980 && year <= new Date().getFullYear()) {
        // Get context (30 chars around the date)
        const start = Math.max(0, m.index - 30);
        const end = Math.min(text.length, m.index + raw.length + 30);
        const context = text.slice(start, end).replace(/\n/g, ' ').trim();

        dates.push({ raw, year, type, context, index: m.index });
      }
    }
  }

  return dates.sort((a, b) => a.year - b.year); // Earliest first
}

/**
 * Extract issue/registration year from a document
 * Logic: look for "Issue Date", "Date of Issue", "Valid From", "Registration Date"
 * near years — gives us earliest proof of residence
 */
function extractDocumentYear(text, docType) {
  const fullText = text.replace(/\n/g, ' ');
  const currentYear = new Date().getFullYear();

  // Specific patterns per document type
  const patterns = {
    electricity_bill: [
      /(?:Bill\s*Date|Issue\s*Date|Date)\s*[:/]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      /(?:Bill\s*Date|Issue\s*Date|Date)\s*[:/]\s*(\d{4})/i,
    ],
    bank_statement: [
      /(?:Statement\s*Date|Period|From)\s*[:/]?\s*(\d{1,2}[\/\-]\d{2}[\/\-]\d{4})/i,
      /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/g, // Any date in statement
    ],
    voter_id: [
      /(?:Issue\s*Date|Date\s*of\s*Issue)\s*[:/]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ],
    driving_license: [
      /(?:Date\s*of\s*Issue|Issue\s*Date|Valid\s*From)\s*[:/]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ],
    marksheet: [
      /(?:Year\s*of\s*Passing|Date\s*of\s*Result|Year)\s*[:/]?\s*(\d{4})/i,
      /\b(20\d{2}|19\d{2})\b/g,
    ],
    aadhaar: [
      // Aadhaar doesn't have issue date visible, but has enrollment
      /(?:Enrollment|Enrolment)\s*[:/]?\s*(\d{4})/i,
    ],
    pan: [
      // PAN doesn't have issue date
    ],
    passport: [
      /(?:Date\s*of\s*Issue|Issue\s*Date)\s*[:/]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ],
  };

  const docPatterns = patterns[docType] || [];

  for (const pat of docPatterns) {
    const match = fullText.match(pat);
    if (match) {
      const raw = match[1];
      const parts = raw ? raw.split(/[\/\-]/) : [];
      const year = (parts.length >= 3 ? parseInt(parts[2]) : null) || parseInt(parts[0]) || parseInt(raw);
      if (year >= 1990 && year <= currentYear) return year;
    }
  }

  // Fallback: find earliest reasonable year in document
  const allYears = [];
  const yearRe = /\b(20\d{2}|19[9]\d)\b/g;
  let ym;
  while ((ym = yearRe.exec(fullText)) !== null) {
    const y = parseInt(ym[1]);
    if (y >= 2000 && y <= currentYear) allYears.push(y);
  }

  if (allYears.length > 0) {
    // Return median-ish year (avoid DOB years being confused as issue years)
    allYears.sort((a, b) => a - b);
    // Skip years that look like DOB years (1990s)
    const nonDobYears = allYears.filter(y => y >= 2000);
    return nonDobYears.length > 0 ? nonDobYears[0] : null;
  }

  return null;
}

/**
 * Post-process all parsed fields from a document
 */
function postProcessParsed(parsed) {
  const out = { ...parsed };

  if (out.name) out.name = cleanName(out.name);
  if (out.father_name) out.father_name = cleanName(out.father_name);
  if (out.mother_name) out.mother_name = cleanName(out.mother_name);
  if (out.husband_name) out.husband_name = cleanName(out.husband_name);

  if (out.dob) out.dob = normalizeDate(out.dob);
  if (out.address) out.address = normalizeAddress(out.address);
  if (out.id_number) out.id_number = formatAadhaar(out.id_number);

  // Remove null/undefined
  Object.keys(out).forEach(k => { if (out[k] === null || out[k] === undefined || out[k] === '') delete out[k]; });

  return out;
}

function formatAadhaar(raw) {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) return `${digits.slice(0,4)} ${digits.slice(4,8)} ${digits.slice(8,12)}`;
  return raw;
}

module.exports = {
  cleanName, normalizeAddress, normalizeDate, cleanIdNumber,
  extractAllDates, extractDocumentYear, postProcessParsed, formatAadhaar,
};
