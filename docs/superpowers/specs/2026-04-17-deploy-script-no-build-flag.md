# deploy.sh 환경 자동 복구 + --no-build 플래그 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**관련 스펙:** `2026-04-17-deploy-script-design.md`

---

## 문제

`scripts/deploy.sh`는 "코드 변경 후 배포" 시나리오만 가정하고 설계되어 다음 두 경우를 처리하지 못한다.

1. **minikube가 중지된 상태에서 실행**
   - `eval $(minikube docker-env)`가 stale context를 반환하거나 실패
   - kubectl 명령이 이전 포트(예: 62591)로 연결을 시도해 모두 실패
   - 사용자가 수동으로 `minikube start`, `minikube update-context`를 실행해야 함

2. **코드 변경 없이 환경만 기동하고 싶은 상황**
   - `docker compose build`가 매번 전체 이미지를 재빌드 → 불필요한 수십 초~수 분 소요
   - `kubectl rollout restart`가 멀쩡한 Pod를 재기동 → CoreDNS 준비 지연 등으로 오히려 장애 유발 가능

"환경만 살리기" 유스케이스는 다음 상황에서 자주 발생한다.
- 맥 재부팅 후 minikube 중지 → UI 접속 불가
- minikube가 수동으로 중지된 상태에서 다시 쓰고 싶을 때
- 포트포워드 프로세스가 죽은 경우

---

## 해결

`deploy.sh`에 두 가지를 추가한다.

1. **minikube 상태 자동 감지 및 복구** — 모든 실행 경로에서 무조건 수행
2. **`--no-build` 플래그** — Docker 빌드와 rollout restart를 생략하는 "환경만 살리기" 모드

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `scripts/deploy.sh` | minikube 상태 체크 로직 추가, `--no-build` 플래그 파싱 추가 |
| `CLAUDE.md` | 배포 규칙에 `--no-build` 사용법 추가 |

`scripts/apply-secrets.sh`는 변경하지 않는다.

---

## deploy.sh 동작 (변경 후)

### 플래그 파싱

```bash
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
```

### 0-pre. minikube 상태 체크 (신규)

```bash
echo "=== 0-pre. Checking minikube status ==="
if ! minikube status --format='{{.Host}}' 2>/dev/null | grep -q "^Running$" \
   || ! minikube status --format='{{.APIServer}}' 2>/dev/null | grep -q "^Running$"; then
  echo "minikube가 중지되어 있거나 API 서버가 내려간 상태입니다. 시작합니다..."
  minikube start
fi

# kubeconfig가 stale인 경우 대비
minikube update-context >/dev/null 2>&1 || true
```

- `Host`와 `APIServer` 둘 다 `Running`이어야 통과
- 둘 중 하나라도 아니면 `minikube start`
- context는 항상 `update-context`로 동기화 (이미 최신이면 no-op)

### 0. 시크릿 적용 (기존 유지)

```bash
echo "=== 0. Applying secrets from .env files ==="
bash "$SCRIPT_DIR/apply-secrets.sh"
```

### 1. minikube Docker env (기존 유지)

```bash
echo "=== 1. Setting minikube Docker env ==="
eval $(minikube docker-env)
```

### 2. Docker 빌드 — `--no-build`일 때 건너뜀

```bash
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
```

### 3. K8s 매니페스트 apply (기존 유지)

```bash
echo "=== 3. Applying K8s manifests ==="
kubectl apply -f k8s/qdrant/
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/query-service/
kubectl apply -f k8s/ui-service/
```

### 4. Rollout — `--no-build`일 때는 조건부

```bash
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
```

- `--no-build` 시에도 `rollout status`는 수행해 Pod가 정상화될 때까지 대기

### 5. 포트포워드 (기존 유지)

기존 로직 그대로. 이미 떠 있는 port-forward를 `pkill`로 정리하고 재설정하므로 "환경만 살리기" 케이스에서도 동일하게 동작한다.

