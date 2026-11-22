/**
 * config/services.default.js — default service catalogue.
 *
 * ⚠ IMPORTANT FOR THE SHOP OWNER
 * These are starting points, NOT official rules. Government notifications
 * change. Every rule ships with verified: false. Open Settings → Services,
 * check each rule against the current official notification / portal / Tehsil
 * office, edit values if needed and tick "Verified". Fees are left empty for
 * you to fill in (your kiosk's government fee and your service charge).
 *
 * Rule types (see services/eligibilityEngine.js):
 *   state_is            { value: 'Rajasthan' }
 *   age_min / age_max   { value: 18 }
 *   income_max          { value: 800000 }                (₹ per year, family)
 *   residence_years_min { value: 10 }                    (proved by dated documents)
 *   born_in_state       { value: 'Rajasthan' }
 *   category_in         { values: ['SC','ST'] }   / category_not_in
 *   confirm             { question: {en,hi}, expected: true|false }  (operator asks customer)
 *   any_of / all_of     { rules: [...] }
 */

'use strict';

const ID_PROOF = ['aadhaar', 'jan_aadhaar', 'voter_id', 'pan', 'driving_license', 'passport'];
const ADDRESS_PROOF = ['aadhaar', 'jan_aadhaar', 'voter_id', 'electricity_bill', 'water_bill', 'ration_card', 'bank_passbook', 'passport', 'rent_agreement', 'land_record', 'driving_license'];
const AGE_PROOF = ['birth_certificate', 'marksheet', 'school_certificate', 'aadhaar', 'pan', 'passport', 'driving_license'];

const SSO_STEPS = {
  en: 'Log in at sso.rajasthan.gov.in with your kiosk SSO ID → open eMitra → choose the service → fill the form (use ⚡ Autofill) → upload documents → review with the customer → pay from your kiosk wallet → print the receipt.',
  hi: 'sso.rajasthan.gov.in पर अपनी कियोस्क SSO ID से लॉगिन करें → eMitra खोलें → सेवा चुनें → फॉर्म भरें (⚡ ऑटोफिल का उपयोग करें) → दस्तावेज़ अपलोड करें → ग्राहक के साथ जाँचें → कियोस्क वॉलेट से भुगतान करें → रसीद प्रिंट करें।',
};

const RAJ_RESIDENT_RULE = {
  id: 'rajasthan_resident',
  type: 'state_is',
  value: 'Rajasthan',
  label: { en: 'Lives in Rajasthan (address on documents)', hi: 'राजस्थान में निवास (दस्तावेज़ों पर पता)' },
  source_note: { en: 'Confirm the residence condition in the current notification.', hi: 'वर्तमान अधिसूचना में निवास की शर्त की पुष्टि करें।' },
};

