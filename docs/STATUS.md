# 프로젝트 구현 상태

**마지막 업데이트:** 2026-04-19
**현재 추천 다음 작업:** 미정 — `model-service` 스코프 제외(2026-04-19). Tier 2 진행 or 프로젝트 마감 선택 대기

---

## Phase별 진행도

### Phase 0 — 기반 구축 ✅

- [x] Go + TS 마이크로서비스 구조 (`ingestion-service`, `query-service`, `ui-service`)
- [x] Qdrant 연동 (임베딩 저장/검색, REST API)
- [x] Voyage AI 임베딩 (voyage-2, 1024차원)
- [x] Claude API 연동 + prompt caching
- [x] PDF 파싱 (`github.com/dslipak/pdf`)
- [x] 슬라이딩 윈도우 청킹 (512 tokens, 50 overlap)
- [x] Docker compose + minikube K8s 매니페스트
- [x] 3분할 대시보드 UI (Next.js 14 + Tailwind)

### Phase 1 — Auth + 사용자 격리 ✅

- [x] Supabase Auth 통합 (Google OAuth)
- [x] ui-service가 유일한 JWT 검증 진입점 (Edge 패턴)
- [x] Qdrant payload에 `user_id` 추가 + 검색 시 필터
- [x] Supabase `documents` 테이블로 사용자별 문서 관리
- [x] callback 리다이렉트 호스트 헤더 기반 처리

### Phase 2 — Agent 고도화 + LLMOps ✅

- [x] LangGraph AgentState에 `retryCount`, `gradingScore` 추가
- [x] grader 노드 (Claude Haiku 채점, 실패 시 fallback)
- [x] query_rewriter 노드 (검색 실패 복구)
- [x] 조건부 엣지로 self-correction 루프 (점수<2 → rewriter → retriever)
- [x] Langfuse 클라우드 트레이싱 (각 노드 span 기록)
- [x] X-Internal-Token 미들웨어 (Go Fiber + TS Hono, `/health` 예외)
- [x] ui-service → 백엔드 호출 시 X-Internal-Token 헤더 전달
- [x] Qdrant payload index (`user_id`, `document_id`)

### Phase 3 — 운영 준비 🔄 (진행 중)

- [x] 약관별 채팅 분리 (document_id 기반 세션 격리)
- [x] Supabase에 채팅/근거조항 영속 저장
- [x] 문서 상태 관리 (processing/ready/failed)
- [x] 랜딩 페이지 + `/dashboard` 분리 (비로그인 공개)
- [x] SEO 메타데이터, sitemap, robots.txt, JSON-LD
- [x] AdSense 슬롯 (근거 조항 패널 하단, CLS 방지)
- [x] Privacy/Terms 페이지 (AdSense 컴플라이언스)
- [x] `.dockerignore` 추가 (3개 서비스)
- [x] 통합 `deploy.sh` (시크릿 → 빌드 → 롤아웃 → 포트포워드 → 헬스체크)
- [x] `deploy.sh --no-build` + minikube 자동 복구 (2026-04-17)
- [x] 프로젝트 하네스 문서화 (STATUS/ROADMAP/ARCHITECTURE, 2026-04-17)
- [x] Railway 클라우드 실배포 + Doppler 시크릿 sync + GitHub Actions CI/CD (2026-04-19)

### Phase 4 — JD 갭 보완 ⏳ (예정)

우선순위 및 상세는 `docs/ROADMAP.md` 참조. YAGNI 원칙으로 스케일 인프라(Redis, 메시지 큐, k6)는 드롭.

Tier 1 (최우선)
- [x] 자동 Evaluation 파이프라인 (백그라운드 자동화, Supabase 기반, node-cron 스케줄)
- [x] 쿼리 진행 상태 UX + 중복 요청 방지 (비동기 + SSE, 단계별 진행바) (SSE 전환 완료)
- [x] Agent 고도화 (축소 Supervisor 패턴 적용, 2026-04-18)
- [x] Railway 클라우드 실배포 + CI/CD 자동화 (2026-04-19)
- ~~`model-service` (Phi-3 CPU 양자화 자체 서빙)~~ — 스코프 제외 (2026-04-19)

Tier 2 (LLMOps 심화)
- [ ] 프롬프트 버전 관리 + A/B (Langfuse Prompts)
- [ ] 비용/품질 대시보드 (Langfuse Dashboard)

