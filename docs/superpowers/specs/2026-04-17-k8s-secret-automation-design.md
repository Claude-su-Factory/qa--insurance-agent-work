# K8s 시크릿 자동화 설계 문서 (v1.1)

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**상태:** 검토 완료 (Reviewer 전용 모드 적용)

---

## 문제

minikube 재시작 시 `k8s/*/secret.yaml`이 재적용되면서 placeholder base64 값이 들어가 실제 API 키가 사라진다. 이후 배포할 때마다 개발자가 수동으로 `kubectl create secret`을 재실행해야 하는 번거로움이 있다.

---

## 해결 방향

`.env` 파일들을 읽어 K8s 시크릿을 자동 생성/갱신하는 스크립트(`scripts/apply-secrets.sh`)를 만들고, CLAUDE.md의 배포 규칙에 포함시킨다. Bash `source` 방식의 부작용을 피하기 위해 안전한 파싱 함수를 사용하며, K8s 환경변수명과 일치시킨다.

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `scripts/apply-secrets.sh` | 신규 — `.env` 파일에서 키 읽어 K8s 시크릿 적용 (안전한 파싱 적용) |
| `CLAUDE.md` (프로젝트) | 배포 규칙 0단계에 `apply-secrets.sh` 실행 추가 |
| `k8s/query-service/secret.yaml` | 주석 추가 — "수동 수정 금지. scripts/apply-secrets.sh 사용" |
| `k8s/supabase-secret.yaml` | 주석 추가 — "수동 수정 금지. scripts/apply-secrets.sh 사용" |

---

## 스크립트 동작 (`scripts/apply-secrets.sh`)

1. `get_env_var` 함수를 통해 각 서비스의 `.env` 파일에서 필요한 키만 안전하게 추출
2. 필수 변수(`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` 등) 존재 여부 검증
3. `kubectl apply`를 사용하여 멱등성(Idempotency) 있게 시크릿 갱신

```bash
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
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secrets applied successfully."
```

---

## CLAUDE.md 배포 규칙 변경

기존 "코드 변경 후 배포 규칙"의 Step 1 앞에 다음 단계 추가:

```markdown
### 0단계 — 시크릿 최신화 (항상 먼저 실행)

시크릿은 `.env` 파일을 원천으로 자동 관리되므로, 배포 전 반드시 실행합니다.
```bash
bash scripts/apply-secrets.sh
```
```

---

## 검증 기준

- `scripts/apply-secrets.sh` 실행 시 누락된 키가 있으면 `exit 1`과 에러 메시지 출력 여부
- `kubectl get secret api-secrets -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d`가 실제 키와 일치하는지 확인
- `ui-service`의 `NEXT_PUBLIC_SUPABASE_URL`이 시크릿을 통해 정상 주입되는지 확인
