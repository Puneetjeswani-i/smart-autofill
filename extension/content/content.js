/**
 * Smart Autofill Content Script — v4
 *
 * Key fixes over v3:
 * - getFieldContext now uses ONLY the direct label for the field (no container bleed)
 * - getVal fallbacks removed (birth_place no longer falls back to district/dob)
 * - nationality getVal no longer hardcodes 'Indian' when profile value is null
 * - gender excluded from nationality/percentage/birth_place matches
 * - Threshold raised to 0.70
 * - address field now matches 'current residential address' and similar
 */

// ── FIELD MAP ────────────────────────────────────────────────────────
const FIELD_MAP = {
  name: {
    keywords: ['full name','fullname','applicant name','applicant_name',
               'candidate name','your name','legal name','पूर्ण नाम','आवेदक का नाम',
               'name as per aadhaar','name as on aadhaar'],
    exclude:  ['father','mother','husband','school','college','institution','guardian',
               'year','passing','percentage','grade','board','spouse','s/o','d/o','w/o',
               'aadhaar','pan','voter','passport','driving','account'],
    getVal: p => p.name,
  },
  father_name: {
    keywords: ["father's name",'father name','पिता का नाम','पिता / पति का नाम',
               's/o','son of','d/o','daughter of','पिता'],
    exclude:  ['mother','husband','school','year','percentage','board'],
    getVal: p => p.father_name,
  },
  mother_name: {
    keywords: ["mother's name",'mother name','माता का नाम','माता'],
    exclude:  ['father','husband','school','year','percentage','board'],
    getVal: p => p.mother_name,
  },
  husband_name: {
    keywords: ["husband's name",'husband name','w/o','wife of','spouse name','पति का नाम'],
    exclude:  ['father','mother','school','year','percentage','board'],
    getVal: p => p.husband_name,   // no fallback to father_name — only fill if actually married
  },
  dob: {
    keywords: ['date of birth','dob','birth date','birthdate','जन्म तिथि','जन्म दिनांक'],
    exclude:  ['year of passing','passing year','school','college','board','percentage','place'],
    getVal: p => p.dob,
  },
  gender: {
    keywords: ['gender','sex','लिंग'],
    exclude:  ['nationality','percentage','grade','birth','place','school','year'],
    getVal: p => p.gender,
  },
  phone: {
    keywords: ['mobile number','phone number','mobile no','contact number','mob no',
               'cell number','telephone','मोबाइल नंबर','मोबाइल'],
    exclude:  [],
    getVal: p => p.phone,
  },
  email: {
    keywords: ['email address','email id','e-mail','emailid','ईमेल'],
    exclude:  [],
    getVal: p => p.email,
  },
  id_number: {
    keywords: ['aadhaar number','aadhar number','uid number','aadhaar no','आधार नंबर','आधार संख्या'],
    exclude:  ['name','father','mother','dob','birth'],
    getVal: p => p.id_number,
  },
  pan: {
    keywords: ['pan number','pan card number','permanent account number','पैन नंबर','pan card'],
    exclude:  [],
    getVal: p => p.pan,
  },
  voter_id: {
    keywords: ['voter id','voter number','epic number','electoral id','मतदाता पहचान पत्र'],
    exclude:  [],
    getVal: p => p.voter_id,
  },
  driving_license: {
    keywords: ['driving licence','driving license','dl number','dl no','licence number',
               'ड्राइविंग लाइसेंस नंबर'],
    exclude:  [],
    getVal: p => p.driving_license,
  },
  passport_number: {
    keywords: ['passport number','passport no','पासपोर्ट नंबर'],
    exclude:  [],
    getVal: p => p.passport_number,
  },
  address: {
    keywords: ['current residential address','permanent address','current address',
               'residential address','home address','full address',
               'वर्तमान पता','स्थायी पता','आवासीय पता',
               'house no street locality','house no. street'],
    exclude:  ['pin','pincode','district','state','city','village','town'],
    getVal: p => p.address,
  },
  pincode: {
    keywords: ['pin code','pincode','postal code','zip code','पिन कोड','6-digit pin','6 digit pin'],
    exclude:  [],
    getVal: p => p.pincode,
  },
  district: {
    keywords: ['district','distt','जिला'],
    exclude:  ['school','college','year','percentage'],
    getVal: p => p.district,
  },
  state: {
    keywords: ['state','province','राज्य'],
    exclude:  ['year','passing','percentage','school','college','nationality'],
    getVal: p => p.state,
  },
  nationality: {
    keywords: ['nationality','citizenship','राष्ट्रीयता'],
    exclude:  ['gender','sex','percentage','grade','school','year','birth','place'],
    getVal: p => p.nationality,
  },
  birth_place: {
    keywords: ['place of birth','birth place','born at','जन्म स्थान','जन्म स्थल'],
    exclude:  ['date','dob','year','percentage','gender','nationality'],
    getVal: p => p.birth_place,   // no fallback — don't fill with wrong data
  },
  years_in_rajasthan: {
    keywords: ['years in rajasthan','years residing in rajasthan','years residing',
               'निवास वर्ष','rajasthan mein niwas'],
    exclude:  [],
    getVal: p => p.years_in_rajasthan,
  },

  // ── Education ──────────────────────────────────────────────────────
  education_10th_school: {
    keywords: ['10th school','class x school','class 10 school','matriculation school',
               'secondary school name','school name class x','school name class 10',
               'school name matriculation','10वीं विद्यालय'],
    exclude:  ['12th','xii','senior secondary','higher secondary','college','graduate',
               'year of passing','percentage','grade','board'],
    getVal: p => p.education_10th_school,
  },
  education_10th_board: {
    keywords: ['10th board','class x board','class 10 board','matriculation board',
               'board class 10','board class x'],
    exclude:  ['12th','xii','school name','college','year','percentage'],
    getVal: p => p.education_10th_board,
  },
  education_10th_year: {
    keywords: ['10th year of passing','class x year of passing','year of passing class 10',
               'matriculation year','passing year class x','year class 10'],
    exclude:  ['12th','xii','school','college','percentage','board'],
    getVal: p => p.education_10th_year,
  },
  education_10th_percentage: {
    keywords: ['10th percentage','class x percentage','class x grade','marks class 10',
               'percentage class x','grade class 10','matriculation percentage',
               'percentage grade class x','percentage grade matriculation',
               'percentage grade class x matriculation',
               // Generic label + section context combinations
               'percentage grade class x','percentage grade matriculation',
               'percentage class x matriculation'],
    exclude:  ['12th','xii','senior secondary','school','college','year','board','gender','nationality'],
    getVal: p => p.education_10th_percentage,
  },
  education_12th_school: {
    keywords: ['12th school','class xii school','class 12 school','senior secondary school',
               'higher secondary school','school name class xii','school name class 12',
               'school college name class xii','12वीं विद्यालय'],
    exclude:  ['10th','class x','matriculation','graduate','year of passing',
               'percentage','grade','board'],
    getVal: p => p.education_12th_school,
  },
  education_12th_board: {
    keywords: ['12th board','class xii board','class 12 board','senior secondary board',
               'higher secondary board','board class xii','board class 12',
               // Generic "board" label + section context
               'board class xii senior','board senior secondary',
               'board class 12 senior','board xii'],
    exclude:  ['10th','class x','matriculation','school name','college','year','percentage'],
    getVal: p => p.education_12th_board,
  },
  education_12th_year: {
    keywords: ['12th year of passing','class xii year of passing','year of passing class 12',
               'senior secondary year','passing year class xii','year class 12'],
    exclude:  ['10th','class x','school','college','percentage','board'],
    getVal: p => p.education_12th_year,
  },
  education_12th_percentage: {
    keywords: ['12th percentage','class xii percentage','class xii grade',
               'marks class 12','percentage class xii','grade class 12',
               'senior secondary percentage','percentage grade class xii',
               'percentage grade senior secondary',
               // Generic label + section context combinations
               'percentage grade class xii','percentage grade senior',
               'percentage class xii senior','percentage class 12 senior',
               // Just "percentage" or "grade" when section is class xii
               'percentage class xii','percentage senior secondary',
               'grade class xii','grade senior secondary'],
    exclude:  ['10th','class x','matriculation','school','college','year','board','gender','nationality'],
    getVal: p => p.education_12th_percentage,
  },
  education_grad_school: {
    keywords: ['graduation college','graduate college','college name graduation',
               'university name','degree college','स्नातक महाविद्यालय'],
    exclude:  ['10th','12th','school','year of passing','percentage','board'],
    getVal: p => p.education_grad_school,
  },
  highest_education: {
    keywords: ['highest qualification','highest education','educational qualification',
               'उच्चतम शैक्षिक योग्यता','highest academic qualification'],
    exclude:  ['school','college','year','percentage','board'],
    getVal: p => p.highest_education,
  },
};

