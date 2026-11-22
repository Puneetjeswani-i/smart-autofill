/**
 * services/eligibilityEngine.js — evaluate a customer against service rules.
 *
 * Three honest outcomes per rule:  pass | fail | unknown
 * Three outcomes per service:
 *   ready         every rule passes, required documents and fields present
 *   needs_info    nothing fails, but something is missing / unconfirmed
 *   not_eligible  at least one rule clearly fails
 *
 * Every result carries a plain English + Hindi explanation, what is missing,
 * and whether the shop owner has verified the rule against official sources.
 */

'use strict';

const V = require('./validators');
const { FIELD_BY_KEY, DOC_TYPES } = require('../config/catalog');
const { residenceReport } = require('./residenceEngine');
const { fieldPresent } = require('./profileEngine');
const { leafRules } = require('./serviceCatalog');

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function fill(text, rule) {
  const value = typeof rule.value === 'number' && rule.type === 'income_max' ? Number(rule.value).toLocaleString('en-IN') : rule.value;
  return String(text || '').replace(/\{value\}/g, value === undefined ? '' : value);
}

function ruleLabel(rule) {
  return { en: fill(rule.label && rule.label.en, rule), hi: fill(rule.label && rule.label.hi, rule) };
}

function fieldLabel(key) {
  return (FIELD_BY_KEY[key] && FIELD_BY_KEY[key].label) || { en: key, hi: key };
}

function result(rule, status, detail, needs) {
  return {
    id: rule.id,
    type: rule.type,
    status,
    label: ruleLabel(rule),
    detail: detail || null,
    needs: needs || null,
    verified: !!rule.verified,
    source_note: rule.source_note || null,
    value: rule.value === undefined ? null : rule.value,
  };
}

