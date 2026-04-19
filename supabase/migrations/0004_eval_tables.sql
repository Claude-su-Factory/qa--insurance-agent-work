-- 0004_eval_tables.sql
-- Evaluation 파이프라인용 4개 테이블.
-- 관련 스펙: docs/superpowers/specs/2026-04-17-eval-background-automation.md

-- eval_snapshots: 실사용 질의에서 누적된 베이스라인 소스
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

-- eval_runs: 각 eval 실행의 집계 결과
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

-- eval_run_items: run당 per-item 상세 결과
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

-- eval_baselines: 승인된 baseline (최신이 현재 기준)
create table eval_baselines (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references eval_runs(run_id),
  aggregate jsonb not null,
  by_category jsonb not null,
  approved_at timestamptz not null default now(),
  approved_by text not null default 'auto' check (approved_by in ('auto', 'manual'))
);
create index eval_baselines_approved_at_idx on eval_baselines (approved_at desc);

-- service_role 권한 부여 (SQL Editor에서 직접 CREATE TABLE한 경우 기본 GRANT 누락될 수 있음)
grant all on eval_snapshots to service_role;
grant all on eval_runs to service_role;
grant all on eval_run_items to service_role;
grant all on eval_baselines to service_role;
