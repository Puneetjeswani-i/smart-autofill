/**
 * services/groqService.js — optional cloud AI (Groq LLM) for document parsing.
 *
 * Privacy rules enforced here:
 *   - Aadhaar numbers, Aadhaar VIDs and long digit runs (bank accounts) are
 *     masked BEFORE any text leaves this computer. Those numbers are always
 *     read by the local extractor instead.
 *   - Nothing is sent when AI is switched off in Settings or no key is set.
 *
 * Accuracy rules:
 *   - The model must copy values as printed and use null when absent.
 *   - Every returned value is "grounded": checked against the OCR text.
 *     Values that cannot be found in the text are kept only as low-confidence
 *     suggestions and flagged for the operator.
 */

'use strict';

const { config } = require('../config');
const V = require('./validators');

// ── Masking ──────────────────────────────────────────────────────────────────

function maskForAi(text) {
  let s = String(text || '');
  // 16-digit VID first, then 12-digit Aadhaar (with or without spaces)
  s = s.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 'XXXX XXXX XXXX XXXX');
  s = s.replace(/\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/g, (m, a, b, c) => `XXXX XXXX ${c}`);
  // any other run of 9+ digits (bank account, ration card, consumer numbers)
  s = s.replace(/\b\d{9,18}\b/g, (m) => 'X'.repeat(m.length - 4) + m.slice(-4));
  return s;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const COMMON_KEYS = {
  name: 'applicant full name in English as printed',
  name_hindi: 'applicant name in Devanagari if printed, else null',
  father_name: "father's name (from 'Father's Name', 'S/O', 'D/O', 'पिता')",
  father_name_hindi: "father's name in Devanagari if printed",
  mother_name: "mother's name if printed",
  husband_name: "husband's name ONLY if 'Husband' or 'W/O' is printed",
  dob: 'date of birth as DD/MM/YYYY (or YYYY if only year printed)',
  gender: 'Male | Female | Transgender',
  address: 'full address in English as one line',
  address_hindi: 'full address in Devanagari if printed',
  house_no: 'house/plot number', street: 'street/locality/ward', village_city: 'village/town/city',
  post_office: 'post office', tehsil: 'tehsil/sub-district', district: 'district', state: 'state',
  pincode: '6-digit PIN', mobile: '10-digit mobile if printed', email: 'email if printed',
  date_of_issue: 'document issue date DD/MM/YYYY',
};

const TYPE_KEYS = {
  aadhaar: ['name', 'name_hindi', 'father_name', 'husband_name', 'dob', 'gender', 'address', 'address_hindi', 'house_no', 'street', 'village_city', 'post_office', 'tehsil', 'district', 'state', 'pincode', 'mobile', 'date_of_issue'],
  pan: ['name', 'father_name', 'dob', 'pan_number'],
  voter_id: ['name', 'name_hindi', 'father_name', 'husband_name', 'gender', 'dob', 'epic_number', 'address', 'district', 'state', 'pincode', 'assembly_constituency', 'date_of_issue'],
  driving_license: ['name', 'father_name', 'dob', 'dl_number', 'address', 'district', 'state', 'pincode', 'date_of_issue', 'valid_till', 'blood_group'],
  passport: ['name', 'father_name', 'mother_name', 'dob', 'gender', 'passport_number', 'place_of_birth', 'date_of_issue', 'date_of_expiry', 'address'],
  marksheet: ['name', 'father_name', 'mother_name', 'dob', 'roll_number', 'board', 'class', 'school_college', 'school_place', 'year_of_passing', 'percentage', 'division', 'result'],
  electricity_bill: ['name', 'address', 'district', 'state', 'pincode', 'consumer_number', 'bill_date', 'billing_month', 'discom'],
  water_bill: ['name', 'address', 'district', 'state', 'pincode', 'consumer_number', 'bill_date'],
  ration_card: ['name', 'father_name', 'address', 'district', 'state', 'pincode', 'ration_card_number', 'date_of_issue', 'caste_category'],
  jan_aadhaar: ['name', 'name_hindi', 'father_name', 'husband_name', 'dob', 'gender', 'address', 'district', 'state', 'pincode', 'jan_aadhaar_id', 'annual_income', 'caste_category', 'religion'],
  birth_certificate: ['name', 'father_name', 'mother_name', 'dob', 'gender', 'place_of_birth', 'address', 'date_of_issue'],
  income_certificate: ['name', 'father_name', 'address', 'district', 'tehsil', 'annual_income', 'certificate_number', 'date_of_issue'],
  caste_certificate: ['name', 'father_name', 'address', 'district', 'tehsil', 'caste', 'caste_category', 'certificate_number', 'date_of_issue'],
  domicile_certificate: ['name', 'father_name', 'address', 'district', 'tehsil', 'certificate_number', 'date_of_issue'],
  bank_passbook: ['name', 'father_name', 'address', 'bank_name', 'ifsc_code', 'account_opening_date'],
  school_certificate: ['name', 'father_name', 'mother_name', 'dob', 'school_college', 'school_place', 'caste_category', 'date_of_issue'],
  land_record: ['name', 'father_name', 'village_city', 'tehsil', 'district', 'caste'],
  rent_agreement: ['name', 'address', 'district', 'state', 'pincode', 'date_of_issue'],
  other: ['name', 'father_name', 'dob', 'gender', 'address', 'district', 'state', 'pincode', 'date_of_issue'],
};

