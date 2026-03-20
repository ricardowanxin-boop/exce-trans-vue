#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

exec python3 -m uvicorn python_backend.app:app --host 127.0.0.1 --port 8000 --reload
