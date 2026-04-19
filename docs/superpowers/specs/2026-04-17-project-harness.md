# 프로젝트 하네스(상태 문서화) 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent

---

## 문제

세션이 종료되면 Claude는 이전 대화의 맥락을 잃는다. 현재 메모리 시스템(`~/.claude/.../memory/`)은 단편적 정보만 보관하며, 로컬 PC에 종속되어 프로젝트 저장소와 동기화되지 않는다. 새 세션이 열릴 때마다 Claude는 프로젝트의 다음 정보를 파악하지 못한다.

1. 현재 구현이 어디까지 진행됐는지 (완료/진행중/예정)
2. 다음에 무엇을 해야 하는지 (우선순위)
3. 왜 이 기술 선택을 했는지 (설계 결정 이력)
4. 타겟 JD와의 매핑 현황

결과적으로 매 세션마다 `git log`, 파일 탐색, 사용자 질문으로 맥락 재구성이 필요해 시간이 낭비된다.

---

## 해결

프로젝트 저장소 안에 4개의 상태 문서를 두어, 새 세션이 열렸을 때 `CLAUDE.md → STATUS.md → ROADMAP.md → ARCHITECTURE.md` 순서로 읽으면 30초 안에 현황 파악이 되도록 한다. 기존 `docs/superpowers/specs/`, `docs/superpowers/plans/`는 그대로 유지한다 (세부 설계/구현 계획).

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 확장 — 프로젝트 허브(요약 + 네비게이션 링크)로 재구성 |
| `docs/STATUS.md` | 신규 — 구현 상태 스냅샷 |
| `docs/ROADMAP.md` | 신규 — 앞으로의 작업 계획 + JD 매핑 |
| `docs/ARCHITECTURE.md` | 신규 — 시스템 구성 + 주요 설계 결정 이력 |

README.md는 이미 배포 중심으로 작성됐으므로 변경하지 않는다. STATUS/ROADMAP/ARCHITECTURE는 내부 문서다.

---

## 1. CLAUDE.md 재구성

기존 CLAUDE.md(프로젝트 개요, 개발 실행 방식, 기술 스택, 배포 규칙, 핵심 설계 결정, 스펙 위치)를 기반으로 네비게이션 허브 섹션을 추가한다.

### 새 구조

```markdown
# CLAUDE.md — 보험 약관 QA Agent

## 프로젝트 개요
(기존 유지 - Go + TS MSA, AI Backend Engineer 포트폴리오)

## 빠른 네비게이션 (신규)

새 세션을 시작할 때 아래 문서를 순서대로 확인하여 컨텍스트를 복원한다.

1. `docs/STATUS.md` — 현재 어디까지 구현됐나
2. `docs/ROADMAP.md` — 다음 작업은 무엇인가 (JD 매핑 포함)
3. `docs/ARCHITECTURE.md` — 시스템 구성 및 주요 결정 이력
4. `docs/superpowers/specs/` — 기능별 상세 설계
5. `docs/superpowers/plans/` — 기능별 구현 계획

## 타겟 JD (신규)

AI Backend Engineer (5년 이상). 주요 요구사항은 `docs/ROADMAP.md`의 "JD 매핑" 섹션 참조.

## 개발 실행 방식 (기존 유지)
## 기술 스택 (기존 유지)
## 로컬 개발 (기존 유지)
## 배포 규칙 (기존 유지, 최근 업데이트)

## 문서 업데이트 규칙 (MANDATORY, 신규)

기능 구현 완료 시 다음 파일을 반드시 업데이트한다.
- `docs/STATUS.md` — 완료된 기능을 ✅로 표시, 관련 커밋/날짜 기록
- `docs/ROADMAP.md` — 완료된 항목 제거, 다음 작업 재정렬
- `docs/ARCHITECTURE.md` — 아키텍처에 영향을 준 변경만 반영
업데이트 없이 기능 작업이 완료된 것으로 간주하지 않는다.

## 핵심 설계 결정 (기존 유지, 점차 ARCHITECTURE.md로 이관)
## 스펙 & 계획 위치 (기존 유지)
```

