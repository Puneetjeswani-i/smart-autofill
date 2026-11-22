/**
 * services/groqService.js
 *
 * Reusable Groq LLM integration for intelligent document parsing.
 *
 * Pipeline:
 *   Raw OCR text → detectDocType() → buildPrompt() → Groq API → parsed JSON
 *
 * Document types supported:
 *   aadhaar, pan, passport, driving_license, voter_id, marksheet,
 *   electricity_bill, bank_statement, income_certificate, caste_certificate
 */

require('dotenv').config();
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama3-70b-8192';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ─── Document type detection from raw OCR text ───────────────────────────────

const DOC_TYPE_SIGNALS = {
  aadhaar: [
    /aadhaar/i, /unique\s*identification/i, /UIDAI/i,
    /\b\d{4}\s\d{4}\s\d{4}\b/, /enrollment\s*no/i,
  ],
  pan: [
    /permanent\s*account\s*number/i, /income\s*tax\s*department/i,
    /\b[A-Z]{5}\d{4}[A-Z]\b/,
  ],
  passport: [
    /republic\s*of\s*india.*passport/i, /passport\s*no/i,
    /place\s*of\s*issue/i, /date\s*of\s*expiry/i,
    /\bP<IND\b/, /\bV\d{7}\b/,
  ],
  driving_license: [
    /driving\s*licen[cs]e/i, /transport\s*department/i,
    /class\s*of\s*vehicle/i, /valid\s*till/i,
    /LMV/i, /MCWG/i, /authorisation\s*to\s*drive/i,
  ],
  voter_id: [
    /election\s*commission/i, /elector.*photo.*identity/i,
    /voter/i, /assembly\s*constituency/i, /polling\s*station/i,
    /EPIC/i,
  ],
  marksheet: [
    /board\s*of\s*secondary/i, /CBSE/i, /ICSE/i,
    /marksheet/i, /mark\s*sheet/i, /certificate\s*of\s*merit/i,
    /percentage/i, /division/i, /subject.*marks/i,
    /class\s*(x|xii|10|12)/i,
  ],
  electricity_bill: [
    /electricity/i, /power\s*supply/i, /BESCOM/i, /UPPCL/i, /KESCO/i,
    /consumer\s*id/i, /meter\s*no/i, /units\s*consumed/i,
    /billing\s*month/i,
  ],
  income_certificate: [
    /income\s*certificate/i, /annual\s*income/i,
    /tehsil/i, /revenue\s*department/i,
  ],
  caste_certificate: [
    /caste\s*certificate/i, /scheduled\s*caste/i, /OBC/i, /ST\b/,
    /social\s*justice/i, /backward\s*class/i,
  ],
  bank_statement: [
    /bank\s*statement/i, /account\s*number/i,
    /IFSC/i, /debit/i, /credit/i, /balance/i,
    /transaction/i,
  ],
};

/**
 * Detect document type from OCR text.
 * Returns the type string and a confidence 0-1.
 */
function detectDocumentType(text) {
  const scores = {};

  for (const [type, signals] of Object.entries(DOC_TYPE_SIGNALS)) {
    let hits = 0;
    for (const signal of signals) {
      if (signal.test(text)) hits++;
    }
    if (hits > 0) scores[type] = hits / signals.length;
  }

  if (Object.keys(scores).length === 0) return { type: 'unknown', confidence: 0 };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { type: best[0], confidence: Math.round(best[1] * 100) };
}

// ─── Prompt templates per document type ──────────────────────────────────────

