#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# .env 파일에서 변수를 안전하게 읽어오는 함수 (source 방식의 부작용 방지)
get_env_var() {
  local file="$1"
  local var_name="$2"
  if [ -f "$file" ]; then
    grep "^${var_name}=" "$file" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//"
  else
    echo ""
  fi
}

echo "Extracting variables from .env files..."

# 각 서비스별 변수 추출
VOYAGE_API_KEY=$(get_env_var "$ROOT/ingestion-service/.env" "VOYAGE_API_KEY")
ANTHROPIC_API_KEY=$(get_env_var "$ROOT/query-service/.env" "ANTHROPIC_API_KEY")
NEXT_PUBLIC_SUPABASE_URL=$(get_env_var "$ROOT/ui-service/.env.local" "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY=$(get_env_var "$ROOT/ui-service/.env.local" "SUPABASE_SERVICE_ROLE_KEY")

# 검증: 필수 키 누락 시 중단
if [ -z "$VOYAGE_API_KEY" ] || [ -z "$ANTHROPIC_API_KEY" ] || [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: Required environment variables are missing in .env files."
  exit 1
fi

echo "Applying K8s secrets..."

# api-secrets (Anthropic + Voyage)
kubectl create secret generic api-secrets \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --from-literal=VOYAGE_API_KEY="$VOYAGE_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# supabase-secrets (Key name aligned with Deployment env)
kubectl create secret generic supabase-secrets \
  --from-literal=SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secrets applied successfully."
