/**
 * config/catalog.js — shared vocabulary for the whole app.
 *
 * FIELD_DEFS is the single source of truth for every profile field:
 *   key      flat key used by forms, the extension and service definitions
 *            (kept identical to the old v5 keys, e.g. id_number = Aadhaar)
 *   path     location inside the structured profile
 *   group    section shown in the "Details" screen
 *   label    English / Hindi label
 *   type     text | textarea | date | select | number | digits
 *   validate optional validator name (see services/validators.js)
 *   sensitive  masked in lists, logs and the extension preview
 */

'use strict';

const FIELD_GROUPS = [
  { id: 'personal',  label: { en: 'Personal details',        hi: 'व्यक्तिगत विवरण' } },
  { id: 'contact',   label: { en: 'Contact',                 hi: 'संपर्क' } },
  { id: 'identity',  label: { en: 'ID numbers',              hi: 'पहचान संख्या' } },
  { id: 'address',   label: { en: 'Address & residence',     hi: 'पता एवं निवास' } },
  { id: 'category',  label: { en: 'Category, income & work', hi: 'वर्ग, आय एवं व्यवसाय' } },
  { id: 'education', label: { en: 'Education',               hi: 'शिक्षा' } },
  { id: 'bank',      label: { en: 'Bank details',            hi: 'बैंक विवरण' } },
  { id: 'marriage',  label: { en: 'Marriage (if applicable)', hi: 'विवाह (यदि लागू हो)' } },
];

const YES_NO = ['Yes', 'No'];

