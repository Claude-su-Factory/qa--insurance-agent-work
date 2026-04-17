# 단일 배포 스크립트 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent

---

## 문제

K8s 배포 시 매번 반복되는 문제:
1. `kubectl apply -f k8s/` 실행 시 secret yaml의 placeholder 값이 적용됨
2. `apply-secrets.sh`로 실제 값을 덮어써도, Pod 재시작 전까지 이전 값 유지
3. 매 배포마다 시크릿 적용 → 빌드 → 롤아웃 → 포트포워드 → 헬스체크 순서를 수동으로 실행해야 함
4. 순서를 빠뜨리거나 까먹으면 placeholder 이슈가 반복됨

---

## 해결

전체 배포 과정을 `scripts/deploy.sh` 하나로 통합한다. placeholder가 적용되는 경로를 제거하고, `.env` 파일이 유일한 시크릿 소스가 되도록 한다.

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `scripts/deploy.sh` | 신규 — 통합 배포 스크립트 |
| `scripts/apply-secrets.sh` | 유지 — deploy.sh가 내부에서 호출 |
| `k8s/query-service/secret.yaml` | 삭제 — placeholder 제거 |
| `k8s/supabase-secret.yaml` | 삭제 — placeholder 제거 |
| `CLAUDE.md` | 배포 규칙을 `bash scripts/deploy.sh` 한 줄로 단순화 |

---

## deploy.sh 동작

```bash
#!/usr/bin/env bash
set -euo pipefail

# 0. 시크릿 최신화 (.env → K8s secrets)
bash scripts/apply-secrets.sh

# 1. minikube Docker 환경
eval $(minikube docker-env)

# 2. 변경된 서비스만 또는 전체 빌드
#    인자가 있으면 해당 서비스만, 없으면 전체
if [ $# -gt 0 ]; then
  for svc in "$@"; do
    docker compose build "$svc"
  done
else
  docker compose build
fi

# 3. K8s 매니페스트 적용 (secret yaml 제외 — apply-secrets.sh가 담당)
kubectl apply -f k8s/qdrant/
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/query-service/
kubectl apply -f k8s/ui-service/

# 4. 롤아웃 재시작
kubectl rollout restart deployment/ingestion-service deployment/query-service deployment/ui-service
kubectl rollout status deployment/ingestion-service --timeout=90s
kubectl rollout status deployment/query-service --timeout=90s
kubectl rollout status deployment/ui-service --timeout=90s

# 5. 포트포워드 재설정
pkill -f "kubectl port-forward" 2>/dev/null || true
sleep 1
kubectl port-forward svc/ingestion-service 8081:8081 &>/tmp/pf-ingestion.log &
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
sleep 3

# 6. 헬스체크
echo "=== Health Check ==="
curl -s http://localhost:8081/health
echo ""
echo "UI: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
echo "=== Deploy Complete ==="
```

---

## 사용법

```bash
# 전체 배포
bash scripts/deploy.sh

# 특정 서비스만 빌드 + 전체 재배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service
```

---

## CLAUDE.md 배포 규칙 변경

기존 0~4단계를 모두 삭제하고 다음으로 대체:

```markdown
## 코드 변경 후 배포 규칙 (MANDATORY)

코드 변경이 완료되면 Claude가 직접 수행한다.

​```bash
# 전체 배포
bash scripts/deploy.sh

# 특정 서비스만 빌드 후 배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service
​```

스크립트가 시크릿 적용 → Docker 빌드 → K8s 롤아웃 → 포트포워드 → 헬스체크를 모두 처리한다.
```

---

## Secret yaml 삭제 이유

`k8s/query-service/secret.yaml`과 `k8s/supabase-secret.yaml`은 placeholder base64 값을 포함하고 있다. `kubectl apply -f k8s/` 실행 시 이 파일이 적용되면 `apply-secrets.sh`가 설정한 실제 값을 덮어쓴다. 이 파일을 삭제하면 placeholder가 적용되는 경로 자체가 사라진다. 시크릿은 오직 `apply-secrets.sh`를 통해서만 생성/갱신된다.

---

## 검증 기준

- `bash scripts/deploy.sh` 한 번 실행으로 모든 서비스가 실제 API 키로 정상 동작
- minikube 재시작 후에도 `bash scripts/deploy.sh`만 실행하면 placeholder 없이 정상 배포
- 특정 서비스만 빌드 시 해당 서비스만 Docker 빌드되고 전체 롤아웃
- K8s 매니페스트 디렉토리에 secret yaml이 없음
