/**
 * routes/groq.js
 *
 * Groq AI utility routes:
 *   GET  /api/groq/status          → verify API key is working
 *   POST /api/groq/parse-text      → parse raw OCR text via Groq (no file upload)
 *   POST /api/groq/ask             → ask a question about the current profile (RAG-lite)
 *   GET  /api/groq/moolniwas-fill  → auto-fill Mool Niwas form from current profile
 */

require('dotenv').config();
const express = require('express');
const router  = express.Router();

const { testGroqConnection, parseDocumentWithGroq } = require('../services/groqService');
const { getDB }                                      = require('../utils/database');
const { decryptProfile }                             = require('../utils/encryption');
const { flattenProfile }                             = require('../services/profileEngine');
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama3-70b-8192';

function getProfileId(req) {
  const sid = req.headers['x-session-id'];
  return sid && sid.length > 8 ? `session_${sid}` : 'default_user_profile';
}

async function callGroqRaw(messages, maxTokens = 800) {
  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  });

  return new Promise((resolve, reject) => {
    const url = new URL('https://api.groq.com/openai/v1/chat/completions');
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
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── GET /api/groq/status ────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const result = await testGroqConnection();
    res.json({
      configured: !!GROQ_API_KEY,
      model: GROQ_MODEL,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ configured: false, ok: false, error: err.message });
  }
});

// ─── POST /api/groq/parse-text ───────────────────────────────────────────────
// Parse raw text (e.g. manually entered or pasted OCR)

router.post('/parse-text', async (req, res) => {
  const { text, doc_type } = req.body;

  if (!text || text.trim().length < 10) {
    return res.status(400).json({ error: 'Provide at least 10 characters of document text' });
  }

  try {
    const result = await parseDocumentWithGroq(text, doc_type || null);
    res.json({
      success:    true,
      doc_type:   result.docType,
      confidence: result.confidence,
      parsed:     result.parsed,
      groq_used:  result.groqUsed,
      tokens:     result.tokensUsed,
      error:      result.error,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/groq/ask ───────────────────────────────────────────────────────
// Document Q&A — ask a question about the citizen's profile / documents

router.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Provide a question' });

  const PROFILE_ID = getProfileId(req);

  // Load profile context
  let profileContext = 'No profile data available.';
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (row) {
      const dec  = decryptProfile(JSON.parse(row.data));
      const flat = flattenProfile(dec);
      profileContext = JSON.stringify(flat, null, 2);
    }
  } catch {}

  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant for Indian citizens using a government document management app called Smart AutoFill. You help citizens understand their documents, check eligibility for schemes, and fill forms. 

The citizen's profile data extracted from their documents is:
${profileContext}

Answer concisely and in simple English. If the citizen asks in Hindi, reply in Hindi. If information is not in the profile, say so clearly.`,
    },
    { role: 'user', content: question },
  ];

  try {
    const answer = await callGroqRaw(messages, 600);
    res.json({ success: true, answer, question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/groq/moolniwas-fill ────────────────────────────────────────────
// Use Groq to intelligently fill the Mool Niwas form from profile data
// and provide a JSON with all form fields mapped + confidence

router.get('/moolniwas-fill', async (req, res) => {
  const PROFILE_ID = getProfileId(req);

  let flatProfile = {};
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(PROFILE_ID);
    if (row) {
      const dec = decryptProfile(JSON.parse(row.data));
      flatProfile = flattenProfile(dec);
    }
  } catch {}

  if (Object.keys(flatProfile).length === 0) {
    return res.status(404).json({ error: 'No profile found. Upload documents first.' });
  }

  const prompt = `You are filling out the Rajasthan Mool Niwas (Domicile) Certificate application form for a citizen.

CITIZEN PROFILE DATA:
${JSON.stringify(flatProfile, null, 2)}

Fill in the Mool Niwas form fields using the profile data. Return ONLY valid JSON:
{
  "applicant_name": "Full name",
  "father_name": "Father's full name",
  "mother_name": "Mother's full name or null",
  "dob": "DD/MM/YYYY",
  "gender": "Male/Female",
  "caste": "Caste name or null",
  "religion": "Religion or null",
  "aadhaar_number": "XXXX XXXX XXXX or null",
  "pan_number": "PAN or null",
  "voter_id": "Voter ID or null",
  "driving_license": "DL number or null",
  "current_address": "Full current address",
  "permanent_address": "Full permanent address (same as current if same)",
  "pincode": "6-digit pincode",
  "district": "District",
  "state": "Rajasthan",
  "years_in_rajasthan": "Estimated years as number",
  "birth_place": "City, State",
  "education_class_10": {"school": null, "board": null, "year": null, "percentage": null},
  "education_class_12": {"school": null, "board": null, "year": null, "percentage": null},
  "education_graduation": {"college": null, "year": null},
  "father_occupation": "Occupation or null",
  "supporting_docs": ["List of document types available in profile"],
  "missing_fields": ["List of required fields that couldn't be filled"],
  "form_completeness_percent": 0-100,
  "notes": "Any important notes about the application"
}`;

  try {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You extract and map citizen profile data to government form fields. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const formData = await new Promise((resolve, reject) => {
      const url = new URL('https://api.groq.com/openai/v1/chat/completions');
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
      const r = https.request(options, (res2) => {
        let d = '';
        res2.on('data', c => { d += c; });
        res2.on('end', () => {
          try {
            const p = JSON.parse(d);
            resolve(JSON.parse(p.choices[0].message.content));
          } catch (e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.setTimeout(30000, () => { r.destroy(); reject(new Error('Timeout')); });
      r.write(body);
      r.end();
    });

    res.json({
      success: true,
      form_data: formData,
      profile_used: flatProfile,
      ai_powered: true,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
