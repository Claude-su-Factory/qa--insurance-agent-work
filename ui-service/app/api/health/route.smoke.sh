#!/bin/bash
# Smoke test: ui-service 가 로컬에서 실행 중일 때 /api/health 가 200 OK 를 반환하는지 확인
set -euo pipefail
URL="${1:-http://localhost:3000/api/health}"
BODY=$(curl -sf "$URL")
echo "response: $BODY"
echo "$BODY" | grep -q '"status":"ok"' || { echo "FAIL: status != ok"; exit 1; }
echo "PASS"
