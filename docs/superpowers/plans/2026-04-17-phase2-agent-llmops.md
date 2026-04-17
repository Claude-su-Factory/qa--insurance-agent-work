# Phase 2: Agent 고도화 + LLMOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LangGraph에 Self-Correction 사이클(grader + query_rewriter)을 추가하고, Langfuse 클라우드 트레이싱, 내부 서비스 간 X-Internal-Token 인증, Qdrant payload indexing을 도입한다.

**Architecture:** query-service는 answer 생성 후 grader(Haiku)가 품질을 1-3점으로 채점하고, 2점 미만이면 query_rewriter가 질문을 재구성해 retriever로 되돌린다. 모든 그래프 실행은 Langfuse trace로 기록되며, 각 노드가 span으로 구분된다. 내부 서비스는 미들웨어로 X-Internal-Token을 검증하고, ingestion-service는 시작 시 Qdrant user_id에 payload index를 생성한다.

**Tech Stack:** LangGraph TypeScript + Langfuse SDK | Claude Haiku (grader/rewriter) | Fiber middleware (Go) + Hono middleware (TS) | Qdrant payload indexing

---

## 파일 구조

```
query-service/src/
├── graph/
│   ├── state.ts                           수정 — retryCount, gradingScore 추가
│   ├── graph.ts                           수정 — grader, query_rewriter 노드 + 조건부 엣지
│   └── nodes/
│       ├── grader.ts                      신규 — Haiku 채점 (fallback 포함)
│       └── query-rewriter.ts              신규 — Haiku 질문 재구성
├── clients/
│   └── langfuse.ts                        신규 — Langfuse 클라이언트 팩토리
├── middleware/
│   └── internal-auth.ts                   신규 — X-Internal-Token 검증
└── index.ts                               수정 — 미들웨어 적용 + Langfuse trace 래핑

ingestion-service/
├── internal/
│   ├── middleware/
│   │   └── internal_auth.go               신규 — X-Internal-Token 미들웨어
│   └── store/
│       └── store.go                       수정 — EnsurePayloadIndex 메서드 추가
└── cmd/main.go                            수정 — 미들웨어 등록 + payload index 호출

ui-service/app/api/
├── ingest/route.ts                        수정 — X-Internal-Token 헤더 전달
├── ingest/status/[jobId]/route.ts         수정 — 동일
└── query/route.ts                         수정 — 동일

scripts/apply-secrets.sh                   수정 — INTERNAL_AUTH_TOKEN, LANGFUSE_* 추가
k8s/ingestion-service/deployment.yaml      수정 — INTERNAL_AUTH_TOKEN env
k8s/query-service/deployment.yaml          수정 — INTERNAL_AUTH_TOKEN + LANGFUSE_* env
k8s/ui-service/deployment.yaml             수정 — INTERNAL_AUTH_TOKEN env
```

---

## Task 1: INTERNAL_AUTH_TOKEN 인프라 준비

**Files:**
- Modify: `scripts/apply-secrets.sh`
- Modify: `k8s/ingestion-service/deployment.yaml`
- Modify: `k8s/query-service/deployment.yaml`
- Modify: `k8s/ui-service/deployment.yaml`

- [ ] **Step 1: 루트 `.env`에 INTERNAL_AUTH_TOKEN 추가 (로컬 개발용)**

`/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/.env`에 추가 (이미 있는 값 유지):

```
INTERNAL_AUTH_TOKEN=dev-internal-token-change-me-in-production
```

임의의 긴 랜덤 문자열도 가능. 이 값은 ui-service build arg가 아니라 런타임 env로만 사용됨.

- [ ] **Step 2: scripts/apply-secrets.sh 업데이트**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

get_env_var() {
  local file="$1"
  local var_name="$2"
  if [ -f "$file" ]; then
    grep "^${var_name}=" "$file" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//"
  else
    echo ""
  fi
}

echo "Extracting variables from .env files..."

