require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const session = require('express-session');
const { initDB } = require('./utils/database');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// credentials: true is required so the browser sends the session cookie back
// with every /api/digilocker/* request.
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.BACKEND_URL  || 'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:3001',
];
app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / Postman (no origin header)
      if (!origin) return cb(null, true);
      // allow Chrome extensions
      if (origin.startsWith('chrome-extension://')) return cb(null, true);
      // allow any localhost port in development
      if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?\/?$/.test(origin)) {
        return cb(null, true);
      }
      // strip trailing slash for comparison
      const normalizedOrigin = origin.replace(/\/$/, '');
      cb(allowedOrigins.includes(normalizedOrigin) ? null : new Error(`CORS: ${origin} not allowed`), allowedOrigins.includes(normalizedOrigin));
    },
    credentials: true,
  })
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ──────────────────────────────────────────────────────────────────
// express-session keeps the DigiLocker access token server-side so it is
// never exposed to the browser.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-CHANGE-IN-PROD',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,                                          // JS cannot read the cookie
      secure: process.env.NODE_ENV === 'production',          // HTTPS only in prod
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 2,                            // 2 hours
    },
  })
);

// ─── DB ───────────────────────────────────────────────────────────────────────
initDB();

// ─── DigiLocker OAuth routes ──────────────────────────────────────────────────
// Auth (no session token required — these initiate and complete the OAuth flow)
//   GET  /auth/digilocker            → redirect to DigiLocker consent page
//   GET  /auth/digilocker/callback   → receive code, exchange for token, store in session
app.use('/auth/digilocker', require('./routes/digilockerAuth'));

// Protected API (require a valid session token)
//   GET  /api/digilocker/status
//   GET  /api/digilocker/documents
//   GET  /api/digilocker/fetch?uri=…&format=pdf
//   POST /api/digilocker/disconnect
app.use('/api/digilocker',  require('./routes/digilockerApi'));

// ─── Existing feature routes ──────────────────────────────────────────────────
app.use('/api/upload-ai',   require('./routes/uploadGroq'));
app.use('/api/groq',        require('./routes/groq'));
app.use('/api/upload',       require('./routes/upload'));
app.use('/api/profile',      require('./routes/profile'));
app.use('/api/verify',       require('./routes/verify'));
app.use('/api/demo-profile', require('./routes/demo'));
// app.use('/api/generate-pdf', require('./routes/generatePDF'));  // Mool Niwas PDF removed
app.use('/api/eligibility',  require('./routes/eligibility'));
app.use('/api/apply',        require('./routes/apply'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const deps = {};
  ['express-session', 'axios', 'tesseract.js', 'pdf-parse', 'sharp', 'pdf-lib'].forEach((m) => {
    try { require(m); deps[m] = '✅'; }
    catch { deps[m] = '❌ missing'; }
  });
  res.json({
    status: 'ok',
    version: '4.1.0',
    digilockerEnv: process.env.DIGILOCKER_ENV || 'sandbox',
    deps,
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message);
  res.status(500).json({ error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Smart Autofill v4.1 → http://localhost:${PORT}`);
  console.log(`   DigiLocker env : ${process.env.DIGILOCKER_ENV || 'sandbox'}`);
  console.log(`   Session secret : ${process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'change-this-to-a-long-random-string-in-production' ? '✅ set' : '⚠️  using fallback — set SESSION_SECRET in .env'}`);
  console.log(`   Client ID      : ${process.env.DIGILOCKER_CLIENT_ID ? '✅ set' : '⚠️  not set — add DIGILOCKER_CLIENT_ID to .env'}`);
  console.log('');
  console.log('   Auth  : GET  /auth/digilocker');
  console.log('           GET  /auth/digilocker/callback');
  console.log('   API   : GET  /api/digilocker/status');
  console.log('           GET  /api/digilocker/documents');
  console.log('           GET  /api/digilocker/fetch?uri=…');
  console.log('           POST /api/digilocker/disconnect');
  console.log('');
  ['tesseract.js', 'pdf-parse', 'pdf-lib', 'express-session'].forEach((m) => {
    try { require(m); console.log(`   ✅ ${m}`); }
    catch { console.error(`   ❌ ${m} MISSING — run: npm install`); }
  });
  try { require('sharp'); console.log('   ✅ sharp'); }
  catch { console.warn('   ⚠️  sharp (optional image processing)'); }
  console.log('');
});
