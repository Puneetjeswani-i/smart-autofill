# Smart Autofill — दुकान गाइड / Shop guide

हिंदी और English दोनों में। / In Hindi and English.

---

## 1. पहली बार सेटअप / First-time setup

**हिंदी**
1. https://nodejs.org से **Node.js LTS (22 या नया)** इंस्टॉल करें।
2. प्रोजेक्ट फ़ोल्डर में **`setup.bat`** पर डबल-क्लिक करें (इंटरनेट चाहिए, 5–10 मिनट)।
3. **`start-shop.bat`** पर डबल-क्लिक करें। ब्राउज़र में **http://localhost:3001** खुलेगा। काली विंडो खुली रखें।
4. दुकान का नाम और **पिन** सेट करें। पिन किसी को न बताएँ।
5. **Chrome एक्सटेंशन**: `chrome://extensions` → *Developer mode* चालू → *Load unpacked* → `extension` फ़ोल्डर चुनें → ⚡ आइकन पिन करें। डैशबोर्ड एक बार खोलते ही यह अपने आप जुड़ जाता है।
6. **सेटिंग्स → सेवाएँ**: हर सेवा का सरकारी शुल्क व अपना सेवा शुल्क भरें। हर नियम को आधिकारिक अधिसूचना से मिलाकर **सत्यापित** पर टिक करें (जैसे मूल निवास के लिए निवास वर्ष)।
7. (वैकल्पिक) बेहतर पढ़ाई के लिए `backend\.env` में `GROQ_API_KEY` डालें।

**English**
1. Install **Node.js LTS (22 or newer)** from https://nodejs.org.
2. Double-click **`setup.bat`** in the project folder (needs internet, 5–10 minutes).
3. Double-click **`start-shop.bat`**. The browser opens **http://localhost:3001**. Keep the black window open.
4. Set the shop name and a **PIN**. Keep the PIN private.
5. **Chrome extension**: `chrome://extensions` → turn on *Developer mode* → *Load unpacked* → choose the `extension` folder → pin the ⚡ icon. It pairs automatically when the dashboard is open.
6. **Settings → Services**: enter the government fee and your service charge. Check each rule against the official notification and tick **Verified** (e.g. residence years for Mool Niwas).
7. (Optional) add `GROQ_API_KEY` in `backend\.env` for better reading of names and addresses.

---

## 2. हर ग्राहक के लिए / For every customer