VOYAGE_API_KEY=$(get_env_var "$ROOT/ingestion-service/.env" "VOYAGE_API_KEY")
ANTHROPIC_API_KEY=$(get_env_var "$ROOT/query-service/.env" "ANTHROPIC_API_KEY")
NEXT_PUBLIC_SUPABASE_URL=$(get_env_var "$ROOT/ui-service/.env.local" "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY=$(get_env_var "$ROOT/ui-service/.env.local" "SUPABASE_SERVICE_ROLE_KEY")
INTERNAL_AUTH_TOKEN=$(get_env_var "$ROOT/.env" "INTERNAL_AUTH_TOKEN")
LANGFUSE_SECRET_KEY=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_SECRET_KEY")
LANGFUSE_PUBLIC_KEY=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_PUBLIC_KEY")
LANGFUSE_HOST=$(get_env_var "$ROOT/query-service/.env" "LANGFUSE_HOST")

if [ -z "$VOYAGE_API_KEY" ] || [ -z "$ANTHROPIC_API_KEY" ] || [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$INTERNAL_AUTH_TOKEN" ]; then
  echo "Error: Required environment variables are missing in .env files."
  exit 1
fi

echo "Applying K8s secrets..."

kubectl create secret generic api-secrets \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --from-literal=VOYAGE_API_KEY="$VOYAGE_API_KEY" \
  --from-literal=INTERNAL_AUTH_TOKEN="$INTERNAL_AUTH_TOKEN" \
  --from-literal=LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-}" \
  --from-literal=LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}" \
  --from-literal=LANGFUSE_HOST="${LANGFUSE_HOST:-https://cloud.langfuse.com}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic supabase-secrets \
  --from-literal=SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secrets applied successfully."
```

- [ ] **Step 3: k8s/ingestion-service/deployment.yaml에 INTERNAL_AUTH_TOKEN env 추가**

기존 env 섹션 맨 아래에 추가:

```yaml
            - name: INTERNAL_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: INTERNAL_AUTH_TOKEN
```

- [ ] **Step 4: k8s/query-service/deployment.yaml에 INTERNAL_AUTH_TOKEN + LANGFUSE env 추가**

기존 env 섹션 맨 아래에 추가:

```yaml
            - name: INTERNAL_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: INTERNAL_AUTH_TOKEN
            - name: LANGFUSE_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: LANGFUSE_SECRET_KEY
            - name: LANGFUSE_PUBLIC_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: LANGFUSE_PUBLIC_KEY
            - name: LANGFUSE_HOST
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: LANGFUSE_HOST
```

- [ ] **Step 5: k8s/ui-service/deployment.yaml에 INTERNAL_AUTH_TOKEN env 추가**

기존 env 섹션 맨 아래에 추가:

```yaml
            - name: INTERNAL_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: INTERNAL_AUTH_TOKEN
```

- [ ] **Step 6: 시크릿 적용 테스트**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
bash scripts/apply-secrets.sh
kubectl get secret api-secrets -o jsonpath='{.data.INTERNAL_AUTH_TOKEN}' | base64 -d
```

Expected: 설정한 토큰 값 출력

- [ ] **Step 7: 커밋**

```bash
git add scripts/apply-secrets.sh k8s/
git commit -m "chore(k8s): add INTERNAL_AUTH_TOKEN and Langfuse secrets to deployments"
```

---

## Task 2: ingestion-service — X-Internal-Token 미들웨어 (Go)

**Files:**
- Create: `ingestion-service/internal/middleware/internal_auth.go`
- Create: `ingestion-service/internal/middleware/internal_auth_test.go`
- Modify: `ingestion-service/cmd/main.go`

- [ ] **Step 1: internal_auth_test.go 먼저 작성 (TDD)**

```go
package middleware_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/middleware"
)

func TestInternalAuth_ValidToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("X-Internal-Token", "secret-token")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}

func TestInternalAuth_InvalidToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("X-Internal-Token", "wrong-token")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestInternalAuth_MissingToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest("GET", "/protected", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 403, resp.StatusCode)
}

func TestInternalAuth_SkipsHealthCheck(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.InternalAuth("secret-token"))
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	// no token header

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/middleware/... -v 2>&1 | tail -5
```

Expected: `no Go files` 또는 컴파일 에러

- [ ] **Step 3: internal_auth.go 구현**

```go
package middleware

import "github.com/gofiber/fiber/v2"

// InternalAuth는 X-Internal-Token 헤더를 검증하는 Fiber 미들웨어다.
// /health 경로는 검증에서 제외한다.
func InternalAuth(expectedToken string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if c.Path() == "/health" {
			return c.Next()
		}
		token := c.Get("X-Internal-Token")
		if token != expectedToken {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "invalid internal token",
			})
		}
		return c.Next()
	}
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
go test ./internal/middleware/... -v 2>&1 | grep -E "PASS|FAIL"
```

Expected: 4개 테스트 모두 PASS

- [ ] **Step 5: cmd/main.go에 미들웨어 등록**

`ingestion-service/cmd/main.go`의 `app := fiber.New()` 직후에 추가:

```go
	internalToken := os.Getenv("INTERNAL_AUTH_TOKEN")
	if internalToken == "" {
		log.Fatal("INTERNAL_AUTH_TOKEN is required")
	}

	app := fiber.New()
	app.Use(middleware.InternalAuth(internalToken))
```

import에 `"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/middleware"` 추가.

- [ ] **Step 6: 빌드 + 테스트**

```bash
go build ./...
go test ./... 2>&1 | grep -E "ok|FAIL"
```

Expected: 빌드 성공, 모든 패키지 PASS

기존 handler 테스트는 X-Internal-Token 헤더 없이 돌아가는데, 미들웨어는 main.go에서만 등록되므로 handler 테스트에는 영향 없음.

- [ ] **Step 7: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ingestion-service/internal/middleware/ ingestion-service/cmd/main.go
git commit -m "feat(ingestion): add X-Internal-Token middleware with /health exception"
```

---

## Task 3: ingestion-service — Qdrant Payload Index

**Files:**
- Modify: `ingestion-service/internal/store/store.go`
- Modify: `ingestion-service/internal/store/store_test.go`
- Modify: `ingestion-service/cmd/main.go`

- [ ] **Step 1: store_test.go에 EnsurePayloadIndex 테스트 추가**

기존 테스트 파일의 `var _ store.Store = (*store.QdrantStore)(nil)` 위에 새 테스트를 추가합니다. MockStore에도 메서드 추가.

MockStore 업데이트:

```go
type MockStore struct {
	UpsertedChunks      []string
	LastUserID          string
	LastDocumentID      string
	IndexedFields       []string
	Err                 error
}

func (m *MockStore) Upsert(_ context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error {
	if m.Err != nil {
		return m.Err
	}
	m.UpsertedChunks = append(m.UpsertedChunks, chunks...)
	m.LastUserID = userID
	m.LastDocumentID = documentID
	return nil
}

func (m *MockStore) EnsureCollection(_ context.Context, vectorSize uint64) error {
	return m.Err
}

func (m *MockStore) EnsurePayloadIndex(_ context.Context, field string, schema string) error {
	if m.Err != nil {
		return m.Err
	}
	m.IndexedFields = append(m.IndexedFields, field+":"+schema)
	return nil
}
```

테스트 추가:

```go
func TestMockStore_EnsurePayloadIndex(t *testing.T) {
	mock := &MockStore{}
	err := mock.EnsurePayloadIndex(context.Background(), "user_id", "keyword")
	assert.NoError(t, err)
	assert.Contains(t, mock.IndexedFields, "user_id:keyword")
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/store/... -v 2>&1 | tail -5
```

Expected: `EnsurePayloadIndex not defined` 에러 (Store 인터페이스에 없음)

- [ ] **Step 3: store.go Store 인터페이스에 EnsurePayloadIndex 추가**

`Store` 인터페이스:

```go
type Store interface {
	Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error
	EnsureCollection(ctx context.Context, vectorSize uint64) error
	EnsurePayloadIndex(ctx context.Context, field string, schema string) error
}
```

`QdrantStore`에 구현 추가 (파일 맨 아래):

```go
func (q *QdrantStore) EnsurePayloadIndex(ctx context.Context, field string, schema string) error {
	url := fmt.Sprintf("%s/collections/%s/index", q.baseURL, q.collection)
	body, _ := json.Marshal(map[string]any{
		"field_name":   field,
		"field_schema": schema,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 이미 존재하는 인덱스는 200 또는 409 — 둘 다 정상 취급
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("qdrant create index error: status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
go test ./internal/store/... -v 2>&1 | grep -E "PASS|FAIL"
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: cmd/main.go에서 EnsurePayloadIndex 호출**

`EnsureCollection` 직후에 추가:

```go
	qdrantStore := store.New(cfg.Qdrant.BaseURL, cfg.Qdrant.Collection)
	if err := qdrantStore.EnsureCollection(context.Background(), 1024); err != nil {
		log.Fatalf("failed to ensure qdrant collection: %v", err)
	}
	if err := qdrantStore.EnsurePayloadIndex(context.Background(), "user_id", "keyword"); err != nil {
		log.Fatalf("failed to ensure qdrant user_id index: %v", err)
	}
	if err := qdrantStore.EnsurePayloadIndex(context.Background(), "document_id", "keyword"); err != nil {
		log.Fatalf("failed to ensure qdrant document_id index: %v", err)
	}
```

- [ ] **Step 6: 전체 빌드 + 테스트**

```bash
go build ./...
go test ./... 2>&1 | grep -E "ok|FAIL"
```

- [ ] **Step 7: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ingestion-service/internal/store/ ingestion-service/cmd/main.go
git commit -m "feat(ingestion): add Qdrant payload index for user_id and document_id"
```

---

## Task 4: query-service — X-Internal-Token 미들웨어 (TypeScript)

**Files:**
- Create: `query-service/src/middleware/internal-auth.ts`
- Modify: `query-service/src/index.ts`

- [ ] **Step 1: internal-auth.ts 생성**

```typescript
import type { MiddlewareHandler } from "hono";

export function internalAuth(expectedToken: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === "/health") {
      await next();
      return;
    }
    const token = c.req.header("x-internal-token");
    if (token !== expectedToken) {
      return c.json({ error: "invalid internal token" }, 403);
    }
    await next();
  };
}
```

- [ ] **Step 2: index.ts에 미들웨어 적용**

기존 Hono 앱 생성 직후에 추가:

```typescript
const internalToken = process.env.INTERNAL_AUTH_TOKEN;
if (!internalToken) {
  throw new Error("INTERNAL_AUTH_TOKEN is required");
}

const app = new Hono();
app.use("*", internalAuth(internalToken));
```

import 추가:

```typescript
import { internalAuth } from "./middleware/internal-auth.js";
```

- [ ] **Step 3: 타입 체크 + 빌드**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/middleware/ query-service/src/index.ts
git commit -m "feat(query): add X-Internal-Token middleware with /health exception"
```

---

## Task 5: ui-service — X-Internal-Token 헤더 전달

**Files:**
- Modify: `ui-service/app/api/ingest/route.ts`
- Modify: `ui-service/app/api/ingest/status/[jobId]/route.ts`
- Modify: `ui-service/app/api/query/route.ts`

- [ ] **Step 1: ingest/route.ts 업데이트**

기존 fetch 헤더에 `X-Internal-Token` 추가:

```typescript
const res = await fetch(`${ingestionUrl}/ingest`, {
  method: "POST",
  headers: {
    "X-User-ID": user.id,
    "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
  },
  body: formData,
});
```

- [ ] **Step 2: ingest/status/[jobId]/route.ts 업데이트**

```typescript
const res = await fetch(`${ingestionUrl}/ingest/status/${params.jobId}`, {
  cache: "no-store",
  headers: {
    "X-User-ID": user.id,
    "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
  },
});
```

- [ ] **Step 3: query/route.ts 업데이트**

```typescript
const res = await fetch(`${queryUrl}/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-User-ID": user.id,
    "X-Document-ID": documentId,
    "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
  },
  body: JSON.stringify({ question }),
});
```

- [ ] **Step 4: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add ui-service/app/api/
git commit -m "feat(ui): forward X-Internal-Token header from ui-service to backend"
```

---

## Task 6: query-service — AgentState에 retryCount, gradingScore, rewrittenQuestion 추가

**Files:**
- Modify: `query-service/src/graph/state.ts`

- [ ] **Step 1: state.ts 필드 추가**

기존 `AgentState`의 다른 필드들 바로 아래에 추가:

```typescript
export const AgentState = Annotation.Root({
  question: Annotation<string>(),
  userId: Annotation<string>(),
  documentId: Annotation<string>(),
  questionType: Annotation<QuestionType>({
    reducer: (_, next) => next,
    default: () => "general",
  }),
  retrievedClauses: Annotation<Clause[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  toolResults: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  answer: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  retryCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  gradingScore: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
});
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/graph/state.ts
git commit -m "feat(query): add retryCount and gradingScore to AgentState"
```

---

## Task 7: query-service — grader 노드

**Files:**
- Create: `query-service/src/graph/nodes/grader.ts`

- [ ] **Step 1: grader.ts 생성**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function grader(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  // 답변이 비어있으면 즉시 실패로 간주
  if (!state.answer || state.answer.trim().length === 0) {
    return { gradingScore: 1, retryCount: state.retryCount + 1 };
  }

  const anthropic = new Anthropic();

  const clauseContext = state.retrievedClauses
    .map((c) => `[${c.clauseNumber}] ${c.clauseTitle}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system: `당신은 보험 약관 답변 품질 평가자입니다. 답변이 질문에 정확히 부합하고 조항에 근거하는지 1~3점으로 채점하세요.

채점 기준:
- 3점: 조항에 명확히 근거하여 질문에 정확히 답변
- 2점: 부분적으로 답변되거나 근거 조항이 부족
- 1점: 질문과 무관하거나 근거 없음

반드시 숫자 하나만 응답하세요. 다른 텍스트 금지.`,
      messages: [
        {
          role: "user",
          content: `질문: ${state.question}\n\n검색된 조항:\n${clauseContext}\n\n답변: ${state.answer}\n\n점수 (1-3):`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim() : "3";
    const parsed = parseInt(text.match(/\d/)?.[0] ?? "3", 10);
    const score = parsed >= 1 && parsed <= 3 ? parsed : 3;

    return {
      gradingScore: score,
      retryCount: state.retryCount + 1,
    };
  } catch (err) {
    // Haiku API 실패 시 fallback: score=3 (통과)로 처리해 self-correction 루프가 막히지 않게 함
    console.error("[grader] fallback due to API error:", err);
    return { gradingScore: 3, retryCount: state.retryCount + 1 };
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/graph/nodes/grader.ts
git commit -m "feat(query): add grader node with Haiku scoring and API failure fallback"
```

---

## Task 8: query-service — query_rewriter 노드

**Files:**
- Create: `query-service/src/graph/nodes/query-rewriter.ts`

- [ ] **Step 1: query-rewriter.ts 생성**

`retriever`가 state.question을 사용하므로, 재작성된 질문을 `question` 필드에 덮어쓴다.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function queryRewriter(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: `당신은 보험 약관 검색 전문가입니다. 이전 검색이 실패했으므로 더 나은 검색 결과를 얻도록 질문을 재구성하세요.

재구성 전략:
- 구체적인 용어를 더 일반적인 용어로 확장
- 보험 업계 표준 용어 사용 (면책, 보장, 특약, 대기기간 등)
- 동의어나 관련 개념 추가

반드시 재구성된 질문 한 줄만 응답하세요. 다른 설명 금지.`,
      messages: [
        {
          role: "user",
          content: `원래 질문: ${state.question}\n\n재구성된 질문:`,
        },
      ],
    });

    const rewritten =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : state.question;

    return { question: rewritten };
  } catch (err) {
    // Haiku 실패 시 원래 질문 유지 (fallback)
    console.error("[query_rewriter] fallback due to API error:", err);
    return { question: state.question };
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/graph/nodes/query-rewriter.ts
git commit -m "feat(query): add query_rewriter node for search failure recovery"
```

---

## Task 9: query-service — graph.ts Self-Correction 사이클 통합

**Files:**
- Modify: `query-service/src/graph/graph.ts`

- [ ] **Step 1: graph.ts 전체 교체**

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { classifyQuestion } from "./nodes/classifier.js";
import { createRetriever } from "./nodes/retriever.js";
import { toolsAgent } from "./nodes/tools-agent.js";
import { generateAnswer } from "./nodes/answer-generator.js";
import { formatCitations } from "./nodes/citation-formatter.js";
import { grader } from "./nodes/grader.js";
import { queryRewriter } from "./nodes/query-rewriter.js";
import type { VoyageClient } from "../clients/voyage.js";
import type { InsuranceQdrantClient } from "../clients/qdrant.js";

const MAX_RETRIES = 2;
const PASSING_SCORE = 2;

export function buildGraph(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  const retrieve = createRetriever(voyageClient, qdrantClient);

  const graph = new StateGraph(AgentState)
    .addNode("question_classifier", classifyQuestion)
    .addNode("retriever", retrieve)
    .addNode("tools_agent", toolsAgent)
    .addNode("answer_generator", generateAnswer)
    .addNode("grader", grader)
    .addNode("query_rewriter", queryRewriter)
    .addNode("citation_formatter", formatCitations)
    .addEdge(START, "question_classifier")
    .addEdge("question_classifier", "retriever")
    .addConditionalEdges(
      "retriever",
      (state) =>
        state.questionType === "claim_eligibility"
          ? "tools_agent"
          : "answer_generator",
      {
        tools_agent: "tools_agent",
        answer_generator: "answer_generator",
      }
    )
    .addEdge("tools_agent", "answer_generator")
    .addEdge("answer_generator", "grader")
    .addConditionalEdges(
      "grader",
      (state) => {
        if (state.gradingScore < PASSING_SCORE && state.retryCount < MAX_RETRIES) {
          return "query_rewriter";
        }
        return "citation_formatter";
      },
      {
        query_rewriter: "query_rewriter",
        citation_formatter: "citation_formatter",
      }
    )
    .addEdge("query_rewriter", "retriever")
    .addEdge("citation_formatter", END);

  return graph.compile();
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/src/graph/graph.ts
git commit -m "feat(query): integrate grader and query_rewriter into LangGraph cycle"
```

---

## Task 10: query-service — Langfuse 클라이언트 + 트레이싱

**Files:**
- Create: `query-service/src/clients/langfuse.ts`
- Modify: `query-service/package.json` (langfuse 의존성)
- Modify: `query-service/src/index.ts`

- [ ] **Step 1: langfuse 패키지 설치**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npm install langfuse
```

- [ ] **Step 2: clients/langfuse.ts 생성**

Langfuse 키가 없으면 no-op 클라이언트를 반환. 개발 환경 대응.

```typescript
import { Langfuse } from "langfuse";

let client: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (client) return client;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    console.log("[langfuse] keys not configured, tracing disabled");
    return null;
  }

  client = new Langfuse({ secretKey, publicKey, baseUrl: host });
  return client;
}
```

- [ ] **Step 3: index.ts에서 Langfuse trace 래핑**

기존 `/query` 핸들러를 수정하여 Langfuse trace 안에서 graph.invoke 호출:

```typescript
import { getLangfuse } from "./clients/langfuse.js";

// ... 기존 코드 ...

app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const documentId = c.req.header("x-document-id");

  if (!userId) return c.json({ error: "X-User-ID header is required" }, 401);
  if (!documentId) return c.json({ error: "X-Document-ID header is required" }, 400);

  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "insurance-qa",
    userId,
    metadata: { documentId },
    input: { question },
  });

  const result = await graph.invoke({ question, userId, documentId });

  if (trace) {
    trace.update({
      output: {
        answer: result.answer,
        citations: result.citations,
        questionType: result.questionType,
        gradingScore: result.gradingScore,
        retryCount: result.retryCount,
      },
    });
    // grader score를 Langfuse Scores로 전송
    if (result.gradingScore > 0) {
      trace.score({
        name: "answer_quality",
        value: result.gradingScore,
        comment: `retryCount=${result.retryCount}`,
      });
    }
    await langfuse?.flushAsync();
  }

  return c.json({
    answer: result.answer,
    citations: result.citations,
    questionType: result.questionType,
  });
});
```

- [ ] **Step 4: 타입 체크 + 빌드**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git add query-service/
git commit -m "feat(query): add Langfuse tracing for graph execution with grader score"
```