// ── HELPERS ──────────────────────────────────────────────────────────
function extractPIN(address) {
  const m = address && address.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[\s\-_\.\/\*]+/g, ' ').trim();
}

/**
 * Get the label text for a field — uses ONLY the direct label for that specific input.
 * Also checks the nearest section heading (fieldset legend / section title) for education context.
 */
function getFieldLabel(el) {
  // 1. aria-label (most reliable)
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return normalize(ariaLabel);

  // 2. label[for=id]
  if (el.id) {
    const linked = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (linked) return normalize(linked.textContent);
  }

  // 3. Wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input,select,textarea').forEach(e => e.remove());
    const txt = normalize(clone.textContent);
    if (txt.length > 2) return txt;
  }

  // 4. Immediately preceding sibling that looks like a label
  let prev = el.previousElementSibling;
  let steps = 0;
  while (prev && steps < 3) {
    const tag = prev.tagName.toLowerCase();
    if (tag === 'label' || tag === 'span' || tag === 'p' || tag === 'div') {
      const txt = normalize(prev.textContent);
      if (txt.length > 2 && txt.length < 120) return txt;
    }
    prev = prev.previousElementSibling;
    steps++;
  }

  // 5. name/id/placeholder as last resort
  const fallback = el.placeholder || el.name || el.id || '';
  return normalize(fallback);
}