const FIELD_DEFS = [
  // personal
  { key: 'name',          path: 'personal_info.name',          group: 'personal', type: 'text', label: { en: 'Full name (English)', hi: 'पूरा नाम (अंग्रेज़ी)' } },
  { key: 'name_hi',       path: 'personal_info.name_hi',       group: 'personal', type: 'text', label: { en: 'Full name (Hindi)', hi: 'पूरा नाम (हिंदी)' } },
  { key: 'father_name',   path: 'personal_info.father_name',   group: 'personal', type: 'text', label: { en: "Father's name", hi: 'पिता का नाम' } },
  { key: 'father_name_hi', path: 'personal_info.father_name_hi', group: 'personal', type: 'text', label: { en: "Father's name (Hindi)", hi: 'पिता का नाम (हिंदी)' } },
  { key: 'mother_name',   path: 'personal_info.mother_name',   group: 'personal', type: 'text', label: { en: "Mother's name", hi: 'माता का नाम' } },
  { key: 'husband_name',  path: 'personal_info.husband_name',  group: 'personal', type: 'text', label: { en: "Husband's name", hi: 'पति का नाम' } },
  { key: 'dob',           path: 'personal_info.dob',           group: 'personal', type: 'date', validate: 'date', label: { en: 'Date of birth', hi: 'जन्म तिथि' } },
  { key: 'gender',        path: 'personal_info.gender',        group: 'personal', type: 'select', options: ['Male', 'Female', 'Transgender'], label: { en: 'Gender', hi: 'लिंग' } },
  { key: 'is_married',    path: 'marriage.is_married',         group: 'personal', type: 'select', options: YES_NO, label: { en: 'Married?', hi: 'विवाहित?' } },
  { key: 'religion',      path: 'personal_info.religion',      group: 'personal', type: 'text', label: { en: 'Religion', hi: 'धर्म' } },
  { key: 'nationality',   path: 'personal_info.nationality',   group: 'personal', type: 'text', label: { en: 'Nationality', hi: 'राष्ट्रीयता' } },
  { key: 'blood_group',   path: 'personal_info.blood_group',   group: 'personal', type: 'text', label: { en: 'Blood group', hi: 'रक्त समूह' } },

  // contact
  { key: 'phone',         path: 'personal_info.phone',         group: 'contact', type: 'digits', validate: 'mobile', label: { en: 'Mobile number', hi: 'मोबाइल नंबर' } },
  { key: 'email',         path: 'personal_info.email',         group: 'contact', type: 'text', validate: 'email', label: { en: 'Email', hi: 'ईमेल' } },

  // identity
  { key: 'id_number',       path: 'identity_documents.aadhaar_number',  group: 'identity', type: 'digits', validate: 'aadhaar', sensitive: true, label: { en: 'Aadhaar number', hi: 'आधार नंबर' } },
  { key: 'jan_aadhaar_id',  path: 'identity_documents.jan_aadhaar_id',  group: 'identity', type: 'text', sensitive: true, label: { en: 'Jan Aadhaar ID', hi: 'जन आधार आईडी' } },
  { key: 'pan',             path: 'identity_documents.pan_number',      group: 'identity', type: 'text', validate: 'pan', sensitive: true, label: { en: 'PAN', hi: 'पैन नंबर' } },
  { key: 'voter_id',        path: 'identity_documents.voter_id',        group: 'identity', type: 'text', validate: 'epic', sensitive: true, label: { en: 'Voter ID (EPIC)', hi: 'मतदाता पहचान पत्र (EPIC)' } },
  { key: 'driving_license', path: 'identity_documents.driving_license', group: 'identity', type: 'text', sensitive: true, label: { en: 'Driving licence no.', hi: 'ड्राइविंग लाइसेंस नंबर' } },
  { key: 'passport_number', path: 'identity_documents.passport_number', group: 'identity', type: 'text', sensitive: true, label: { en: 'Passport no.', hi: 'पासपोर्ट नंबर' } },
  { key: 'ration_card_number', path: 'identity_documents.ration_card_number', group: 'identity', type: 'text', sensitive: true, label: { en: 'Ration card no.', hi: 'राशन कार्ड नंबर' } },

  // address
  { key: 'address',        path: 'residence.current_address',  group: 'address', type: 'textarea', label: { en: 'Full address', hi: 'पूरा पता' } },
  { key: 'address_hi',     path: 'residence.current_address_hi', group: 'address', type: 'textarea', label: { en: 'Full address (Hindi)', hi: 'पूरा पता (हिंदी)' } },
  { key: 'house_no',       path: 'residence.house_no',         group: 'address', type: 'text', label: { en: 'House / plot no.', hi: 'मकान / प्लॉट नं.' } },
  { key: 'street',         path: 'residence.street',           group: 'address', type: 'text', label: { en: 'Street / locality / ward', hi: 'गली / मोहल्ला / वार्ड' } },
  { key: 'village_city',   path: 'residence.village_city',     group: 'address', type: 'text', label: { en: 'Village / town / city', hi: 'गाँव / कस्बा / शहर' } },
  { key: 'post_office',    path: 'residence.post_office',      group: 'address', type: 'text', label: { en: 'Post office', hi: 'डाकघर' } },
  { key: 'tehsil',         path: 'residence.tehsil',           group: 'address', type: 'text', label: { en: 'Tehsil / sub-district', hi: 'तहसील' } },
  { key: 'district',       path: 'residence.district',         group: 'address', type: 'text', label: { en: 'District', hi: 'जिला' } },
  { key: 'state',          path: 'residence.state',            group: 'address', type: 'text', label: { en: 'State', hi: 'राज्य' } },
  { key: 'pincode',        path: 'residence.pincode',          group: 'address', type: 'digits', validate: 'pincode', label: { en: 'PIN code', hi: 'पिन कोड' } },
  { key: 'permanent_address', path: 'residence.permanent_address', group: 'address', type: 'textarea', label: { en: 'Permanent address (if different)', hi: 'स्थायी पता (यदि अलग हो)' } },
  { key: 'birth_place',    path: 'residence.birth_place',      group: 'address', type: 'text', label: { en: 'Place of birth', hi: 'जन्म स्थान' } },
  { key: 'native_place',   path: 'residence.native_place',     group: 'address', type: 'text', label: { en: "Father's native place", hi: 'पिता का मूल स्थान' } },
  { key: 'years_in_rajasthan', path: 'residence.years_in_rajasthan', group: 'address', type: 'number', label: { en: 'Years living in Rajasthan (as told by customer)', hi: 'राजस्थान में कितने वर्ष से (ग्राहक के अनुसार)' } },
  { key: 'in_voter_list',  path: 'residence.in_voter_list',    group: 'address', type: 'select', options: YES_NO, label: { en: 'Name in voter list?', hi: 'मतदाता सूची में नाम?' } },

  // category / income / work
  { key: 'caste',          path: 'category.caste',             group: 'category', type: 'text', label: { en: 'Caste', hi: 'जाति' } },
  { key: 'caste_category', path: 'category.caste_category',    group: 'category', type: 'select', options: ['General', 'OBC', 'MBC', 'SC', 'ST'], label: { en: 'Category', hi: 'वर्ग' } },
  { key: 'annual_income',  path: 'category.annual_income',     group: 'category', type: 'number', label: { en: 'Annual family income (₹)', hi: 'वार्षिक पारिवारिक आय (₹)' } },
  { key: 'occupation',     path: 'occupation.occupation',      group: 'category', type: 'text', label: { en: 'Occupation', hi: 'व्यवसाय' } },
  { key: 'father_occupation', path: 'occupation.father_occupation', group: 'category', type: 'text', label: { en: "Father's occupation", hi: 'पिता का व्यवसाय' } },
  { key: 'father_occupation_address', path: 'occupation.father_occupation_address', group: 'category', type: 'text', label: { en: "Father's work address", hi: 'पिता के व्यवसाय का पता' } },

  // education
  { key: 'education_10th_school',     path: 'education.class_10.school',     group: 'education', type: 'text', label: { en: 'Class 10 school', hi: '10वीं विद्यालय' } },
  { key: 'education_10th_place',      path: 'education.class_10.place',      group: 'education', type: 'text', label: { en: 'Class 10 school place', hi: '10वीं विद्यालय स्थान' } },
  { key: 'education_10th_board',      path: 'education.class_10.board',      group: 'education', type: 'text', label: { en: 'Class 10 board', hi: '10वीं बोर्ड' } },
  { key: 'education_10th_year',       path: 'education.class_10.year',       group: 'education', type: 'digits', label: { en: 'Class 10 passing year', hi: '10वीं उत्तीर्ण वर्ष' } },
  { key: 'education_10th_roll',       path: 'education.class_10.roll_number', group: 'education', type: 'text', label: { en: 'Class 10 roll no.', hi: '10वीं रोल नंबर' } },
  { key: 'education_10th_percentage', path: 'education.class_10.percentage', group: 'education', type: 'text', label: { en: 'Class 10 %', hi: '10वीं प्रतिशत' } },
  { key: 'education_12th_school',     path: 'education.class_12.school',     group: 'education', type: 'text', label: { en: 'Class 12 school', hi: '12वीं विद्यालय' } },
  { key: 'education_12th_place',      path: 'education.class_12.place',      group: 'education', type: 'text', label: { en: 'Class 12 school place', hi: '12वीं विद्यालय स्थान' } },
  { key: 'education_12th_board',      path: 'education.class_12.board',      group: 'education', type: 'text', label: { en: 'Class 12 board', hi: '12वीं बोर्ड' } },
  { key: 'education_12th_year',       path: 'education.class_12.year',       group: 'education', type: 'digits', label: { en: 'Class 12 passing year', hi: '12वीं उत्तीर्ण वर्ष' } },
  { key: 'education_12th_roll',       path: 'education.class_12.roll_number', group: 'education', type: 'text', label: { en: 'Class 12 roll no.', hi: '12वीं रोल नंबर' } },
  { key: 'education_12th_percentage', path: 'education.class_12.percentage', group: 'education', type: 'text', label: { en: 'Class 12 %', hi: '12वीं प्रतिशत' } },
  { key: 'education_grad_school',     path: 'education.graduate.college',    group: 'education', type: 'text', label: { en: 'Graduation college', hi: 'स्नातक महाविद्यालय' } },
  { key: 'education_grad_place',      path: 'education.graduate.place',      group: 'education', type: 'text', label: { en: 'Graduation college place', hi: 'स्नातक महाविद्यालय स्थान' } },
  { key: 'education_grad_year',       path: 'education.graduate.year',       group: 'education', type: 'digits', label: { en: 'Graduation year', hi: 'स्नातक वर्ष' } },
  { key: 'highest_education',         path: 'education.highest_level',       group: 'education', type: 'text', label: { en: 'Highest qualification', hi: 'उच्चतम योग्यता' } },

  // bank
  { key: 'account_number', path: 'bank.account_number', group: 'bank', type: 'digits', sensitive: true, label: { en: 'Bank account no.', hi: 'बैंक खाता संख्या' } },
  { key: 'ifsc_code',      path: 'bank.ifsc_code',      group: 'bank', type: 'text', validate: 'ifsc', label: { en: 'IFSC code', hi: 'IFSC कोड' } },
  { key: 'bank_name',      path: 'bank.bank_name',      group: 'bank', type: 'text', label: { en: 'Bank name', hi: 'बैंक का नाम' } },

  // marriage
  { key: 'marriage_date',      path: 'marriage.marriage_date',      group: 'marriage', type: 'text', label: { en: 'Marriage date & spouse', hi: 'विवाह तिथि एवं जीवनसाथी' } },
  { key: 'husband_domicile',   path: 'marriage.husband_domicile',   group: 'marriage', type: 'select', options: YES_NO, label: { en: 'Husband is Rajasthan domicile?', hi: 'क्या पति राजस्थान के मूल निवासी हैं?' } },
  { key: 'living_with_husband_since', path: 'marriage.living_with_husband_since', group: 'marriage', type: 'text', label: { en: 'Living with husband since / where', hi: 'पति के साथ कब से / कहाँ' } },
];