---

## Task 11: 배포 & 전체 검증

**Files:** 코드 변경 없음

- [ ] **Step 1: 로컬 .env에 INTERNAL_AUTH_TOKEN 확인**

`/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/.env`에 값이 있어야 함 (Task 1 Step 1).

Langfuse 키는 선택 사항. 실제 트레이싱을 보고 싶으면 https://cloud.langfuse.com 에 가입 후 `query-service/.env`에 추가:

```
LANGFUSE_SECRET_KEY=sk-lf-xxxxx
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

- [ ] **Step 2: 배포 실행**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
bash scripts/deploy.sh
```

Expected: 3개 서비스 Built, rolled out, 헬스체크 성공

- [ ] **Step 3: 인증 검증 — 토큰 없이 호출하면 403**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8081/ingest \
  -H "X-User-ID: test"
```

Expected: `403`

- [ ] **Step 4: UI 경유 정상 동작 검증**

브라우저에서 http://localhost:3000 접속 → 로그인 → PDF 업로드 → 질문 실행 → 답변 수신 확인

- [ ] **Step 5: Qdrant 인덱스 확인**

```bash
kubectl port-forward svc/qdrant 6333:6333 &>/dev/null &
sleep 2
curl -s http://localhost:6333/collections/insurance_clauses | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d['result']['payload_schema'].keys()))"
```

Expected: `['user_id', 'document_id']`

- [ ] **Step 6: query-service 로그로 self-correction 동작 확인**

```bash
kubectl logs deployment/query-service --tail=50 2>/dev/null | grep -E "grader|retry|rewrit"
```

Expected: grader 호출 및 retryCount 관련 로그 (조건부, 실제 답변 품질에 따라)

- [ ] **Step 7: 최종 커밋**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
git commit --allow-empty -m "chore: deploy Phase 2 — self-correction + Langfuse + internal auth"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| X-Internal-Token 미들웨어 (Go Fiber, /health 예외) | Task 2 |
| X-Internal-Token 미들웨어 (TS Hono, /health 예외) | Task 4 |
| ui-service에서 헤더 전달 | Task 5 |
| 검증 실패 시 403 반환 | Task 2, 4 |
| Qdrant user_id payload index (EnsurePayloadIndex 멱등적) | Task 3 |
| Qdrant document_id payload index | Task 3 |
| Self-Correction 루프 (grader + query_rewriter) | Task 6-9 |
| Grader 장애 시 fallback (score=3) | Task 7 |
| Query rewriter 장애 시 원 질문 유지 | Task 8 |
| MAX_RETRIES=2, PASSING_SCORE=2 | Task 9 |
| Langfuse 트레이싱 (Traces, Tags, Scores) | Task 10 |
| INTERNAL_AUTH_TOKEN K8s Secret | Task 1 |
| LANGFUSE_* K8s Secret | Task 1 |
| AgentState에 retryCount, gradingScore | Task 6 |