/**
 * Get section context — looks for the nearest fieldset legend or section heading.
 * Used to disambiguate "Percentage / Grade" in Class X vs Class XII sections.
 * Also includes the element's own name/id attributes as hints.
 */
function getSectionContext(el) {
  // Include element's own name/id as context hints
  const ownHints = normalize((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-field') || ''));

  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 15) {
    const tag = node.tagName?.toLowerCase();

    // Check for fieldset legend
    if (tag === 'fieldset') {
      const legend = node.querySelector('legend');
      if (legend) return ownHints + ' ' + normalize(legend.textContent);
    }

    // Check for heading elements directly inside this node
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > legend');
    if (heading) {
      const txt = normalize(heading.textContent);
      if (txt.length > 2 && txt.length < 100) return ownHints + ' ' + txt;
    }

    // Check if this node itself is a heading
    if (['h1','h2','h3','h4','h5','legend'].includes(tag)) {
      const txt = normalize(node.textContent);
      if (txt.length > 2 && txt.length < 100) return ownHints + ' ' + txt;
    }

    // Check for common section title class names
    if (node.className && /section.title|card.title|panel.title|group.title|form.section/i.test(String(node.className))) {
      const txt = normalize(node.textContent);
      if (txt.length > 2 && txt.length < 100) return ownHints + ' ' + txt;
    }

    // Look for any element with class containing 'title' or 'heading' as first child
    const titleEl = node.querySelector(':scope > [class*="title"], :scope > [class*="heading"]');
    if (titleEl && titleEl !== el) {
      const txt = normalize(titleEl.textContent);
      if (txt.length > 2 && txt.length < 80) return ownHints + ' ' + txt;
    }

    node = node.parentElement;
    depth++;
  }
  return ownHints;
}

/**
 * Get section context — looks for the nearest fieldset legend or section heading.
 * Used to disambiguate "Percentage / Grade" in Class X vs Class XII sections.
 */
function getSectionContext(el) {
  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 15) {
    const tag = node.tagName?.toLowerCase();

    // Check for fieldset legend
    if (tag === 'fieldset') {
      const legend = node.querySelector('legend');
      if (legend) return normalize(legend.textContent);
    }

    // Check for heading elements directly inside this node
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > legend');
    if (heading) {
      const txt = normalize(heading.textContent);
      if (txt.length > 2 && txt.length < 100) return txt;
    }

    // Check if this node itself is a heading
    if (['h1','h2','h3','h4','h5','legend'].includes(tag)) {
      const txt = normalize(node.textContent);
      if (txt.length > 2 && txt.length < 100) return txt;
    }

    // Check for common section title class names
    if (node.className && /section.title|card.title|panel.title|group.title|form.section/i.test(node.className)) {
      const txt = normalize(node.textContent);
      if (txt.length > 2 && txt.length < 100) return txt;
    }

    // Look for any element with class containing 'title' or 'heading' as first child
    const titleEl = node.querySelector(':scope > [class*="title"], :scope > [class*="heading"], :scope > [class*="label"]');
    if (titleEl && titleEl !== el) {
      const txt = normalize(titleEl.textContent);
      if (txt.length > 2 && txt.length < 80) return txt;
    }

    node = node.parentElement;
    depth++;
  }
  return '';
}