function buildPrompt(ocrText, docType) {
  const FIELD_SCHEMAS = {
    aadhaar: `{
  "doc_type": "aadhaar",
  "name": "Full name",
  "dob": "DD/MM/YYYY",
  "gender": "Male/Female/Other",
  "aadhaar_number": "XXXX XXXX XXXX",
  "address": "Full address string",
  "pincode": "6-digit pincode",
  "district": "District name",
  "state": "State name",
  "confidence": 0-100
}`,
    pan: `{
  "doc_type": "pan",
  "name": "Full name",
  "father_name": "Father full name",
  "dob": "DD/MM/YYYY",
  "pan_number": "ABCDE1234F format",
  "confidence": 0-100
}`,
    passport: `{
  "doc_type": "passport",
  "name": "Full name (Given + Surname)",
  "surname": "Surname only",
  "given_name": "Given name only",
  "dob": "DD/MM/YYYY",
  "gender": "Male/Female",
  "nationality": "INDIAN",
  "passport_number": "V1234567 format",
  "place_of_birth": "City, State",
  "place_of_issue": "City",
  "date_of_issue": "DD/MM/YYYY",
  "date_of_expiry": "DD/MM/YYYY",
  "mrz_line1": "First MRZ line if visible",
  "mrz_line2": "Second MRZ line if visible",
  "confidence": 0-100
}`,
    driving_license: `{
  "doc_type": "driving_license",
  "name": "Full name",
  "father_name": "S/D/W of name",
  "dob": "DD/MM/YYYY",
  "dl_number": "DL number e.g. UP78 20210012345",
  "address": "Full address",
  "pincode": "6-digit pincode",
  "state": "State of issue",
  "district": "District",
  "vehicle_class": "LMV/MCWG etc",
  "date_of_issue": "DD/MM/YYYY",
  "valid_till": "DD/MM/YYYY",
  "blood_group": "A+/B+ etc",
  "issuing_authority": "RTO name",
  "confidence": 0-100
}`,
    voter_id: `{
  "doc_type": "voter_id",
  "name": "Full name",
  "father_name": "Father name",
  "gender": "Male/Female",
  "dob": "DD/MM/YYYY",
  "voter_id": "Epic number e.g. XYP1234567",
  "address": "Full address",
  "pincode": "6-digit pincode",
  "state": "State",
  "district": "District",
  "assembly_constituency": "Constituency name",
  "part_number": "Part number",
  "date_of_issue": "DD/MM/YYYY",
  "confidence": 0-100
}`,
    marksheet: `{
  "doc_type": "marksheet",
  "name": "Student full name",
  "roll_number": "Roll/Seat number",
  "board": "CBSE/ICSE/State board name",
  "class": "10/12/Graduate",
  "school_college": "Institution name",
  "year_of_passing": "YYYY",
  "subjects": [{"subject": "name", "marks_obtained": 0, "max_marks": 0}],
  "total_marks": 0,
  "max_total_marks": 0,
  "percentage": "95.38%",
  "division": "First/Second/Third/Distinction",
  "result": "Pass/Fail",
  "confidence": 0-100
}`,
    electricity_bill: `{
  "doc_type": "electricity_bill",
  "name": "Consumer name",
  "address": "Service address",
  "pincode": "6-digit pincode",
  "state": "State",
  "district": "District/City",
  "consumer_id": "Consumer ID",
  "meter_number": "Meter number",
  "billing_month": "Month Year",
  "bill_date": "DD/MM/YYYY",
  "due_date": "DD/MM/YYYY",
  "units_consumed": 0,
  "bill_amount": 0,
  "discom": "Electricity board name",
  "confidence": 0-100
}`,
    income_certificate: `{
  "doc_type": "income_certificate",
  "name": "Full name",
  "father_name": "Father name",
  "annual_income": 0,
  "income_in_words": "Rupees X only",
  "address": "Full address",
  "state": "State",
  "district": "District",
  "tehsil": "Tehsil name",
  "certificate_number": "Cert number",
  "date_of_issue": "DD/MM/YYYY",
  "issuing_authority": "Authority name",
  "confidence": 0-100
}`,
    caste_certificate: `{
  "doc_type": "caste_certificate",
  "name": "Full name",
  "father_name": "Father name",
  "caste": "Caste name",
  "caste_category": "SC/ST/OBC/General",
  "sub_caste": "Sub-caste if any",
  "address": "Full address",
  "state": "State",
  "district": "District",
  "certificate_number": "Cert number",
  "date_of_issue": "DD/MM/YYYY",
  "issuing_authority": "Authority",
  "confidence": 0-100
}`,
    unknown: `{
  "doc_type": "detected_type_or_unknown",
  "name": "Full name if found",
  "dob": "DD/MM/YYYY if found",
  "id_number": "Any ID number found",
  "address": "Address if found",
  "date_of_issue": "Issue date if found",
  "other_fields": {},
  "confidence": 0-100
}`,
  };

  const schema = FIELD_SCHEMAS[docType] || FIELD_SCHEMAS.unknown;

  return `You are an expert OCR post-processor for Indian government documents. Extract structured data from the following OCR text.

DOCUMENT TYPE DETECTED: ${docType.toUpperCase().replace(/_/g, ' ')}

OCR TEXT:
"""
${ocrText.substring(0, 3000)}
"""

INSTRUCTIONS:
1. Extract ONLY fields that are clearly present in the text
2. For missing fields, use null (not empty string)
3. Correct obvious OCR errors (e.g., "0" vs "O", "1" vs "I", "rn" vs "m")
4. For names: use proper Title Case
5. For dates: normalize to DD/MM/YYYY format
6. For Aadhaar: format as "XXXX XXXX XXXX"
7. For PAN: format as 10-char alphanumeric (e.g., ABCDE1234F)
8. Return ONLY valid JSON — no explanation, no markdown, no extra text

RETURN THIS EXACT JSON STRUCTURE (fill in values, keep nulls for missing):
${schema}`;
}

// ─── Core Groq API call ───────────────────────────────────────────────────────

/**
 * Call Groq API with a prompt.
 * Returns the raw response text.
 */
async function callGroq(prompt, maxTokens = 1000) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set in .env');
  }

  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert at extracting structured data from Indian government document OCR text. Always respond with valid JSON only. Never include markdown code blocks, explanations, or any text outside the JSON object.