module.exports = [
  {
    id: 'mool_niwas',
    name: { en: 'Mool Niwas (Domicile) Certificate', hi: 'मूल निवास प्रमाण पत्र' },
    category: 'certificate',
    department: { en: 'Revenue Department (Tehsildar / SDM)', hi: 'राजस्व विभाग (तहसीलदार / उपखंड अधिकारी)' },
    portal: { url: 'https://sso.rajasthan.gov.in', steps: SSO_STEPS },
    documents: [
      { id: 'identity', label: { en: 'Identity proof', hi: 'पहचान प्रमाण' }, any_of: ['aadhaar', 'jan_aadhaar', 'voter_id'], required: true },
      { id: 'address', label: { en: 'Current address proof in Rajasthan', hi: 'राजस्थान में वर्तमान पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'long_residence', label: { en: 'Old proof of living in Rajasthan (bill, marksheet, ration card, land record)', hi: 'राजस्थान में लंबे निवास का पुराना प्रमाण (बिल, अंकतालिका, राशन कार्ड, भूमि रिकॉर्ड)' }, any_of: ['electricity_bill', 'water_bill', 'marksheet', 'school_certificate', 'ration_card', 'land_record', 'birth_certificate', 'voter_id'], required: true },
      { id: 'photo', label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' }, any_of: ['photo'], required: true, manual: true },
      { id: 'affidavit', label: { en: 'Self-declaration / affidavit', hi: 'स्व-घोषणा / शपथ पत्र' }, any_of: ['self_declaration'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'address', 'district', 'tehsil', 'pincode', 'phone', 'id_number', 'birth_place', 'years_in_rajasthan'],
    optional_fields: ['name_hi', 'father_name_hi', 'mother_name', 'husband_name', 'native_place', 'father_occupation', 'father_occupation_address',
      'education_10th_school', 'education_10th_place', 'education_12th_school', 'education_12th_place', 'education_grad_school', 'education_grad_place',
      'voter_id', 'in_voter_list', 'driving_license', 'is_married', 'marriage_date', 'husband_domicile', 'living_with_husband_since'],
    rules: [
      RAJ_RESIDENT_RULE,
      {
        id: 'residence_or_birth',
        type: 'any_of',
        label: { en: 'Lived in Rajasthan for the required years, or born in Rajasthan', hi: 'आवश्यक वर्षों से राजस्थान में निवास, या राजस्थान में जन्म' },
        source_note: {
          en: 'Third-party guides commonly cite 10 years of residence; your earlier prototype used 8. Confirm the current rule with the official notification / Tehsil office and set the number in Settings.',
          hi: 'आम तौर पर 10 वर्ष निवास बताया जाता है; आपके पुराने प्रोटोटाइप में 8 था। आधिकारिक अधिसूचना / तहसील से वर्तमान नियम की पुष्टि करें और सेटिंग्स में संख्या रखें।',
        },
        rules: [
          { id: 'residence_years', type: 'residence_years_min', value: 10, label: { en: 'Documents prove residence for at least {value} years', hi: 'दस्तावेज़ कम से कम {value} वर्ष का निवास साबित करते हैं' } },
          { id: 'born_in_rajasthan', type: 'born_in_state', value: 'Rajasthan', label: { en: 'Born in Rajasthan', hi: 'राजस्थान में जन्म' } },
        ],
      },
    ],
  },

  {
    id: 'income_certificate',
    name: { en: 'Income Certificate (Aay Praman Patra)', hi: 'आय प्रमाण पत्र' },
    category: 'certificate',
    department: { en: 'Revenue Department (Tehsildar)', hi: 'राजस्व विभाग (तहसीलदार)' },
    portal: { url: 'https://sso.rajasthan.gov.in', steps: SSO_STEPS },
    documents: [
      { id: 'identity', label: { en: 'Identity proof', hi: 'पहचान प्रमाण' }, any_of: ID_PROOF, required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'income', label: { en: 'Income proof (salary slip / ITR / self-declaration)', hi: 'आय का प्रमाण (वेतन पर्ची / ITR / स्व-घोषणा)' }, any_of: ['self_declaration', 'income_certificate', 'bank_passbook'], required: true, manual: true },
      { id: 'photo', label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' }, any_of: ['photo'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'address', 'district', 'tehsil', 'pincode', 'phone', 'id_number', 'annual_income', 'occupation'],
    optional_fields: ['name_hi', 'father_name_hi', 'husband_name', 'caste_category', 'jan_aadhaar_id'],
    rules: [RAJ_RESIDENT_RULE],
  },

  {
    id: 'caste_certificate',
    name: { en: 'Caste Certificate (SC / ST / OBC / MBC)', hi: 'जाति प्रमाण पत्र (अजा / अजजा / अपिव / अपिव-अति)' },
    category: 'certificate',
    department: { en: 'Revenue Department (Tehsildar / SDM)', hi: 'राजस्व विभाग (तहसीलदार / उपखंड अधिकारी)' },
    portal: { url: 'https://sso.rajasthan.gov.in', steps: SSO_STEPS },
    documents: [
      { id: 'identity', label: { en: 'Identity proof', hi: 'पहचान प्रमाण' }, any_of: ID_PROOF, required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'caste_proof', label: { en: "Family caste proof (father's/relative's caste certificate, Jamabandi, school record)", hi: 'परिवार की जाति का प्रमाण (पिता/संबंधी का जाति प्रमाण पत्र, जमाबंदी, विद्यालय रिकॉर्ड)' }, any_of: ['caste_certificate', 'land_record', 'school_certificate', 'marksheet'], required: true },
      { id: 'photo', label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' }, any_of: ['photo'], required: true, manual: true },
      { id: 'affidavit', label: { en: 'Self-declaration / affidavit', hi: 'स्व-घोषणा / शपथ पत्र' }, any_of: ['self_declaration'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'address', 'district', 'tehsil', 'pincode', 'phone', 'id_number', 'caste', 'caste_category'],
    optional_fields: ['name_hi', 'father_name_hi', 'annual_income', 'occupation'],
    rules: [
      RAJ_RESIDENT_RULE,
      {
        id: 'reserved_category', type: 'category_in', values: ['SC', 'ST', 'OBC', 'MBC'],
        label: { en: 'Belongs to SC / ST / OBC / MBC', hi: 'अजा / अजजा / अपिव / अपिव-अति वर्ग से' },
        source_note: { en: 'OBC/MBC certificates may also need the non-creamy-layer income condition — check the notification.', hi: 'अपिव/अति पिछड़ा प्रमाण पत्र के लिए नॉन-क्रीमी लेयर आय शर्त भी हो सकती है — अधिसूचना देखें।' },
      },
    ],
  },

  {
    id: 'ews_certificate',
    name: { en: 'EWS Certificate', hi: 'आर्थिक रूप से कमजोर वर्ग (EWS) प्रमाण पत्र' },
    category: 'certificate',
    department: { en: 'Revenue Department (Tehsildar / SDM)', hi: 'राजस्व विभाग (तहसीलदार / उपखंड अधिकारी)' },
    portal: { url: 'https://sso.rajasthan.gov.in', steps: SSO_STEPS },
    documents: [
      { id: 'identity', label: { en: 'Identity proof', hi: 'पहचान प्रमाण' }, any_of: ID_PROOF, required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'income', label: { en: 'Family income proof / self-declaration', hi: 'पारिवारिक आय का प्रमाण / स्व-घोषणा' }, any_of: ['income_certificate', 'self_declaration'], required: true, manual: true },
      { id: 'photo', label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' }, any_of: ['photo'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'address', 'district', 'tehsil', 'pincode', 'phone', 'id_number', 'caste', 'caste_category', 'annual_income'],
    optional_fields: ['name_hi', 'occupation'],
    rules: [
      RAJ_RESIDENT_RULE,
      { id: 'not_reserved', type: 'category_not_in', values: ['SC', 'ST', 'OBC', 'MBC'], label: { en: 'Not covered by SC / ST / OBC / MBC reservation', hi: 'अजा / अजजा / अपिव / अति पिछड़ा आरक्षण में शामिल नहीं' } },
      {
        id: 'income_limit', type: 'income_max', value: 800000,
        label: { en: 'Family income up to ₹{value} per year', hi: 'पारिवारिक आय ₹{value} प्रति वर्ष तक' },
        source_note: { en: 'The central EWS limit is ₹8 lakh gross annual family income. Confirm Rajasthan\'s current conditions (assets, etc.).', hi: 'केंद्र की EWS सीमा ₹8 लाख वार्षिक पारिवारिक आय है। राजस्थान की वर्तमान शर्तें (संपत्ति आदि) पुष्टि करें।' },
      },
    ],
  },

  {
    id: 'voter_registration',
    name: { en: 'New Voter Registration (Form 6)', hi: 'नया मतदाता पंजीकरण (फॉर्म 6)' },
    category: 'id_card',
    department: { en: 'Election Commission of India', hi: 'भारत निर्वाचन आयोग' },
    portal: { url: 'https://voters.eci.gov.in', steps: { en: 'voters.eci.gov.in → sign up / log in → Form 6 (new voter) → fill (use ⚡ Autofill) → upload photo, age and address proof → submit → note the reference number.', hi: 'voters.eci.gov.in → साइन अप / लॉगिन → फॉर्म 6 (नया मतदाता) → भरें (⚡ ऑटोफिल) → फोटो, आयु व पता प्रमाण अपलोड करें → जमा करें → संदर्भ संख्या लिखें।' } },
    documents: [
      { id: 'age', label: { en: 'Age proof', hi: 'आयु प्रमाण' }, any_of: AGE_PROOF, required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'photo', label: { en: 'Passport-size photo', hi: 'पासपोर्ट साइज फोटो' }, any_of: ['photo'], required: true, manual: true },
    ],
    fields: ['name', 'dob', 'gender', 'father_name', 'address', 'district', 'state', 'pincode', 'phone'],
    optional_fields: ['name_hi', 'father_name_hi', 'email', 'id_number', 'husband_name'],
    rules: [
      {
        id: 'age_18', type: 'age_min', value: 18,
        label: { en: 'At least {value} years old', hi: 'कम से कम {value} वर्ष की आयु' },
        source_note: { en: 'Citizens aged 17+ may apply in advance; registration happens on the qualifying date. Check ECI guidance.', hi: '17+ आयु के नागरिक अग्रिम आवेदन कर सकते हैं; पंजीकरण अर्हता तिथि पर होता है। ECI दिशानिर्देश देखें।' },
      },
      { id: 'no_existing_card', type: 'confirm', expected: true, question: { en: 'Customer is not already registered as a voter anywhere else?', hi: 'क्या ग्राहक पहले से कहीं और मतदाता के रूप में पंजीकृत नहीं है?' }, label: { en: 'Not already registered elsewhere', hi: 'कहीं और पहले से पंजीकृत नहीं' } },
    ],
  },

  {
    id: 'learner_licence',
    name: { en: "Learner's Driving Licence", hi: 'लर्निंग ड्राइविंग लाइसेंस' },
    category: 'id_card',
    department: { en: 'Transport Department (Sarathi / Parivahan)', hi: 'परिवहन विभाग (सारथी / परिवहन)' },
    portal: { url: 'https://sarathi.parivahan.gov.in', steps: { en: 'sarathi.parivahan.gov.in → select Rajasthan → Apply for Learner Licence → fill (use ⚡ Autofill) → upload documents, photo, signature → pay fee → book test slot.', hi: 'sarathi.parivahan.gov.in → राजस्थान चुनें → लर्नर लाइसेंस आवेदन → भरें (⚡ ऑटोफिल) → दस्तावेज़, फोटो, हस्ताक्षर अपलोड करें → शुल्क भुगतान → टेस्ट स्लॉट बुक करें।' } },
    documents: [
      { id: 'age', label: { en: 'Age proof', hi: 'आयु प्रमाण' }, any_of: AGE_PROOF, required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'photo', label: { en: 'Photo', hi: 'फोटो' }, any_of: ['photo'], required: true, manual: true },
      { id: 'signature', label: { en: 'Signature', hi: 'हस्ताक्षर' }, any_of: ['signature'], required: true, manual: true },
    ],
    fields: ['name', 'dob', 'gender', 'father_name', 'address', 'district', 'state', 'pincode', 'phone'],
    optional_fields: ['blood_group', 'email', 'id_number', 'husband_name'],
    rules: [
      {
        id: 'age_18', type: 'age_min', value: 18,
        label: { en: 'At least {value} years old (car / geared motorcycle)', hi: 'कम से कम {value} वर्ष (कार / गियर वाली मोटरसाइकिल)' },
        source_note: { en: '16+ may apply for a gearless two-wheeler up to 50cc with guardian consent. Applicants 40+ need a medical certificate. Check Sarathi.', hi: '16+ आयु अभिभावक की सहमति से 50cc तक बिना गियर वाहन के लिए आवेदन कर सकते हैं। 40+ आयु के लिए मेडिकल प्रमाण पत्र चाहिए। सारथी देखें।' },
      },
    ],
  },

  {
    id: 'pan_card',
    name: { en: 'New PAN Card', hi: 'नया पैन कार्ड' },
    category: 'id_card',
    department: { en: 'Income Tax Department (via Protean / UTIITSL)', hi: 'आयकर विभाग (प्रोटीन / UTIITSL के माध्यम से)' },
    portal: { url: 'https://www.pan.utiitsl.com', steps: { en: 'Use your authorised PAN portal (UTIITSL / Protean) → new PAN (Form 49A) → fill (use ⚡ Autofill) → e-KYC / upload documents → pay → note the acknowledgement number.', hi: 'अपने अधिकृत पैन पोर्टल (UTIITSL / प्रोटीन) पर → नया पैन (फॉर्म 49A) → भरें (⚡ ऑटोफिल) → ई-KYC / दस्तावेज़ अपलोड → भुगतान → पावती संख्या लिखें।' } },
    documents: [
      { id: 'identity', label: { en: 'Aadhaar', hi: 'आधार' }, any_of: ['aadhaar'], required: true },
      { id: 'dob', label: { en: 'Date of birth proof', hi: 'जन्म तिथि प्रमाण' }, any_of: AGE_PROOF, required: true },
      { id: 'photo', label: { en: 'Photo', hi: 'फोटो' }, any_of: ['photo'], required: true, manual: true },
      { id: 'signature', label: { en: 'Signature', hi: 'हस्ताक्षर' }, any_of: ['signature'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'id_number', 'address', 'district', 'state', 'pincode', 'phone'],
    optional_fields: ['email', 'mother_name'],
    rules: [
      { id: 'no_existing_pan', type: 'confirm', expected: true, question: { en: 'Customer does NOT already have a PAN? (Having two PANs is not allowed.)', hi: 'क्या ग्राहक के पास पहले से पैन नहीं है? (दो पैन रखना मना है।)' }, label: { en: 'Does not already have a PAN', hi: 'पहले से पैन नहीं है' } },
    ],
  },

  {
    id: 'pm_kisan',
    name: { en: 'PM-KISAN Registration', hi: 'पीएम किसान पंजीकरण' },
    category: 'scheme',
    department: { en: 'Agriculture Department / PM-KISAN', hi: 'कृषि विभाग / पीएम किसान' },
    portal: { url: 'https://pmkisan.gov.in', steps: { en: 'pmkisan.gov.in → New Farmer Registration → Aadhaar & mobile OTP → fill (use ⚡ Autofill) → land details → submit.', hi: 'pmkisan.gov.in → नया किसान पंजीकरण → आधार व मोबाइल OTP → भरें (⚡ ऑटोफिल) → भूमि विवरण → जमा करें।' } },
    documents: [
      { id: 'identity', label: { en: 'Aadhaar', hi: 'आधार' }, any_of: ['aadhaar'], required: true },
      { id: 'land', label: { en: 'Land record (Jamabandi) in own name', hi: 'स्वयं के नाम भूमि रिकॉर्ड (जमाबंदी)' }, any_of: ['land_record'], required: true },
      { id: 'bank', label: { en: 'Bank passbook (Aadhaar-linked account)', hi: 'बैंक पासबुक (आधार से जुड़ा खाता)' }, any_of: ['bank_passbook'], required: true },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'id_number', 'phone', 'address', 'district', 'tehsil', 'state', 'account_number', 'ifsc_code'],
    optional_fields: ['caste_category', 'village_city', 'bank_name'],
    rules: [
      { id: 'owns_land', type: 'confirm', expected: true, question: { en: 'Customer owns cultivable land in their own name?', hi: 'क्या ग्राहक के अपने नाम पर कृषि योग्य भूमि है?' }, label: { en: 'Owns cultivable land', hi: 'कृषि योग्य भूमि का स्वामी' } },
      {
        id: 'not_excluded', type: 'confirm', expected: false,
        question: { en: 'Is the customer (or spouse) an income-tax payer, government employee / pensioner, or a registered professional (doctor, engineer, lawyer, CA)?', hi: 'क्या ग्राहक (या पति/पत्नी) आयकरदाता, सरकारी कर्मचारी / पेंशनभोगी, या पंजीकृत पेशेवर (डॉक्टर, इंजीनियर, वकील, CA) है?' },
        label: { en: 'Not in an excluded category', hi: 'अपवर्जित श्रेणी में नहीं' },
        source_note: { en: 'See the official PM-KISAN exclusion list on pmkisan.gov.in.', hi: 'pmkisan.gov.in पर आधिकारिक अपवर्जन सूची देखें।' },
      },
    ],
  },

  {
    id: 'jan_aadhaar',
    name: { en: 'Jan Aadhaar Enrolment / Update', hi: 'जन आधार नामांकन / अपडेट' },
    category: 'id_card',
    department: { en: 'Government of Rajasthan (Jan Aadhaar)', hi: 'राजस्थान सरकार (जन आधार)' },
    portal: { url: 'https://janaadhaar.rajasthan.gov.in', steps: SSO_STEPS },
    documents: [
      { id: 'aadhaar', label: { en: 'Aadhaar of each family member', hi: 'परिवार के प्रत्येक सदस्य का आधार' }, any_of: ['aadhaar'], required: true },
      { id: 'address', label: { en: 'Address proof', hi: 'पते का प्रमाण' }, any_of: ADDRESS_PROOF, required: true },
      { id: 'bank', label: { en: 'Bank passbook of head of family', hi: 'परिवार के मुखिया की बैंक पासबुक' }, any_of: ['bank_passbook'], required: false },
    ],
    fields: ['name', 'father_name', 'dob', 'gender', 'id_number', 'address', 'district', 'pincode', 'phone'],
    optional_fields: ['name_hi', 'caste_category', 'annual_income', 'religion', 'account_number', 'ifsc_code', 'bank_name', 'husband_name'],
    rules: [RAJ_RESIDENT_RULE],
  },

  {
    id: 'post_matric_scholarship',
    name: { en: 'Post-Matric Scholarship (Rajasthan)', hi: 'उत्तर मैट्रिक छात्रवृत्ति (राजस्थान)' },
    category: 'scheme',
    department: { en: 'Social Justice & Empowerment Dept. (SJMS)', hi: 'सामाजिक न्याय एवं अधिकारिता विभाग' },
    portal: { url: 'https://sso.rajasthan.gov.in', steps: { en: 'SSO login (student\'s SSO ID) → Scholarship (SJMS) → new application → fill (use ⚡ Autofill) → upload documents → submit to institution.', hi: 'SSO लॉगिन (छात्र की SSO ID) → छात्रवृत्ति (SJMS) → नया आवेदन → भरें (⚡ ऑटोफिल) → दस्तावेज़ अपलोड → संस्थान को भेजें।' } },
    documents: [
      { id: 'identity', label: { en: 'Aadhaar / Jan Aadhaar', hi: 'आधार / जन आधार' }, any_of: ['aadhaar', 'jan_aadhaar'], required: true },
      { id: 'marksheet', label: { en: 'Previous class marksheet', hi: 'पिछली कक्षा की अंकतालिका' }, any_of: ['marksheet'], required: true },
      { id: 'income', label: { en: 'Income certificate', hi: 'आय प्रमाण पत्र' }, any_of: ['income_certificate'], required: true },
      { id: 'caste', label: { en: 'Caste certificate (if applicable)', hi: 'जाति प्रमाण पत्र (यदि लागू हो)' }, any_of: ['caste_certificate'], required: false },
      { id: 'bank', label: { en: 'Bank passbook in student\'s name', hi: 'छात्र के नाम बैंक पासबुक' }, any_of: ['bank_passbook'], required: true },
      { id: 'fee_receipt', label: { en: 'Fee receipt / admission proof', hi: 'फीस रसीद / प्रवेश प्रमाण' }, any_of: ['school_certificate', 'self_declaration'], required: true, manual: true },
    ],
    fields: ['name', 'father_name', 'mother_name', 'dob', 'gender', 'id_number', 'phone', 'address', 'district', 'caste_category', 'annual_income', 'account_number', 'ifsc_code'],
    optional_fields: ['email', 'jan_aadhaar_id', 'education_10th_school', 'education_10th_year', 'education_10th_percentage', 'education_12th_school', 'education_12th_year', 'education_12th_percentage', 'bank_name'],
    rules: [
      RAJ_RESIDENT_RULE,
      { id: 'studying', type: 'confirm', expected: true, question: { en: 'Student is studying in class 11 or above in a recognised institution this year?', hi: 'क्या छात्र इस वर्ष मान्यता प्राप्त संस्थान में कक्षा 11 या उससे ऊपर पढ़ रहा है?' }, label: { en: 'Studying class 11 or above', hi: 'कक्षा 11 या ऊपर में अध्ययनरत' } },
      { id: 'income_within_limit', type: 'confirm', expected: true, question: { en: 'Family income is within the scheme limit for the student\'s category (see current notification)?', hi: 'क्या पारिवारिक आय छात्र के वर्ग की योजना सीमा के भीतर है (वर्तमान अधिसूचना देखें)?' }, label: { en: 'Income within scheme limit', hi: 'आय योजना सीमा के भीतर' } },
    ],
  },

  {
    id: 'ayushman_card',
    name: { en: 'Ayushman Card (PM-JAY)', hi: 'आयुष्मान कार्ड (PM-JAY)' },
    category: 'scheme',
    department: { en: 'National Health Authority', hi: 'राष्ट्रीय स्वास्थ्य प्राधिकरण' },
    portal: { url: 'https://beneficiary.nha.gov.in', steps: { en: 'beneficiary.nha.gov.in → check eligibility with Aadhaar / ration card / Jan Aadhaar → e-KYC → generate card.', hi: 'beneficiary.nha.gov.in → आधार / राशन कार्ड / जन आधार से पात्रता जाँचें → ई-KYC → कार्ड बनाएं।' } },
    documents: [
      { id: 'identity', label: { en: 'Aadhaar', hi: 'आधार' }, any_of: ['aadhaar'], required: true },
      { id: 'family', label: { en: 'Ration card / Jan Aadhaar', hi: 'राशन कार्ड / जन आधार' }, any_of: ['ration_card', 'jan_aadhaar'], required: false },
    ],
    fields: ['name', 'dob', 'gender', 'id_number', 'phone', 'district', 'state'],
    optional_fields: ['jan_aadhaar_id', 'ration_card_number', 'address'],
    rules: [
      {
        id: 'in_beneficiary_list', type: 'confirm', expected: true,
        question: { en: 'Family was found eligible on the official beneficiary portal (or customer is 70+)?', hi: 'क्या आधिकारिक लाभार्थी पोर्टल पर परिवार पात्र पाया गया (या ग्राहक 70+ आयु का है)?' },
        label: { en: 'Eligible on the official portal', hi: 'आधिकारिक पोर्टल पर पात्र' },
        source_note: { en: 'PM-JAY eligibility comes from official beneficiary lists — always check on the portal.', hi: 'PM-JAY पात्रता आधिकारिक लाभार्थी सूची से तय होती है — हमेशा पोर्टल पर जाँचें।' },
      },
    ],
  },
];
