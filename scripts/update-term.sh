#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
REDDIT_API_DIR="$ROOT_DIR/backend/reddit_api"
DATA_DIR="$ROOT_DIR/backend/data"

TIME_PERIOD="${TIME_PERIOD:-all}"
LIMIT="${LIMIT:-500}"
TOP_COURSES_COUNT="${TOP_COURSES_COUNT:-80}"
API_URL="${API_URL:-http://localhost:3001}"
MUST_INCLUDE_COURSES="${MUST_INCLUDE_COURSES:-CP104}"
COURSE_THREAD_LIMIT="${COURSE_THREAD_LIMIT:-100}"

API_PID=""
KEEP_API_RUNNING="${KEEP_API_RUNNING:-0}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$API_PID" && "$KEEP_API_RUNNING" != "1" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_api() {
  local attempts=0
  local max_attempts=40
  while (( attempts < max_attempts )); do
    if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

start_api_if_needed() {
  if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
    echo "Reddit API already running at $API_URL"
    return 0
  fi

  echo "Starting Reddit API..."
  (
    cd "$REDDIT_API_DIR"
    pnpm start
  ) >/tmp/birdsignal-reddit-api.log 2>&1 &
  API_PID="$!"

  if ! wait_for_api; then
    echo "Failed to start Reddit API. Check /tmp/birdsignal-reddit-api.log" >&2
    exit 1
  fi
  echo "Reddit API ready."
}

require_cmd pnpm
require_cmd uv
require_cmd curl

echo "Step 1/5: Ensure Reddit API is running"
start_api_if_needed

echo "Step 2/5: Sync curated catalog from sheet"
(
  cd "$FRONTEND_DIR"
  pnpm run catalog:sync
)

echo "Step 3/5: Run backend pipeline"
(
  cd "$DATA_DIR"
  uv sync
  uv run python bootstrap_nltk.py
  uv run python pipeline.py \
    --api-url "$API_URL" \
    --time-period "$TIME_PERIOD" \
    --limit "$LIMIT" \
    --analyze-top-courses \
    --top-courses-count "$TOP_COURSES_COUNT" \
    --must-include-courses "$MUST_INCLUDE_COURSES" \
    --course-thread-limit "$COURSE_THREAD_LIMIT" \
    --no-prompt
)

echo "Step 4/5: Copy generated course details into frontend public data"
cp -f "$DATA_DIR"/processed/course_details/*.json "$FRONTEND_DIR"/public/course_details/

echo "Step 5/5: Build frontend"
(
  cd "$FRONTEND_DIR"
  pnpm run build
)

echo
echo "Term update complete."
echo "Output:"
echo "- $FRONTEND_DIR/public/data/course-catalog/{raw,normalized,by-code}.json"
echo "- $FRONTEND_DIR/public/course_details/*.json"