function matchScore(label, keywords, exclude) {
  if (!label || label.length < 2) return 0;

  // Exclusion check — if any exclusion word appears in the label, reject
  if (exclude && exclude.length > 0) {
    for (const ex of exclude) {
      if (label.includes(normalize(ex))) return 0;
    }
  }

  let best = 0;
  for (const kw of keywords) {
    const nkw = normalize(kw);
    if (label === nkw) { best = 1.0; break; }
    if (label.includes(nkw)) {
      // Phrase found in label — score based on how much of the label it covers
      const coverage = nkw.length / label.length;
      best = Math.max(best, Math.min(0.95, 0.75 + coverage * 0.2));
    } else {
      // Word-level overlap (only meaningful words, length > 2)
      const kwWords = nkw.split(' ').filter(w => w.length > 2);
      if (kwWords.length === 0) continue;
      const labelWords = label.split(' ');
      const overlap = kwWords.filter(w =>
        labelWords.some(c => c === w || (c.length > 3 && (c.startsWith(w) || w.startsWith(c))))
      ).length;
      if (overlap > 0) {
        const ratio = overlap / kwWords.length;
        // Only give partial credit if majority of keyword words match
        if (ratio >= 0.5) best = Math.max(best, 0.55 + ratio * 0.2);
      }
    }
  }
  return best;
}

function detectField(el) {
  const label = getFieldLabel(el);
  if (!label || label.length < 2) return null;

  // Build combined context: label + section heading + element name/id hints
  const section = getSectionContext(el);
  const combinedContext = section ? `${label} ${section}` : label;

  // Debug: log what we're working with
  console.log(`[AutoFill v4] Detecting: label="${label}" section="${section.substring(0,60)}" combined="${combinedContext.substring(0,80)}"`);

  let bestField = null, bestScore = 0;
  for (const [key, cfg] of Object.entries(FIELD_MAP)) {
    // Try combined context
    let score = matchScore(combinedContext, cfg.keywords, cfg.exclude);
    // Also try label alone
    const labelScore = matchScore(label, cfg.keywords, cfg.exclude);
    score = Math.max(score, labelScore);
    if (score > bestScore) { bestScore = score; bestField = key; }
  }

  // ── Position-based fallback for generic education labels ──────────
  // If label is "percentage / grade" or "board" and section contains class level info
  if (bestScore < 0.70) {
    const lbl = label.replace(/[^a-z0-9 ]/g, '').trim();
    const sec = section.toLowerCase();
    const isXII = /xii|12|senior secondary|higher secondary/i.test(sec);
    const isX   = /\bx\b|class 10|matriculation|secondary(?!.*senior)/i.test(sec);

    if (/^percentage/.test(lbl) || /^grade/.test(lbl) || lbl === 'percentage grade') {
      if (isXII) { bestField = 'education_12th_percentage'; bestScore = 0.80; }
      else if (isX) { bestField = 'education_10th_percentage'; bestScore = 0.80; }
    }
    if (/^board$/.test(lbl) || lbl === 'board of examination' || lbl === 'select board') {
      if (isXII) { bestField = 'education_12th_board'; bestScore = 0.80; }
      else if (isX) { bestField = 'education_10th_board'; bestScore = 0.80; }
    }
    if (/^school/.test(lbl) || /school college name/.test(lbl)) {
      if (isXII) { bestField = 'education_12th_school'; bestScore = 0.80; }
      else if (isX) { bestField = 'education_10th_school'; bestScore = 0.80; }
    }
    if (/year of passing/.test(lbl) || /^year$/.test(lbl)) {
      if (isXII) { bestField = 'education_12th_year'; bestScore = 0.80; }
      else if (isX) { bestField = 'education_10th_year'; bestScore = 0.80; }
    }
  }

  if (bestScore >= 0.70) {
    console.log(`[AutoFill v4] Matched: "${label}" → ${bestField} (${Math.round(bestScore*100)}%)`);
  } else {
    console.log(`[AutoFill v4] No match for: "${label}" (best=${Math.round(bestScore*100)}% as ${bestField})`);
  }

  return bestScore >= 0.70 ? { field: bestField, score: bestScore } : null;
}