---

## 2. docs/STATUS.md

구현 상태 스냅샷. 기능 단위 체크리스트. 매 기능 완료 시 업데이트.

### 구조

```markdown
# 프로젝트 구현 상태

**마지막 업데이트:** YYYY-MM-DD
**다음 작업:** (현재 진행 중 또는 바로 착수할 예정 항목)

---

## Phase별 진행도

### Phase 0 — 기반 구축 ✅
- [x] Go + TS MSA 초기 세팅
- [x] Qdrant 연동 (임베딩 저장/검색)
- [x] Claude API 연동 (prompt caching 포함)
...

### Phase 1 — Auth + 사용자 격리 ✅
- [x] Supabase Auth 통합 (Google OAuth)
- [x] 사용자별 데이터 격리 (user_id 필터)
- [x] X-Internal-Token 내부 인증 미들웨어
...

### Phase 2 — Agent 고도화 + LLMOps ✅
- [x] LangGraph self-correction (grader + rewriter)
- [x] Langfuse 트레이싱
- [x] Qdrant payload indexing
...

### Phase 3 — 운영 준비 🔄
- [x] 통합 deploy.sh + minikube 자동 복구 + --no-build (2026-04-17)
- [x] 랜딩 페이지 + SEO + AdSense
- [x] 약관별 채팅 분리
- [ ] Railway 클라우드 배포
...

### Phase 4 — JD 갭 보완 ⏳ (예정)
- [ ] Redis 도입 (캐싱 + 레이트 리미팅)
- [ ] model-service (Phi-3 + bge 자체 서빙)
- [ ] 자동 Evaluation 파이프라인
...

---

## 서비스별 현재 상태

| 서비스 | 주요 엔드포인트 | 핵심 의존성 | 상태 |
|---|---|---|---|
| ingestion-service | `/ingest`, `/ingest/status/{jobId}`, `/health` | Qdrant, Voyage AI | ✅ 운영 |
| query-service | `/query`, `/health` | Qdrant, Claude, Langfuse | ✅ 운영 |
| ui-service | Next.js 페이지 + API 라우트 | Supabase, 위 서비스들 | ✅ 운영 |

---

## 최근 변경 이력

변경일 기준 역순. 최대 10개만 유지. 더 오래된 건 git log에서 확인.

| 날짜 | 변경 | 관련 스펙 |
|---|---|---|
| 2026-04-17 | deploy.sh --no-build + minikube 자동 복구 | 2026-04-17-deploy-script-no-build-flag.md |
| 2026-04-17 | Phase 2 배포 (self-correction + Langfuse + internal auth) | 2026-04-16-auth-agent-llmops-design.md |
| 2026-04-17 | 랜딩 페이지 + SEO + AdSense | 2026-04-17-landing-seo-adsense-design.md |
| 2026-04-17 | 약관별 채팅 분리 | 2026-04-17-document-scoped-chat-design.md |
...
```

---

## 3. docs/ROADMAP.md

앞으로의 작업 계획. JD 매핑 테이블 + Tier별 작업 목록 + 현재 추천 다음 작업.

### 구조