CRITICAL RULES:
- "husband_name" must ONLY be filled if the document explicitly states the person is married and names their husband. NEVER copy father_name into husband_name.
- "father_name" is the person's father. "husband_name" is only for married women's husband. These are different people.
- If a document shows "S/O" (Son of) or "D/O" (Daughter of), that is the father_name, NOT husband_name.
- "W/O" (Wife of) indicates husband_name for married women only.
- If husband is not mentioned in the document, set husband_name to null.
- percentage must be extracted as a string like "95.38%" — do not omit it if present.
- class field must be exactly "10" or "12" or "Graduate" — not "Class X" or "Class XII".`,
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.1, // Low temp for deterministic extraction
    response_format: { type: 'json_object' }, // Force JSON mode
  });

  return new Promise((resolve, reject) => {
    const url = new URL(GROQ_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // Handle non-200 HTTP responses
        if (res.statusCode === 403) {
          return reject(new Error('Groq API 403: Host not allowlisted or invalid key. Check GROQ_API_KEY in .env'));
        }
        if (res.statusCode === 429) {
          return reject(new Error('Groq API rate limit exceeded. Wait 60s and retry.'));
        }
        if (res.statusCode >= 500) {
          return reject(new Error('Groq API server error (' + res.statusCode + '). Try again later.'));
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error('Groq API error: ' + parsed.error.message));
          } else {
            const content = parsed.choices?.[0]?.message?.content;
            resolve({ content, usage: parsed.usage });
          }
        } catch (e) {
          reject(new Error('Failed to parse Groq response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Groq API request timed out after 30s'));
    });
    req.write(body);
    req.end();
  });
}

// ─── Parse JSON from Groq response ───────────────────────────────────────────

function parseGroqJSON(content) {
  if (!content) throw new Error('Empty Groq response');

  // Strip markdown fences if present (shouldn't happen with json_object mode)
  let cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Find the first { and last } in case there's surrounding text
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Process OCR text through Groq AI to extract structured document fields.
 *
 * @param {string} ocrText   - Raw OCR-extracted text
 * @param {string} [hint]    - Optional document type hint ('aadhaar', 'pan', etc.)
 * @returns {Promise<{parsed, docType, confidence, groqUsed, error}>}
 */
async function parseDocumentWithGroq(ocrText, hint = null) {
  const startTime = Date.now();

  // 1. Detect document type
  const { type: detectedType, confidence: detectionConf } = detectDocumentType(ocrText);
  const docType = hint || detectedType;

  console.log(`[Groq] Document type: ${docType} (detection confidence: ${detectionConf}%)`);

  // 2. Build prompt
  const prompt = buildPrompt(ocrText, docType);

  // 3. Call Groq
  let groqResult;
  try {
    groqResult = await callGroq(prompt, 1200);
  } catch (err) {
    console.error('[Groq] API call failed:', err.message);
    return {
      parsed: null,
      docType,
      confidence: 0,
      groqUsed: false,
      error: err.message,
      processingMs: Date.now() - startTime,
    };
  }

  // 4. Parse JSON response
  let parsed;
  try {
    parsed = parseGroqJSON(groqResult.content);
  } catch (err) {
    console.error('[Groq] JSON parse failed:', err.message);
    console.error('[Groq] Raw response:', groqResult.content?.substring(0, 500));
    return {
      parsed: null,
      docType,
      confidence: 0,
      groqUsed: true,
      error: `JSON parse failed: ${err.message}`,
      processingMs: Date.now() - startTime,
    };
  }

  // 5. Normalize and return
  const confidence = parsed.confidence || detectionConf || 70;
  delete parsed.confidence; // Move to top-level

  console.log(`[Groq] Parsed ${Object.keys(parsed).filter(k => parsed[k] !== null).length} fields in ${Date.now() - startTime}ms`);

  return {
    parsed,
    docType: parsed.doc_type || docType,
    confidence,
    groqUsed: true,
    tokensUsed: groqResult.usage?.total_tokens || 0,
    processingMs: Date.now() - startTime,
    error: null,
  };
}

/**
 * Parse multiple documents and merge into a single profile.
 * Used for the batch upload flow.
 */
async function parseMultipleDocuments(ocrResults) {
  const results = [];

  for (const { ocrText, filename, hint } of ocrResults) {
    console.log(`[Groq] Processing: ${filename}`);
    const result = await parseDocumentWithGroq(ocrText, hint);
    results.push({ filename, ...result });

    // Respect Groq rate limits: 30 req/min on free tier
    if (ocrResults.length > 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Quick test to verify Groq API key is working.
 */
async function testGroqConnection() {
  try {
    const result = await callGroq('Return this JSON: {"status": "ok", "model": "working"}', 50);
    const json = parseGroqJSON(result.content);
    return { ok: true, model: GROQ_MODEL, response: json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  parseDocumentWithGroq,
  parseMultipleDocuments,
  detectDocumentType,
  testGroqConnection,
};
