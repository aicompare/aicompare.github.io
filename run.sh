#!/usr/bin/env bash
# Start the ModelRadar web server.
cd "$(dirname "$0")"
exec python3 -m uvicorn app.server:app --host 0.0.0.0 --port "${PORT:-8000}"