```markdown
# 프로젝트 로드맵

**마지막 업데이트:** YYYY-MM-DD
**현재 추천 다음 작업:** (한 줄로 명시)

---

## 타겟 JD 매핑

> 상세 JD 원문은 `docs/target-jd.md` (또는 이 문서 부록) 참조.

| JD 항목 | 상태 | 커버하는 기능/Phase |
|---|---|---|
| Agent 기반 제품 설계 | ✅ | LangGraph self-correction |
| LLMOps 운영 | ⚠️ 부분 | Langfuse 트레이싱은 있으나 자동 평가 미흡 |
| 백엔드 (Go, Node.js) | ✅ | ingestion-service(Go), query-service(TS) |
| DB 다양성 (MySQL/Redis/ES) | ❌ | Qdrant + Supabase만. Redis 도입 예정 |
| AI 모델 서빙 (vllm 등) | ❌ | 외부 API만. model-service 예정 |
| AI Agent 프레임워크 | ✅ | LangGraph |
| 클라우드 (AWS/Azure) | ❌ | 로컬 minikube만. Railway 예정 |
| Docker/K8s/MSA | ✅ | 구축 완료 |
| 금융업 (우대) | ✅ | 보험 도메인 |
| 시스템 아키텍처 설계 (우대) | ⚠️ | MSA 분리됨, 이벤트/큐 없음 |
| AI 모델 경량화 (우대) | ❌ | model-service에서 다룰 예정 |

---

## Tier 1 — JD 필수 갭 (최우선)

### Redis 도입
- 질의 응답 캐싱 (user+doc+question 해시 키)
- 임베딩 캐싱 (텍스트 → 벡터)
- Rate limiting (사용자별 분당 N건)
- Ingestion job 상태 저장소
- 예상 기간: 3-4일

### model-service (CPU 양자화 자체 서빙)
- Phi-3-mini Q4_K_M (grader 교체)
- bge-small-en (임베딩 교체)
- 런타임: llama.cpp 또는 Ollama
- 예상 기간: 5-7일
- 제약: Railway RAM 32GB 이내

### Railway 클라우드 배포
- minikube → Railway 서비스 단위 이전
- ElastiCache (Redis) or Railway Redis
- 환경변수 + 시크릿 관리
- 예상 기간: 2-3일

---

## Tier 2 — LLMOps 고도화

### 자동 Evaluation 파이프라인
- Golden Dataset 구축 (30-50건)
- RAGAS 메트릭 (faithfulness, answer relevance, context precision/recall)
- GitHub Actions에서 PR마다 실행
- 예상 기간: 4-5일

### 프롬프트 버전 관리 + A/B
- Langfuse Prompts로 prod/exp 버전 관리
- 예상 기간: 2일

### 비용/품질 대시보드
- grader 점수 일별 추세, 토큰 비용 집계
- Grafana 또는 Langfuse Dashboard
- 예상 기간: 2-3일

---

## Tier 3 — 차별화 (우대사항)

### Elasticsearch 하이브리드 검색
- BM25 + dense vector 결합
- RRF 또는 가중치 평균
- 예상 기간: 4-5일

### 메시지 큐 (Redis Streams)
- Ingestion 비동기화
- 이벤트 기반 아키텍처 증빙
- 예상 기간: 3-4일

### 부하 테스트 (k6)
- p95 지연, 처리량 측정
- README에 수치 명시
- 예상 기간: 2일

---

## 추천 실행 순서

1. **현재**: 하네스 파일화 (본 스펙)
2. **다음**: Redis 도입 (기반 인프라, 이후 작업 여러 곳에서 활용)
3. **그다음**: model-service (경량화 스토리 + JD 서빙 요구사항)
4. **그다음**: 자동 Evaluation (LLMOps 고도화)
5. **그다음**: Railway 배포 (최종 운영 증빙)
```

---

## 4. docs/ARCHITECTURE.md

시스템 구성도 + 주요 설계 결정 이력. 현재 CLAUDE.md의 "핵심 설계 결정" 섹션을 이관하고 확장한다.

### 구조

