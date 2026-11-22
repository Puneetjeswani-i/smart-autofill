/**
 * Smart Autofill — content script (v6)
 *
 * On the Smart Autofill dashboard (localhost): receives the pairing key.
 * On government portals: detects form fields, shows a PREVIEW of what will be
 * filled for the active customer, fills only after the operator confirms,
 * and lets the operator "teach" fields the heuristics do not recognise.
 *
 * It never clicks submit/pay buttons and never stores customer data.
 */
(() => {
  if (window.__smartAutofillLoaded) return;
  window.__smartAutofillLoaded = true;

  const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  // ── 1. Pairing with the dashboard ─────────────────────────────────────────
  if (IS_LOCAL && HAS_CHROME) {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data || {};
      if (d.type !== 'SMART_AUTOFILL_PAIR' || !d.key) return;
      chrome.runtime.sendMessage({ action: 'pair', key: d.key, backend: d.backend || location.origin }, (r) => {
        if (r && r.ok) window.postMessage({ type: 'SMART_AUTOFILL_PAIRED', version: '6.0.0' }, location.origin);
      });
    });
    return; // no autofill UI on the dashboard itself
  }

  // ── 2. Field vocabulary ───────────────────────────────────────────────────
  const F = (keywords, exclude = [], extra = {}) => ({ keywords, exclude, ...extra });
  const NAME_EXCL = ['father', 'mother', 'husband', 'spouse', 'guardian', 'school', 'college', 'bank', 'branch', 'institute', 'village', 'district', 'user', 'login', 'first', 'last', 'middle', 'nominee', 'पिता', 'माता', 'पति', 'hindi', 'हिंदी', 'हिन्दी'];
  const FIELD_MAP = {
    name: F(['applicant name', 'full name', 'name of applicant', 'candidate name', 'student name', 'name as per aadhaar', 'name as in aadhaar', 'your name', 'name english', 'name in english', 'आवेदक का नाम', 'प्रार्थी का नाम', 'पूरा नाम', 'नाम अंग्रेजी', 'नाम'], NAME_EXCL),
    name_hi: F(['name in hindi', 'name hindi', 'applicant name in hindi', 'नाम हिंदी', 'हिंदी में नाम', 'आवेदक का नाम हिंदी', 'नाम हिन्दी'], ['father', 'mother', 'husband', 'पिता', 'माता', 'पति']),
    first_name: F(['first name', 'given name', 'प्रथम नाम', 'पहला नाम'], ['father', 'mother', 'husband']),
    middle_name: F(['middle name', 'मध्य नाम'], ['father', 'mother']),
    last_name: F(['last name', 'surname', 'family name', 'उपनाम'], ['father', 'mother']),
    father_name: F(["father's name", 'father name', 'fathers name', 'name of father', 'पिता का नाम'], ['mother', 'husband', 'hindi', 'हिंदी', 'हिन्दी', 'occupation', 'व्यवसाय', 'पति']),
    father_name_hi: F(['father name in hindi', 'father name hindi', 'पिता का नाम हिंदी', 'पिता का नाम हिन्दी'], ['mother']),
    father_or_husband_name: F(['father husband', 'father or husband', 'पिता पति', 'पिता / पति'], ['hindi', 'हिंदी']),
    mother_name: F(["mother's name", 'mother name', 'name of mother', 'माता का नाम'], ['father', 'husband']),
    husband_name: F(["husband's name", 'husband name', 'spouse name', 'पति का नाम'], ['father', 'mother']),
    dob: F(['date of birth', 'dob', 'birth date', 'जन्म तिथि', 'जन्म दिनांक', 'जन्मतिथि'], ['place', 'स्थान', 'certificate']),
    age: F(['age', 'आयु', 'उम्र'], [], { word: true }),
    gender: F(['gender', 'sex', 'लिंग'], [], { word: true }),
    is_married: F(['marital status', 'married', 'वैवाहिक स्थिति', 'विवाहित'], []),
    religion: F(['religion', 'धर्म'], [], { word: true }),
    caste_category: F(['caste category', 'social category', 'category', 'वर्ग', 'श्रेणी'], ['service', 'document', 'vehicle', 'certificate type', 'product', 'scheme']),
    caste: F(['caste', 'जाति'], ['category', 'certificate', 'वर्ग']),
    annual_income: F(['annual income', 'family income', 'yearly income', 'income', 'वार्षिक आय', 'पारिवारिक आय', 'आय'], ['tax', 'certificate no']),
    occupation: F(['occupation', 'profession', 'व्यवसाय', 'पेशा'], ['father', 'पिता']),
    father_occupation: F(["father's occupation", 'father occupation', 'पिता का व्यवसाय'], []),
    phone: F(['mobile number', 'mobile no', 'mobile', 'phone number', 'contact number', 'contact no', 'मोबाइल नंबर', 'मोबाइल'], ['otp', 'verify']),
    email: F(['email', 'e mail', 'email id', 'ईमेल'], []),
    id_number: F(['aadhaar number', 'aadhar number', 'aadhaar no', 'aadhar no', 'uid number', 'uid no', 'aadhaar', 'आधार नंबर', 'आधार संख्या', 'आधार क्रमांक', 'आधार'], ['enrol', 'vid', 'virtual', 'jan', 'जन']),
    jan_aadhaar_id: F(['jan aadhaar', 'janaadhaar', 'bhamashah', 'जन आधार'], []),
    pan: F(['pan number', 'pan no', 'pan card', 'permanent account number', 'पैन'], ['panchayat', 'company']),
    voter_id: F(['voter id', 'epic', 'electoral', 'मतदाता पहचान', 'वोटर'], []),
    driving_license: F(['driving licence', 'driving license', 'dl number', 'dl no', 'ड्राइविंग लाइसेंस'], []),
    passport_number: F(['passport number', 'passport no', 'पासपोर्ट'], []),
    ration_card_number: F(['ration card', 'राशन कार्ड'], []),
    address: F(['address', 'full address', 'permanent address', 'current address', 'residential address', 'correspondence address', 'पता', 'स्थायी पता', 'वर्तमान पता'], ['email', 'e mail', 'ip address', 'web', 'office', 'work', 'line 2', 'hindi', 'हिंदी', 'pin', 'district', 'state', 'occupation']),
    address_hi: F(['address in hindi', 'address hindi', 'पता हिंदी', 'पता हिन्दी'], []),
    house_no: F(['house no', 'house number', 'plot no', 'flat no', 'मकान नं', 'मकान संख्या'], ['owner', 'tax']),
    street: F(['street', 'locality', 'mohalla', 'colony', 'road', 'गली', 'मोहल्ला'], []),
    village_city: F(['village', 'city', 'town', 'vtc', 'gram', 'गाँव', 'ग्राम', 'शहर', 'कस्बा'], ['district', 'tehsil', 'panchayat']),
    post_office: F(['post office', 'डाकघर'], ['code', 'pin', 'postal code']),
    tehsil: F(['tehsil', 'tahsil', 'sub district', 'तहसील'], []),
    district: F(['district', 'distt', 'जिला', 'ज़िला'], ['sub district']),
    state: F(['state', 'राज्य'], ['statement', 'status'], { word: true }),
    pincode: F(['pin code', 'pincode', 'postal code', 'zip', 'पिन कोड', 'पिनकोड'], []),
    birth_place: F(['place of birth', 'birth place', 'जन्म स्थान'], []),
    native_place: F(['native place', 'मूल स्थान'], []),
    years_in_rajasthan: F(['years in rajasthan', 'years of residence', 'residing since', 'कितने वर्षों', 'निवास की अवधि'], []),
    nationality: F(['nationality', 'राष्ट्रीयता'], []),
    blood_group: F(['blood group', 'रक्त समूह'], []),
    account_number: F(['account number', 'account no', 'a c no', 'bank account', 'खाता संख्या', 'खाता नंबर'], ['ifsc']),
    ifsc_code: F(['ifsc', 'ifsc code'], []),
    bank_name: F(['bank name', 'name of bank', 'बैंक का नाम'], ['branch']),
    education_10th_school: F(['10th school', 'class x school', 'class 10 school', 'secondary school name', '10वीं विद्यालय'], ['12th', 'xii', 'senior', 'year', 'percentage', 'board']),
    education_10th_board: F(['10th board', 'class x board', 'class 10 board', 'matriculation board'], ['12th', 'xii', 'school name', 'year', 'percentage']),
    education_10th_year: F(['10th year of passing', 'class x year of passing', 'class 10 passing year', 'matriculation year'], ['12th', 'xii', 'percentage', 'board']),
    education_10th_percentage: F(['10th percentage', 'class x percentage', 'class 10 percentage', 'matriculation percentage'], ['12th', 'xii', 'year', 'board']),
    education_12th_school: F(['12th school', 'class xii school', 'class 12 school', 'senior secondary school', '12वीं विद्यालय'], ['10th', 'class x ', 'year', 'percentage', 'board']),
    education_12th_board: F(['12th board', 'class xii board', 'class 12 board', 'senior secondary board'], ['10th', 'school name', 'year', 'percentage']),
    education_12th_year: F(['12th year of passing', 'class xii year of passing', 'class 12 passing year'], ['10th', 'percentage', 'board']),
    education_12th_percentage: F(['12th percentage', 'class xii percentage', 'class 12 percentage', 'senior secondary percentage'], ['10th', 'year', 'board']),
    education_grad_school: F(['graduation college', 'college name', 'university name', 'स्नातक महाविद्यालय'], ['10th', '12th', 'school', 'year', 'percentage']),
    highest_education: F(['highest qualification', 'educational qualification', 'education qualification', 'शैक्षिक योग्यता'], ['school', 'college', 'year']),
  };
  const HINDI_VARIANT = { name: 'name_hi', father_name: 'father_name_hi', address: 'address_hi' };

  const DISTRICT_HI = {
    ajmer: 'अजमेर', alwar: 'अलवर', balotra: 'बालोतरा', banswara: 'बांसवाड़ा', baran: 'बारां', barmer: 'बाड़मेर', beawar: 'ब्यावर',
    bharatpur: 'भरतपुर', bhilwara: 'भीलवाड़ा', bikaner: 'बीकानेर', bundi: 'बूंदी', chittorgarh: 'चित्तौड़गढ़', churu: 'चूरू', dausa: 'दौसा',
    deeg: 'डीग', dholpur: 'धौलपुर', 'didwana-kuchaman': 'डीडवाना-कुचामन', dungarpur: 'डूंगरपुर', hanumangarh: 'हनुमानगढ़', jaipur: 'जयपुर',
    jaisalmer: 'जैसलमेर', jalore: 'जालोर', jhalawar: 'झालावाड़', jhunjhunu: 'झुंझुनूं', jodhpur: 'जोधपुर', karauli: 'करौली',
    'khairthal-tijara': 'खैरथल-तिजारा', kota: 'कोटा', 'kotputli-behror': 'कोटपूतली-बहरोड़', nagaur: 'नागौर', pali: 'पाली', phalodi: 'फलोदी',
    pratapgarh: 'प्रतापगढ़', rajsamand: 'राजसमंद', salumbar: 'सलूम्बर', 'sawai madhopur': 'सवाई माधोपुर', sikar: 'सीकर', sirohi: 'सिरोही',
    'sri ganganagar': 'श्रीगंगानगर', ganganagar: 'श्रीगंगानगर', tonk: 'टोंक', udaipur: 'उदयपुर',
  };

  const SYNONYMS = {
    gender: {
      male: ['male', 'm', 'पुरुष', 'purush', 'man'],
      female: ['female', 'f', 'महिला', 'स्त्री', 'woman', 'mahila'],
      transgender: ['transgender', 'third gender', 'other', 't', 'tg', 'ट्रांसजेंडर', 'अन्य', 'उभयलिंगी'],
    },
    yesno: { yes: ['yes', 'y', 'हाँ', 'हां', 'haan', 'married', 'विवाहित'], no: ['no', 'n', 'नहीं', 'nahi', 'unmarried', 'single', 'अविवाहित'] },
    caste_category: {
      general: ['general', 'gen', 'सामान्य', 'ur', 'unreserved', 'open'],
      obc: ['obc', 'other backward class', 'अन्य पिछड़ा वर्ग', 'पिछड़ा वर्ग'],
      mbc: ['mbc', 'most backward class', 'अति पिछड़ा वर्ग', 'विशेष पिछड़ा वर्ग', 'sbc'],
      sc: ['sc', 'scheduled caste', 'अनुसूचित जाति'],
      st: ['st', 'scheduled tribe', 'अनुसूचित जनजाति'],
    },
    state: { rajasthan: ['rajasthan', 'राजस्थान', 'rj'] },
    religion: { hindu: ['hindu', 'हिंदू', 'हिन्दू'], muslim: ['muslim', 'islam', 'मुस्लिम', 'इस्लाम'], sikh: ['sikh', 'सिख'], christian: ['christian', 'ईसाई'], jain: ['jain', 'जैन'], buddhist: ['buddhist', 'बौद्ध'] },
  };

  // ── 3. Text helpers ───────────────────────────────────────────────────────
  const NOISE = new Set(['ctl00', 'ctl01', 'content', 'place', 'holder', 'holder1', 'contentplaceholder1', 'cph', 'txt', 'ddl', 'lbl', 'rb', 'rbl', 'chk', 'main', 'body', 'tb', 'input', 'field', 'form', 'mc', 'ucl', 'uc', 'grd']);

  function normalize(str) {
    return String(str || '').toLowerCase().replace(/[’'`]/g, "'").replace(/[\s\-_.\/*:()[\]|,;#]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function attrWords(str) {
    return normalize(String(str || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\d+/g, ' '))
      .split(' ').filter((w) => w && !NOISE.has(w)).join(' ');
  }
  function textOf(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll && clone.querySelectorAll('input,select,textarea,script,style,option').forEach((n) => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lev(a, b) {
    const m = a.length; const n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      prev = cur;
    }
    return prev[n];
  }

  // ── 4. Label detection (works for ASP.NET table layouts too) ─────────────
  function labelFor(el) {
    const parts = [];
    const aria = el.getAttribute('aria-label');
    if (aria) parts.push(aria);
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) parts.push(textOf(l));
      } catch (e) { /* ignore */ }
    }
    const wrap = el.closest('label');
    if (wrap) parts.push(textOf(wrap));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(textOf(n)); });
    if (!parts.join('').trim()) {
      const cell = el.closest('td,th');
      if (cell) {
        let prev = cell.previousElementSibling;
        for (let k = 0; k < 2 && prev; k++, prev = prev.previousElementSibling) {
          const tx = textOf(prev);
          if (tx && tx.length < 120) { parts.push(tx); break; }
        }
      }
    }
    if (!parts.join('').trim()) {
      let prev = el.previousElementSibling;
      for (let k = 0; k < 3 && prev; k++, prev = prev.previousElementSibling) {
        const tx = textOf(prev);
        if (tx && tx.length > 1 && tx.length < 120) { parts.push(tx); break; }
      }
    }
    if (!parts.join('').trim() && el.parentElement) {
      const pp = el.parentElement.previousElementSibling;
      const tx = textOf(pp);
      if (tx && tx.length < 120) parts.push(tx);
    }
    return parts.join(' ').replace(/\s*\*\s*/g, ' ').trim();
  }

  function sectionContext(el) {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 12; depth++, node = node.parentElement) {
      if (node.tagName === 'FIELDSET') {
        const lg = node.querySelector('legend');
        if (lg) return normalize(textOf(lg));
      }
      const h = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > legend, :scope > .panel-heading, :scope > .card-header');
      if (h && !h.contains(el)) {
        const tx = normalize(textOf(h));
        if (tx.length > 2 && tx.length < 100) return tx;
      }
    }
    return '';
  }

  function matchScore(text, cfg) {
    if (!text) return 0;
    const padded = ` ${text} `;
    for (const ex of cfg.exclude) if (padded.includes(` ${normalize(ex)} `) || (normalize(ex).length > 4 && text.includes(normalize(ex)))) return 0;
    let best = 0;
    for (const kw of cfg.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (text === k) return 1;
      if (padded.includes(` ${k} `)) best = Math.max(best, Math.min(0.95, 0.72 + (k.length / text.length) * 0.25));
      else if (!cfg.word && k.length >= 5 && text.includes(k)) best = Math.max(best, 0.66);
      else {
        const kw2 = k.split(' ').filter((w) => w.length > 2);
        if (kw2.length > 1) {
          const tw = text.split(' ');
          const hit = kw2.filter((w) => tw.includes(w)).length / kw2.length;
          if (hit >= 0.99) best = Math.max(best, 0.7);
        }
      }
    }
    return best;
  }

  // ── 5. Saved field mappings ("Teach fields") ─────────────────────────────
  const pageKey = () => location.hostname + location.pathname.toLowerCase();
  let savedMappings = {};

  async function loadMappings() {
    if (!HAS_CHROME) return;
    const { af_mappings } = await chrome.storage.local.get('af_mappings');
    savedMappings = af_mappings || {};
  }
  async function saveMapping(el, field) {
    const key = pageKey();
    savedMappings[key] = savedMappings[key] || {};
    if (field) savedMappings[key][selectorKey(el)] = field;
    else savedMappings[key][selectorKey(el)] = '__ignore__';
    if (HAS_CHROME) await chrome.storage.local.set({ af_mappings: savedMappings });
  }
  function selectorKey(el) {
    if (el.id && !/^\d/.test(el.id)) return `#${el.id}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && parts.length < 7) {
      let i = 1; let s = n;
      while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i += 1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${i})`);
      n = n.parentElement;
    }
    return parts.join('>');
  }
  function savedFieldFor(el) {
    const page = savedMappings[pageKey()];
    return page ? page[selectorKey(el)] || null : null;
  }

  // ── 6. Detection ──────────────────────────────────────────────────────────
  function isVisible(el) {
    if (el.disabled || el.readOnly) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  function fillableElements() {
    return Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
      if (el.tagName === 'INPUT') {
        const t = (el.type || 'text').toLowerCase();
        if (!['text', 'email', 'tel', 'number', 'date', 'search', ''].includes(t)) return false;
        if (/captcha|otp|password|search/i.test(`${el.name} ${el.id} ${el.placeholder}`)) return false;
      }
      return isVisible(el) && !el.closest('#__smart_autofill_root');
    });
  }

  function detectField(el) {
    const saved = savedFieldFor(el);
    if (saved === '__ignore__') return null;
    if (saved) return { field: saved, score: 1, saved: true, label: labelFor(el) || el.name || el.id };
    const label = normalize(labelFor(el));
    const attrs = attrWords(`${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.title || ''}`);
    const section = sectionContext(el);
    let best = null;
    for (const [field, cfg] of Object.entries(FIELD_MAP)) {
      let score = Math.max(matchScore(label, cfg), matchScore(attrs, cfg) * 0.85);
      if (/education_/.test(field) && section) score = Math.max(score, matchScore(`${label} ${section}`, cfg) * 0.95);
      if (!best || score > best.score) best = { field, score };
    }
    if (!best || best.score < 0.62) {
      // generic education labels inside a "Class X / XII" section
      const sec = `${section} ${label}`;
      const lbl = label;
      const isXII = /\b(xii|12|12th|senior secondary|higher secondary)\b/.test(sec);
      const isX = !isXII && /\b(x|10|10th|secondary|matric)\b/.test(sec);
      const bucket = isXII ? '12th' : isX ? '10th' : null;
      if (bucket) {
        if (/^(percentage|grade|marks|percent)/.test(lbl)) best = { field: `education_${bucket}_percentage`, score: 0.75 };
        else if (/^board/.test(lbl)) best = { field: `education_${bucket}_board`, score: 0.75 };
        else if (/^(school|institution)/.test(lbl)) best = { field: `education_${bucket}_school`, score: 0.75 };
        else if (/year/.test(lbl)) best = { field: `education_${bucket}_year`, score: 0.75 };
      }
    }
    if (!best || best.score < 0.62) return null;
    if (HINDI_VARIANT[best.field] && /hindi|हिंदी|हिन्दी/.test(label)) best.field = HINDI_VARIANT[best.field];
    return { ...best, saved: false, label: labelFor(el) || el.placeholder || el.name || el.id };
  }

  // ── 7. Values and option matching ─────────────────────────────────────────
  function toIso(v) {
    const m = String(v || '').match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  }

  function valueFor(field, values) {
    if (values[field] !== undefined && values[field] !== null && values[field] !== '') return values[field];
    if (field === 'father_or_husband_name') return values.father_or_husband_name || values.father_name;
    if (field === 'address_hi' || field === 'name_hi' || field === 'father_name_hi') return null; // never guess Hindi
    return null;
  }

  function formatForElement(el, field, raw) {
    let v = String(raw);
    let note = null;
    const ph = `${el.placeholder || ''} ${el.title || ''}`.toLowerCase();
    if (field === 'dob' || /date/.test(field)) {
      if (el.type === 'date') v = toIso(v) || v;
      else if (/yyyy-mm-dd/.test(ph)) v = toIso(v) || v;
      else if (/dd-mm-yyyy/.test(ph)) v = v.replace(/\//g, '-');
    }
    if (field === 'id_number') {
      const digits = v.replace(/\D/g, '');
      if ((el.maxLength > 0 && el.maxLength <= 12) || el.type === 'number' || !/\s/.test(el.placeholder || ' ')) v = digits;
    }
    if (field === 'phone') v = v.replace(/\D/g, '').slice(-10);
    if (el.maxLength > 0 && v.length > el.maxLength) {
      if (/\d/.test(v) && /\s/.test(v) && v.replace(/\s/g, '').length <= el.maxLength) v = v.replace(/\s/g, '');
      else { v = v.slice(0, el.maxLength); note = 'shortened'; }
    }
    return { value: v, note };
  }

  function candidatesFor(field, value) {
    const v = normalize(value);
    const out = [v];
    const group = field === 'gender' ? SYNONYMS.gender
      : ['is_married', 'in_voter_list', 'husband_domicile'].includes(field) ? SYNONYMS.yesno
        : field === 'caste_category' ? SYNONYMS.caste_category
          : field === 'state' ? SYNONYMS.state
            : field === 'religion' ? SYNONYMS.religion : null;
    if (group) {
      for (const list of Object.values(group)) if (list.map(normalize).includes(v)) out.push(...list.map(normalize));
    }
    if (field === 'district' && DISTRICT_HI[v]) out.push(normalize(DISTRICT_HI[v]));
    return [...new Set(out.filter(Boolean))];
  }

  function chooseOption(select, field, value) {
    const cands = candidatesFor(field, value);
    const opts = Array.from(select.options).filter((o) => !o.disabled && o.value !== '' && !/^(-+|select|चुनें|--select--)/i.test(o.text.trim()));
    const norm = (o) => [normalize(o.text), normalize(o.value)];
    for (const c of cands) { const o = opts.find((x) => norm(x).includes(c)); if (o) return o; }
    for (const c of cands.filter((x) => x.length >= 3)) {
      const o = opts.find((x) => norm(x).some((t) => t.length >= 3 && (t.includes(c) || c.includes(t))));
      if (o) return o;
    }
    for (const c of cands.filter((x) => x.length >= 5)) {
      const o = opts.find((x) => norm(x).some((t) => lev(t, c) <= 1));
      if (o) return o;
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    ['input', 'change', 'blur'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  }

  function hasPostback(el) {
    const oc = el.getAttribute('onchange') || '';
    return /__doPostBack|submit\(|setTimeout\(/.test(oc) || el.getAttribute('autopostback') === 'true';
  }

  // ── 8. Build plan / fill ─────────────────────────────────────────────────
  function radioGroups() {
    const groups = {};
    document.querySelectorAll('input[type="radio"]').forEach((r) => {
      if (!r.name || !isVisible(r)) return;
      (groups[r.name] = groups[r.name] || []).push(r);
    });
    return Object.values(groups);
  }

  function radioText(r) {
    let t = '';
    if (r.id) { try { const l = document.querySelector(`label[for="${CSS.escape(r.id)}"]`); if (l) t = textOf(l); } catch (e) { /* ignore */ } }
    if (!t && r.nextSibling) t = (r.nextSibling.textContent || '').trim();
    if (!t && r.closest('label')) t = textOf(r.closest('label'));
    return normalize(t || r.value);
  }

  function buildPlan(values, { skipFilled = true } = {}) {
    const plan = [];
    for (const el of fillableElements()) {
      const det = detectField(el);
      if (!det) continue;
      const raw = valueFor(det.field, values);
      if (raw === null || raw === undefined || raw === '') continue;
      const already = el.tagName === 'SELECT' ? el.selectedIndex > 0 && el.value : el.value && el.value.trim();
      const entry = { el, field: det.field, label: det.label, score: det.score, saved: det.saved, include: !(skipFilled && already), already: !!already };
      if (el.tagName === 'SELECT') {
        const opt = chooseOption(el, det.field, raw);
        if (!opt) continue;
        entry.value = opt.text.trim();
        entry.option = opt;
        entry.postback = hasPostback(el);
      } else {
        const f = formatForElement(el, det.field, raw);
        entry.value = f.value;
        entry.note = f.note;
      }
      plan.push(entry);
    }
    // radio groups (gender, marital status, category …)
    for (const group of radioGroups()) {
      const first = group[0];
      const groupLabel = normalize(`${labelFor(first)} ${sectionContext(first)} ${attrWords(first.name)}`);
      let field = null;
      for (const f of ['gender', 'is_married', 'caste_category', 'religion', 'in_voter_list']) {
        if (matchScore(groupLabel, FIELD_MAP[f] || F([f.replace(/_/g, ' ')])) >= 0.62) { field = f; break; }
      }
      if (!field) {
        const texts = group.map(radioText).join(' ');
        if (/\b(male|female)\b|पुरुष|महिला/.test(texts)) field = 'gender';
      }
      if (!field) continue;
      const raw = valueFor(field, values);
      if (!raw) continue;
      const cands = candidatesFor(field, raw);
      const target = group.find((r) => cands.includes(radioText(r)) || cands.some((c) => c.length >= 3 && radioText(r).includes(c)));
      if (!target) continue;
      plan.push({ el: target, radio: true, field, label: labelFor(first) || field, value: radioText(target), score: 0.8, include: !(skipFilled && group.some((r) => r.checked)), already: group.some((r) => r.checked) });
    }
    // fill dropdowns that reload the page LAST
    plan.sort((a, b) => (a.postback ? 1 : 0) - (b.postback ? 1 : 0));
    return plan;
  }

  function executePlan(plan) {
    let filled = 0;
    let postback = false;
    for (const p of plan) {
      if (!p.include) continue;
      try {
        if (p.radio) {
          p.el.click();
          p.el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (p.option) {
          if (p.postback) postback = true;
          setNativeValue(p.el, p.option.value);
        } else {
          setNativeValue(p.el, p.value);
        }
        p.el.style.outline = '2px solid rgba(34,197,94,0.85)';
        setTimeout(() => { p.el.style.outline = ''; }, 4000);
        filled += 1;
        if (p.postback) break; // the page is reloading; continue after reload
      } catch (e) { /* skip field */ }
    }
    return { filled, postback };
  }

  // ── 9. UI (shadow DOM so portal CSS cannot break it) ─────────────────────
  let host = null;
  let root = null;
  function ui() {
    if (root) return root;
    host = document.createElement('div');
    host.id = '__smart_autofill_root';
    host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      *{box-sizing:border-box;font-family:'Segoe UI','Nirmala UI',Arial,sans-serif}
      .panel{position:fixed;top:16px;right:16px;width:420px;max-height:86vh;display:flex;flex-direction:column;background:#14141e;color:#f1f1f5;border:1px solid #333348;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55);font-size:13px}
      .head{padding:12px 14px;border-bottom:1px solid #2a2a3a}
      .who{font-size:15px;font-weight:700;color:#c4b5fd}
      .sub{font-size:11px;color:#9a9ab0;margin-top:2px}
      .warn{margin:8px 14px 0;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#fcd34d;font-size:12px}
      .list{overflow:auto;padding:6px 10px;flex:1}
      .row{display:grid;grid-template-columns:20px 1fr;gap:6px;align-items:start;padding:7px 6px;border-bottom:1px solid #22222f}
      .row label{font-size:11px;color:#9a9ab0}
      .row .f{font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.4px}
      .row input[type=text]{width:100%;margin-top:3px;background:#0f0f16;border:1px solid #333348;border-radius:6px;color:#f1f1f5;padding:5px 7px;font-size:12.5px}
      .tag{display:inline-block;font-size:10px;padding:0 6px;border-radius:8px;margin-left:4px}
      .saved{background:#2e1065;color:#c4b5fd}.had{background:#3a2e1e;color:#fcd34d}.pb{background:#450a0a;color:#fca5a5}
      .foot{padding:10px 14px;border-top:1px solid #2a2a3a;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      button{border:none;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
      .go{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}.no{background:#2a2a3a;color:#d4d4e0}
      .fab{position:fixed;right:18px;bottom:18px;display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:99px;padding:9px 14px;box-shadow:0 6px 22px rgba(0,0,0,.4);font-weight:700;cursor:pointer;font-size:13px}
      .fab .x{opacity:.7;margin-left:6px;font-weight:400}
      .pick{position:fixed;background:#14141e;color:#f1f1f5;border:1px solid #7c3aed;border-radius:10px;padding:10px;width:300px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .pick select{width:100%;margin:6px 0;padding:6px;background:#0f0f16;color:#f1f1f5;border:1px solid #333348;border-radius:6px}
      .toast{position:fixed;right:18px;bottom:70px;background:#064e3b;color:#d1fae5;border:1px solid #10b981;border-radius:10px;padding:10px 14px;max-width:360px;font-size:13px}
      .toast.err{background:#450a0a;color:#fecaca;border-color:#ef4444}
    </style><div id="layer"></div>`;
    return root;
  }
  function layer() { return ui().getElementById('layer'); }
  function clearLayer(keepFab) {
    const l = layer();
    Array.from(l.children).forEach((c) => { if (!(keepFab && c.classList.contains('fab'))) c.remove(); });
  }
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = `toast ${err ? 'err' : ''}`;
    t.textContent = msg;
    layer().appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  async function fetchActive(force) {
    if (!HAS_CHROME) return window.__SMART_AUTOFILL_TEST_DATA__ || { active: null };
    return new Promise((resolve) => chrome.runtime.sendMessage({ action: 'getActive', force: !!force }, (r) => resolve(r || { error: 'no_response' })));
  }

  function fieldLabels(data) {
    const map = {};
    (data.fields || []).forEach((f) => { map[f.key] = f.label && (f.label.en || f.key); });
    return map;
  }

  async function openPreview() {
    await loadMappings();
    const data = await fetchActive(true);
    if (data.error) { toast(data.error === 'not_paired' ? 'Smart Autofill: open the dashboard once so the extension can connect.' : 'Smart Autofill: app not reachable. Is it running?', true); return { ok: false, error: data.error }; }
    if (!data.active) { toast('Smart Autofill: open a customer in the dashboard first.', true); return { ok: false, error: 'no_active' }; }
    const labels = fieldLabels(data);
    let skipFilled = true;
    let plan = buildPlan(data.values, { skipFilled });
    clearLayer(true);
    const c = data.active.customer;
    const svc = data.active.service;
    const panel = document.createElement('div');
    panel.className = 'panel';
    const render = () => {
      const include = plan.filter((p) => p.include).length;
      panel.innerHTML = `
        <div class="head">
          <div class="sub">Filling details of</div>
          <div class="who">${esc(c.name || 'Customer')} <span style="font-weight:400;color:#9a9ab0">#${esc(c.customer_no)}${c.aadhaar_last4 ? ` · Aadhaar ••••${esc(c.aadhaar_last4)}` : ''}</span></div>
          ${svc ? `<div class="sub">Service: ${esc(svc.name && (svc.name.en || svc.id))}</div>` : ''}
        </div>
        ${plan.some((p) => p.postback) ? '<div class="warn">A dropdown on this page reloads the page. It is filled last — press ⚡ Fill again after the page reloads to continue.</div>' : ''}
        ${plan.length === 0 ? '<div class="warn">No matching fields found on this page. Use “Teach fields” in the extension popup to show which box is which.</div>' : ''}
        <div class="list">${plan.map((p, i) => `
          <div class="row">
            <input type="checkbox" data-i="${i}" ${p.include ? 'checked' : ''}/>
            <div>
              <div class="f">${esc(labels[p.field] || p.field)}${p.saved ? '<span class="tag saved">taught</span>' : ''}${p.already ? '<span class="tag had">has value</span>' : ''}${p.postback ? '<span class="tag pb">reloads page</span>' : ''}</div>
              <label>→ ${esc((p.label || '').slice(0, 70))}</label>
              ${p.option || p.radio ? `<div style="margin-top:3px">${esc(p.value)}</div>` : `<input type="text" data-v="${i}" value="${esc(p.value)}"/>`}
              ${p.note === 'shortened' ? '<label style="color:#fcd34d">Shortened to fit the box — check it.</label>' : ''}
            </div>
          </div>`).join('')}</div>
        <div class="foot">
          <label style="font-size:12px;color:#9a9ab0;display:flex;gap:6px;align-items:center"><input type="checkbox" id="skip" ${skipFilled ? 'checked' : ''}/> Skip boxes that already have a value</label>
          <span style="flex:1"></span>
          <button class="no" id="cancel">Cancel</button>
          <button class="go" id="fill" ${include ? '' : 'disabled'}>⚡ Fill ${include}</button>
        </div>`;
      panel.querySelectorAll('input[data-i]').forEach((cb) => cb.addEventListener('change', () => { plan[+cb.dataset.i].include = cb.checked; render(); }));
      panel.querySelectorAll('input[data-v]').forEach((inp) => inp.addEventListener('input', () => { plan[+inp.dataset.v].value = inp.value; }));
      panel.querySelector('#skip').addEventListener('change', (e) => { skipFilled = e.target.checked; plan = buildPlan(data.values, { skipFilled }); render(); });
      panel.querySelector('#cancel').addEventListener('click', () => panel.remove());
      panel.querySelector('#fill').addEventListener('click', () => {
        const r = executePlan(plan);
        panel.remove();
        toast(`Filled ${r.filled} field(s). Check every value before you submit.${r.postback ? ' The page is reloading — press ⚡ Fill again afterwards.' : ''}`);
      });
    };
    render();
    layer().appendChild(panel);
    return { ok: true, fields: plan.length };
  }

  // ── 10. Teach mode ────────────────────────────────────────────────────────
  let learning = false;
  async function onLearnClick(e) {
    const el = e.target && e.target.closest && e.target.closest('input, select, textarea');
    if (!el || el.closest('#__smart_autofill_root')) return;
    if (el.type && ['button', 'submit', 'checkbox', 'radio', 'hidden', 'password', 'file'].includes(el.type)) return;
    e.preventDefault();
    e.stopPropagation();
    const data = await fetchActive(false);
    const fields = (data && data.fields) || Object.keys(FIELD_MAP).map((k) => ({ key: k, label: { en: k } }));
    clearLayer(true);
    const r = el.getBoundingClientRect();
    const pick = document.createElement('div');
    pick.className = 'pick';
    pick.style.top = `${Math.min(window.innerHeight - 170, r.bottom + 6)}px`;
    pick.style.left = `${Math.min(window.innerWidth - 320, Math.max(8, r.left))}px`;
    const current = savedFieldFor(el) || (detectField(el) || {}).field || '';
    pick.innerHTML = `<div style="font-weight:700">What is this box?</div>
      <div style="font-size:11px;color:#9a9ab0">${esc((labelFor(el) || el.name || el.id || '').slice(0, 60))}</div>
      <select id="f"><option value="">— Ignore this box —</option>${fields.map((f) => `<option value="${esc(f.key)}" ${f.key === current ? 'selected' : ''}>${esc((f.label && (f.label.en + (f.label.hi ? ' / ' + f.label.hi : ''))) || f.key)}</option>`).join('')}</select>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="no" id="c">Cancel</button><button class="go" id="s">Save</button></div>`;
    layer().appendChild(pick);
    pick.querySelector('#c').addEventListener('click', () => pick.remove());
    pick.querySelector('#s').addEventListener('click', async () => {
      await saveMapping(el, pick.querySelector('#f').value || null);
      el.style.outline = '2px solid #a78bfa';
      pick.remove();
    });
  }
  function setLearning(on) {
    learning = !!on;
    if (learning) {
      document.addEventListener('click', onLearnClick, true);
      fillableElements().forEach((el) => { el.dataset.afOutline = el.style.outline; el.style.outline = savedFieldFor(el) ? '2px solid #a78bfa' : '2px dashed #a78bfa'; });
      toast('Teach mode ON: click any box and choose what it is. Turn it off in the extension popup.');
    } else {
      document.removeEventListener('click', onLearnClick, true);
      fillableElements().forEach((el) => { el.style.outline = el.dataset.afOutline || ''; });
      clearLayer(true);
    }
  }

  // ── 11. Floating button on portal forms ──────────────────────────────────
  async function maybeShowFab() {
    if (window.top !== window) return; // only in the top page
    if (fillableElements().length < 3) return;
    const data = await fetchActive(false);
    if (!data || !data.active) return;
    const fab = document.createElement('div');
    fab.className = 'fab';
    fab.innerHTML = `⚡ Fill: ${esc((data.active.customer.name || 'customer').split(' ')[0])}<span class="x" title="Hide">✕</span>`;
    fab.addEventListener('click', (e) => {
      if (e.target.classList.contains('x')) { fab.remove(); return; }
      openPreview();
    });
    layer().appendChild(fab);
  }

  // ── 12. Messages from the popup ───────────────────────────────────────────
  if (HAS_CHROME) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        await loadMappings();
        if (msg.action === 'scan') {
          const els = fillableElements();
          const detected = els.map(detectField).filter(Boolean);
          sendResponse({ inputs: els.length, detected: detected.length, taught: detected.filter((d) => d.saved).length, learning });
        } else if (msg.action === 'preview') {
          if (window.top !== window) { sendResponse({ ok: false, frame: true }); return; }
          sendResponse(await openPreview());
        } else if (msg.action === 'learn') {
          setLearning(msg.on);
          sendResponse({ ok: true, learning });
        } else if (msg.action === 'clearMappings') {
          delete savedMappings[pageKey()];
          await chrome.storage.local.set({ af_mappings: savedMappings });
          sendResponse({ ok: true });
        } else {
          sendResponse({});
        }
      })();
      return true;
    });
    loadMappings().then(() => setTimeout(maybeShowFab, 800));
  }

  // Test hook (only when the page defines the flag before injection)
  if (window.__SMART_AUTOFILL_TEST__) {
    window.__smartAutofill = { buildPlan, executePlan, detectField, fillableElements, labelFor, chooseOption, openPreview };
  }
})();
