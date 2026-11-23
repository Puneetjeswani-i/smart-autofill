# Changelog

## 6.0.0 — shop-ready release

The original v5 code is preserved as the first commit (`Baseline: original Smart Autofill v5`) so every change below can be reviewed with `git diff`.

### Security & privacy (critical for a shop handling Aadhaar data)
- **Real encryption at rest.** v5 showed “AES-256 encrypted” but stored profiles in plain text (its encryption only touched top-level keys that did not exist in the structured profile). v6 encrypts every customer record with AES-256-GCM. A test checks the database file contains no plain-text name, Aadhaar or mobile.
- **Not reachable from the shop network.** v5 listened on all network interfaces and `/api/profile/latest` returned the latest customer's full profile without any login. v6 listens on `127.0.0.1` and every API needs a PIN session (or the paired extension key, which only sees the active customer).
- **Shop PIN** with lockout and idle auto-lock; **activity log** without personal data.
- **No raw OCR text stored** (v5 kept 2,000 characters of every scan forever). Uploads are processed in memory only.
- **Aadhaar/VID/long numbers masked** before any text is sent to Groq; AI can be switched off.
- **Consent + automatic deletion** of customers who did not agree to storage; retention setting; data wipe with PIN.
- The simulated DigiLocker page no longer imitates Government of India branding and is only available with `DEMO_MODE=true`.
- Removed fabricated UI claims (“Approval probability based on 1.2k similar profiles”, “12,400+ users · 4.8★”, “verified against DigiLocker”).

### Bugs fixed from v5
- Legacy `/api/upload` crashed (it read fields that `parseDocumentText` did not return).
- `annual_income`, `caste`, `caste_category` were dropped during extraction → income/category rules could never work.
- `years_in_rajasthan` was never computed → the Mool Niwas residence rule was always “unknown”.
- Having an Aadhaar on file made any address count as “Rajasthan”.
- Residence requirement was 10 years in the backend but 8 in the UI — now one setting.
- The applicant's name was compared with the father's/mother's name → every customer got a “name inconsistency”.
- A class 10 marksheet filled the class 12 fields.
- Several electricity bills (good residence proof) were flagged as a fraud risk (“duplicate documents”).
- Verify screens fetched the wrong profile (no session header).
- Electricity bill K-numbers could be read as Aadhaar numbers.
- Old residence engine counted non-Rajasthan documents towards Rajasthan years.
- Groq model `llama3-70b-8192` / `llama-3.3-70b-versatile` retired → AI silently failed; v6 picks an available model automatically.

### New
- Encrypted SQLite storage (`node:sqlite`, no native build), daily backups with the key, restore README.
- OCR: reusable worker, **English + Hindi**, image clean-up, rotation retry, **scanned PDF** support, e-Aadhaar **PDF passwords**, quality warnings instead of hard rejections.
- Local extractors with checksums/format checks for Aadhaar, PAN, EPIC, DL, passport MRZ, dates, PIN, mobile, IFSC, names (Hindi + English labels), addresses (+ house/street/village/tehsil/district/state/PIN parts), marksheets, category, income.
- AI output **grounding**: values not found in the scanned text are flagged.
- Profile keeps all values from all documents: real conflicts, one-click choice, undo, remove document.
- Service catalogue (11 services) with document checklists, required fields, configurable rules, *Verified* flags, fees, portal links; three-state eligibility with bilingual explanations.
- Customer register, application register (ref no., fees, status, follow-ups, CSV export), receipts, checklist slips, review sheets.
- Document tools: compress to N KB, merge images/scanned PDFs into one PDF, passport photo/signature resize.
- Chrome extension v6: paired, preview-first, Hindi labels, ASP.NET table layouts, Hindi district dropdowns, radios, postback-aware, teach mode; runs only on government sites by default.
- Dashboard rebuilt around the kiosk workflow, Hindi/English, offline system fonts, strict CSP.
- `setup.bat` / `start-shop.bat`; docs (architecture, roadmap, bilingual shop guide); 43 automated tests.

### Removed
- Invented portal CSS selectors in the extension (could fill the wrong box).
- Session-based single “profile” model and its routes (`/api/profile`, `/api/upload*`, `/api/verify`, `/api/eligibility`, `/api/apply`, `/api/groq`, `/api/demo-profile`).
- Unused/superseded components (old upload, verify, profile, Mool Niwas PDF builder that could not render Hindi).
