# 프로젝트 로드맵

**마지막 업데이트:** 2026-04-18
**현재 추천 다음 작업:** Agent 고도화 (Evaluation baseline 확인 후 옵션 A/B/C 중 선택)

---

## 타겟 JD 매핑

타겟 포지션: **AI Backend Engineer (5년 이상 경력)**

### 주요 업무

| JD 항목 | 상태 | 커버하는 기능 |
|---|---|---|
| Agent 기반 제품 설계 및 개발 | ✅ | LangGraph self-correction (grader + rewriter). **Agent 고도화로 심화 예정** |
| Agentic 아키텍처 전략적 활용 | ✅ | 조건부 엣지, 멀티 노드 구성, 툴 에이전트 |
| 기존 AI 서비스, LLMOps 운영 고도화 | ⚠️ 부분 | Langfuse 트레이싱은 있으나 자동 평가 미흡. **Evaluation 파이프라인 예정** |

### 필수 자격

| JD 항목 | 상태 | 현재 |
|---|---|---|
| 백엔드 (Python, Java, Go, Node.js) | ✅ | Go(Fiber) + TS(Hono) 폴리글랏 |
| DB 다양성 (MySQL, Redis, Elasticsearch 등) | ⚠️ | Qdrant + Supabase(Postgres). 스케일 인프라는 YAGNI 기준으로 추가 안 함 |
| AI 서비스 설계→개발→운영 전 과정 | ✅ | 설계 문서부터 배포 스크립트까지 |
| AI 모델 서빙 프레임워크 (vllm, sglang, TensorRT-LLM) | ❌ | 외부 API만. **model-service 예정 (CPU 양자화)** |
| AI Agent 프레임워크 (LangChain, LangGraph) | ✅ | LangGraph self-correction |
| 클라우드 (AWS, Azure) | ❌ | 로컬 minikube만. **Railway 예정** |
| Docker/K8s/MSA | ✅ | 구축 완료 |
| 팀 협업/의사소통 | ⚠️ | 문서화(스펙/STATUS/ROADMAP/ARCHITECTURE)로 간접 증빙 |

### 우대사항

| JD 항목 | 상태 | 현재 |
|---|---|---|
| 시스템 아키텍처 설계 및 구축 | ✅ | MSA 분리 + 명시적 설계 문서(ARCHITECTURE.md) |
| 금융업 설계/개발/운영 | ✅ | 보험 도메인 선택 |
| AI 모델 경량화 | ❌ | **model-service에서 CPU 양자화로 커버 예정** |

---

## 설계 원칙

**YAGNI.** "가상의 대규모 트래픽"을 가정한 스케일 인프라(Redis, 메시지 큐, 부하 테스트)는 추가하지 않는다. 포트폴리오 규모에선 오버엔지니어링이 오히려 약점이다. 대신 **JD 요구사항에 직접 매칭되는 산출물(아티팩트)**을 만드는 작업에 집중한다.

드롭된 후보 (YAGNI):
- ~~Redis (캐싱, 레이트 리미팅, job 상태)~~
- ~~메시지 큐 (Redis Streams / Kafka)~~
- ~~k6 부하 테스트~~

---

## Tier 1 — JD 필수 갭 & 주요업무 직결 (최우선)

### 0. 쿼리 진행 상태 UX + 중복 요청 방지 ✅ 완료 (2026-04-17, 2026-04-18 SSE 전환)
**JD 매핑:** 시스템 아키텍처 설계 (우대), AI 서비스 운영 (필수)

**최종 구조**
- 진행 상태 전송: SSE (`GET /query/stream/:jobId`), 쿼리 1건당 HTTP 연결 1회
- POST `/query` → 202 + jobId (비동기), 클라이언트는 EventSource로 단방향 구독
- LangGraph `graph.stream()`으로 노드 단위 진행 추적
- totalSteps는 질문 유형별 동적 결정 (5 or 6)
- 재시도 시 progressIndex 유지, label만 변경 (역주행 방지)
- 중복 방지: 클라이언트 disabled + 서버 409 + 기존 jobId로 폴링 복귀
- in-memory JobRegistry (TTL 5분, replica=1 전제)

