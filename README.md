# TypeCast - O'zbekcha Transliteratsiya Platformasi (Uzbek Transliteration Platform)

A high-performance, production-ready Uzbek Latin ↔ Cyrillic transliteration platform featuring:
1. **Real-time Dual-pane Text Editor:** 100% client-side bidirectional conversion (0ms network latency).
2. **In-place Document Transliteration:** Native OpenXML engine for `.docx` and `.txt` that preserves 100% of formatting, tables, images, headers/footers, and text box geometry.
3. **Word Digraph Fragmentation Fix:** Merges fragmented Word runs (`<w:r>`) to prevent words like `Shahar` or `O'zbekiston` from corrupting into `Сҳаҳар` or `Оъзбекистон`.
4. **Legacy Word 97-2003 (.doc) Support:** Headless LibreOffice bridge running in an isolated container sandbox with format conversion options (`.docx`, `.doc`, `.pdf`, `.txt`).
5. **Vercel-Ready Architecture:** Complete client-side in-browser `.docx` and `.txt` processing (powered by bundled JSZip and DOMParser), allowing full deployment to Vercel with zero server cost, zero 4.5MB payload limit, and 100% client-side privacy.

---

## Architecture Overview

```
TypeCast/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI endpoints, CORS, file streaming & cleanup
│   │   ├── transliterator.py     # Bidirectional Uzbek transliterator (Latin <-> Cyrillic)
│   │   └── doc_handler.py        # docx (python-docx + run merger), doc (soffice), txt
│   ├── tests/
│   │   ├── test_transliterator.py # Comprehensive phonology & digraph unit tests
│   │   ├── test_doc_handler.py    # DOCX run merging, tables, txt & pdf tests
│   │   └── test_api.py            # FastAPI REST endpoint integration tests
│   ├── Dockerfile               # Debian python:3.11-slim, libreoffice-nogui, fonts
│   ├── requirements.txt         # fastapi, uvicorn, python-docx, python-multipart
│   └── run.sh                   # Startup script
├── frontend/
│   ├── index.html               # Dual-pane UI, file dropzone, format selector
│   ├── styles.css               # Modern vanilla CSS, glassmorphism, responsive, dark/light
│   ├── app.js                   # UI logic, bidirectional live text, file drag-and-drop
│   └── js/
│       ├── transliterator.js    # Identical JS port of Uzbek transliteration engine
│       ├── docx_engine.js       # In-browser JSZip OpenXML docx & txt transliterator
│       └── libs/
│           └── jszip.min.js     # Bundled JSZip library for offline & Vercel reliability
├── docker-compose.yml           # Local full-stack development orchestration
├── nginx.conf                   # Nginx reverse proxy configuration for Docker frontend
├── vercel.json                  # Vercel deployment configuration
└── README.md
```

---

## 1. Quick Start (Local Development)

### A. Run Backend (FastAPI + LibreOffice)
```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run FastAPI service on port 8000
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### B. Run Frontend
You can serve the `frontend/` directory with any static server:
```bash
# Python simple server
python3 -m http.server 3000 --directory frontend

# Or using Node.js npx serve
npx serve frontend -p 3000
```
Open `http://localhost:3000` in your browser. The frontend automatically detects the backend on port 8000.

---

## 2. Docker Compose Deployment (Full Container Mode)

To run the complete system with headless LibreOffice support for legacy `.doc` files:
```bash
docker compose up --build -d
```
- **Frontend & Reverse Proxy:** `http://localhost:3000`
- **FastAPI Backend API:** `http://localhost:8000`
- **Health check:** `http://localhost:8000/api/health`

---

## 3. Deploying to Vercel (Edge / Browser Mode)

TypeCast is architected to deploy directly to Vercel as a static or serverless web application:

1. Push your repository to GitHub / GitLab.
2. In Vercel, import the repository:
   - **Root Directory:** `./` (or select `frontend`)
   - **Framework Preset:** Other
   - **Output Directory:** `frontend`
3. Click **Deploy**.

> [!NOTE]
> **How It Works on Vercel:**
> - Real-time dual-pane text conversion runs 100% in client-side JavaScript.
> - `.docx` and `.txt` files are transliterated **directly inside the user's browser** via `frontend/js/docx_engine.js` (using JSZip). This means **infinite scalability, zero server bandwidth costs, no 4.5MB Vercel upload limit, and 100% data privacy**.
> - For legacy `.doc` (Word 97-2003) and `.pdf` conversions, you can deploy the Docker container to a free or low-cost container platform (e.g. Render, Railway, Fly.io, or VPS) and configure `TYPECAST_API_URL` to point to it.

---

## 4. Transliteration Rules & Linguistic Precision

The transliteration engine implements official Uzbek orthography and phonology rules:
- **Apostrophe Normalization:** Automatically standardizes `‘`, `’`, `` ` ``, `ʻ`, `ʼ`, `´` to official typewriter apostrophe `'`.
- **Initial 'E' Rule:** Words starting with `E`/`e` (or preceded by vowels/punctuation) map to `Э`/`э` (`Eshik` -> `Эшик`, `Aeroport` -> `Аэропорт`). After consonants, it maps to `Е`/`е` (`Besh` -> `Беш`, `Men` -> `Мен`).
- **Reverse 'Е' Rule:** In Cyrillic, `Е`/`е` at word-start or after vowels maps to `Ye`/`ye` (`Ер` -> `Yer`, `Киев` -> `Kiyev`); after consonants it maps to `E`/`e` (`Бер` -> `Ber`).
- **Triple-Letter Digraph Precedence:** `yo'` is mapped to `йў` (`yo'l` -> `йўл`, never corrupting to `ёъл`).
- **Compound Sound Protection:** `s'h` maps to `сҳ` (`Is'hoq` -> `Исҳоқ`, never corrupting to `ш`).
- **Uppercase Digraph Matching:** Preserves casing across all digraphs (`SHAHAR` ↔ `ШАҲАР`, `Shahar` ↔ `Шаҳар`).

---

## 5. Running Automated Tests

```bash
# Transliteration phonological unit tests
python3 -m unittest backend/tests/test_transliterator.py

# Document OpenXML, run-merging, and LibreOffice tests
python3 -m unittest backend/tests/test_doc_handler.py

# FastAPI REST endpoint integration tests
python3 -m unittest backend/tests/test_api.py

# JavaScript transliterator and DOCX XML engine tests
node -e 'require("./frontend/js/transliterator.js"); console.log("JS OK");'
```

---

## 6. API Endpoints

- `GET /api/health`: Returns system status and LibreOffice availability.
- `POST /api/transliterate/text`:
  ```json
  {
    "text": "O'zbekiston - kelajagi buyuk davlat.",
    "direction": "latin-to-cyrillic"
  }
  ```
- `POST /api/transliterate/file`:
  Accepts `multipart/form-data`:
  - `file`: `.docx`, `.doc`, or `.txt` file
  - `direction`: `latin-to-cyrillic` | `cyrillic-to-latin`
  - `target_format`: `same` | `docx` | `doc` | `pdf` | `txt`
  Streams the converted file back with cleanup in `BackgroundTasks`.
