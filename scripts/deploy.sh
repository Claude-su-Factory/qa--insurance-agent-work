#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "=== 0. Applying secrets from .env files ==="
bash "$SCRIPT_DIR/apply-secrets.sh"

echo "=== 1. Setting minikube Docker env ==="
eval $(minikube docker-env)

echo "=== 2. Building Docker images ==="
cd "$ROOT"
if [ $# -gt 0 ]; then
  for svc in "$@"; do
    echo "  Building $svc..."
    docker compose build "$svc"
  done
else
  docker compose build
fi

echo "=== 3. Applying K8s manifests ==="
kubectl apply -f k8s/qdrant/
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/query-service/
kubectl apply -f k8s/ui-service/

echo "=== 4. Rolling out deployments ==="
kubectl rollout restart deployment/ingestion-service deployment/query-service deployment/ui-service
kubectl rollout status deployment/ingestion-service --timeout=90s
kubectl rollout status deployment/query-service --timeout=90s
kubectl rollout status deployment/ui-service --timeout=90s

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
