# EasyClick

**AI-Powered Job Search, Resume Tailoring & Application Automation**

EasyClick is a local-first, AI-powered job portal. It discovers matching roles from multiple job boards, scores them against your profile, tailors your resume into a pixel-perfect PDF, generates cold outreach emails, runs mock interviews, helps you track applications, and alerts you to job scams — all from a single dashboard running entirely on your machine.

---

## Features at a Glance

| Module | What it does |
|---|---|
| **Market Search** | Scrapes live listings from Indeed, Naukri, LinkedIn, Internshala & Wellfound |
| **Direct Extract** | Paste any company career page URL — scrapes job details directly |
| **Resume Tailoring** | AI rewrites your resume against the job description; renders a real PDF via RenderCV + Typst |
| **Resume Sandbox** | Visual template library + split-screen YAML editor with live PDF preview |
| **Cold Email Generator** | Writes personalized cold emails from your profile + job description |
| **AI Mock Interview** | Voice-enabled mock interviews with topic rotation and scorecard evaluation |
| **Skill Roadmap** | AI-generated phase-by-phase learning roadmap for your target role |
| **Salary Insights** | Market compensation analysis by role, location, and experience |
| **Application Tracker** | Track application status, notes, and interview progress |
| **Scam Alerts** | Live scam reports from Reddit, Google News & HackerNews; search any company |

---

## Prerequisites

Install these **before** you do anything else:

| Tool | Version | Download |
|---|---|---|
| **Node.js** | 18 or higher | https://nodejs.org |
| **Python** | 3.11 or higher | https://python.org/downloads |
| **Git** | Any recent version | https://git-scm.com |

> **Windows users:** During Python installation, check **"Add Python to PATH"**.  
> Verify installs: `node -v`, `python --version`, `git --version`

---

## Setup (One-Time)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd EasyClick
```

### 2. Install Node Dependencies

```bash
npm run install:all
```

This installs both the root (`concurrently`) and the `frontend/` Next.js packages.

### 3. Create a Python Virtual Environment

```bash
# Create the venv
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate

# macOS / Linux:
source venv/bin/activate
```

> You must activate the venv **every time** you open a new terminal before running the project.

### 4. Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs FastAPI, Playwright, RenderCV, aiohttp, and all other backend packages.

### 5. Install the Playwright Browser

```bash
python -m playwright install chromium
```

This downloads the Chromium browser used by the scraper (~150 MB, one-time only).

> **Linux users only:** also run:
> ```bash
> python -m playwright install-deps chromium
> ```

### 6. Verify RenderCV (PDF Engine)

RenderCV needs a working Python environment to render PDFs. Test it once:

```bash
python -c "import rendercv; print('RenderCV OK')"
```

If it prints `RenderCV OK` you're set. No LaTeX or system fonts required.

---

## Running the Project

Make sure your virtual environment is **activated**, then from the root `EasyClick/` folder:

```bash
npm run dev
```

This starts both servers simultaneously:

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API (FastAPI) | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

Open **http://localhost:3000** in your browser.

---

## First-Time Configuration (Required)

The app will show a **startup screen** and then redirect you to **Settings**. You must complete this before any features work.

### Step 1 — Fill Your Profile

In **Settings → Profile**, enter:

- **Full Name**
- **Email Address**
- **Phone** (optional)
- **Target Roles** — e.g. `Software Engineer`, `Data Analyst`
- **Location** — your preferred work location
- **Skills** — comma-separated list
- **Experience (years)**
- **Resume Text** — paste your current resume as plain text (used for AI tailoring)
- **LinkedIn / Portfolio URLs** (optional)
- **About Me, Work Style, Experience Summary** (used by email generator)

### Step 2 — Add Your OpenRouter API Key

Go to **Settings → Configuration**:

1. Visit **https://openrouter.ai** → sign up free (no credit card needed)
2. Go to **https://openrouter.ai/keys** → create a key
3. Copy the key (starts with `sk-or-v1-...`)
4. Paste it into **OpenRouter API Key** field → Save

> The app uses **free AI models** by default. No paid credits required.

### Step 3 — Gmail Setup (Optional, for Email Sending)

Only needed if you want to auto-send cold emails:

1. Go to your **Google Account → Security → 2-Step Verification** (must be enabled)
2. Go to **App Passwords** → generate a new password for "Mail"
3. In **Settings → Configuration**, enter your Gmail address and that 16-character app password

> **Important:** Use an **App Password**, not your real Gmail password.

Once both profile and API key are saved, the sidebar unlocks and all features become available.

---

## Dependencies Reference

### Python (`requirements.txt`)

```
fastapi          — Backend API framework
uvicorn          — ASGI server
playwright       — Headless browser for scraping
aiohttp          — Async HTTP for AI API + scam sources
aiosqlite        — Async SQLite database driver
pydantic         — Data validation
python-multipart — File upload support
watchfiles       — Hot-reload for dev server
httpx            — HTTP client (fallback scraping)
rendercv         — PDF resume rendering engine
ruamel.yaml      — YAML parsing for resume templates
pypdf            — PDF reading/merging
```

### Node.js

```
Next.js 14       — Frontend framework (React)
concurrently     — Runs Next.js + FastAPI in one terminal
```

---

## Project Structure

```
EasyClick/
├── frontend/          # Next.js app (port 3000)
│   ├── app/           # Pages (search, resume, settings, scams, etc.)
│   ├── components/    # Shared UI components
│   └── lib/           # API client
├── backend/           # FastAPI app (port 8000)
│   ├── routers/       # API route handlers
│   ├── services/      # Scraper, AI, resume, email services
│   ├── database.py    # SQLite schema + migrations
│   └── main.py        # FastAPI entrypoint
├── requirements.txt   # Python dependencies
├── package.json       # Node scripts
└── run_server.py      # Starts the FastAPI server
```

---

## Common Issues

### `playwright install` fails or browser not found
```bash
python -m playwright install chromium --with-deps
```

### `ModuleNotFoundError` for any Python package
```bash
# Make sure venv is active first
venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

### Port already in use
Kill whatever is using port 3000 or 8000:
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### AI features return errors
- Check **Settings → Configuration** — the OpenRouter key must be saved
- Verify the key at https://openrouter.ai/keys is still active
- Free model rate limits can cause temporary failures — the app retries automatically across 5 fallback models

### Resume PDF doesn't render
- Ensure `rendercv` is installed in your active venv: `pip install rendercv`
- Run `python -c "import rendercv"` — if it errors, reinstall

---

## Security Notes

- **No `.env` file** — all API keys are stored in the local SQLite database (`backend/easyclick.db`)
- `easyclick.db` is listed in `.gitignore` — it will **never be committed** to git
- Keys are masked in the Settings UI after saving
- All processing is 100% local — no data leaves your machine except API calls to OpenRouter (AI) and Reddit/Google News (scam alerts)

---

## Tech Stack

- **Frontend**: Next.js 14, React, CSS Modules
- **Backend**: FastAPI (Python), SQLite via aiosqlite
- **Scraping**: Playwright (Chromium headless)
- **AI**: OpenRouter API (free models — Gemini, LLaMA, Qwen)
- **PDF Engine**: RenderCV + Typst (no LaTeX)
- **Scam Sources**: Reddit API, Google News RSS, HackerNews Algolia API
