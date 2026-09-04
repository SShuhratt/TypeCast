#!/bin/bash
set -e

echo "Starting TypeCast Uzbek Transliteration Backend Service..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
