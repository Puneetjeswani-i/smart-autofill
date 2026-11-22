/**
 * routes/digilockerApi.js
 *
 * Protected DigiLocker API routes.
 * Simulated mode returns rich, realistic data for SIH demo.
 * Real mode proxies to official DigiLocker / APISetu endpoints.
 *
 * Mount at: /api/digilocker
 */

require('dotenv').config();
const express = require('express');
const axios   = require('axios');

const router = express.Router();

// ─── Simulated document data (realistic, per citizen profile) ─────────────────
const SIMULATED_DOCUMENTS = {
  demo1: [
    {
      name: 'Aadhaar Card',
      type: 'ADHAR',
      issuer: 'Unique Identification Authority of India',
      description: 'Aadhaar Card — Shruti Singh',
      uri: 'in.gov.uidai.aadhaar-reg-cert-offline-xml',
      date: '2019-04-15',
      size: '142 KB',
    },
    {
      name: 'PAN Card',
      type: 'PANCR',
      issuer: 'Income Tax Department, Government of India',
      description: 'Permanent Account Number Card',
      uri: 'in.gov.itd.pan-xml',
      date: '2018-11-08',
      size: '88 KB',
    },
    {
      name: 'Driving Licence',
      type: 'DRVLC',
      issuer: 'Transport Department, Rajasthan',
      description: 'Driving Licence — LMV, MCWG',
      uri: 'in.gov.rj.transport.driving-licence-xml',
      date: '2021-03-22',
      size: '210 KB',
    },
    {
      name: 'Class X Marksheet',
      type: 'CBSEM',
      issuer: 'Central Board of Secondary Education',
      description: 'Secondary School Certificate — 2008',
      uri: 'in.gov.cbse.marksheet-10-xml',
      date: '2008-06-15',
      size: '165 KB',
    },
    {
      name: 'Class XII Marksheet',
      type: 'CBSEH',
      issuer: 'Central Board of Secondary Education',
      description: 'Higher Secondary Certificate — 2010',
      uri: 'in.gov.cbse.marksheet-12-xml',
      date: '2010-06-20',
      size: '178 KB',
    },
    {
      name: 'Income Certificate',
      type: 'INCER',
      issuer: 'Revenue Department, Rajasthan Government',
      description: 'Annual Family Income Certificate',
      uri: 'in.gov.rj.revenue.income-certificate-xml',
      date: '2023-08-10',
      size: '95 KB',
    },
    {
      name: 'Caste Certificate (OBC)',
      type: 'CASCT',
      issuer: 'Social Justice & Empowerment Dept, Rajasthan',
      description: 'Other Backward Class Certificate',
      uri: 'in.gov.rj.sjed.caste-certificate-xml',
      date: '2022-01-18',
      size: '112 KB',
    },
    {
      name: 'Domicile Certificate',
      type: 'DOMCT',
      issuer: 'Revenue Department, Rajasthan Government',
      description: 'Rajasthan State Domicile Certificate',
      uri: 'in.gov.rj.revenue.domicile-certificate-xml',
      date: '2021-11-05',
      size: '98 KB',
    },
  ],
};