function evaluateRule(rule, ctx) {
  const { flat, customer } = ctx;
  switch (rule.type) {
    case 'state_is': {
      const target = String(rule.value || 'Rajasthan');
      let verdict;
      if (/rajasthan/i.test(target)) {
        verdict = V.looksRajasthan({ text: [flat.address, flat.district, flat.village_city].filter(Boolean).join(', '), state: flat.state || '', pincode: flat.pincode || '' });
      } else if (flat.state) {
        verdict = V.normaliseName(flat.state) === V.normaliseName(target);
      } else verdict = null;
      if (verdict === true) return result(rule, 'pass', { en: `Address is in ${target}.`, hi: `पता ${target === 'Rajasthan' ? 'राजस्थान' : target} में है।` });
      if (verdict === false) return result(rule, 'fail', { en: `Address does not appear to be in ${target}${flat.state ? ` (state: ${flat.state})` : ''}.`, hi: `पता ${target === 'Rajasthan' ? 'राजस्थान' : target} में नहीं लगता${flat.state ? ` (राज्य: ${flat.state})` : ''}।` });
      return result(rule, 'unknown', { en: 'Address / state / PIN not available yet.', hi: 'पता / राज्य / पिन अभी उपलब्ध नहीं।' }, { fields: ['address', 'state', 'pincode'] });
    }

    case 'age_min':
    case 'age_max': {
      const age = V.ageOn(flat.dob, ctx.now);
      if (age === null) return result(rule, 'unknown', { en: 'Date of birth not available.', hi: 'जन्म तिथि उपलब्ध नहीं।' }, { fields: ['dob'] });
      const ok = rule.type === 'age_min' ? age >= rule.value : age <= rule.value;
      return result(rule, ok ? 'pass' : 'fail', {
        en: `Age is ${age} (${rule.type === 'age_min' ? 'minimum' : 'maximum'} ${rule.value}).`,
        hi: `आयु ${age} वर्ष है (${rule.type === 'age_min' ? 'न्यूनतम' : 'अधिकतम'} ${rule.value})।`,
      });
    }

    case 'income_max': {
      const income = V.parseAmount(flat.annual_income);
      if (income === null) return result(rule, 'unknown', { en: 'Annual family income not entered.', hi: 'वार्षिक पारिवारिक आय दर्ज नहीं।' }, { fields: ['annual_income'] });
      const ok = income <= rule.value;
      return result(rule, ok ? 'pass' : 'fail', {
        en: `Income ${inr(income)} ${ok ? 'is within' : 'is above'} the limit of ${inr(rule.value)}.`,
        hi: `आय ${inr(income)} सीमा ${inr(rule.value)} ${ok ? 'के भीतर' : 'से अधिक'} है।`,
      });
    }

    case 'residence_years_min': {
      const rep = residenceReport(customer, flat, { minYears: rule.value, now: ctx.now });
      ctx.residence = rep;
      if (rep.evidence_years >= rule.value) {
        return result(rule, 'pass', { en: `Documents show residence since ${rep.earliest_proof_year} (${rep.evidence_years} years).`, hi: `दस्तावेज़ ${rep.earliest_proof_year} से निवास दिखाते हैं (${rep.evidence_years} वर्ष)।` });
      }
      if (rep.declared_years !== null && rep.declared_years < rule.value && rep.evidence_years < rule.value) {
        return result(rule, 'fail', { en: `Customer has lived in Rajasthan ${rep.declared_years} years (needs ${rule.value}).`, hi: `ग्राहक ${rep.declared_years} वर्ष से राजस्थान में हैं (${rule.value} चाहिए)।` });
      }
      const proved = rep.evidence_years ? `${rep.evidence_years} years (since ${rep.earliest_proof_year})` : 'no dated Rajasthan proof yet';
      const provedHi = rep.evidence_years ? `${rep.evidence_years} वर्ष (${rep.earliest_proof_year} से)` : 'अभी तारीख वाला राजस्थान प्रमाण नहीं';
      return result(rule, 'unknown', {
        en: `Documents prove ${proved}. Add a Rajasthan document from ${rep.need_proof_from_year} or earlier.`,
        hi: `दस्तावेज़ ${provedHi} साबित करते हैं। ${rep.need_proof_from_year} या उससे पहले का राजस्थान का दस्तावेज़ जोड़ें।`,
      }, { documents: ['electricity_bill', 'marksheet', 'school_certificate', 'ration_card', 'land_record'], fields: rep.declared_years === null ? ['years_in_rajasthan'] : [] });
    }

    case 'born_in_state': {
      const birthDoc = (customer.documents || []).find((d) => d.doc_type === 'birth_certificate' && d.evidence && d.evidence.is_rajasthan === true);
      const verdict = birthDoc ? true : flat.birth_place ? V.looksRajasthan({ text: flat.birth_place }) : null;
      if (verdict === true) return result(rule, 'pass', { en: `Born in ${rule.value}${flat.birth_place ? ` (${flat.birth_place})` : ''}.`, hi: `जन्म राजस्थान में${flat.birth_place ? ` (${flat.birth_place})` : ''}।` });
      if (verdict === false) return result(rule, 'fail', { en: `Place of birth (${flat.birth_place}) is not in ${rule.value}.`, hi: `जन्म स्थान (${flat.birth_place}) राजस्थान में नहीं है।` });
      return result(rule, 'unknown', { en: 'Place of birth not known.', hi: 'जन्म स्थान ज्ञात नहीं।' }, { fields: ['birth_place'], documents: ['birth_certificate'] });
    }

    case 'category_in':
    case 'category_not_in': {
      const cat = flat.caste_category;
      if (!cat) return result(rule, 'unknown', { en: 'Category (SC/ST/OBC/MBC/General) not entered.', hi: 'वर्ग (अजा/अजजा/अपिव/अति पिछड़ा/सामान्य) दर्ज नहीं।' }, { fields: ['caste_category'] });
      const inList = (rule.values || []).includes(cat);
      const ok = rule.type === 'category_in' ? inList : !inList;
      return result(rule, ok ? 'pass' : 'fail', { en: `Category is ${cat}.`, hi: `वर्ग ${cat} है।` });
    }

    case 'confirm': {
      const answer = customer.declared ? customer.declared[rule.id] : undefined;
      if (answer === undefined || answer === null) {
        return result(rule, 'unknown', { en: 'Ask the customer and record the answer.', hi: 'ग्राहक से पूछकर उत्तर दर्ज करें।' }, { answer: { id: rule.id, question: rule.question } });
      }
      const ok = !!answer === !!rule.expected;
      const r = result(rule, ok ? 'pass' : 'fail', { en: `Customer answered: ${answer ? 'Yes' : 'No'}.`, hi: `ग्राहक का उत्तर: ${answer ? 'हाँ' : 'नहीं'}।` });
      r.question = rule.question;
      r.answer = !!answer;
      return r;
    }

    case 'any_of':
    case 'all_of': {
      const children = (rule.rules || []).map((r) => evaluateRule(r, ctx));
      let status;
      if (rule.type === 'any_of') {
        status = children.some((c) => c.status === 'pass') ? 'pass' : children.every((c) => c.status === 'fail') ? 'fail' : 'unknown';
      } else {
        status = children.some((c) => c.status === 'fail') ? 'fail' : children.every((c) => c.status === 'pass') ? 'pass' : 'unknown';
      }
      const r = result(rule, status, null, null);
      r.children = children;
      r.verified = leafRules(rule.rules).every((x) => x.verified);
      return r;
    }

    default:
      return result(rule, 'unknown', { en: `Unknown rule type "${rule.type}".`, hi: `अज्ञात नियम "${rule.type}"।` });
  }
}

