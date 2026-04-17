# CLAUDE.md — 보험 약관 QA Agent

## 프로젝트 개요

Go + TypeScript 마이크로서비스 기반 보험 약관 QA Agent.
AI Backend Engineer 포트폴리오 프로젝트.

```
ingestion-service/   Go + Fiber  — PDF 파싱 → Voyage AI 임베딩 → Qdrant 저장
query-service/       TypeScript + Hono + LangGraph.js — multi-step reasoning Agent
ui-service/          Next.js 14 + Tailwind — 3분할 대시보드 UI
k8s/                 minikube K8s 배포 매니페스트
```

## 개발 실행 방식

구현 계획 실행 시 **항상 Subagent-Driven 방식**을 사용한다.

- `superpowers:subagent-driven-development` 스킬을 호출한다
- Task마다 새 서브에이전트를 디스패치하고, 스펙 리뷰 → 코드 퀄리티 리뷰 2단계 검토를 거친다
- Inline Execution은 사용하지 않는다

## 기술 스택 & 설정

| 서비스 | 언어 | 설정 파일 |
|--------|------|-----------|
| ingestion-service | Go 1.23 + Fiber v2 | `config.toml` (비민감), `.env` (API 키) |
| query-service | TypeScript 5 + Hono | `.env` |
| ui-service | Next.js 14 | `.env.local` |

- 벡터 DB: Qdrant v1.9.2 (포트 6333)
- LLM: Claude claude-sonnet-4-6 (Anthropic API)
- 임베딩: Voyage AI voyage-2
- K8s: minikube (로컬), `eval $(minikube docker-env)` 필요

## 로컬 개발

```bash
# 전체 스택 실행
docker compose up -d

# UI 접근 (K8s)
kubectl port-forward svc/ui-service 3000:3000 &
# → http://localhost:3000
```

## 코드 변경 후 배포 규칙 (MANDATORY)

코드 변경이 완료되면 **반드시** 아래 순서를 Claude가 직접 수행한다. 사용자에게 인프라 작업을 요청하지 않는다.

### 0. 시크릿 최신화 (항상 먼저 실행)

시크릿은 `.env` 파일을 원천으로 자동 관리되므로, 배포 전 반드시 실행합니다.

```bash
bash scripts/apply-secrets.sh
```

### 1. minikube Docker 환경 설정

```bash
eval $(minikube docker-env)
```

minikube가 미실행 상태면 먼저 시작한다:

```bash
minikube start --driver=docker
eval $(minikube docker-env)
```

### 2. Docker 이미지 재빌드

변경된 서비스만 재빌드하거나 전체 빌드:

```bash
# 전체 재빌드
docker compose build

# 특정 서비스만
docker compose build ingestion-service
docker compose build ui-service
```

### 3. K8s 롤아웃 재시작

변경된 서비스에 대해 실행:

```bash
kubectl rollout restart deployment/<service-name>
kubectl rollout status deployment/<service-name> --timeout=60s
```

### 4. 헬스체크로 정상 배포 확인

포트포워드 후 응답 확인:

```bash
kubectl port-forward svc/ingestion-service 8081:8081 &>/tmp/pf-ingestion.log &
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
sleep 3
curl -s http://localhost:8081/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 적용 범위

- ingestion-service 변경 → ingestion-service 재빌드 + 롤아웃
- query-service 변경 → query-service 재빌드 + 롤아웃
- ui-service 변경 → ui-service 재빌드 + 롤아웃
- 여러 서비스 동시 변경 → 해당 서비스 모두 재빌드 + 롤아웃

## 핵심 설계 결정

- **PDF 파싱**: `github.com/dslipak/pdf` (ledongthuc/pdf는 Go 1.24+ 필요)
- **진행 상황 전달**: Polling 방식 (`/ingest/status/{jobId}`, 1초 간격)
- **상태 관리**: React Context (AppContext)
- **LangGraph conditional edge**: `claim_eligibility` 질문만 tools_agent 거침
- **Qdrant**: REST API 사용 (gRPC 아님, 포트 6333)

## 스펙 & 계획 위치

```
docs/superpowers/specs/   — 설계 문서
docs/superpowers/plans/   — 구현 계획
```