Tier 3 (선택적 차별화)
- [ ] Elasticsearch 하이브리드 검색 (BM25 + dense vector)

---

## 서비스별 현재 상태

| 서비스 | 역할 | 주요 엔드포인트 | 핵심 의존성 | 상태 |
|---|---|---|---|---|
| ingestion-service | PDF 업로드 → 청킹 → 임베딩 → Qdrant 저장 | `POST /ingest`, `GET /ingest/status/{jobId}`, `GET /health` | Qdrant, Voyage AI, Supabase | ✅ 운영 |
| query-service | LangGraph 기반 QA Agent | `POST /query`, `GET /health` | Qdrant, Anthropic, Voyage AI, Langfuse | ✅ 운영 |
| ui-service | 랜딩, 대시보드, API 라우트 프록시 | `/`, `/dashboard`, `/api/*`, `/api/health` | Supabase, query-service, ingestion-service | ✅ 운영 |
| qdrant | 벡터 DB | `:6333` (REST) | — | ✅ 운영 |

---

## 최근 변경 이력

| 날짜 | 변경 | 관련 스펙 |
|---|---|---|
| 2026-04-19 | `model-service` (Phi-3 CPU 양자화) 스코프 제외 확정. JD "AI 모델 서빙 / 경량화" 항목 ❌ 유지. | — |
| 2026-04-19 | Railway 실배포 + CI/CD 자동화 (3 service Hobby, Doppler ↔ Railway sync, GitHub Actions 6 job, main push → auto-deploy, Qdrant Cloud + Langfuse Cloud 활성). Live: https://ui-service-production-4cab.up.railway.app | `2026-04-18-railway-deployment.md` |
| 2026-04-18 | Supervisor 패턴 + Hierarchical Team (retrieval_team, answer_team subgraph) | `2026-04-18-supervisor-pattern.md` |
| 2026-04-18 | 쿼리 진행 상태 SSE 전환 (폴링 제거, EventSource + EventEmitter pub/sub, eval runner SSE 구독) | `2026-04-17-query-sse.md` |
| 2026-04-17 | 쿼리 진행 상태 UX + 중복 요청 방지 (POST 비동기 + /status 폴링, QueryProgress 컴포넌트, 409 in-flight) | `2026-04-17-query-progress-ux.md` |
| 2026-04-17 | Evaluation 파이프라인 완전 자동화 (Supabase 4테이블, node-cron 주1회, snapshot side-effect, auto-promote) | `2026-04-17-eval-background-automation.md` |
| 2026-04-17 | `supabase/migrations/` 스키마 관리 체계 도입 (Railway 배포 대비) | 신규 체계 |
| 2026-04-17 | 프로젝트 하네스 문서화 (CLAUDE.md 확장 + STATUS/ROADMAP/ARCHITECTURE 생성) | `2026-04-17-project-harness.md` |
| 2026-04-17 | `deploy.sh --no-build` + minikube 자동 복구 | `2026-04-17-deploy-script-no-build-flag.md` |
| 2026-04-17 | Phase 2 배포 — self-correction + Langfuse + X-Internal-Token | `2026-04-16-auth-agent-llmops-design.md` |
| 2026-04-17 | 랜딩 페이지 + SEO + AdSense | `2026-04-17-landing-seo-adsense-design.md` |
| 2026-04-17 | 약관별 채팅 분리 + 데이터 모델 개선 | `2026-04-17-document-scoped-chat-design.md` |
| 2026-04-17 | 통합 `deploy.sh` + placeholder secret yaml 제거 | `2026-04-17-deploy-script-design.md` |
| 2026-04-17 | K8s 시크릿 자동화 (`apply-secrets.sh`) | `2026-04-17-k8s-secret-automation-design.md` |
| 2026-04-16 | UI 리디자인 (3분할 대시보드) | `2026-04-16-ui-redesign-design.md` |
| 2026-04-16 | Auth + Agent + LLMOps 설계 (Phase 1/2 스펙 확정) | `2026-04-16-auth-agent-llmops-design.md` |
| 2026-04-15 | 프로젝트 초기 설계 (MSA 구조, 기술 스택 선정) | `2026-04-15-insurance-qa-agent-design.md` |

상세 커밋 이력은 `git log`에서 확인.
