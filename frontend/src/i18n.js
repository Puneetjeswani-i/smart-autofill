/**
 * i18n.js — English / Hindi UI text.
 * Labels that come from the server are already { en, hi } objects; use L().
 */

import React, { createContext, useContext } from 'react';

const DICT = {
  appTitle: ['Smart Autofill', 'स्मार्ट ऑटोफिल'],
  appSub: ['eMitra shop assistant', 'ई-मित्र दुकान सहायक'],
  home: ['Home', 'होम'],
  newCustomer: ['New customer', 'नया ग्राहक'],
  customers: ['Customers', 'ग्राहक'],
  applications: ['Applications', 'आवेदन रजिस्टर'],
  tools: ['Document tools', 'दस्तावेज़ टूल्स'],
  settings: ['Settings', 'सेटिंग्स'],
  extension: ['Browser extension', 'ब्राउज़र एक्सटेंशन'],
  lock: ['Lock', 'लॉक करें'],
  workingOn: ['Working on', 'वर्तमान ग्राहक'],
  encrypted: ['Encrypted on this PC', 'इस कंप्यूटर पर एन्क्रिप्टेड'],
  encryptedSub: ['AES-256, PIN protected', 'AES-256, पिन से सुरक्षित'],
  save: ['Save', 'सेव करें'],
  saveChanges: ['Save changes', 'बदलाव सेव करें'],
  saved: ['Saved', 'सेव हो गया'],
  cancel: ['Cancel', 'रद्द करें'],
  close: ['Close', 'बंद करें'],
  delete: ['Delete', 'हटाएँ'],
  edit: ['Edit', 'बदलें'],
  back: ['Back', 'वापस'],
  search: ['Search', 'खोजें'],
  loading: ['Loading…', 'लोड हो रहा है…'],
  yes: ['Yes', 'हाँ'],
  no: ['No', 'नहीं'],
  print: ['Print', 'प्रिंट करें'],
  copy: ['Copy', 'कॉपी'],
  copied: ['Copied', 'कॉपी हुआ'],
  open: ['Open', 'खोलें'],
  optional: ['optional', 'वैकल्पिक'],
  required: ['required', 'आवश्यक'],
  none: ['None', 'कोई नहीं'],

  // login
  setPinTitle: ['Set up your shop', 'अपनी दुकान सेट करें'],
  setPinSub: ['Choose a PIN. It protects all customer data on this computer.', 'एक पिन चुनें। यह इस कंप्यूटर पर सभी ग्राहकों के डेटा की सुरक्षा करता है।'],
  shopName: ['Shop name', 'दुकान का नाम'],
  pin: ['PIN', 'पिन'],
  confirmPin: ['Confirm PIN', 'पिन दोबारा'],
  pinMismatch: ['PINs do not match', 'पिन मेल नहीं खाते'],
  pinTooShort: ['PIN must be at least 4 characters', 'पिन कम से कम 4 अंकों का होना चाहिए'],
  login: ['Unlock', 'खोलें'],
  loginTitle: ['Enter shop PIN', 'दुकान का पिन डालें'],
  forgotPin: ['Forgot PIN? On this computer run: backend → npm run reset-pin', 'पिन भूल गए? इस कंप्यूटर पर चलाएँ: backend → npm run reset-pin'],
  startSetup: ['Start', 'शुरू करें'],

  // customer
  customerNo: ['Customer #', 'ग्राहक #'],
  mobile: ['Mobile', 'मोबाइल'],
  nameOptional: ['Name (optional — documents will fill it)', 'नाम (वैकल्पिक — दस्तावेज़ों से भर जाएगा)'],
  consentLabel: ['Customer agrees to keep their details for future visits', 'ग्राहक भविष्य के लिए अपना विवरण रखने की सहमति देते हैं'],
  consentHelp: ['If not ticked, this customer is deleted automatically tonight.', 'यदि सहमति नहीं है, तो यह ग्राहक आज रात अपने आप हटा दिया जाएगा।'],
  kept: ['Details kept', 'विवरण सुरक्षित'],
  deletesTonight: ['Deletes tonight', 'आज रात हटेगा'],
  doneNext: ['Done — next customer', 'काम पूरा — अगला ग्राहक'],
  deleteCustomer: ['Delete customer', 'ग्राहक हटाएँ'],
  deleteCustomerConfirm: ['Delete this customer and all their details? Applications stay in the register without personal data.', 'इस ग्राहक और उनके सारे विवरण हटाएँ? आवेदन रजिस्टर में बिना व्यक्तिगत जानकारी के रहेंगे।'],
  exportData: ['Export data', 'डेटा निर्यात'],
  noCustomers: ['No customers yet', 'अभी कोई ग्राहक नहीं'],
  searchHint: ['Name, mobile, Aadhaar last 4 digits or customer #', 'नाम, मोबाइल, आधार के अंतिम 4 अंक या ग्राहक #'],
  unnamed: ['(name not read yet)', '(नाम अभी नहीं पढ़ा गया)'],

  // tabs
  tabDocuments: ['Documents', 'दस्तावेज़'],
  tabDetails: ['Details', 'विवरण'],
  tabServices: ['Services', 'सेवाएँ'],
  tabResidence: ['Residence', 'निवास'],
  tabChecks: ['Checks', 'जाँच'],
  tabApplications: ['Applications', 'आवेदन'],

  // documents
  dropTitle: ['Drop documents here or click to choose', 'दस्तावेज़ यहाँ छोड़ें या चुनने के लिए क्लिक करें'],
  dropSub: ['Photos (JPG/PNG) or PDF — Aadhaar, PAN, Voter ID, marksheet, bills…', 'फोटो (JPG/PNG) या PDF — आधार, पैन, वोटर कार्ड, अंकतालिका, बिल…'],
  autoDetect: ['Auto-detect type', 'प्रकार स्वतः पहचानें'],
  pdfPassword: ['PDF password (e-Aadhaar)', 'PDF पासवर्ड (ई-आधार)'],
  readDocuments: ['Read documents', 'दस्तावेज़ पढ़ें'],
  reading: ['Reading', 'पढ़ रहे हैं'],
  of: ['of', 'में से'],
  readingSlow: ['Reading takes 5–20 seconds per page. Keep this window open.', 'हर पेज पढ़ने में 5–20 सेकंड लगते हैं। यह विंडो खुली रखें।'],
  uploadedDocs: ['Documents on file', 'जमा दस्तावेज़'],
  noDocs: ['No documents yet. Scan or photograph the customer\'s documents and drop them above.', 'अभी कोई दस्तावेज़ नहीं। ग्राहक के दस्तावेज़ स्कैन करें या फोटो लें और ऊपर डालें।'],
  removeDoc: ['Remove', 'हटाएँ'],
  removeDocConfirm: ['Remove this document and the values read from it?', 'यह दस्तावेज़ और उससे पढ़े गए मान हटाएँ?'],
  showText: ['Show scanned text', 'स्कैन किया गया पाठ दिखाएँ'],
  hideText: ['Hide scanned text', 'पाठ छिपाएँ'],
  fieldsRead: ['Values read', 'पढ़े गए मान'],
  docDate: ['Date on document', 'दस्तावेज़ की तारीख'],
  rajasthanAddress: ['Rajasthan address', 'राजस्थान का पता'],
  aiNotInText: ['AI suggestion — not found in scanned text, check it', 'AI सुझाव — स्कैन पाठ में नहीं मिला, जाँचें'],
  retry: ['Try again', 'फिर कोशिश करें'],

  // details
  showEmpty: ['Show empty fields', 'खाली फ़ील्ड दिखाएँ'],
  conflict: ['Documents disagree', 'दस्तावेज़ों में अंतर'],
  useThis: ['Use this', 'यह उपयोग करें'],
  typedByYou: ['typed by operator', 'ऑपरेटर ने लिखा'],
  undoEdit: ['Use document value', 'दस्तावेज़ का मान लें'],
  notes: ['Notes', 'नोट्स'],
  unsaved: ['You have unsaved changes', 'बदलाव सेव नहीं हुए हैं'],
  invalidAadhaar: ['Aadhaar checksum is wrong — a digit may be mistyped', 'आधार जाँच अंक गलत है — कोई अंक गलत हो सकता है'],
  invalidMobile: ['Mobile should be 10 digits starting 6–9', 'मोबाइल 6–9 से शुरू होने वाले 10 अंकों का हो'],
  invalidPin: ['PIN code should be 6 digits', 'पिन कोड 6 अंकों का हो'],
  invalidPan: ['PAN format looks wrong (e.g. ABCPE1234F)', 'पैन प्रारूप गलत लगता है (जैसे ABCPE1234F)'],
  invalidIfsc: ['IFSC should look like SBIN0001234', 'IFSC ऐसा होना चाहिए: SBIN0001234'],

  // services
  ready: ['Ready to apply', 'आवेदन हेतु तैयार'],
  needsInfo: ['Needs info / documents', 'जानकारी / दस्तावेज़ चाहिए'],
  notEligible: ['Not eligible', 'पात्र नहीं'],
  startApplication: ['Start application', 'आवेदन शुरू करें'],
  rulesTitle: ['Eligibility rules', 'पात्रता नियम'],
  docsTitle: ['Documents', 'दस्तावेज़'],
  missingFields: ['Missing details', 'कमी वाले विवरण'],
  fillNow: ['Fill in Details', 'विवरण भरें'],
  ruleUnverified: ['Rule not verified by shop', 'दुकान द्वारा नियम सत्यापित नहीं'],
  ruleVerified: ['Verified', 'सत्यापित'],
  seenPhysical: ['Seen / ready', 'देखा / तैयार'],
  printChecklist: ['Print document checklist', 'दस्तावेज़ सूची प्रिंट करें'],
  askCustomer: ['Ask the customer', 'ग्राहक से पूछें'],
  feeGovt: ['Govt fee', 'सरकारी शुल्क'],
  feeService: ['Service charge', 'सेवा शुल्क'],
  unverifiedNote: ['These rules are starting points. Confirm them with the official notification and tick “Verified” in Settings.', 'ये नियम केवल शुरुआती हैं। आधिकारिक अधिसूचना से पुष्टि करें और सेटिंग्स में “सत्यापित” पर टिक करें।'],

  // apply
  valuesToFill: ['Values to fill', 'भरने के मान'],
  copyAll: ['Copy all as text', 'सब टेक्स्ट में कॉपी करें'],
  openPortal: ['Open portal', 'पोर्टल खोलें'],
  steps: ['Steps', 'चरण'],
  extensionReady: ['The ⚡ extension will fill these values for this customer and service.', '⚡ एक्सटेंशन इस ग्राहक और सेवा के लिए ये मान भरेगा।'],
  neverSubmits: ['Submit and pay on the official portal yourself. This app never submits or pays.', 'आधिकारिक पोर्टल पर जमा और भुगतान स्वयं करें। यह ऐप कभी जमा या भुगतान नहीं करता।'],
  printReview: ['Print review sheet for customer', 'ग्राहक के लिए जाँच पत्र प्रिंट करें'],
  recordApplication: ['Record in register', 'रजिस्टर में दर्ज करें'],
  applicationNo: ['Application / acknowledgement no.', 'आवेदन / पावती संख्या'],
  status: ['Status', 'स्थिति'],
  amountPaid: ['Amount paid by customer', 'ग्राहक द्वारा भुगतान'],
  paymentMode: ['Payment mode', 'भुगतान का तरीका'],
  cash: ['Cash', 'नकद'],
  upi: ['UPI', 'UPI'],
  other: ['Other', 'अन्य'],
  printReceipt: ['Print receipt', 'रसीद प्रिंट करें'],
  recorded: ['Saved in the application register', 'आवेदन रजिस्टर में सेव हुआ'],

  // applications
  today: ['Today', 'आज'],
  thisWeek: ['This week', 'इस सप्ताह'],
  thisMonth: ['This month', 'इस महीने'],
  allTime: ['All', 'सभी'],
  exportCsv: ['Export to Excel (CSV)', 'Excel (CSV) में निर्यात'],
  total: ['Total', 'कुल'],
  refNo: ['Ref no.', 'क्रम सं.'],
  date: ['Date', 'तारीख'],
  service: ['Service', 'सेवा'],
  customer: ['Customer', 'ग्राहक'],
  allStatuses: ['All statuses', 'सभी स्थितियाँ'],
  allServices: ['All services', 'सभी सेवाएँ'],
  noApplications: ['No applications in this period', 'इस अवधि में कोई आवेदन नहीं'],
  followUp: ['Follow up (submitted 7+ days ago)', 'फॉलो-अप (7+ दिन पहले जमा)'],

  // home
  greeting: ['Namaste', 'नमस्ते'],
  customersToday: ['Customers today', 'आज के ग्राहक'],
  applicationsToday: ['Applications today', 'आज के आवेदन'],
  collectedToday: ['Collected today', 'आज की वसूली'],
  thisMonthApps: ['Applications this month', 'इस महीने के आवेदन'],
  recentCustomers: ['Recent customers', 'हाल के ग्राहक'],
  gettingStarted: ['Getting started', 'शुरुआत'],
  findCustomer: ['Find a customer', 'ग्राहक खोजें'],

  // tools
  compressTitle: ['Compress / convert for portal upload', 'पोर्टल अपलोड के लिए छोटा / बदलें'],
  photoTitle: ['Photo / signature resize', 'फोटो / हस्ताक्षर का आकार'],
  maxSize: ['Maximum size (KB)', 'अधिकतम आकार (KB)'],
  outputFormat: ['Output', 'आउटपुट'],
  onePdf: ['One PDF (merge all)', 'एक PDF (सब जोड़ें)'],
  jpgImage: ['JPG image', 'JPG फोटो'],
  grayscale: ['Black & white (smaller)', 'ब्लैक एंड व्हाइट (छोटा)'],
  makeFile: ['Make file', 'फाइल बनाएँ'],
  chooseFiles: ['Choose files', 'फाइलें चुनें'],
  width: ['Width (px)', 'चौड़ाई (px)'],
  height: ['Height (px)', 'ऊँचाई (px)'],
  localOnly: ['Files are processed on this computer only — nothing is uploaded to any website.', 'फाइलें केवल इसी कंप्यूटर पर बनती हैं — किसी वेबसाइट पर अपलोड नहीं होतीं।'],
};

const LangContext = createContext({ lang: 'en', t: (k) => k, L: (o) => o });

export function makeT(lang) {
  const i = lang === 'hi' ? 1 : 0;
  const t = (key) => (DICT[key] ? DICT[key][i] : key);
  const L = (obj) => {
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || '';
  };
  return { lang, t, L };
}

export function LangProvider({ lang, children }) {
  return <LangContext.Provider value={makeT(lang)}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