const EXTRA_KEY_HELP = {
  pan_number: '10-character PAN', epic_number: 'voter ID / EPIC number', dl_number: 'driving licence number',
  passport_number: 'passport number', place_of_birth: 'place of birth', date_of_expiry: 'expiry date DD/MM/YYYY',
  valid_till: 'valid till date', blood_group: 'blood group', roll_number: 'roll number',
  board: 'examination board', class: '"10" or "12" or "Graduate"', school_college: 'school/college name',
  school_place: 'school town/city', year_of_passing: 'year of passing YYYY', percentage: 'percentage like "75.33%"',
  division: 'division', result: 'Pass/Fail', consumer_number: 'consumer / K number', bill_date: 'bill date DD/MM/YYYY',
  billing_month: 'billing month like "Jun 2015"', discom: 'electricity company', ration_card_number: 'ration card number',
  jan_aadhaar_id: 'Jan Aadhaar ID', annual_income: 'annual income as a plain number in rupees',
  caste: 'caste name', caste_category: 'SC | ST | OBC | MBC | General', religion: 'religion',
  certificate_number: 'certificate number', bank_name: 'bank name', ifsc_code: 'IFSC code',
  account_opening_date: 'account opening date', assembly_constituency: 'assembly constituency',
};

function buildMessages(maskedText, docType) {
  const keys = TYPE_KEYS[docType] || TYPE_KEYS.other;
  const schema = {};
  for (const k of keys) schema[k] = COMMON_KEYS[k] || EXTRA_KEY_HELP[k] || k;
  schema.detected_doc_type = 'your best guess of the document type';
  return [
    {
      role: 'system',
      content: [
        'You extract data from OCR text of Indian government documents for an eMitra kiosk operator.',
        'Return ONE JSON object only. Rules:',
        '1. Copy values exactly as printed; only fix obvious OCR letter mistakes (0/O, 1/I, rn/m).',
        '2. If a value is not clearly present, use null. Never guess or invent.',
        '3. Names in English in Title Case. Keep Hindi (Devanagari) text as printed in *_hindi fields.',
        '4. Dates as DD/MM/YYYY.',
        '5. father_name is the father. husband_name only when "Husband" or "W/O" is printed. Never copy one into the other.',
        '6. Numbers shown as XXXX are hidden on purpose: return them as null.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Document type (guess): ${docType}\n\nOCR TEXT:\n"""\n${maskedText.slice(0, 3500)}\n"""\n\nReturn JSON with exactly these keys:\n${JSON.stringify(schema, null, 2)}`,
    },
  ];
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

class AiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Groq retires models from time to time. If the configured model disappears,
// pick the best available chat model automatically instead of silently
// losing AI (this happened with llama-3.3-70b-versatile in 2026).
const MODEL_PREFERENCE = ['openai/gpt-oss-120b', 'llama-3.3-70b', 'qwen/qwen3', 'openai/gpt-oss-20b', 'llama-4', 'llama'];
const NOT_CHAT = /whisper|guard|orpheus|tts|playai|allam|safeguard|distil|embed/i;
let fallbackModel = null;

function effectiveModel() {
  return fallbackModel || config.groq.model;
}

async function pickAvailableModel(exclude) {
  const res = await fetch(config.groq.url.replace(/chat\/completions$/, 'models'), {
    headers: { Authorization: `Bearer ${config.groq.apiKey}` },
  });
  const data = await res.json().catch(() => ({}));
  const ids = (data.data || []).filter((m) => m.active !== false && !NOT_CHAT.test(m.id) && (m.context_window || 8192) >= 8192)
    .map((m) => m.id).filter((id) => id !== exclude);
  for (const pref of MODEL_PREFERENCE) {
    const hit = ids.find((id) => id.startsWith(pref));
    if (hit) return hit;
  }
  return ids[0] || null;
}

function isReasoningModel(model) {
  return /gpt-oss/i.test(model);
}

async function callGroq(messages, opts = {}) {
  try {
    return await callGroqOnce(messages, opts);
  } catch (err) {
    if (err.code !== 'bad_model' || opts.model || opts.noFallback) throw err;
    const failed = effectiveModel();
    const next = await pickAvailableModel(failed).catch(() => null);
    if (!next) throw err;
    console.warn(`[ai] model "${failed}" is not available; using "${next}". Set GROQ_MODEL=${next} in backend/.env to make this permanent.`);
    fallbackModel = next;
    return callGroqOnce(messages, { ...opts, noFallback: true });
  }
}

async function callGroqOnce(messages, { maxTokens = 900, json = true, temperature = 0.1, model } = {}) {
  if (!config.groq.apiKey) throw new AiError('Groq API key is not set (GROQ_API_KEY in backend/.env)', 'no_key');
  const useModel = model || effectiveModel();
  const body = {
    model: useModel,
    messages,
    max_tokens: isReasoningModel(useModel) ? Math.max(maxTokens * 2, 1500) : maxTokens,
    temperature,
  };
  if (isReasoningModel(useModel)) body.reasoning_effort = 'low';
  if (json) body.response_format = { type: 'json_object' };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.groq.timeoutMs);
    try {
      const res = await fetch(config.groq.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.groq.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status >= 500) {
        lastErr = new AiError(res.status === 429 ? 'AI rate limit reached — try again in a minute' : `AI server error (${res.status})`, res.status === 429 ? 'rate_limited' : 'server_error');
        const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1);
        await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
        continue;
      }
      if (!res.ok || data.error) {
        const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
        const code = /decommission|does not exist|not found/i.test(msg) ? 'bad_model' : res.status === 401 || res.status === 403 ? 'bad_key' : 'error';
        throw new AiError(code === 'bad_model' ? `AI model "${body.model}" is not available — set GROQ_MODEL in backend/.env (${msg})` : `AI error: ${msg}`, code);
      }
      return { content: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content, usage: data.usage || {} };
    } catch (err) {
      if (err.name === 'AbortError') lastErr = new AiError('AI request timed out', 'timeout');
      else if (err instanceof AiError) throw err;
      else lastErr = new AiError(`Cannot reach AI service (${err.message}) — check internet`, 'network');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function parseJsonLoose(content) {
  if (!content) throw new Error('Empty AI response');
  let s = String(content).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

// ── Grounding ────────────────────────────────────────────────────────────────

function normText(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * How well does `value` appear in the OCR text? 0..1
 */
function groundingScore(key, value, text) {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(text || '');
  if (/dob|date|valid_till|bill_date/.test(key)) {
    const p = V.parseDate(value);
    if (!p) return 0;
    const dates = (raw.match(/\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4}|\d{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{4}/g) || []).map(V.parseDate).filter(Boolean);
    if (!p.d) return raw.includes(String(p.y)) ? 1 : 0;
    return dates.some((d) => d.d === p.d && d.m === p.m && d.y === p.y) ? 1 : raw.includes(String(p.y)) ? 0.4 : 0;
  }
  if (['pincode', 'mobile', 'phone', 'annual_income'].includes(key)) {
    const digits = V.digitsOnly(value);
    return digits && V.digitsOnly(raw).includes(digits) ? 1 : 0;
  }
  if (['pan_number', 'epic_number', 'dl_number', 'passport_number', 'ifsc_code', 'roll_number', 'jan_aadhaar_id', 'ration_card_number', 'consumer_number'].includes(key)) {
    const v = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!v) return 0;
    if (t.includes(v)) return 1;
    // allow 1-character OCR slip
    for (let i = 0; i + v.length <= t.length; i++) {
      if (V.levenshtein(v, t.slice(i, i + v.length)) <= 1) return 0.8;
    }
    return 0;
  }
  if (['gender', 'caste_category', 'class', 'detected_doc_type', 'result', 'division'].includes(key)) return 1; // categorical, checked elsewhere
  const tokens = normText(value).split(' ').filter((tk) => tk.length >= 2);
  if (!tokens.length) return 0;
  const textTokens = new Set(normText(raw).split(' '));
  const textArr = [...textTokens];
  const found = tokens.filter((tk) => textTokens.has(tk) || (tk.length >= 4 && textArr.some((u) => u.length >= 4 && Math.abs(u.length - tk.length) <= 1 && V.levenshtein(u, tk) <= 1))).length;
  return found / tokens.length;
}

// ── Normalising AI output into profile keys ──────────────────────────────────

const AI_KEY_MAP = {
  name: 'name', name_hindi: 'name_hi', father_name: 'father_name', father_name_hindi: 'father_name_hi',
  mother_name: 'mother_name', husband_name: 'husband_name', dob: 'dob', gender: 'gender',
  address: 'address', address_hindi: 'address_hi', house_no: 'house_no', street: 'street',
  village_city: 'village_city', post_office: 'post_office', tehsil: 'tehsil', district: 'district',
  state: 'state', pincode: 'pincode', mobile: 'phone', email: 'email', pan_number: 'pan',
  epic_number: 'voter_id', dl_number: 'driving_license', passport_number: 'passport_number',
  place_of_birth: 'birth_place', blood_group: 'blood_group', ration_card_number: 'ration_card_number',
  jan_aadhaar_id: 'jan_aadhaar_id', annual_income: 'annual_income', caste: 'caste',
  caste_category: 'caste_category', religion: 'religion', bank_name: 'bank_name', ifsc_code: 'ifsc_code',
  roll_number: '_marks_roll_number', board: '_marks_board', class: '_marks_class_level',
  school_college: '_marks_school_college', school_place: '_marks_school_place',
  year_of_passing: '_marks_year_of_passing', percentage: '_marks_percentage', division: '_marks_division',
};

const EVIDENCE_KEYS = ['date_of_issue', 'bill_date', 'billing_month', 'date_of_expiry', 'valid_till', 'account_opening_date'];

function cleanAiValue(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  let s = String(value).trim();
  if (!s || /^(null|n\/a|na|none|not available|-|unknown)$/i.test(s) || /X{4}/.test(s)) return null;
  if (key === 'dob') return V.normaliseDate(s);
  if (key === 'gender') {
    if (/^f|महिला/i.test(s)) return 'Female';
    if (/^t|ट्रांस/i.test(s)) return 'Transgender';
    if (/^m|पुरुष/i.test(s)) return 'Male';
    return null;
  }
  if (key === 'phone') { const m = V.normaliseMobile(s); return V.isValidMobile(m) ? m : null; }
  if (key === 'pincode') { const d = V.digitsOnly(s); return V.isValidPincode(d) ? d : null; }
  if (key === 'pan') { const p = s.toUpperCase().replace(/\s/g, ''); return V.isValidPAN(p) ? p : V.repairPAN(p); }
  if (key === 'ifsc_code') { const p = s.toUpperCase().replace(/\s/g, ''); return V.isValidIFSC(p) ? p : null; }
  if (key === 'annual_income') return V.parseAmount(s);
  if (key === 'caste_category') {
    const u = s.toUpperCase();
    if (/\bST\b|TRIBE|जनजाति/.test(u)) return 'ST';
    if (/\bSC\b|SCHEDULED CASTE|अनुसूचित जाति/.test(u)) return 'SC';
    if (/MBC|MOST BACKWARD|अति पिछड़ा/.test(u)) return 'MBC';
    if (/OBC|BACKWARD|पिछड़ा/.test(u)) return 'OBC';
    if (/GEN|SAMANYA|सामान्य|EWS/.test(u)) return 'General';
    return null;
  }
  if (/name$|_name$/.test(key) && !/_hi$/.test(key)) return V.titleCase(s);
  if (key === '_marks_class_level') {
    if (/12|xii|senior/i.test(s)) return '12';
    if (/10|\bx\b|secondary|matric/i.test(s)) return '10';
    if (/grad|b\.?a|b\.?sc|b\.?com|degree/i.test(s)) return 'graduate';
    return null;
  }
  return s;
}

/**
 * Parse OCR text with the AI.
 * @returns {Promise<{ fields, meta, evidence, detectedType, tokens, ms, model, error? }>}
 */
async function parseWithAi(text, docType) {
  const started = Date.now();
  const masked = maskForAi(text);
  const { content, usage } = await callGroq(buildMessages(masked, docType), { maxTokens: 900 });
  const raw = parseJsonLoose(content);
  const fields = {};
  const meta = {};
  const evidence = {};
  for (const [aiKey, value] of Object.entries(raw)) {
    if (EVIDENCE_KEYS.includes(aiKey)) {
      const v = aiKey === 'billing_month' ? value : V.normaliseDate(value);
      if (v && !/X{4}/.test(String(v))) evidence[aiKey] = v;
      continue;
    }
    const key = AI_KEY_MAP[aiKey];
    if (!key) continue;
    const v = cleanAiValue(key, value);
    if (v === null || v === undefined || v === '') continue;
    const g = groundingScore(aiKey === 'mobile' ? 'phone' : aiKey, v, text);
    fields[key] = v;
    meta[key] = {
      method: 'ai',
      grounded: g >= 0.6,
      grounding: Math.round(g * 100) / 100,
      confidence: g >= 0.6 ? 0.85 : g >= 0.3 ? 0.6 : 0.35,
    };
  }
  return {
    fields, meta, evidence,
    detectedType: typeof raw.detected_doc_type === 'string' ? raw.detected_doc_type : null,
    tokens: usage.total_tokens || 0,
    ms: Date.now() - started,
    model: effectiveModel(),
  };
}

async function testConnection() {
  try {
    const { content } = await callGroq([
      { role: 'system', content: 'Reply with JSON only.' },
      { role: 'user', content: 'Return {"status":"ok"}' },
    ], { maxTokens: 40 });
    const json = parseJsonLoose(content);
    return { ok: json.status === 'ok', model: effectiveModel(), configured_model: config.groq.model };
  } catch (err) {
    return { ok: false, model: effectiveModel(), error: err.message, code: err.code };
  }
}

/** Free-text answer for the operator's AI helper (context must be pre-masked). */
async function askAssistant(question, context, lang = 'en') {
  const { content } = await callGroq([
    {
      role: 'system',
      content: `You help an eMitra kiosk operator in Rajasthan. Answer briefly and practically in ${lang === 'hi' ? 'simple Hindi' : 'simple English'}.
Use only the customer data and rules given below. If something is not in the data, say so. Do not invent government rules, fees or deadlines — tell the operator to confirm on the official portal when unsure.

DATA:
${JSON.stringify(context, null, 1).slice(0, 6000)}`,
    },
    { role: 'user', content: String(question).slice(0, 1000) },
  ], { maxTokens: 500, json: false, temperature: 0.3 });
  return content || '';
}

module.exports = { maskForAi, parseWithAi, groundingScore, testConnection, askAssistant, effectiveModel, AiError, _internal: { buildMessages, cleanAiValue } };