function fillInput(el, value) {
  if (value === null || value === undefined || value === '') return false;
  const str = String(value);
  if (el.tagName === 'SELECT') {
    const lv = str.toLowerCase().trim();
    // Try exact match first
    let opt = Array.from(el.options).find(o =>
      o.value.toLowerCase() === lv || o.text.toLowerCase() === lv
    );
    // Try contains match
    if (!opt) opt = Array.from(el.options).find(o =>
      o.text.toLowerCase().includes(lv) || lv.includes(o.text.toLowerCase().trim())
    );
    // For board fields: try keyword matching (CBSE, ICSE, UP Board, etc.)
    if (!opt) {
      const boardKeywords = extractBoardKeywords(lv);
      opt = Array.from(el.options).find(o => {
        const ot = o.text.toLowerCase();
        return boardKeywords.some(kw => ot.includes(kw));
      });
    }
    if (opt) { el.value = opt.value; triggerEvents(el); return true; }
    return false;
  }
  const nativeSetter = el.tagName === 'TEXTAREA'
    ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, str);
  else el.value = str;
  triggerEvents(el);
  return true;
}

/**
 * Extract meaningful keywords from a board name for fuzzy select matching.
 * e.g. "Uttar Pradesh Board Of High School And Intermediate Education"
 *   → ['uttar pradesh', 'up board', 'upmsp']
 */
function extractBoardKeywords(boardName) {
  const kws = [boardName];
  if (/uttar\s*pradesh/i.test(boardName)) kws.push('uttar pradesh', 'up board', 'upmsp', 'u.p');
  if (/cbse/i.test(boardName)) kws.push('cbse', 'central board');
  if (/icse|cisce/i.test(boardName)) kws.push('icse', 'cisce');
  if (/rajasthan/i.test(boardName)) kws.push('rajasthan', 'rbse', 'bser');
  if (/maharashtra/i.test(boardName)) kws.push('maharashtra', 'msbshse');
  if (/bihar/i.test(boardName)) kws.push('bihar', 'bseb');
  if (/madhya\s*pradesh/i.test(boardName)) kws.push('madhya pradesh', 'mpbse');
  if (/gujarat/i.test(boardName)) kws.push('gujarat', 'gseb');
  if (/karnataka/i.test(boardName)) kws.push('karnataka', 'kseeb');
  if (/tamil\s*nadu/i.test(boardName)) kws.push('tamil nadu', 'tnbse');
  if (/west\s*bengal/i.test(boardName)) kws.push('west bengal', 'wbbse');
  return kws;
}

function triggerEvents(el) {
  ['input', 'change', 'blur', 'keyup'].forEach(t =>
    el.dispatchEvent(new Event(t, { bubbles: true }))
  );
}

function highlightField(el, score) {
  const color = score >= 0.85 ? '34, 197, 94' : score >= 0.70 ? '234, 179, 8' : '99, 102, 241';
  el.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
  el.style.boxShadow = `0 0 0 2px rgba(${color}, 0.5)`;
  el.style.outline = `2px solid rgba(${color}, 0.8)`;
  setTimeout(() => { el.style.boxShadow = ''; el.style.outline = ''; }, 3000);
}

function getInputs() {
  return Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="image"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]),' +
    'textarea, select'
  )).filter(el => {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && !el.disabled && !el.readOnly;
  });
}

// ── PREVIEW OVERLAY ──────────────────────────────────────────────────
let overlayEl = null;