| चरण / Step | हिंदी | English |
|---|---|---|
| 1 | **➕ नया ग्राहक** दबाएँ। मोबाइल लिखें। ग्राहक से पूछें कि क्या उनका विवरण आगे के लिए रखें — हाँ हो तो टिक करें (नहीं तो आज रात अपने आप हट जाएगा)। | Click **➕ New customer**, type the mobile, ask whether to keep their details for future visits — tick if yes (otherwise deleted automatically tonight). |
| 2 | **दस्तावेज़** टैब: आधार (आगे+पीछे), वोटर कार्ड, बिल, अंकतालिका की फोटो/स्कैन डालें → **दस्तावेज़ पढ़ें**। ई-आधार PDF हो तो पासवर्ड डालें (नाम के पहले 4 अक्षर कैपिटल + जन्म वर्ष)। | **Documents** tab: drop photos/scans (Aadhaar front+back, voter ID, bills, marksheets) → **Read documents**. For e-Aadhaar PDFs enter the password (first 4 letters of name in CAPITALS + birth year). |
| 3 | **विवरण** टैब: हर मान जाँचें। पीले बॉक्स = दस्तावेज़ों में अंतर → सही मान पर **यह उपयोग करें**। लाल चेतावनी (जैसे आधार जाँच अंक) ठीक करें। **सेव करें**। | **Details** tab: check every value. Yellow box = documents disagree → click **Use this** on the right one. Fix red warnings (e.g. Aadhaar checksum). **Save**. |
| 4 | **सेवाएँ** टैब: हरा = तैयार, पीला = कुछ कमी, लाल = पात्र नहीं (कारण पढ़ें)। प्रश्न हों तो ग्राहक से पूछकर हाँ/नहीं दबाएँ। फोटो/शपथ पत्र देख लिया हो तो “देखा / तैयार” टिक करें। कमी हो तो **दस्तावेज़ सूची प्रिंट करें** और ग्राहक को दें। | **Services** tab: green = ready, yellow = something missing, red = not eligible (read why). Ask the customer the questions and press Yes/No. Tick “Seen / ready” for photo/affidavit. If documents are missing, **Print document checklist** for the customer. |
| 5 | **आवेदन शुरू करें** → **पोर्टल खोलें** → SSO से लॉगिन → फॉर्म खोलें → पेज पर ⚡ बटन (या एक्सटेंशन आइकन) → पूर्वावलोकन में नाम/आधार के अंतिम 4 अंक जाँचें → **Fill**। | **Start application** → **Open portal** → SSO login → open the form → ⚡ button on the page (or the extension icon) → check the name and Aadhaar last 4 in the preview → **Fill**. |
| 6 | पोर्टल पर हर मान खुद जाँचें। ज़रूरत हो तो **ग्राहक के लिए जाँच पत्र प्रिंट करें** और हस्ताक्षर लें। फिर पोर्टल पर स्वयं जमा करें और वॉलेट से भुगतान करें। | Check every value on the portal yourself. If useful, **Print review sheet** and get the customer's signature. Then submit and pay on the portal yourself. |
| 7 | पोर्टल की आवेदन संख्या और शुल्क **रजिस्टर में दर्ज करें** → **रसीद प्रिंट करें**। | Enter the portal's application number and fees → **Record in register** → **Print receipt**. |
| 8 | **काम पूरा — अगला ग्राहक** दबाएँ (ताकि अगले फॉर्म में पुराना डेटा न भरे)। | Click **Done — next customer** (so the next form is not filled with the old customer's data). |

> ड्रॉपडाउन (जैसे जिला) बदलने पर कुछ पोर्टल पेज दोबारा लोड करते हैं — लोड होने के बाद ⚡ **Fill** फिर दबाएँ।
> Some portals reload the page after a dropdown (like district) changes — press ⚡ **Fill** again after it reloads.

> एक्सटेंशन किसी बॉक्स को न पहचाने तो पॉपअप में **Teach fields** चालू करें, बॉक्स पर क्लिक करें और बताएँ कि वह क्या है। अगली बार वह याद रखेगा।
> If the extension does not recognise a box, turn on **Teach fields** in its popup, click the box and choose what it is. It remembers next time.

---

## 3. अन्य काम / Other daily tasks

- **आवेदन रजिस्टर / Applications**: स्थिति बदलें (जमा → स्वीकृत → ग्राहक को दिया), फॉलो-अप देखें, महीने का हिसाब **Excel (CSV)** में निकालें। / Update status (submitted → approved → delivered), see follow-ups, export the month to **Excel (CSV)**.
- **दस्तावेज़ टूल्स / Document tools**: फोटो/PDF को 50/100/200 KB से छोटा करें, आगे-पीछे को एक PDF में जोड़ें, पासपोर्ट फोटो/हस्ताक्षर का आकार बदलें — सब इसी कंप्यूटर पर। / Shrink photos/PDFs under 50/100/200 KB, merge front+back into one PDF, resize photo/signature — all on this computer.
- **पुराना ग्राहक / Returning customer**: होम पर नाम, मोबाइल या आधार के अंतिम 4 अंक से खोजें। / Search by name, mobile or Aadhaar last 4 on Home.

---

## 4. बैकअप और सुरक्षा / Backup & safety

- ऐप हर दिन `backend\backups` में अपने आप बैकअप बनाता है (अंतिम 14)। हफ्ते में एक बार इसे **USB ड्राइव** में कॉपी करें और सुरक्षित रखें — इसमें एन्क्रिप्शन कुंजी भी है।
  The app makes a daily backup in `backend\backups` (last 14 kept). Copy it to a **USB drive** weekly and keep it safe — it contains the encryption key.
- `backend\data\master.key` खो गई तो डेटा पढ़ा नहीं जा सकेगा। / If `backend\data\master.key` is lost, the data cannot be read.
- `backend\.env` और `backend\data` किसी को न भेजें, न इंटरनेट पर डालें। / Never share or upload `backend\.env` or `backend\data`.
- ग्राहक के सामने स्क्रीन पर दूसरे ग्राहकों का विवरण न खुला रखें; उठते समय **लॉक** दबाएँ। / Don't leave other customers' details on screen; press **Lock** when you step away.

**बैकअप से वापस लाना / Restore**: ऐप बंद करें → बैकअप फ़ोल्डर से `shop.db` और `master.key` को `backend\data` में कॉपी करें (पुरानी `shop.db-wal`, `shop.db-shm` हटाएँ) → `start-shop.bat`।
Close the app → copy `shop.db` and `master.key` from a backup folder into `backend\data` (delete old `shop.db-wal`, `shop.db-shm`) → `start-shop.bat`.

**नए कंप्यूटर पर / Moving to a new PC**: नए PC पर `setup.bat` चलाएँ, फिर ऊपर की तरह बैकअप वापस लाएँ। / Run `setup.bat` on the new PC, then restore a backup as above.

---

## 5. समस्या और समाधान / Troubleshooting

| समस्या / Problem | समाधान / Fix |
|---|---|
| ब्राउज़र में “Server not reachable” / “Server not reachable” in the browser | `start-shop.bat` चलाएँ और काली विंडो खुली रखें। / Run `start-shop.bat` and keep its window open. |
| “Port 3001 is already in use” | ऐप पहले से चल रहा है — बस http://localhost:3001 खोलें। / The app is already running — just open http://localhost:3001. |
| पिन भूल गए / Forgot PIN | `backend` फ़ोल्डर में `npm run reset-pin` चलाएँ (डेटा नहीं हटता)। / Run `npm run reset-pin` in the `backend` folder (data stays). |
| दस्तावेज़ नहीं पढ़ा गया / Document not read | समतल रखकर, अच्छी रोशनी में, पूरा दस्तावेज़ फ्रेम में लेकर दोबारा फोटो लें; या प्रकार (Aadhaar आदि) स्वयं चुनें। / Retake flat, well lit, whole document in frame; or choose the type manually. |
| AI बंद / “AI not available” | सेटिंग्स → AI → *Test connection*। Groq कुंजी जाँचें। AI के बिना भी ऐप काम करता है। / Settings → AI → *Test connection*; check the Groq key. The app also works without AI. |
| एक्सटेंशन “Not connected” | डैशबोर्ड खोलकर लॉगिन करें, फिर पोर्टल पेज रीफ़्रेश करें। / Open and log in to the dashboard, then refresh the portal page. |

---

## 6. महत्वपूर्ण / Important

- यह ऐप सरकारी नियम तय नहीं करता। पात्रता नियम आपकी सेटिंग्स हैं — आधिकारिक अधिसूचना से पुष्टि करके ही ग्राहक को सलाह दें।
  The app does not decide government rules. Eligibility rules are your settings — confirm them with the official notification before advising customers.
- ऐप कभी पोर्टल पर जमा या भुगतान नहीं करता। / The app never submits or pays on portals.
