# 보험 약관 QA Agent — Auth / Agent 고도화 / LLMOps 설계 문서

**작성일:** 2026-04-16  
**대상 프로젝트:** insurance-qa-agent  
**목적:** 일반 공개 서비스 전환 + 포트폴리오 강화 (한화생명 AI실 JD 대응)

---

## 배경 및 목표

현재 시스템은 모든 사용자가 동일한 Qdrant 컬렉션을 공유하는 단일 테넌트 구조다. 일반 공개 서비스로 전환하려면 사용자 인증과 데이터 격리가 필수다. 동시에 LangGraph를 단순 파이프라인이 아닌 실제 Agentic 아키텍처로 고도화하고, 운영 관찰성을 확보한다.

---

## 전체 아키텍처

### 인증 게이트웨이 패턴

ui-service가 유일한 외부 진입점이며 Supabase 인증을 검증한다. 내부 서비스(ingestion-service, query-service)는 K8s ClusterIP로 외부 접근이 불가하며, ui-service로부터 `X-User-ID` 헤더를 신뢰한다.

```
[Browser]
    │ Google OAuth
    ▼
[ui-service] ──── Supabase Auth 검증 (JWT)
    │
    │ X-User-ID 헤더 추가
    ├──────────────────────────────┐
    ▼                              ▼
[ingestion-service]         [query-service]
  ClusterIP                   ClusterIP
  user_id → Qdrant payload    user_id → Qdrant 필터링
  user_id → Supabase 문서기록  user_id → LangGraph 메모리

         [Qdrant]
         payload: { user_id, content, document_name, chunk_index }

         [Supabase PostgreSQL]
         ├── auth.users
         ├── documents
         └── checkpoints (Phase 2)

         [Langfuse Cloud] (Phase 2)
```

---

## Phase 1: 서비스 공개 가능한 상태

### 1-1. Supabase 설정

**Google OAuth 설정**
- Supabase 프로젝트 생성
- Authentication → Providers → Google 활성화
- Google Cloud Console에서 OAuth 2.0 클라이언트 생성 후 Client ID/Secret 등록
- Redirect URL: `{SUPABASE_URL}/auth/v1/callback`

**데이터베이스 스키마**

```sql
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_documents_only"
  ON documents FOR ALL
  USING (auth.uid() = user_id);
```

### 1-2. ui-service 변경

**패키지 추가**
- `@supabase/supabase-js`
- `@supabase/ssr`

**신규 파일**
- `app/lib/supabase/client.ts` — 브라우저 클라이언트
- `app/lib/supabase/server.ts` — 서버 클라이언트 (cookies 기반)
- `app/auth/callback/route.ts` — OAuth 콜백 처리
- `app/login/page.tsx` — 로그인 페이지 (Google 로그인 버튼)
- `middleware.ts` — 인증 미들웨어 (비인증 → /login 리다이렉트)

**변경 파일**
- `app/layout.tsx` — 세션 Provider 추가
- `app/page.tsx` — 서버 컴포넌트에서 user 정보 fetch
- `app/api/ingest/route.ts` — `X-User-ID` 헤더 추가
- `app/api/ingest/status/[jobId]/route.ts` — `X-User-ID` 헤더 추가
- `app/api/query/route.ts` — `X-User-ID`, `X-Session-ID` 헤더 추가
- `app/components/LeftPanel.tsx` — 로그아웃 버튼, 문서 목록 Supabase에서 fetch
- `app/context/AppContext.tsx` — user 상태 추가

**인증 흐름**
```
1. 비인증 사용자 → middleware가 /login으로 리다이렉트
2. /login → Supabase Google OAuth 시작
3. Google 인증 완료 → /auth/callback → 세션 저장 → / 리다이렉트
4. 이후 요청: server.ts로 세션 검증 → user_id 추출 → 백엔드 헤더 전달
```

### 1-3. ingestion-service 변경

**`internal/handler/ingest.go`**
- `X-User-ID` 헤더 읽기 (없으면 401 반환)
- Qdrant 포인트 payload에 `user_id` 필드 추가
- 처리 완료 후 Supabase documents 테이블에 INSERT

**`internal/store/store.go`**
- `Upsert()` 시그니처에 `userID string` 파라미터 추가
- payload에 `user_id` 포함

**Supabase 클라이언트 (Go)**
- `internal/supabase/client.go` 신규 생성
- Service Role Key로 documents 테이블 INSERT (RLS 우회)

### 1-4. query-service 변경

**`src/index.ts`**
- `X-User-ID`, `X-Session-ID` 헤더 읽기
- graph.invoke()에 user_id, session_id 전달

**`src/clients/qdrant.ts`**
- `search()` 메서드에 `userId` 파라미터 추가
- Qdrant `filter` 조건: `{ must: [{ key: "user_id", match: { value: userId } }] }`

**`src/graph/state.ts`**
- `userId: Annotation<string>()` 추가
- `sessionId: Annotation<string>()` 추가

**`src/graph/nodes/retriever.ts`**
- `state.userId`를 Qdrant 검색 필터로 전달

### 1-5. 환경변수 추가

**ui-service `.env.local`**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**ingestion-service `.env`**
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**K8s secrets 추가**
- `supabase-secrets` Secret 생성 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- ui-service deployment에 SUPABASE 환경변수 추가
- ingestion-service deployment에 supabase-secrets 마운트

