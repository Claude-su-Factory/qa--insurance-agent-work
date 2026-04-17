#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

get_env_var() {
  local file="$1"
  local var_name="$2"
  if [ -f "$file" ]; then
    grep "^${var_name}=" "$file" 2>/dev/null | cut -d'=' -f2- | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//" || true
  else
    echo ""
  fi
}

echo "Extracting variables from .env files..."

VOYAGE_API_KEY=$(get_env_var "$ROOT/ingestion-service/.env" "VOYAGE_API_KEY")
ANTHROPIC_API_KEY=$(get_env_var "$ROOT/query-service/.env" "ANTHROPIC_API_KEY")
NEXT_PUBLIC_SUPABASE_URL=$(get_env_var "$ROOT/ui-service/.env.local" "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY=$(get_env_var "$ROOT/ui-service/.env.local" "SUPABASE_SERVICE_ROLE_KEY")
INTERNAL_AUTH_TOKEN=$(get_env_var "$ROOT/.env" "INTERNAL_AUTH_TOKEN")
LANGFUSE_SECRET_KEY=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_SECRET_KEY")
LANGFUSE_PUBLIC_KEY=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_PUBLIC_KEY")
LANGFUSE_HOST=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_HOST")

if [ -z "$VOYAGE_API_KEY" ] || [ -z "$ANTHROPIC_API_KEY" ] || [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$INTERNAL_AUTH_TOKEN" ]; then
  echo "Error: Required environment variables are missing in .env files."
  exit 1
fi

echo "Applying K8s secrets..."

kubectl create secret generic api-secrets \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --from-literal=VOYAGE_API_KEY="$VOYAGE_API_KEY" \
  --from-literal=INTERNAL_AUTH_TOKEN="$INTERNAL_AUTH_TOKEN" \
  --from-literal=LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-}" \
  --from-literal=LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}" \
  --from-literal=LANGFUSE_HOST="${LANGFUSE_HOST:-https://cloud.langfuse.com}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic supabase-secrets \
  --from-literal=SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secrets applied successfully."
