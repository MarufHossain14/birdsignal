# BirdSignal

BirdSignal is a full-stack course discovery app that identifies likely "bird courses" by analyzing Reddit discussions and combining NLP/sentiment signals with a curated course catalog.

## What This Project Does

- Fetches posts from `r/wlu` related to bird courses.
- Extracts course mentions (for example, `BU111`, `EM203`) from thread text.
- Computes per-course bird scores and supporting signals.
- Generates per-course JSON artifacts consumed by the frontend.
- Displays ranked courses with filtering, confidence signals, and evidence-ranked threads.

## Repository Structure

```text
birdcourse/
├── frontend/                   # React + TypeScript + Vite UI
│   ├── src/                    # UI components and client-side enrichment logic
│   ├── public/course_details/  # Generated course JSON files used by UI
│   └── scripts/                # Catalog sync/normalize scripts
├── backend/
│   ├── reddit_api/             # Node.js API for Reddit fetching and lookup endpoints
│   └── data/                   # Python pipeline + sentiment analysis
└── scripts/
    └── update-term.sh          # One-command refresh: sync + pipeline + build
```

## Architecture and Data Flow

1. `backend/reddit_api` serves endpoints that fetch Reddit search results and expose course-thread/top-course data.
2. `backend/data/pipeline.py` calls the API, runs sentiment analysis, and writes processed outputs.
3. Generated course files are copied into `frontend/public/course_details/`.
4. `frontend/src/App.tsx` loads those JSON files and enriches display data (confidence + evidence ranking).

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4, Vaul (mobile drawer)
- Backend API: Node.js, Express, CORS middleware
- Data pipeline: Python 3.11+, NLTK, VADER sentiment, regex-based course extraction
- Tooling: `pnpm`, `uv`, Bash automation

## Prerequisites

- Node.js 18+
- `pnpm`
- Python 3.11+
- `uv` (recommended)
- `curl`

## Local Development (3 Terminals)

### 1. Run Reddit API

```bash
cd backend/reddit_api
pnpm install
pnpm start
```

API health check: `http://localhost:3001/health`

### 2. Run Data Pipeline

```bash
cd backend/data
uv sync
uv run python bootstrap_nltk.py
uv run python pipeline.py \
  --api-url http://localhost:3001 \
  --no-prompt \
  --time-period all \
  --limit 500 \
  --analyze-top-courses \
  --top-courses-count 80
```

### 3. Run Frontend

```bash
cd frontend
pnpm install
pnpm run dev
```

Open Vite URL (usually `http://localhost:5173`).

## One-Command Refresh

Use this when you want fresh catalog + fresh analyzed course data + production build:

```bash
./scripts/update-term.sh
```

Script workflow:

1. Ensures Reddit API is running.
2. Syncs/normalizes curated course catalog.
3. Runs Python pipeline.
4. Copies processed course JSON into frontend public data.
5. Builds frontend output.

Optional environment variables:

- `API_URL` (default `http://localhost:3001`)
- `TIME_PERIOD` (default `all`)
- `LIMIT` (default `500`)
- `TOP_COURSES_COUNT` (default `80`)
- `KEEP_API_RUNNING=1` (do not kill spawned API process on exit)

## Backend API Reference

Base URL: `http://localhost:3001`

### `GET /health`

Returns `200 OK` when service is alive.

### `GET /api/bird-courses`

Query params:

- `limit` (positive int, capped)
- `timePeriod` (`hour|day|week|month|year|all`)

Returns matching Reddit threads about bird courses.

### `GET /api/top-bird-courses`

Query params:

- `count` (positive int)

Returns top courses from processed course detail artifacts.

### `GET /api/course-threads/:courseCode`

Path params:

- `courseCode` (validated course code format)

Query params:

- `limit` (positive int)

Returns deduplicated course-specific threads (title/body/general search).

## API Environment Variables

Set these in your shell or `.env` before starting `backend/reddit_api`:

- `PORT` (default `3001`)
- `CORS_ORIGIN` (comma-separated allowlist; empty means allow all origins)
- `RATE_LIMIT_WINDOW_SECONDS` (default `60`)
- `RATE_LIMIT_MAX` (default `120`)

## Data Pipeline Commands

```bash
cd backend/data
uv sync
uv run python bootstrap_nltk.py
uv run python pipeline.py
uv run python pipeline_smoke_test.py
```

Useful options for `pipeline.py`:

- `--api-url` (default `http://localhost:3001`)
- `--limit` (default `200`)
- `--time-period` (`hour|day|week|month|year|all`)
- `--analyze-top-courses`
- `--skip-top-courses`
- `--top-courses-count` (default `15`)
- `--no-prompt`

## Frontend Commands

```bash
cd frontend
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
```

Catalog scripts:

```bash
# Normalize existing raw catalog JSON
pnpm run catalog:normalize

# Fetch from Google Sheet, normalize, and merge with existing catalog
pnpm run catalog:sync
```

If needed, override the sheet URL:

```bash
BIRDCOURSE_SHEET_URL="<google-sheet-url>" pnpm run catalog:sync
```

## Generated Data Artifacts

Pipeline output files are written under `backend/data/processed/` and then copied to frontend public assets.

Primary files used by UI:

- `frontend/public/course_details/catalog.json`
- `frontend/public/course_details/index.json`
- `frontend/public/course_details/<COURSE_CODE>.json`

Curated catalog files:

- `frontend/public/data/course-catalog/raw.json`
- `frontend/public/data/course-catalog/normalized.json`
- `frontend/public/data/course-catalog/by-code.json`

## Scoring and Confidence Notes

Bird score and ranking are heuristic, not an objective measure of course quality.

- Python pipeline computes base bird scores using sentiment, bird-term detection, mention counts, engagement signals, and department/level adjustments.
- Frontend computes display confidence (`high|medium|low`) from mention volume and recency.
- Low-confidence courses intentionally hide the numeric bird score and surface warning context.
- Threads inside course details are evidence-ranked to prioritize stronger signals.

## Troubleshooting

### Missing NLTK resources

Run:

```bash
cd backend/data
uv run python bootstrap_nltk.py
```

### Pipeline says no data fetched

- Ensure API is running on expected URL (`http://localhost:3001` by default).
- Verify `GET /health` responds with `200`.
- Retry with a broader time period (`--time-period all`).

### Frontend loads but no courses appear

- Confirm generated files exist in `frontend/public/course_details/`.
- Re-run pipeline and copy step (or run `./scripts/update-term.sh`).

## Current Limitations

- Reddit source is currently scoped to `r/wlu` search.
- Scores are heuristic and sensitive to sample size and recency.
- Catalog/category quality depends on source sheet quality and normalization.

## License

No license file is currently included in this repository.
