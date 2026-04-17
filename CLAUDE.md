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

코드 변경이 완료되면 Claude가 직접 수행한다. 사용자에게 인프라 작업을 요청하지 않는다.

```bash
# 전체 배포 (시크릿 → 빌드 → 롤아웃 → 포트포워드 → 헬스체크)
bash scripts/deploy.sh

# 특정 서비스만 빌드 후 배포
bash scripts/deploy.sh ui-service
bash scripts/deploy.sh ingestion-service query-service
```

스크립트가 `.env` 파일에서 시크릿 적용 → Docker 빌드 → K8s 롤아웃 → 포트포워드 → 헬스체크를 모두 처리한다. K8s secret yaml은 존재하지 않으며, 시크릿은 오직 `.env` 파일 → `apply-secrets.sh`를 통해서만 생성된다.

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
