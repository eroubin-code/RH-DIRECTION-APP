#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_DIR"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "${CLIENT_PID:-}" ]]; then
    kill "$CLIENT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "=========================================="
echo "RH Direction App - Bac a sable local"
echo "Projet  : $PROJECT_DIR"
echo "Mode    : mock"
echo "URL     : http://127.0.0.1:5173"
echo "Backend : http://127.0.0.1:3001"
echo "Compte  : sysadm / Tp0sana"
echo "=========================================="
echo

RH_DATA_SOURCE=mock npm run dev:server &
SERVER_PID=$!

sleep 2

npm run dev:client -- --host 127.0.0.1 --port 5173 &
CLIENT_PID=$!

echo "Stop: Ctrl+C"
echo

wait
