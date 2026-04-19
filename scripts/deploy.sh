#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

NO_BUILD=false
SERVICES=()

for arg in "$@"; do
  case "$arg" in
    --no-build)
      NO_BUILD=true
      ;;
    *)
      SERVICES+=("$arg")
      ;;
  esac
done

echo "=== 0-pre. Checking minikube status ==="
if ! minikube status --format='{{.Host}}' 2>/dev/null | grep -q "^Running$" \
   || ! minikube status --format='{{.APIServer}}' 2>/dev/null | grep -q "^Running$"; then
  echo "minikube가 중지되어 있거나 API 서버가 내려간 상태입니다. 시작합니다..."
  minikube start
fi
minikube update-context >/dev/null 2>&1 || true

echo "=== 0. Applying secrets from .env files ==="
bash "$SCRIPT_DIR/apply-secrets.sh"

echo "=== 1. Setting minikube Docker env ==="
eval $(minikube docker-env)

if [ "$NO_BUILD" = true ]; then
  echo "=== 2. Skipping Docker build (--no-build) ==="
else
  echo "=== 2. Building Docker images ==="
  cd "$ROOT"
  if [ ${#SERVICES[@]} -gt 0 ]; then
    for svc in "${SERVICES[@]}"; do
      echo "  Building $svc..."
      docker compose build "$svc"
    done
  else
    docker compose build
  fi
fi

echo "=== 3. Applying K8s manifests ==="
kubectl apply -f k8s/qdrant/
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/query-service/
kubectl apply -f k8s/ui-service/

if [ "$NO_BUILD" = true ]; then
  echo "=== 4. Ensuring deployments are available (no restart) ==="
  kubectl rollout status deployment/ingestion-service --timeout=90s
  kubectl rollout status deployment/query-service --timeout=90s
  kubectl rollout status deployment/ui-service --timeout=90s
else
  echo "=== 4. Rolling out deployments ==="
  kubectl rollout restart deployment/ingestion-service deployment/query-service deployment/ui-service
  kubectl rollout status deployment/ingestion-service --timeout=90s
  kubectl rollout status deployment/query-service --timeout=90s
  kubectl rollout status deployment/ui-service --timeout=90s
fi

echo "=== 5. Setting up port-forward ==="
pkill -f "kubectl port-forward" 2>/dev/null || true
sleep 1
kubectl port-forward svc/ingestion-service 8081:8081 &>/tmp/pf-ingestion.log &
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
sleep 3

echo "=== 6. Health Check ==="
echo "Ingestion: $(curl -s http://localhost:8081/health)"
echo "UI: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
echo "=== Deploy Complete ==="
