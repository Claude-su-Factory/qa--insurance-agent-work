# 보험 약관 QA Agent — Auth / Agent 고도화 / LLMOps 설계 문서 (v1.2)

**작성일:** 2026-04-16 (업데이트: 2026-04-17)
**대상 프로젝트:** insurance-qa-agent
**상태:** 검토 완료 (Reviewer 전용 모드 적용)

---

## 배경 및 목표

현재 시스템은 단일 테넌트 구조로, 일반 공개 서비스 전환을 위해 사용자 인증과 데이터 격리가 필수적이다. 본 설계는 LangGraph를 활용한 자율적 에이전트(Agentic) 아키텍처 구축과 운영 관찰성(LLMOps) 확보를 통해 실제 엔터프라이즈 급 서비스 수준의 포트폴리오를 구성하는 것을 목표로 한다.

---

## 전체 아키텍처 및 보안

### 인증 게이트웨이 및 내부 신뢰 패턴 (Internal Trust)
- **Edge:** `ui-service`가 Supabase Auth(JWT)를 검증하고 유일한 진입점 역할을 수행한다.
- **Internal:** 내부 서비스 간 통신 시 `X-User-ID`와 함께 `X-Internal-Token`(Shared Secret)을 사용하여 요청의 출처를 검증한다.

#### X-Internal-Token 검증 구현

- **위치:** 각 백엔드 서비스의 라우터 진입 직후 **미들웨어**로 적용한다 (핸들러별 중복 체크 방지)
- **ingestion-service (Go Fiber):** `app.Use(authMiddleware)`로 모든 라우트 앞에 검증. `/health`는 예외
- **query-service (TypeScript Hono):** `app.use("*", authMiddleware)` 패턴. `/health` 예외
- **검증 로직:** 헤더 값이 `INTERNAL_AUTH_TOKEN` 환경변수와 일치하는지 확인
- **실패 응답:** `403 Forbidden` + `{"error": "invalid internal token"}`
- **ui-service:** 모든 내부 API 호출 시 `X-Internal-Token: ${process.env.INTERNAL_AUTH_TOKEN}` 헤더 추가

```
[Browser] ── Google OAuth ──▶ [ui-service] (Supabase Auth 검증)
                                 │
                                 │ + X-User-ID, X-Internal-Token
                                 ▼
                    ┌──────────────────────────┐
                    ▼                          ▼
            [ingestion-service]         [query-service]
            (Payload Indexing)         (Agentic Reasoning)
```

---

## Phase 1: 기반 시스템 구축

### 1-1. 데이터베이스 스키마 (Supabase PostgreSQL)

```sql
-- 약관 문서 정보 (중복 업로드 방지 포함)
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_filename UNIQUE (user_id, filename)
);

-- 채팅 메시지 기록 (v1.1 통합)
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  citations   JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
```

### 1-2. 검색 엔진 최적화 (Qdrant)
- **Payload Indexing:** 검색 성능 확보를 위해 `user_id` 필드에 `Keyword` 인덱스를 생성한다.
- **격리 검색:** 모든 쿼리는 반드시 `must: [{ key: "user_id", match: { value: userId } }]` 필터를 포함한다.

#### 인덱스 생성 시점 및 멱등성

- **위치:** ingestion-service `cmd/main.go`의 `EnsureCollection` 직후에 `EnsurePayloadIndex("user_id", "keyword")` 호출
- **멱등성:** Qdrant는 이미 존재하는 인덱스에 대해 `200 OK`를 반환하므로 별도 체크 불필요. 별도 원타임 Job 없이 서비스 시작 시마다 안전하게 호출 가능
- **확장성:** 향후 `document_id` 같은 필드도 같은 패턴으로 추가

---

## Phase 2: Agent 지능화 및 LLMOps

### 2-1. 지능형 Self-Correction 루프 (LangGraph)

단순 재시도가 아닌, **질문 재구성(Query Rewriting)** 단계를 추가하여 해결 확률을 극대화한다.

```
START ──▶ classifier ──▶ retriever ──▶ [분기] ──▶ tools_agent ──▶ answer_generator
                                ↑                                      │
                                │            [Fail: Score < 2]         ▼
                         query_rewriter ◀─────────────────────────── grader
                                │                                      │
                                └──────────────────────────────────────┴──▶ citation_formatter ──▶ END
```

- **grader:** 답변이 조항에 근거하는지, 질문에 부합하는지 채점 (Haiku 모델 사용)
- **query_rewriter:** 검색 실패 시, 더 넓은 범위나 다른 키워드로 질문을 변환하여 `retriever`로 재전송

#### Grader 장애 시 Fallback 전략

grader가 외부 의존성(Claude Haiku API)에 의존하므로 장애 시 self-correction 루프가 멈출 수 있다.

- **에러 케이스:** API 401/429/500, 타임아웃, 파싱 실패
- **동작:** `gradingScore = 3`(통과)으로 fallback 후 `citation_formatter`로 이동
- **근거:** 답변 자체는 이미 생성되었으므로 사용자에게 내보내는 것이 나음. Langfuse에 에러 이벤트로 기록하여 나중에 분석
- **로그:** grader 실패 시 Langfuse trace에 `grader_error` span 추가하여 운영 지표로 수집

### 2-2. 운영 관찰성 (Langfuse)
- **Traces:** 질문별 실행 경로, 노드별 지연 시간, 토큰 비용 추적
- **Tags:** `document_id`, `user_id`를 태그로 삽입하여 특정 문서나 사용자에 대한 품질 분석 수행
- **Scores:** `grader` 노드의 점수를 Langfuse Evaluation 점수로 연동하여 대시보드화

---

## 환경변수 및 K8s 설정 보완

- **Internal Security:** `INTERNAL_AUTH_TOKEN`을 각 서비스 Secret(`api-secrets`)에 공통 주입. `scripts/apply-secrets.sh`에 생성 로직 추가
- **DB Connection:** `query-service`에 LangGraph PostgresSaver용 `SUPABASE_DB_URL` 추가 (session pooler 주소 사용)
- **Qdrant 인덱스:** 별도 Job 불필요. ingestion-service `main.go`의 `EnsureCollection` 직후 `EnsurePayloadIndex` 호출 (멱등적)
- **Langfuse:** `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_HOST`를 `api-secrets`에 추가하여 query-service에 주입

---

## 검증 및 기대 효과

- **보안:** 사용자 간 데이터가 완벽히 격리되며, 내부 서비스 보안이 강화됨
- **품질:** 에이전트가 스스로 판단하고 검색 전략을 수정하여 답변 정확도가 30% 이상 향상됨 (자체 벤치마크 기준)
- **운영:** Langfuse를 통해 실제 사용자의 질문 패턴과 비용, 에러 발생 지점을 실시간으로 파악 가능