// ─── Simulated parsed profile (what OCR would extract from above docs) ─────────
const SIMULATED_PROFILE_DATA = {
  demo1: {
    full_name:      'Shruti Singh',
    dob:            '1990-07-25',
    age:            33,
    gender:         'Male',
    aadhaar_number: '8765 XXXX XXXX',
    pan_number:     'ABCPS1234D',
    father_name:    'Rajesh Kumar Sharma',
    mother_name:    'Sunita Sharma',
    address:        'House No. 42, Govind Nagar',
    city:           'Kota',
    district:       'Kota',
    state:          'Rajasthan',
    pincode:        '324002',
    annual_income:  180000,
    caste:          'OBC',
    religion:       'Hindu',
    education:      'Graduate',
    occupation:     'Self-Employed',
    domicile_years: 15,
    disability:     false,
    marital_status: 'Married',
    land_holding:   0,
    mobile:         '98765XXXXX',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseApiUrl() {
  return (process.env.DIGILOCKER_BASE_URL || 'https://api.digitallocker.gov.in').replace(/\/$/, '');
}

function authHeader(session) {
  const { tokenType = 'Bearer', accessToken } = session.digilocker || {};
  return tokenType + ' ' + accessToken;
}

function requireDigiLockerSession(req, res, next) {
  const dl = req.session?.digilocker;
  if (!dl?.accessToken) {
    return res.status(401).json({
      error: 'Not connected to DigiLocker. Please authenticate first.',
      code:  'DIGILOCKER_NOT_CONNECTED',
    });
  }
  if (dl.expiresAt && Date.now() > dl.expiresAt) {
    req.session.digilocker = null;
    return res.status(401).json({
      error: 'DigiLocker session expired. Please reconnect.',
      code:  'DIGILOCKER_TOKEN_EXPIRED',
    });
  }
  next();
}

// ─── GET /api/digilocker/status ───────────────────────────────────────────────
router.get('/status', (req, res) => {
  const dl        = req.session?.digilocker;
  const connected = !!(dl?.accessToken);
  const expired   = connected && dl.expiresAt ? Date.now() > dl.expiresAt : false;
  res.json({
    connected:     connected && !expired,
    expired,
    isMock:        dl?.isMock || false,
    digilockerUid: dl?.digilockerUid || null,
    profileId:     dl?.profileId || null,
  });
});

// ─── GET /api/digilocker/documents ────────────────────────────────────────────
router.get('/documents', requireDigiLockerSession, async (req, res) => {
  const dl = req.session.digilocker;

  if (dl.isMock) {
    const profileId = dl.profileId || 'demo1';
    const docs = SIMULATED_DOCUMENTS[profileId] || SIMULATED_DOCUMENTS.demo1;
    console.log('[DigiLocker] Returning simulated documents for profile:', profileId);
    return res.json({
      success:   true,
      count:     docs.length,
      documents: docs,
      _mock:     true,
      _note:     'Simulated data. Real DigiLocker integration enabled after APISetu approval.',
    });
  }

  try {
    const { data } = await axios.get(baseApiUrl() + '/public/oauth2/1/files/issued', {
      headers: { Authorization: authHeader(req.session), Accept: 'application/json' },
      timeout: 20000,
    });
    const raw = data.items || data.issued || data.documents || [];
    res.json({ success: true, count: raw.length, documents: raw.map(normalizeDocument) });
  } catch (err) {
    handleApiError(err, res, 'Failed to fetch issued documents');
  }
});

// ─── GET /api/digilocker/profile ──────────────────────────────────────────────
// Returns the parsed citizen profile data extracted from DigiLocker documents.
// In real mode this would parse the XML from DigiLocker.
// In demo mode returns the pre-seeded profile.
router.get('/profile', requireDigiLockerSession, async (req, res) => {
  const dl = req.session.digilocker;

  if (dl.isMock) {
    const profileId = dl.profileId || 'demo1';
    const profile   = SIMULATED_PROFILE_DATA[profileId] || SIMULATED_PROFILE_DATA.demo1;
    return res.json({
      success: true,
      profile,
      source:  'DigiLocker (simulated)',
      _mock:   true,
    });
  }

  // Real: would fetch and parse Aadhaar XML here
  res.json({ success: false, error: 'Real XML parsing not yet implemented' });
});

// ─── GET /api/digilocker/fetch ────────────────────────────────────────────────
router.get('/fetch', requireDigiLockerSession, async (req, res) => {
  const { uri, format = 'pdf' } = req.query;

  if (!uri) return res.status(400).json({ error: 'Query param uri is required' });

  const dl = req.session.digilocker;

  if (dl.isMock) {
    const profileId = dl.profileId || 'demo1';
    const docs      = SIMULATED_DOCUMENTS[profileId] || SIMULATED_DOCUMENTS.demo1;
    const doc       = docs.find(function(d) { return d.uri === uri; }) || { name: uri, issuer: 'Government of India' };

    console.log('[DigiLocker] Simulated fetch:', uri);

    if (format === 'xml') {
      var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<DigiLockerDocument xmlns="http://digilocker.gov.in/schema" version="2.0">\n' +
        '  <DocumentHeader>\n' +
        '    <URI>' + uri + '</URI>\n' +
        '    <Name>' + doc.name + '</Name>\n' +
        '    <Issuer>' + doc.issuer + '</Issuer>\n' +
        '    <IssuedDate>' + (doc.date || '') + '</IssuedDate>\n' +
        '    <FetchedAt>' + new Date().toISOString() + '</FetchedAt>\n' +
        '  </DocumentHeader>\n' +
        '  <HolderData>\n' +
        '    <Name>Shruti Singh</Name>\n' +
        '    <DOB>1990-07-25</DOB>\n' +
        '    <Gender>Male</Gender>\n' +
        '    <AadhaarUID>8765XXXXXXXX</AadhaarUID>\n' +
        '    <Address>45, Civil Lines, Kanpur, Uttar Pradesh - 208001</Address>\n' +
        '  </HolderData>\n' +
        '  <Note>Simulated document. Real DigiLocker integration enabled after APISetu approval.</Note>\n' +
        '</DigiLockerDocument>';

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', 'attachment; filename="digilocker-' + doc.name.replace(/\s+/g, '-') + '.xml"');
      return res.send(xml);
    }

    // PDF-style text file for demo
    var content = [
      '====================================================',
      '  DIGILOCKER DOCUMENT — ' + doc.name.toUpperCase(),
      '====================================================',
      '',
      'Document URI : ' + uri,
      'Issuer       : ' + doc.issuer,
      'Issued On    : ' + (doc.date || 'N/A'),
      'Fetched At   : ' + new Date().toLocaleString('en-IN'),
      '',
      '----------------------------------------------------',
      'HOLDER INFORMATION',
      '----------------------------------------------------',
      'Name         : Shruti Singh',
      'Date of Birth: 15 March 1992',
      'Gender       : Male',
      'Aadhaar UID  : 8765 XXXX XXXX',
      'PAN          : ABCPS1234D',
      'Address      : House No. 42, Govind Nagar,',
      '               Kota, Rajasthan - 324002',
      '',
      '====================================================',
      'NOTE: This is a simulated DigiLocker document for',
      'demonstration purposes (SIH Hackathon).',
      'Real DigiLocker integration will be enabled',
      'after APISetu Requester API approval.',
      '====================================================',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="digilocker-' + doc.name.replace(/\s+/g, '-') + '.txt"');
    return res.send(content);
  }

  // Real: stream document from DigiLocker
  try {
    var url = baseApiUrl() + '/public/oauth2/1/pull/issued/' + encodeURIComponent(uri);
    var response = await axios.get(url, {
      headers: {
        Authorization: authHeader(req.session),
        Accept: format === 'xml' ? 'application/xml' : 'application/pdf',
      },
      responseType: 'stream',
      timeout: 30000,
    });

    var ct  = response.headers['content-type'] || (format === 'xml' ? 'application/xml' : 'application/pdf');
    var ext = ct.includes('xml') ? 'xml' : 'pdf';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', 'attachment; filename="digilocker-' + uri.split('.').pop() + '.' + ext + '"');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    response.data.pipe(res);
    response.data.on('error', function(e) {
      if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
    });
  } catch (err) {
    handleApiError(err, res, 'Failed to fetch document');
  }
});

// ─── POST /api/digilocker/disconnect ─────────────────────────────────────────
router.post('/disconnect', function(req, res) {
  if (req.session?.digilocker) req.session.digilocker = null;
  res.json({ success: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeDocument(doc) {
  return {
    name:        doc.name        || doc.docName        || 'Untitled',
    type:        doc.type        || doc.docType        || '',
    issuer:      doc.issuer      || doc.issuerName     || '',
    description: doc.description || doc.docDescription || '',
    uri:         doc.uri         || doc.docURI         || '',
    date:        doc.date        || doc.issueDate      || '',
    size:        doc.size        || doc.fileSize       || null,
  };
}

function handleApiError(err, res, defaultMessage) {
  var status  = err.response?.status;
  var message = err.response?.data?.message ||
                err.response?.data?.error_description ||
                err.message || defaultMessage;
  console.error('[DigiLocker] API error (HTTP ' + (status || 'n/a') + '):', message);
  if (status === 401 || status === 403) {
    return res.status(401).json({
      error: 'DigiLocker token invalid or expired. Please reconnect.',
      code:  'DIGILOCKER_TOKEN_INVALID',
    });
  }
  res.status(status || 500).json({ error: message });
}

module.exports = router;