```markdown
# 아키텍처 문서

**마지막 업데이트:** YYYY-MM-DD

---

## 시스템 구성도

(ASCII 또는 Mermaid 다이어그램)
- ui-service → query-service, ingestion-service
- query-service → Qdrant, Anthropic, Voyage, Langfuse, Supabase
- ingestion-service → Qdrant, Voyage, Supabase

---

## 서비스별 역할

### ingestion-service (Go + Fiber)
...

### query-service (TS + Hono + LangGraph)
- 그래프 구조: classifier → retriever → tools_agent(조건부) → answer → grader → (점수<2면 query_rewriter → retriever 루프)
- 노드 파일: `src/graph/nodes/*.ts`
...

### ui-service (Next.js 14)
...

---

## 인증 흐름

ui-service(Supabase JWT 검증) → query/ingestion-service(X-Internal-Token 검증)
...

---

## 데이터 모델

### Qdrant
- collection: `insurance_clauses`
- vector: Voyage voyage-2 (1024차원)
- payload: `user_id`, `document_id`, `clause_no`, `page`, `doc_name`, `text`
- index: `user_id`, `document_id` (payload index)

### Supabase
- documents, chat_messages, citations (약관별 채팅에서 이관)
...

---

## 주요 설계 결정 이력

각 결정에 **Why** 기록.

### PDF 파싱: github.com/dslipak/pdf 선택
- Why: ledongthuc/pdf는 Go 1.24+ 필요, 현재 Go 1.23 고정
- When: Phase 0

### 진행 상황 전달: Polling (1초 간격)
- Why: SSE보다 구현 단순, 작은 규모엔 충분
- When: Phase 0

### grader 모델: Claude Haiku
- Why: 채점 작업엔 Sonnet 불필요, 비용 최소화
- When: Phase 2
- 향후 변경: model-service 도입 시 Phi-3 CPU 서빙으로 교체 예정

### Qdrant REST API (gRPC 아님)
- Why: Go 클라이언트 안정성, 포트 포워딩 용이
- When: Phase 0

### LangGraph 조건부 엣지
- `claim_eligibility` 질문만 tools_agent 거침
- grader 점수 < 2일 때 query_rewriter 루프
...

### Internal Trust 패턴
- UI만 외부 노출, 내부 서비스는 X-Internal-Token으로만 접근
- Why: 내부 서비스가 직접 외부 공격에 노출되지 않도록 격리
- When: Phase 2
```

---

## CLAUDE.md 문서 업데이트 규칙 (신규 섹션)

기능 구현이 끝나면 **반드시** 다음 순서로 업데이트한다.

1. `docs/STATUS.md` — 해당 기능을 ✅로 이동, "최근 변경 이력"에 한 줄 추가
2. `docs/ROADMAP.md` — 완료 항목 제거, 필요 시 다음 추천 작업 재정렬
3. `docs/ARCHITECTURE.md` — 아키텍처가 변경된 경우에만 업데이트

이 규칙은 코드 변경 완료 후 배포 규칙과 동급으로 취급한다. 업데이트 없이는 작업이 완료된 것으로 간주하지 않는다.

---

## 설계 결정

### 왜 README.md가 아닌 별도 문서인가

README는 외부(포트폴리오 방문자) 대상. STATUS/ROADMAP/ARCHITECTURE는 내부(Claude 및 개발자) 대상. 섞이면 외부에 불필요한 정보(진행 중 작업, 결정 이력)가 노출됨.

### 왜 CLAUDE.md를 허브로 삼는가

CLAUDE.md는 매 세션 자동 로드되는 유일한 파일. 이 안에 다른 문서로의 링크를 두면 Claude가 자연스럽게 확장 컨텍스트를 읽는다.

### 왜 Phase로 구분하는가

현재까지의 커밋 이력을 보면 자연스럽게 Phase 0(기반) → Phase 1(Auth) → Phase 2(Agent/LLMOps) → Phase 3(운영 준비)로 흘러왔다. Phase 4 이후는 JD 갭 보완으로 정의.

### 왜 최근 변경 이력을 최대 10개만 유지하는가

git log가 권위 있는 이력 소스. STATUS.md는 요약 뷰. 중복을 최소화하고 파일이 무거워지지 않게 한다.

---

## 검증 기준

- 새 Claude 세션 시작 시 `CLAUDE.md → STATUS.md → ROADMAP.md` 3개 파일만 읽어도 "지금 어디까지 왔고 다음에 뭘 할지" 파악 가능
- 각 문서에 마지막 업데이트 날짜가 명시되어 있음
- CLAUDE.md에 문서 업데이트 규칙이 MANDATORY로 표시되어 있음
- ARCHITECTURE.md에 주요 설계 결정마다 Why가 기록되어 있음
- 기존 CLAUDE.md의 "핵심 설계 결정" 섹션이 ARCHITECTURE.md로 이관됨 (중복 제거)
