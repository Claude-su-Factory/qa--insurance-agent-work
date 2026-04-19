# Insurance QA Agent

[![CI](https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions/workflows/ci.yml/badge.svg)](https://github.com/Claude-su-Factory/qa--insurance-agent-work/actions/workflows/ci.yml)

**Live demo:** https://ui-service-production-4cab.up.railway.app

Go + TypeScript 마이크로서비스 기반 보험 약관 QA Agent.

```
ingestion-service/   Go + Fiber  — PDF 파싱 → Voyage AI 임베딩 → Qdrant 저장
query-service/       TypeScript + Hono + LangGraph.js — multi-step reasoning Agent
ui-service/          Next.js 14 + Tailwind — 3분할 대시보드 UI
k8s/                 minikube K8s 배포 매니페스트
```

## 배포

프로덕션은 Railway가 자동 수행. `main` push → GitHub Actions 6 job (3 test + 3 docker-build matrix) 통과 → Railway 3 service 자동 재배포.

- 시크릿: Doppler (`prd_ingestion` / `prd_query` / `prd_ui`) → Railway 자동 sync. 저장소에 값 없음
- 서비스 간 URL: Railway private domain (`http://<svc>.railway.internal:8080`)
- Health: ingestion/query `/health`, ui `/api/health`

로컬 개발:

```bash
docker compose up -d
# → UI: http://localhost:3000
```

`scripts/deploy.sh` 및 `scripts/apply-secrets.sh`는 레거시 minikube 흐름 증빙용 (프로덕션엔 사용 안 함).

## 서비스 스펙

- 마이크로서비스: Go(Fiber) + TS(Hono) + Next.js 14 폴리글랏
- 벡터 DB: Qdrant (payload index + user_id 필터로 사용자 격리)
- Agent 아키텍처: LangGraph.js Supervisor 패턴 + Hierarchical Team (retrieval_team / answer_team subgraph)
- Self-correction: grader (Claude Haiku 채점) + query_rewriter 조건부 엣지 사이클
- 실시간 스트리밍: SSE 기반 노드 단위 진행 상태 push (`graph.stream` subgraphs 모드)
- 인증/보안: Supabase Auth (Google OAuth) + ui-service Edge 패턴 (JWT 단일 진입점) + X-Internal-Token 미들웨어
- LLMOps: Langfuse Cloud 트레이싱 + 자동 Evaluation 파이프라인 (Supabase 4 테이블 + node-cron 주1회 + bootstrap baseline + auto-promote)
- 클라우드 배포: Railway Hobby 3 service + Doppler 시크릿 sync + 서비스 간 private domain
- CI/CD: GitHub Actions 6 job (test + docker-build matrix), `main` push → auto-deploy (사람 개입 0)
- Docker/K8s: Dockerfile 빌더 + minikube 매니페스트 (레거시 증빙)
- 비용 최적화: Claude prompt caching + 시스템 프롬프트 캐시 적중

## ⏳ 예정 (JD 갭 보완)

- AI 모델 경량화 & 자체 서빙: Phi-3-mini Q4_K_M GGUF → grader 교체 (llama.cpp/Ollama, CPU 양자화)
- 프롬프트 버전 관리 + A/B (Langfuse Prompts)
- 비용/품질 대시보드 (Langfuse Dashboard)

## 데이터베이스 스키마 (Supabase Postgres)

실제 코드에서 사용하는 테이블은 6개다. 전체 DDL은 `supabase/migrations/` 아래에 번호 순서로 관리되며, 새 환경 부트스트랩 시 Supabase Studio SQL Editor에 순서대로 붙여넣어 실행한다.

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  chunk_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, filename)
);
create index documents_user_id_idx on documents (user_id);
create index documents_created_at_idx on documents (created_at desc);
```

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
create index messages_document_id_idx on messages (document_id);
create index messages_created_at_idx on messages (created_at);
```

```sql
create table eval_snapshots (
  id uuid primary key default gen_random_uuid(),
  question_hash text not null unique,
  question text not null,
  user_id uuid not null,
  document_id uuid not null,
  category text not null,
  baseline_answer text not null,
  baseline_citations jsonb not null,
  baseline_retrieved_clauses jsonb not null,
  baseline_grader_score int not null,
  source_trace_id text,
  created_at timestamptz not null default now()
);
create index eval_snapshots_category_idx on eval_snapshots (category);
create index eval_snapshots_created_at_idx on eval_snapshots (created_at desc);
```

```sql
create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running', 'completed', 'failed')),
  dataset_size int not null default 0,
  aggregate jsonb,
  by_category jsonb,
  has_regression boolean default false,
  error text
);
create index eval_runs_started_at_idx on eval_runs (started_at desc);
```

```sql
create table eval_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references eval_runs(run_id) on delete cascade,
  snapshot_id uuid not null references eval_snapshots(id) on delete cascade,
  answer text,
  retrieved_clauses jsonb,
  scores jsonb not null,
  error text,
  created_at timestamptz not null default now()
);
create index eval_run_items_run_id_idx on eval_run_items (run_id);
```

```sql
create table eval_baselines (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references eval_runs(run_id),
  aggregate jsonb not null,
  by_category jsonb not null,
  approved_at timestamptz not null default now(),
  approved_by text not null default 'auto' check (approved_by in ('auto', 'manual'))
);
create index eval_baselines_approved_at_idx on eval_baselines (approved_at desc);
```

```sql
grant all on eval_snapshots, eval_runs, eval_run_items, eval_baselines to service_role;
```