> query-service는 Phase 1에서 Supabase 자격증명 불필요. user_id는 헤더로 수신하며 Qdrant 필터링에만 사용한다. Supabase 연결은 Phase 2(체크포인터) 때 추가한다.

---

## Phase 2: Agent 품질 + 운영 관찰성

### 2-1. LangGraph Self-Correction 루프

**AgentState 추가 필드**

```typescript
retryCount: Annotation<number>({
  default: () => 0,
  reducer: (_, next) => next,
}),
gradingScore: Annotation<number>({
  default: () => 0,
  reducer: (_, next) => next,
}),
```

**grader 노드 (`src/graph/nodes/grader.ts`)**

Claude Haiku로 답변 품질을 채점한다.

```
입력: question, retrievedClauses, answer
출력: gradingScore (1~3), retryCount+1

채점 기준:
  3점 — 약관 조항을 근거로 질문에 명확하게 답변
  2점 — 부분적으로 답변되었으나 근거 조항이 불충분
  1점 — 약관에서 관련 내용을 찾지 못했거나 답변이 부정확
```

**그래프 변경**

```
기존:
START → classifier → retriever → [분기] → tools_agent → answer_generator → citation_formatter → END

변경:
START → classifier → retriever → [분기] → tools_agent ──┐
                         ↑                └──────────────→ answer_generator
                         │                                       ↓
                    (retry, 재검색)                           grader
                         ↑                            ↙ score<2 & retry<2  ↘ 그 외
                         └──────────────────── retriever            citation_formatter → END
```

**조건부 엣지 로직**
```typescript
(state) => {
  if (state.gradingScore < 2 && state.retryCount < 2) return "retriever";
  return "citation_formatter";
}
```

### 2-2. Multi-turn 메모리 (Supabase PostgreSQL 체크포인터)

**패키지 추가**
- `@langchain/langgraph-checkpoint-postgres`

**체크포인터 설정**
```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(
  process.env.SUPABASE_DB_URL!
);
await checkpointer.setup(); // 체크포인트 테이블 자동 생성

const graph = buildGraph(voyageClient, qdrantClient, checkpointer);
```

**thread_id 규칙**
```
thread_id = `${userId}:${sessionId}`
```

세션은 ui-service에서 관리하며, 새 대화 시작 시 새 sessionId를 생성한다.

**Supabase에 추가될 테이블** (자동 생성)
- `checkpoints`
- `checkpoint_blobs`
- `checkpoint_writes`

**ui-service 변경**
- ChatPanel에 "새 대화" 버튼 추가
- sessionId를 localStorage 또는 React state로 관리
- 새 대화 시 새 UUID 생성

**환경변수 추가**
```
# query-service
SUPABASE_DB_URL=postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres
```

### 2-3. Langfuse LLMOps

**패키지 추가 (query-service)**
- `langfuse`

**트레이싱 구조**

query-service의 각 그래프 실행을 하나의 trace로 감싼다.

```typescript
// 트레이스 단위: 질문 1건
trace {
  name: "insurance-qa"
  user_id: userId
  session_id: sessionId
  input: question

  span: "classifier" { model, tokens, latency }
  span: "retriever"  { query, results_count }
  span: "tools_agent" { tools_used, model, tokens }
  span: "answer_generator" { model, tokens, latency, cache_hit }
  span: "grader" { score, retry_count, model, tokens }
}
```

**모니터링 지표**
- 질문당 총 토큰 사용량 / 비용
- 노드별 레이턴시
- Self-correction 발생률 (grader score 분포)
- 에러율

**ingestion-service Langfuse (Go)**
- `langfuse-go` 라이브러리 또는 HTTP API 직접 호출
- 트레이스 단위: PDF 1건 인제스천
- 청킹 수, 임베딩 배치 수, 소요 시간 기록

**환경변수 추가**
```
# query-service, ingestion-service
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

---

## UI 변경 요약

| 컴포넌트 | Phase 1 | Phase 2 |
|---|---|---|
| `/login` | Google 로그인 버튼 신규 | — |
| Header | 사용자 프로필/로그아웃 추가 | — |
| LeftPanel | 내 문서만 표시 (Supabase fetch) | — |
| ChatPanel | — | "새 대화" 버튼, 대화 기록 복원 |
| middleware | 비인증 → /login 리다이렉트 | — |

---

## K8s 변경 요약

**Phase 1**
- `k8s/supabase-secrets.yaml` 신규 (SUPABASE_URL, SERVICE_ROLE_KEY)
- ingestion-service deployment — supabase-secrets 마운트
- query-service deployment — supabase-secrets 마운트
- ui-service deployment — SUPABASE 환경변수 추가

**Phase 2**
- query-service deployment — LANGFUSE 환경변수 추가
- ingestion-service deployment — LANGFUSE 환경변수 추가
- query-service deployment — SUPABASE_DB_URL 추가

---

## 포트폴리오 어필 포인트

| JD 요구사항 | 구현 내용 |
|---|---|
| Agentic 아키텍처 전략적 활용 | Self-correction 사이클, 조건부 재시도 루프 |
| LLMOps 운영 고도화 | Langfuse 트레이싱, 토큰/레이턴시/에러 모니터링 |
| AI 서비스 E2E 주도 경험 | 인증부터 RAG, Agent, 모니터링까지 전 과정 |
| MSA + K8s 운영 | 서비스별 secret 격리, ClusterIP 보안 패턴 |
| 금융업 도메인 | 보험 약관 특화 tools (면책조항, 대기기간, 입원일수) |