const FIELD_BY_KEY = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f]));
const FIELD_BY_PATH = Object.fromEntries(FIELD_DEFS.map((f) => [f.path, f]));

/**
 * Document types. `trust` decides which document wins when two documents
 * disagree about the same field (higher wins). Operator edits always win.
 */
const DOC_TYPES = {
  aadhaar:            { label: { en: 'Aadhaar card', hi: 'आधार कार्ड' },                 trust: 90 },
  jan_aadhaar:        { label: { en: 'Jan Aadhaar card', hi: 'जन आधार कार्ड' },          trust: 86 },
  pan:                { label: { en: 'PAN card', hi: 'पैन कार्ड' },                       trust: 88 },
  passport:           { label: { en: 'Passport', hi: 'पासपोर्ट' },                        trust: 89 },
  voter_id:           { label: { en: 'Voter ID card', hi: 'मतदाता पहचान पत्र' },          trust: 82 },
  driving_license:    { label: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस' },        trust: 84 },
  ration_card:        { label: { en: 'Ration card', hi: 'राशन कार्ड' },                    trust: 70 },
  birth_certificate:  { label: { en: 'Birth certificate', hi: 'जन्म प्रमाण पत्र' },       trust: 88 },
  marksheet:          { label: { en: 'Marksheet', hi: 'अंकतालिका' },                      trust: 78 },
  school_certificate: { label: { en: 'School certificate / TC', hi: 'विद्यालय प्रमाण पत्र / TC' }, trust: 74 },
  electricity_bill:   { label: { en: 'Electricity bill', hi: 'बिजली बिल' },                trust: 62 },
  water_bill:         { label: { en: 'Water bill', hi: 'पानी का बिल' },                    trust: 60 },
  bank_passbook:      { label: { en: 'Bank passbook / statement', hi: 'बैंक पासबुक / स्टेटमेंट' }, trust: 66 },
  rent_agreement:     { label: { en: 'Rent agreement', hi: 'किरायानामा' },                  trust: 55 },
  land_record:        { label: { en: 'Land record (Jamabandi)', hi: 'भूमि रिकॉर्ड (जमाबंदी)' }, trust: 72 },
  income_certificate: { label: { en: 'Income certificate', hi: 'आय प्रमाण पत्र' },         trust: 80 },
  caste_certificate:  { label: { en: 'Caste certificate', hi: 'जाति प्रमाण पत्र' },        trust: 80 },
  domicile_certificate: { label: { en: 'Mool Niwas (domicile) certificate', hi: 'मूल निवास प्रमाण पत्र' }, trust: 82 },
  photo:              { label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' },     trust: 0 },
  signature:          { label: { en: 'Signature', hi: 'हस्ताक्षर' },                         trust: 0 },
  self_declaration:   { label: { en: 'Self-declaration / affidavit', hi: 'स्व-घोषणा / शपथ पत्र' }, trust: 40 },
  other:              { label: { en: 'Other document', hi: 'अन्य दस्तावेज़' },              trust: 40 },
  manual:             { label: { en: 'Entered by operator', hi: 'ऑपरेटर द्वारा दर्ज' },     trust: 100 },
};

/** Document types an operator can only tick as "seen" (not read by OCR). */
const MANUAL_DOC_TYPES = ['photo', 'signature', 'self_declaration'];

const APPLICATION_STATUSES = [
  { id: 'draft',      label: { en: 'Draft', hi: 'ड्राफ्ट' } },
  { id: 'submitted',  label: { en: 'Submitted', hi: 'जमा किया' } },
  { id: 'in_process', label: { en: 'In process', hi: 'प्रक्रिया में' } },
  { id: 'approved',   label: { en: 'Approved', hi: 'स्वीकृत' } },
  { id: 'rejected',   label: { en: 'Rejected', hi: 'अस्वीकृत' } },
  { id: 'delivered',  label: { en: 'Delivered to customer', hi: 'ग्राहक को दिया' } },
  { id: 'cancelled',  label: { en: 'Cancelled', hi: 'रद्द' } },
];

/**
 * Rajasthan districts (41 after the Dec-2024 reorganisation) plus districts
 * that existed in 2023-24 and still appear on older documents. Used only as a
 * hint; the PIN code (30xxxx–34xxxx) and the word "Rajasthan" are stronger.
 */
const RAJASTHAN_DISTRICTS = [
  'ajmer', 'alwar', 'balotra', 'banswara', 'baran', 'barmer', 'beawar', 'bharatpur', 'bhilwara',
  'bikaner', 'bundi', 'chittorgarh', 'chittaurgarh', 'churu', 'dausa', 'deeg', 'dholpur',
  'didwana', 'kuchaman', 'dungarpur', 'hanumangarh', 'jaipur', 'jaisalmer', 'jalore', 'jalor',
  'jhalawar', 'jhunjhunu', 'jhunjhunun', 'jodhpur', 'karauli', 'khairthal', 'tijara', 'kota',
  'kotputli', 'behror', 'nagaur', 'pali', 'phalodi', 'pratapgarh', 'rajsamand', 'salumbar',
  'sawai madhopur', 'sikar', 'sirohi', 'sri ganganagar', 'ganganagar', 'tonk', 'udaipur',
  // created 2023, cancelled 2024 — still printed on documents from that period
  'dudu', 'kekri', 'shahpura', 'neem ka thana', 'gangapur city', 'anupgarh', 'sanchore',
];

/** First two digits of an Indian PIN code → postal circle (state hint). */
const PIN_PREFIX_STATE = {
  11: 'Delhi', 12: 'Haryana', 13: 'Haryana', 14: 'Punjab', 15: 'Punjab', 16: 'Punjab/Chandigarh',
  17: 'Himachal Pradesh', 18: 'Jammu & Kashmir', 19: 'Jammu & Kashmir',
  20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh', 23: 'Uttar Pradesh',
  24: 'Uttar Pradesh/Uttarakhand', 25: 'Uttar Pradesh', 26: 'Uttarakhand/Uttar Pradesh',
  27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
  30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan', 33: 'Rajasthan', 34: 'Rajasthan',
  36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
  40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra', 43: 'Maharashtra', 44: 'Maharashtra',
  45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh', 49: 'Chhattisgarh',
  50: 'Telangana', 51: 'Andhra Pradesh', 52: 'Andhra Pradesh', 53: 'Andhra Pradesh',
  56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka', 59: 'Karnataka',
  60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu',
  67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
  70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal',
  75: 'Odisha', 76: 'Odisha', 77: 'Odisha', 78: 'Assam', 79: 'North-East',
  80: 'Bihar', 81: 'Bihar/Jharkhand', 82: 'Bihar/Jharkhand', 83: 'Jharkhand', 84: 'Bihar', 85: 'Bihar',
};

module.exports = {
  FIELD_GROUPS, FIELD_DEFS, FIELD_BY_KEY, FIELD_BY_PATH,
  DOC_TYPES, MANUAL_DOC_TYPES, APPLICATION_STATUSES,
  RAJASTHAN_DISTRICTS, PIN_PREFIX_STATE,
};
