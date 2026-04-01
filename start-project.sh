#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BRANCH="reprise-auth-53d756b"
TARGET_BRANCH="${1:-$DEFAULT_BRANCH}"

cd "$PROJECT_DIR"

echo "Project: $PROJECT_DIR"
echo "Branch:  $TARGET_BRANCH"

git fetch --all --prune
git checkout "$TARGET_BRANCH"

if [[ "$TARGET_BRANCH" == "main" ]]; then
  git pull --ff-only origin main
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "${CLIENT_PID:-}" ]]; then
    kill "$CLIENT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

npm run dev:server &
SERVER_PID=$!

sleep 2

npm run dev:client -- --host 127.0.0.1 &
CLIENT_PID=$!

echo
echo "Backend:  http://127.0.0.1:3001"
echo "Frontend: check the Vite URL printed below"
echo "Stop:     Ctrl+C"
echo

wait