### 6. 헬스체크 (기존 유지)

기존 로직 그대로.

---

## 사용법 (변경 후)

```bash
# 전체 배포 (코드 변경 후) — 기존 동작 유지
bash scripts/deploy.sh

# 특정 서비스만 빌드 + 전체 rollout — 기존 동작 유지
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service

# 환경만 살리기 (코드 변경 없음) — 신규
bash scripts/deploy.sh --no-build
```

어떤 케이스든 minikube가 중지된 상태면 자동으로 기동되므로, 사용자는 minikube 상태를 신경 쓸 필요가 없다.

---

## CLAUDE.md 변경

`## 코드 변경 후 배포 규칙` 섹션을 다음과 같이 확장한다.

```markdown
## 배포 규칙 (MANDATORY)

Claude가 직접 수행한다. 사용자에게 인프라 작업을 요청하지 않는다.

​```bash
# 코드 변경 후 — 전체 빌드 + 재배포
bash scripts/deploy.sh

# 특정 서비스만 빌드 후 배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service

# 코드 변경 없음 — 환경만 복구 (minikube 재기동, Pod 기동 대기, 포트포워드)
bash scripts/deploy.sh --no-build
​```

스크립트가 minikube 상태 체크 → 시크릿 적용 → (옵션) Docker 빌드 → K8s apply → (옵션) rollout → 포트포워드 → 헬스체크를 모두 처리한다.
```

기존 메모리 `feedback_deploy_after_code_change.md`는 "코드 변경 시 자동 수행"을 규정하고 있으므로 변경하지 않는다. `--no-build`는 별개의 운영 시나리오다.

---

## 설계 결정

### 왜 `--no-build` 기본값이 아닌가

현재 기본 동작("코드 변경 후 배포")을 바꾸면 기존 워크플로우와 메모리가 깨진다. 대부분의 배포가 코드 변경을 수반하므로 기본값을 유지하고, "환경만 살리기"는 명시적 플래그로 분리한다.

### 왜 minikube 자동 시작은 플래그가 없는가

minikube가 중지된 상태에서 `deploy.sh`를 실행하면 모든 kubectl 명령이 실패하므로 자동 시작 외에 의미 있는 대안이 없다. 플래그로 분기할 이유가 없다.

### 왜 `--no-build`에서도 `kubectl apply`를 실행하는가

매니페스트가 변경됐을 수 있으므로 apply는 수행한다. apply는 멱등이고 매니페스트에 변화가 없으면 사실상 no-op이다.

### 왜 `--no-build`에서는 `rollout restart`를 생략하는가

`--no-build`는 "현재 Pod 상태를 유지하고 싶다"는 의도다. 무조건 restart하면 이번 세션처럼 CoreDNS 준비 전 재기동돼 장애를 만들 수 있다. Pod가 실제로 문제가 있으면 `rollout status` 타임아웃에서 드러나고, 그때 수동으로 `rollout restart`를 하면 된다.

---

## 검증 기준

- `bash scripts/deploy.sh --no-build`가 minikube 중지 상태에서 실행돼도 정상 완료 (minikube 자동 시작)
- `bash scripts/deploy.sh --no-build` 실행 시간이 기존 `deploy.sh`보다 유의미하게 짧다 (Docker 빌드 생략)
- `bash scripts/deploy.sh --no-build` 실행 후 `http://localhost:3000` HTTP 200, `http://localhost:8081/health` `{"status":"ok"}`
- `bash scripts/deploy.sh` (플래그 없음) 기존 동작과 동일 (빌드 + rollout restart)
- `bash scripts/deploy.sh ui-service` 기존 동작과 동일 (해당 서비스만 빌드 + 전체 rollout)
- `bash scripts/deploy.sh --no-build ui-service` → 플래그와 서비스 인자가 섞여도 `--no-build`가 우선해 빌드 생략 (서비스 인자 무시)