function manualDocKey(serviceId, req) {
  const globalTypes = ['photo', 'signature'];
  if (req.any_of.length === 1 && globalTypes.includes(req.any_of[0])) return req.any_of[0];
  return `${serviceId}.${req.id}`;
}

function evaluateService(service, customer, flat, { now = new Date() } = {}) {
  const ctx = { flat, customer, now, residence: null };
  const rules = (service.rules || []).map((r) => evaluateRule(r, ctx));

  const docs = (service.documents || []).map((req) => {
    const found = (customer.documents || []).filter((d) => req.any_of.includes(d.doc_type));
    const key = manualDocKey(service.id, req);
    const confirmed = !!(customer.manual_docs && customer.manual_docs[key]);
    let status = 'missing';
    if (found.length) status = 'have';
    else if (confirmed) status = 'confirmed';
    else if (!req.required) status = 'optional';
    return {
      id: req.id,
      key,
      label: req.label,
      required: !!req.required,
      manual: !!req.manual,
      any_of: req.any_of,
      any_of_labels: req.any_of.map((t) => (DOC_TYPES[t] ? DOC_TYPES[t].label : { en: t, hi: t })),
      found: found.map((d) => ({ id: d.id, doc_type: d.doc_type })),
      status,
    };
  });

  const fields = (service.fields || []).map((key) => ({ key, label: fieldLabel(key), present: fieldPresent(flat, key), required: true }));
  const optional = (service.optional_fields || []).map((key) => ({ key, label: fieldLabel(key), present: fieldPresent(flat, key), required: false }));

  const anyFail = rules.some((r) => r.status === 'fail');
  const allPass = rules.every((r) => r.status === 'pass');
  const missingDocs = docs.filter((d) => d.required && d.status === 'missing');
  const missingFields = fields.filter((f) => !f.present);
  const status = anyFail ? 'not_eligible' : allPass && !missingDocs.length && !missingFields.length ? 'ready' : 'needs_info';

  const answers = [];
  const collectAnswers = (list) => list.forEach((r) => {
    if (r.needs && r.needs.answer) answers.push(r.needs.answer);
    if (r.children) collectAnswers(r.children);
  });
  collectAnswers(rules);

  const requiredDocs = docs.filter((d) => d.required);
  const total = rules.length + requiredDocs.length + fields.length;
  const done = rules.filter((r) => r.status === 'pass').length
    + requiredDocs.filter((d) => d.status !== 'missing').length
    + fields.filter((f) => f.present).length;

  return {
    id: service.id,
    name: service.name,
    category: service.category,
    department: service.department,
    portal: service.portal,
    fees: service.fees,
    notes: service.notes,
    status,
    eligibility: anyFail ? 'not_eligible' : allPass ? 'eligible' : 'unknown',
    readiness: total ? Math.round((100 * done) / total) : 100,
    rules,
    documents: docs,
    fields,
    optional_fields: optional,
    missing: {
      fields: missingFields.map((f) => ({ key: f.key, label: f.label })),
      documents: missingDocs.map((d) => ({ id: d.id, key: d.key, label: d.label, manual: d.manual })),
      answers,
    },
    unverified_rules: service.unverified_rules || 0,
    residence: ctx.residence,
  };
}

function evaluateAll(services, customer, flat, opts) {
  const order = { ready: 0, needs_info: 1, not_eligible: 2 };
  return services.map((s) => evaluateService(s, customer, flat, opts))
    .sort((a, b) => order[a.status] - order[b.status] || b.readiness - a.readiness);
}

module.exports = { evaluateService, evaluateAll, evaluateRule, manualDocKey };