### 1. 자동 Evaluation 파이프라인 ✅ 완료 (2026-04-17)
**JD 매핑:** LLMOps 운영 고도화 (주요 업무)

**최종 구조: 백그라운드 자동화**
- Supabase 4테이블 (`eval_snapshots`, `eval_runs`, `eval_run_items`, `eval_baselines`)
- `query-service/src/eval/` — metrics, runner, supabase-repo, snapshot, worker
- `/query` 핸들러에 snapshot side-effect (grader≥2 자동 적재)
- node-cron 주 1회 (일요일 03:00 UTC) × 10 샘플 × skip-if-no-new-snapshots
- 첫 run이 bootstrap baseline, 이후 회귀 없으면 auto-promote
- 사용자 수작업 0건 — UI에서 질의만 하면 전체 루프 동작

---

### 2. Agent 고도화
**JD 매핑:** Agent 기반 제품 설계 + Agentic 아키텍처 전략적 활용 (주요 업무)

현재 Agent는 단일 그래프. 더 에이전틱하게 확장한다. 3가지 옵션 중 하나 선택.

**옵션 A — 멀티 에이전트 (Supervisor 패턴)**
- Supervisor 에이전트가 하위 에이전트(검색 / 법률 해석 / 요약)에게 작업 분배
- LangGraph Hierarchical Team 패턴
- "Agentic 아키텍처 전략적 활용" 문구에 가장 잘 맞음

**옵션 B — 장기 메모리 (Long-term Memory)**
- 사용자 프로필 + 과거 질의 패턴 기억 → 답변 개인화
- Supabase `user_memory` 테이블 + Agent memory 노드

**옵션 C — 도구 확장**
- 약관 간 비교, 보험료 계산, 용어 사전 등 툴 추가
- tools_agent 역할 확장

**선정 시점:** Evaluation 파이프라인 완료 후 품질 baseline 확인하며 결정

**예상 기간:** 5-7일

---

### 3. model-service (CPU 양자화 자체 서빙)
**JD 매핑:** AI 모델 서빙 프레임워크 (필수), AI 모델 경량화 (우대)

**산출물**
- Phi-3-mini Q4_K_M GGUF → grader 교체
- bge-small-en-v1.5 → 임베딩 교체 (선택)
- 런타임: llama.cpp 또는 Ollama
- Haiku vs Phi-3 품질/비용 비교 표

**예상 기간:** 5-7일

**제약:** Railway CPU 환경 전제 (GPU 없음)

---

### 4. Railway 클라우드 실배포
**JD 매핑:** 클라우드 서비스 (필수)

**범위**
- minikube → Railway 서비스 단위 이전
- 환경변수 + 시크릿 관리 (Railway 플랫폼)
- 도메인 + HTTPS
- (선택) model-service도 함께 배포

**예상 기간:** 2-3일

---

## Tier 2 — LLMOps 심화

### 5. 프롬프트 버전 관리 + A/B
Langfuse Prompts로 `prod` / `exp` 버전 관리, 런타임 grader 점수 기반 A/B 비교.
**예상 기간:** 2일

### 6. 비용/품질 대시보드
grader 점수 일별 추세, 토큰 비용 집계, p50/p95 지연. Langfuse Dashboard 우선.
**예상 기간:** 2-3일

---

## Tier 3 — 선택적 차별화

### 7. Elasticsearch 하이브리드 검색
BM25 + dense vector 결합, RRF 기반. 검색 품질 개선이 명확하면 진행.
**예상 기간:** 4-5일

---

## 추천 실행 순서

1. 하네스 파일화 ✅
2. 자동 Evaluation 파이프라인 ✅
3. **현재 다음**: Agent 고도화 (Evaluation baseline 확인 후 옵션 A/B/C 중 선택)
4. model-service + Railway 배포 (묶어서 진행)
5. Tier 2 → Tier 3 선택