function showConsentOverlay(mappings, profile, onConfirm, onCancel) {
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.id = '__autofill_overlay__';
  overlayEl.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:2147483647;
    width:340px;max-height:80vh;overflow-y:auto;
    background:#1e1e2e;color:#cdd6f4;border-radius:16px;
    box-shadow:0 20px 60px rgba(0,0,0,0.6);border:1px solid #313244;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;
  `;
  const highConf = mappings.filter(m => m.score >= 0.85).length;
  const medConf  = mappings.filter(m => m.score >= 0.70 && m.score < 0.85).length;

  overlayEl.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:10px">
      <div style="font-size:22px">⚡</div>
      <div>
        <div style="font-weight:700;font-size:15px;color:#cba6f7">Smart Autofill</div>
        <div style="font-size:11px;color:#6c7086">${mappings.length} field${mappings.length !== 1 ? 's' : ''} detected on this page</div>
      </div>
      <button id="__af_close__" style="margin-left:auto;background:none;border:none;color:#6c7086;cursor:pointer;font-size:18px;line-height:1">×</button>
    </div>
    <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap">
      ${highConf ? `<span style="background:#1e3a1e;color:#a6e3a1;padding:3px 8px;border-radius:20px;font-size:11px">✓ ${highConf} high confidence</span>` : ''}
      ${medConf  ? `<span style="background:#3a2e1e;color:#f9e2af;padding:3px 8px;border-radius:20px;font-size:11px">⚠ ${medConf} medium confidence</span>` : ''}
    </div>
    <div style="padding:0 12px;max-height:320px;overflow-y:auto">
      ${mappings.map((m, i) => {
        const confColor = m.score >= 0.85 ? '#a6e3a1' : '#f9e2af';
        const confLabel = m.score >= 0.85 ? 'High' : 'Med';
        return `
          <div style="margin:6px 0;background:#181825;border-radius:10px;padding:10px 12px;border:1px solid #313244">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="color:#89b4fa;font-size:11px;font-weight:600;text-transform:uppercase">${m.field.replace(/_/g,' ')}</div>
              <div style="font-size:10px;color:${confColor};background:${confColor}22;padding:2px 6px;border-radius:10px">${confLabel} ${Math.round(m.score*100)}%</div>
            </div>
            <input id="__af_val_${i}__" value="${escHtml(String(m.value || ''))}"
              style="width:100%;background:#11111b;border:1px solid #45475a;border-radius:6px;padding:6px 8px;color:#cdd6f4;font-size:12px;box-sizing:border-box"/>
            <div style="font-size:10px;color:#6c7086;margin-top:4px">→ ${escHtml(m.label)}</div>
          </div>`;
      }).join('')}
    </div>
    <div style="padding:14px 16px;display:flex;gap:8px;border-top:1px solid #313244">
      <button id="__af_confirm__" style="flex:1;background:#6c5ce7;color:#fff;border:none;border-radius:8px;padding:9px 0;cursor:pointer;font-weight:600;font-size:13px">
        ⚡ Fill ${mappings.length} Fields
      </button>
      <button id="__af_cancel__" style="background:#313244;color:#cdd6f4;border:none;border-radius:8px;padding:9px 14px;cursor:pointer;font-size:13px">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlayEl);

  document.getElementById('__af_close__')?.addEventListener('click', () => { removeOverlay(); onCancel(); });
  document.getElementById('__af_cancel__')?.addEventListener('click', () => { removeOverlay(); onCancel(); });
  document.getElementById('__af_confirm__')?.addEventListener('click', () => {
    const editedMappings = mappings.map((m, i) => ({
      ...m,
      value: document.getElementById(`__af_val_${i}__`)?.value ?? m.value,
    }));
    removeOverlay();
    onConfirm(editedMappings);
  });
}

function removeOverlay() {
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SCAN FIELDS ──────────────────────────────────────────────────────
function scanFields() {
  return getInputs().map(el => {
    const match = detectField(el);
    const label = el.getAttribute('aria-label')
      || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
      || el.placeholder || el.name || el.id || 'unnamed';
    return { el, label, matched: match?.field || null, score: match?.score || 0 };
  }).filter(f => f.matched);
}

// ── AUTOFILL ─────────────────────────────────────────────────────────
function buildMappings(profile) {
  return scanFields().map(f => ({
    el: f.el,
    field: f.matched,
    label: f.label,
    score: f.score,
    value: FIELD_MAP[f.matched]?.getVal(profile) || null,
  })).filter(m => m.value !== null && m.value !== undefined && m.value !== '');
}

function executeAutofill(mappings) {
  let filled = 0;
  for (const m of mappings) {
    if (fillInput(m.el, m.value)) {
      highlightField(m.el, m.score);
      filled++;
      console.log(`[AutoFill v4] ✓ "${m.label}" → ${m.field} = "${m.value}" (${Math.round(m.score * 100)}%)`);
    }
  }
  return { filled, total: mappings.length };
}

// ── MESSAGE LISTENER ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'scanFields') {
    const fields = scanFields().map(f => ({
      name: f.label, tag: f.el.tagName, type: f.el.type || '',
      matched: f.matched, score: f.score,
    }));
    sendResponse({ fields });
  }

  if (message.action === 'doAutofill') {
    const profile = message.profile;
    if (!profile) return sendResponse({ filled: 0, total: 0 });
    const mappings = buildMappings(profile);
    if (mappings.length === 0) return sendResponse({ filled: 0, total: 0 });

    if (message.showPreview) {
      showConsentOverlay(
        mappings, profile,
        (editedMappings) => {
          const result = executeAutofill(editedMappings);
          chrome.runtime.sendMessage({ action: 'autofillComplete', result });
        },
        () => chrome.runtime.sendMessage({ action: 'autofillCancelled' })
      );
      sendResponse({ preview: true, fields_detected: mappings.length });
    } else {
      sendResponse(executeAutofill(mappings));
    }
  }

  if (message.action === 'removeOverlay') {
    removeOverlay();
    sendResponse({ ok: true });
  }

  // ── Portal autofill triggered by background.js ──────────────────
  if (message.action === 'doPortalAutofill') {
    const { schemeId, profileData } = message;
    const result = runPortalAutofill(schemeId, profileData);
    // Clear pending after filling
    if (window.chrome?.storage?.local) {
      chrome.storage.local.remove('pendingAutofill');
    }
    sendResponse({ filled: result.filled, total: result.total });
  }

  return true;
});

// ── Listen for postMessage from the dashboard (same tab) ─────────────
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'SMART_AUTOFILL_APPLY') return;
  const { schemeId, profileData } = event.data;
  if (!schemeId || !profileData) return;

  // Store in chrome.storage.local so background.js can trigger on the new tab
  if (window.chrome?.storage?.local) {
    chrome.storage.local.set({
      pendingAutofill: { schemeId, profileData, timestamp: Date.now() },
    });
  }
});

// ── Portal field maps ─────────────────────────────────────────────────
const PORTAL_FIELD_MAPS = {
  // eMitra (mool_niwas, income_certificate, caste_certificate)
  emitra: {
    name:        ['#applicantName','[name="applicantName"]','[placeholder*="Name"]','[placeholder*="नाम"]'],
    father_name: ['#fatherName','[name="fatherName"]','[placeholder*="Father"]','[placeholder*="पिता"]'],
    dob:         ['#dob','[name="dob"]','[placeholder*="Birth"]','[placeholder*="जन्म"]'],
    id_number:   ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]','[placeholder*="आधार"]'],
    address:     ['#address','[name="address"]','[placeholder*="Address"]','[placeholder*="पता"]'],
    district:    ['#district','[name="district"]','[placeholder*="District"]','[placeholder*="जिला"]'],
    pincode:     ['#pincode','[name="pincode"]','[placeholder*="PIN"]','[placeholder*="पिन"]'],
    phone:       ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]','[placeholder*="मोबाइल"]'],
  },
  // Scholarship portal
  scholarship: {
    name:                      ['#studentName','[name="studentName"]','[placeholder*="Student Name"]'],
    dob:                       ['#dob','[name="dob"]','[placeholder*="Date of Birth"]'],
    id_number:                 ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]'],
    father_name:               ['#fatherName','[name="fatherName"]','[placeholder*="Father"]'],
    address:                   ['#address','[name="address"]','[placeholder*="Address"]'],
    pincode:                   ['#pincode','[name="pincode"]','[placeholder*="PIN"]'],
    education_12th_school:     ['#schoolName','[name="schoolName"]','[placeholder*="School"]'],
    education_12th_board:      ['#boardName','[name="boardName"]','[placeholder*="Board"]'],
    education_12th_percentage: ['#percentage','[name="percentage"]','[placeholder*="Percentage"]'],
  },
  // ECI Voter portal
  voters: {
    name:     ['#applicantName','[name="applicantName"]','[placeholder*="Name"]'],
    dob:      ['#dob','[name="dob"]','[placeholder*="Birth"]'],
    gender:   ['#gender','[name="gender"]','[placeholder*="Gender"]'],
    phone:    ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]'],
    email:    ['#emailId','[name="emailId"]','[placeholder*="Email"]'],
    address:  ['#houseNo','[name="houseNo"]','[placeholder*="House"]'],
    pincode:  ['#pinCode','[name="pinCode"]','[placeholder*="PIN"]'],
  },
  // Sarathi DL portal
  sarathi: {
    name:        ['#appName','[name="appName"]','[placeholder*="Name"]'],
    dob:         ['#appDob','[name="appDob"]','[placeholder*="Birth"]'],
    gender:      ['#appGender','[name="appGender"]'],
    phone:       ['#appMobile','[name="appMobile"]','[placeholder*="Mobile"]'],
    blood_group: ['#appBloodGroup','[name="appBloodGroup"]'],
    address:     ['#appAddress','[name="appAddress"]','[placeholder*="Address"]'],
    pincode:     ['#appPincode','[name="appPincode"]','[placeholder*="PIN"]'],
  },
  // PM-KISAN
  pmkisan: {
    id_number:   ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]'],
    name:        ['#farmerName','[name="farmerName"]','[placeholder*="Name"]'],
    father_name: ['#fatherName','[name="fatherName"]','[placeholder*="Father"]'],
    address:     ['#address','[name="address"]','[placeholder*="Address"]'],
    district:    ['#districtName','[name="districtName"]','[placeholder*="District"]'],
    state:       ['#stateName','[name="stateName"]','[placeholder*="State"]'],
    pincode:     ['#pinCode','[name="pinCode"]','[placeholder*="PIN"]'],
    phone:       ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]'],
  },
  // Ayushman Bharat
  ayushman: {
    id_number: ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]'],
    phone:     ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]'],
    name:      ['#name','[name="name"]','[placeholder*="Name"]'],
  },
  // NSP Scholarship
  nsp: {
    name:           ['#studentName','[name="studentName"]','[placeholder*="Name"]'],
    dob:            ['#dob','[name="dob"]','[placeholder*="Birth"]'],
    phone:          ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]'],
    email:          ['#emailId','[name="emailId"]','[placeholder*="Email"]'],
    id_number:      ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]'],
    account_number: ['#bankAccountNo','[name="bankAccountNo"]','[placeholder*="Account"]'],
    ifsc_code:      ['#ifscCode','[name="ifscCode"]','[placeholder*="IFSC"]'],
  },
  // Rajasthan Sambal / LDMS
  ldms: {
    name:        ['#workerName','[name="workerName"]','[placeholder*="Name"]'],
    father_name: ['#fatherName','[name="fatherName"]','[placeholder*="Father"]'],
    dob:         ['#dob','[name="dob"]','[placeholder*="Birth"]'],
    id_number:   ['#aadhaarNo','[name="aadhaarNo"]','[placeholder*="Aadhaar"]'],
    phone:       ['#mobileNo','[name="mobileNo"]','[placeholder*="Mobile"]'],
    address:     ['#address','[name="address"]','[placeholder*="Address"]'],
    district:    ['#district','[name="district"]','[placeholder*="District"]'],
    pincode:     ['#pincode','[name="pincode"]','[placeholder*="PIN"]'],
  },
};

// Map scheme IDs to portal field maps
const SCHEME_TO_PORTAL = {
  mool_niwas:         'emitra',
  income_certificate: 'emitra',
  caste_certificate:  'emitra',
  scholarship:        'scholarship',
  voter_registration: 'voters',
  driving_license:    'sarathi',
  pm_kisan:           'pmkisan',
  ayushman_bharat:    'ayushman',
  nsp_scholarship:    'nsp',
  rajasthan_sambal:   'ldms',
};

/**
 * Fill a portal form using the scheme's field map and profile data.
 * Tries multiple selectors per field, uses the first that finds an element.
 */
function runPortalAutofill(schemeId, profileData) {
  const portalKey = SCHEME_TO_PORTAL[schemeId];
  const fieldMap  = PORTAL_FIELD_MAPS[portalKey];
  if (!fieldMap || !profileData) return { filled: 0, total: 0 };

  let filled = 0;
  const total = Object.keys(fieldMap).length;

  for (const [profileKey, selectors] of Object.entries(fieldMap)) {
    const value = profileData[profileKey];
    if (!value) continue;

    let el = null;
    for (const sel of selectors) {
      try {
        el = document.querySelector(sel);
        if (el) break;
      } catch {}
    }

    // Fallback: find by label text
    if (!el) {
      const labelText = profileKey.replace(/_/g, ' ');
      const labels = document.querySelectorAll('label');
      for (const label of labels) {
        if (label.textContent.toLowerCase().includes(labelText.toLowerCase())) {
          const forId = label.getAttribute('for');
          if (forId) el = document.getElementById(forId);
          if (!el) el = label.querySelector('input, select, textarea');
          if (!el) el = label.nextElementSibling?.querySelector?.('input, select, textarea') || label.nextElementSibling;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) break;
          else el = null;
        }
      }
    }

    if (el && fillInput(el, String(value))) {
      highlightField(el, 0.85);
      filled++;
      console.log(`[AutoFill Portal] ✓ ${profileKey} → "${value}"`);
    }
  }

  console.log(`[AutoFill Portal] Filled ${filled}/${total} fields for ${schemeId}`);
  return { filled, total };
}
