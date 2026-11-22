# Smart Autofill — eMitra shop assistant (v6)

Smart Autofill helps an **eMitra / CSC operator** serve customers faster and with fewer mistakes:

1. **Scan** the customer's documents (photo, scanner image or PDF — English + Hindi).
2. The app **reads** names, dates, Aadhaar/PAN/Voter ID numbers, addresses, marksheet details — checking each value (Aadhaar checksum, PAN format, dates) and showing where it came from.
3. It **checks** the customer against your service rules (Mool Niwas, income/caste/EWS certificates, voter ID, learner licence, PAN, PM-KISAN, Jan Aadhaar, scholarship, Ayushman) and explains — in Hindi and English — what is ready, what is missing and why.
4. The **⚡ Chrome extension** fills the portal form after you preview every value. **You** review, submit and pay on the official portal — the app never submits or pays.
5. You **record** the application (number, fees, status), print a **receipt**, and track follow-ups in the **register**.

Everything runs on **your shop computer**. Customer data is encrypted (AES-256-GCM) and protected by a shop PIN. Cloud AI (Groq) is optional and never receives Aadhaar numbers.

> ⚠️ **Eligibility rules are starting points, not official rules.** Every rule ships marked *“not verified”*. Confirm each one against the current official notification and tick **Verified** in Settings → Services. Example: Mool Niwas residence years is a setting (default 10; your earlier prototype used 8).

---

## Quick start (Windows shop PC)

1. Install **Node.js 22 LTS or newer** from https://nodejs.org (the app needs Node ≥ 22.13 for its built-in database).
2. Double-click **`setup.bat`** (one time; needs internet). It installs packages, downloads Hindi/English OCR data and builds the dashboard.
3. Double-click **`start-shop.bat`** every day. The dashboard opens at **http://localhost:3001**. Keep the black window open while you work.
4. First time: set your **shop PIN** and shop name.
5. Install the **Chrome extension**: `chrome://extensions` → Developer mode → *Load unpacked* → choose the `extension` folder. Open the dashboard once — it pairs automatically.
6. Optional: put a Groq API key in `backend\.env` (`GROQ_API_KEY=…`) for better name/address reading.

Full step-by-step guide in Hindi and English: **[docs/SHOP-GUIDE.md](docs/SHOP-GUIDE.md)**.

## What is where

| Folder | What it is |
|---|---|
| `backend/` | Node.js + Express server: OCR, extraction, profile, eligibility, registers, encrypted SQLite storage |
| `frontend/` | React dashboard (served by the backend after `npm run build`) |
| `extension/` | Chrome/Edge extension (Manifest V3) that fills portal forms |
| `docs/` | Architecture, roadmap, shop guide |
| `setup.bat`, `start-shop.bat` | One-click setup and daily start for Windows |

Architecture, design decisions, data model, security model and roadmap: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
What changed from v5 and why: **[CHANGELOG.md](CHANGELOG.md)**.

## Development

```powershell
cd backend; npm install; npm test; npm run dev      # API on http://localhost:3001
cd frontend; npm install; npm start                 # dashboard dev server on http://localhost:3000
```

Useful backend scripts:

| Command | Purpose |
|---|---|
| `npm test` | Unit + API + OCR tests (`node --test`) |
| `npm run ocr:download` | Download English + Hindi OCR data for offline use |
| `npm run reset-pin` | Forgot the shop PIN (data stays) |
| `npm run import-legacy` | Import profiles saved by v5 (`backend/data/autofill.json`), then delete that file |

Configuration lives in `backend/.env` (see `backend/.env.example`). By default the server only accepts connections from **this computer** (`HOST=127.0.0.1`).

## Important limits (honest list)

- The app does **not** connect to eMitra, SSO, DigiLocker or Jan Aadhaar APIs — those need official approval. It helps you fill forms; you submit them.
- The extension was tested on a mock eMitra-style form, not the live portal (which needs your kiosk login). Use **Teach fields** in the extension once per portal page if a box is not recognised.
- OCR quality depends on the photo: flat, well lit, whole document in frame.
- Rules, fees and document lists must be confirmed by you for your district/department.

## Data safety

- Data: `backend\data\shop.db` (encrypted) + `backend\data\master.key` (the key — **never share or lose it**).
- Daily automatic backups in `backend\backups` (database + key). Copy them to a USB drive kept safe.
- Never commit or share `backend\.env` or `backend\data\` — `.gitignore` already excludes them.
