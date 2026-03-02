# BirdSignal 🦅

BirdSignal helps students find and analyze "bird courses" (easy courses) by processing Reddit discussions with sentiment and NLP signals.

## Project Structure

```
BirdSignal/
├── frontend/           # React + TypeScript frontend
├── backend/
│   ├── data/          # Python data processing scripts
│   └── reddit_api/    # Node.js Reddit API service
```

## Setup

### Quick Start: Run Locally

Use this flow to run the app locally and view the UI.

```bash
# Terminal 1: start Reddit API
cd backend/reddit_api
pnpm install
pnpm start
```

```bash
# Terminal 2: run data pipeline (updates course JSON data)
cd backend/data
uv sync
uv run python bootstrap_nltk.py
uv run python pipeline.py --no-prompt --time-period all --limit 500 --analyze-top-courses --top-courses-count 80
```

```bash
# Terminal 3: run frontend dev server
cd frontend
pnpm install
pnpm run dev
```

Then open the local URL shown by Vite (usually `http://localhost:5173`).

### Quick Start: One-Command Term Refresh

If you want to refresh catalog + course details + frontend build in one shot:

```bash
./scripts/update-term.sh
```

This script:
1. Start Reddit API if not already running.
2. Sync catalog data.
3. Run Python pipeline.
4. Copy generated JSON into frontend public data.
5. Build frontend static files.

Important:
- `./scripts/update-term.sh` does **not** start the frontend dev server.
- For local UI development, run `cd frontend && pnpm run dev` separately.

### Reddit API Service

```bash
cd backend/reddit_api
pnpm install
pnpm start

# For development with auto-restart
pnpm run dev
```

Optional API environment variables:

- `CORS_ORIGIN`: comma-separated allowed origins (example: `https://birdsignal.app,https://www.birdsignal.app`)
- `RATE_LIMIT_WINDOW_SECONDS`: per-IP rate-limit window in seconds (default `60`)
- `RATE_LIMIT_MAX`: max API requests per window per IP (default `120`)

### Data Processing Pipeline

```bash
cd backend/data

# Install uv (one-time)
# https://docs.astral.sh/uv/getting-started/installation/

uv sync
uv run python bootstrap_nltk.py
uv run python pipeline.py

# Optional smoke test
uv run python pipeline_smoke_test.py

# Pipeline with parameters
uv run python pipeline.py --time-period all --limit 300 --analyze-top-courses --top-courses-count 50
```

If you prefer to keep using `pip`, `backend/data/requirements.txt` is still available as a fallback.

#### Pipeline Parameters

| Parameter | Description | Default | Options |
|-----------|-------------|---------|---------|
| --time-period | Time period to search | all | hour, day, week, month, year, all |
| --limit | Max threads to fetch | 200 | Any positive integer |
| --analyze-top-courses | Force analyze top courses | True | Flag |
| --skip-top-courses | Skip top-course analysis | False | Flag |
| --top-courses-count | Number of top courses | 15 | Any positive integer |

### Frontend Application

```bash
cd frontend
pnpm install

# Normalize curated catalog data (if raw sheet changed)
pnpm run catalog:normalize

# Sync from Google Sheet + normalize
pnpm run catalog:sync

# Start development server
pnpm run dev
```

### Curated Course Catalog Files

These files are used to enrich Reddit-driven course data with curated titles/categories:

- Raw source sheet JSON: `frontend/public/data/course-catalog/raw.json`
- Normalized catalog list: `frontend/public/data/course-catalog/normalized.json`
- Code lookup map used by the app: `frontend/public/data/course-catalog/by-code.json`

When `raw.json` changes, run:

```bash
cd frontend
pnpm run catalog:normalize
```

To fetch directly from the Google Sheet source and regenerate all catalog files:

```bash
cd frontend
pnpm run catalog:sync
```

`catalog:sync` merges sheet courses with your existing local catalog and deduplicates by course code, so courses already in your catalog are preserved.

## Course Analysis

You can analyze specific courses using:

```bash
cd backend/data
uv run python course_details_analyzer.py --course-codes CS101 BU111 PS262 --limit 50
```

### Analysis Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| --course-codes | Courses to analyze | Required |
| --limit | Max threads per course | 25 |
| --output-dir | Output directory | processed/course_details |

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Tech Stack

- Frontend: React, TypeScript, Tailwind CSS, Vite
- Backend: Node.js, Express, Python, NLTK (Natural Language Processing), VADER Sentiment Analysis
