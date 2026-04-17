# 약관별 채팅 & 데이터 모델 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약관별 격리된 채팅 경험을 구현하고, Supabase에 대화 기록을 영구 저장하며, document_id 기반 Qdrant 검색 필터링과 .dockerignore 최적화를 적용한다.

**Architecture:** ingestion-service가 Supabase INSERT를 먼저 수행해 document_id를 획득한 후 Qdrant에 document_id를 payload로 포함 저장한다. ui-service API route가 query-service 응답 후 user/assistant 메시지를 Supabase messages 테이블에 저장한다. 프론트엔드는 selectedDocument 상태에 따라 Supabase에서 해당 약관의 메시지를 로드한다.

**Tech Stack:** Next.js 14 + Supabase (messages 테이블, RLS) | Go + Fiber (document_id 흐름 변경) | TypeScript + Qdrant (document_id 필터) | Docker (.dockerignore)

---

## 파일 구조

```
ui-service/
├── .dockerignore                              신규
├── app/
│   ├── context/AppContext.tsx                수정 — selectedDocument, localStorage 제거, Supabase 메시지 로드
│   ├── components/
│   │   ├── LeftPanel.tsx                     수정 — 약관 선택/하이라이트, 409 핸들링
│   │   ├── ChatPanel.tsx                     수정 — 미선택 가이드, document별 메시지
│   │   └── CitationPanel.tsx                수정 — selectedDocument의 마지막 citations
│   └── api/
│       └── query/route.ts                    수정 — document_id 전달, 메시지 저장

query-service/
├── .dockerignore                              신규
├── src/
│   ├── graph/state.ts                        수정 — documentId 필드 추가
│   ├── clients/qdrant.ts                     수정 — document_id 필터 추가
│   ├── graph/nodes/retriever.ts             수정 — documentId 전달
│   └── index.ts                              수정 — X-Document-ID 헤더 수신

ingestion-service/
├── .dockerignore                              신규
├── internal/
│   ├── supabase/client.go                    수정 — InsertDocument가 document_id 반환, 409 처리
│   ├── store/store.go                         수정 — Upsert에 documentID 파라미터 추가
│   ├── store/store_test.go                    수정 — documentID 반영
│   ├── handler/ingest.go                      수정 — Supabase 먼저 → document_id → Qdrant, 409 전달
│   └── handler/ingest_test.go                수정 — 테스트 업데이트
```

---

## Task 1: Supabase 스키마 변경 (수동)

**Files:** 해당 없음 (Supabase 대시보드)

- [ ] **Step 1: messages 테이블 생성**

Supabase SQL Editor에서 실행:

```sql
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  citations   JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_messages_access"
  ON messages FOR ALL
  USING (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM documents WHERE id = document_id AND user_id = auth.uid())
  );

GRANT ALL ON messages TO service_role;
GRANT SELECT, INSERT ON messages TO anon, authenticated;
```

- [ ] **Step 2: documents 테이블에 유니크 제약 추가**

```sql
ALTER TABLE documents
  ADD CONSTRAINT unique_user_filename UNIQUE (user_id, filename);
```

---

## Task 2: .dockerignore 추가 (3개 서비스)

**Files:**
- Create: `ui-service/.dockerignore`
- Create: `query-service/.dockerignore`
- Create: `ingestion-service/.dockerignore`

- [ ] **Step 1: ui-service/.dockerignore 생성**

```
node_modules
.next
.env.local
.env
*.env
.git
.DS_Store
```

- [ ] **Step 2: query-service/.dockerignore 생성**

```
node_modules
dist
.env
*.env
.git
.DS_Store
```

- [ ] **Step 3: ingestion-service/.dockerignore 생성**

```
vendor
*.exe
.env
*.env
.git
.DS_Store
testdata
```

- [ ] **Step 4: 빌드 컨텍스트 크기 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
eval $(minikube docker-env)
docker compose build ui-service 2>&1 | grep "transferring context"
```

Expected: ~10MB 이하 (이전 380MB 대비)

- [ ] **Step 5: 커밋**

```bash
git add ui-service/.dockerignore query-service/.dockerignore ingestion-service/.dockerignore
git commit -m "chore: add .dockerignore to all services"
```

---

## Task 3: ingestion-service — Supabase 클라이언트 document_id 반환 + 중복 처리

**Files:**
- Modify: `ingestion-service/internal/supabase/client.go`

- [ ] **Step 1: client.go 전체 교체**

`InsertDocument`가 document_id(UUID)를 반환하고, 409(중복) 시 별도 에러 타입을 반환한다.

```go
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var ErrDuplicateDocument = errors.New("duplicate document")

type Client struct {
	url            string
	serviceRoleKey string
}

func New(url, serviceRoleKey string) *Client {
	return &Client{url: url, serviceRoleKey: serviceRoleKey}
}

type documentRecord struct {
	UserID     string `json:"user_id"`
	Filename   string `json:"filename"`
	ChunkCount int    `json:"chunk_count"`
}

type insertedDoc struct {
	ID string `json:"id"`
}

func (c *Client) InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) (string, error) {
	body, err := json.Marshal(documentRecord{
		UserID:     userID,
		Filename:   filename,
		ChunkCount: chunkCount,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/rest/v1/documents", c.url),
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		return "", ErrDuplicateDocument
	}

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("supabase insert document failed: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var docs []insertedDoc
	if err := json.Unmarshal(respBody, &docs); err != nil {
		return "", fmt.Errorf("supabase response parse failed: %w", err)
	}
	if len(docs) == 0 {
		return "", fmt.Errorf("supabase returned empty response")
	}
	return docs[0].ID, nil
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go build ./internal/supabase/...
```

Expected: 컴파일 에러 (handler가 아직 이전 시그니처 사용) — 예상됨

- [ ] **Step 3: 커밋**

```bash
git add ingestion-service/internal/supabase/client.go
git commit -m "feat(ingestion): return document_id from Supabase INSERT, handle 409 duplicate"
```

---

## Task 4: ingestion-service — Qdrant store에 documentID 추가

**Files:**
- Modify: `ingestion-service/internal/store/store.go`
- Modify: `ingestion-service/internal/store/store_test.go`

- [ ] **Step 1: store_test.go 업데이트 (TDD)**

```go
package store_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

type MockStore struct {
	UpsertedChunks []string
	LastUserID     string
	LastDocumentID string
	Err            error
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

func TestMockStore_Upsert(t *testing.T) {
	mock := &MockStore{}
	err := mock.Upsert(
		context.Background(),
		[]string{"chunk1", "chunk2"},
		[][]float32{{0.1}, {0.2}},
		"삼성생명_암보험",
		"user-uuid-123",
		"doc-uuid-456",
	)
	assert.NoError(t, err)
	assert.Equal(t, []string{"chunk1", "chunk2"}, mock.UpsertedChunks)
	assert.Equal(t, "user-uuid-123", mock.LastUserID)
	assert.Equal(t, "doc-uuid-456", mock.LastDocumentID)
}

var _ store.Store = (*store.QdrantStore)(nil)
```

- [ ] **Step 2: 테스트 실행하여 컴파일 에러 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/store/... -v 2>&1 | tail -5
```

Expected: Upsert 시그니처 불일치 에러

- [ ] **Step 3: store.go Upsert에 documentID 추가**

`Store` 인터페이스와 `QdrantStore.Upsert` 시그니처를 변경:

```go
type Store interface {
	Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error
	EnsureCollection(ctx context.Context, vectorSize uint64) error
}
```

`QdrantStore.Upsert` payload에 `document_id` 추가:

```go
func (q *QdrantStore) Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error {
	points := make([]point, len(chunks))
	for i, chunk := range chunks {
		points[i] = point{
			ID:     uuid.New().String(),
			Vector: vectors[i],
			Payload: map[string]any{
				"content":       chunk,
				"document_name": docName,
				"chunk_index":   i,
				"user_id":       userID,
				"document_id":   documentID,
			},
		}
	}
	// ... 나머지 HTTP 로직 동일
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
go test ./internal/store/... -v
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/store/
git commit -m "feat(ingestion): add document_id to Qdrant point payload"
```

---

## Task 5: ingestion-service — handler 흐름 변경 (Supabase 먼저 → Qdrant)

**Files:**
- Modify: `ingestion-service/internal/handler/ingest.go`
- Modify: `ingestion-service/internal/handler/ingest_test.go`

- [ ] **Step 1: SupabaseInserter 인터페이스 변경**

```go
type SupabaseInserter interface {
	InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) (string, error)
}
```

- [ ] **Step 2: Handle에서 Supabase 중복 체크를 동기로 수행**

`Handle` 메서드 시작 부분에서 Supabase INSERT를 먼저 시도한다. 중복이면 409를 즉시 반환하고 비동기 처리를 시작하지 않는다. INSERT가 성공하면 `document_id`를 받아 비동기 처리에 전달한다.

핵심 변경:

```go
func (h *IngestHandler) Handle(c *fiber.Ctx) error {
	// ... 기존 userID, file 검증 동일 ...

	// Supabase에 먼저 INSERT → document_id 획득 (중복 시 409)
	docID, err := h.supabase.InsertDocument(context.Background(), userID, file.Filename, 0)
	if err != nil {
		if errors.Is(err, supabase.ErrDuplicateDocument) {
			os.Remove(tmpPath)
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "이미 관리 중인 약관입니다"})
		}
		os.Remove(tmpPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "문서 등록 실패"})
	}

	jobID := uuid.New().String()
	docName := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	h.jobStore.Create(jobID, file.Filename)

	go h.processAsync(jobID, tmpPath, docName, userID, docID)

	return c.JSON(fiber.Map{"jobId": jobID, "document": docName, "documentId": docID})
}
```

`processAsync`에서 Supabase INSERT 제거, `store.Upsert`에 `docID` 전달:

```go
func (h *IngestHandler) processAsync(jobID, tmpPath, docName, userID, docID string) {
	// ... 파싱, 청킹, 임베딩 동일 ...

	// Qdrant 저장 시 document_id 포함
	if err := h.store.Upsert(context.Background(), chunks, allVectors, docName, userID, docID); err != nil {
		fail("Qdrant 저장 실패: " + err.Error())
		return
	}

	// chunk_count 업데이트 (Supabase에 이미 INSERT된 레코드)
	_ = h.supabase.UpdateChunkCount(context.Background(), docID, len(chunks))

	// ... StepDone, DeleteAfter 동일 ...
}
```

- [ ] **Step 3: Supabase client에 UpdateChunkCount 메서드 추가**

`ingestion-service/internal/supabase/client.go`에 추가:

```go
func (c *Client) UpdateChunkCount(ctx context.Context, documentID string, chunkCount int) error {
	body, _ := json.Marshal(map[string]int{"chunk_count": chunkCount})

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPatch,
		fmt.Sprintf("%s/rest/v1/documents?id=eq.%s", c.url, documentID),
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

- [ ] **Step 4: ingest_test.go 업데이트**

mockSupabase 변경:

```go
type mockSupabase struct {
	docID string
	err   error
}

func (m *mockSupabase) InsertDocument(_ context.Context, _ string, _ string, _ int) (string, error) {
	return m.docID, m.err
}

func (m *mockSupabase) UpdateChunkCount(_ context.Context, _ string, _ int) error {
	return nil
}
```

mockStore 변경 (6-param Upsert):

```go
func (m *mockStore) Upsert(_ context.Context, _ []string, _ [][]float32, _ string, _ string, _ string) error {
	return m.err
}
```

`newTestApp` 업데이트:

```go
func newTestApp(p *mockParser, c *mockChunker, e *mockEmbedder, s *mockStore, sb *mockSupabase, js *job.Store) *fiber.App {
	cfg := &config.Config{}
	cfg.Chunking.ChunkSize = 512
	cfg.Chunking.Overlap = 50
	h := handler.New(p, c, e, s, sb, js, cfg)
	app := fiber.New()
	app.Post("/ingest", h.Handle)
	return app
}
```

기존 `TestHandle_Success`의 mockSupabase를 `&mockSupabase{docID: "doc-uuid-123"}`로 변경.

추가 테스트:

```go
func TestHandle_DuplicateDocument(t *testing.T) {
	app := newTestApp(
		&mockParser{},
		&mockChunker{},
		&mockEmbedder{},
		&mockStore{},
		&mockSupabase{err: supabase.ErrDuplicateDocument},
		job.NewStore(),
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("X-User-ID", "test-user-123")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 409, resp.StatusCode)
}
```

- [ ] **Step 5: SupabaseInserter 인터페이스도 UpdateChunkCount 추가**

```go
type SupabaseInserter interface {
	InsertDocument(ctx context.Context, userID string, filename string, chunkCount int) (string, error)
	UpdateChunkCount(ctx context.Context, documentID string, chunkCount int) error
}
```

- [ ] **Step 6: 전체 빌드 + 테스트**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go build ./...
go test ./... 2>&1 | grep -E "ok|FAIL"
```

Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add ingestion-service/
git commit -m "feat(ingestion): Supabase INSERT first for document_id, handle 409 duplicate"
```

---

## Task 6: query-service — document_id 기반 Qdrant 필터링

**Files:**
- Modify: `query-service/src/graph/state.ts`
- Modify: `query-service/src/clients/qdrant.ts`
- Modify: `query-service/src/graph/nodes/retriever.ts`
- Modify: `query-service/src/index.ts`

- [ ] **Step 1: state.ts에 documentId 추가**

기존 `sessionId` 아래에 추가:

```typescript
documentId: Annotation<string>(),
```

- [ ] **Step 2: qdrant.ts search에 documentId 필터 추가**

```typescript
async search(vector: number[], userId: string, documentId: string, limit = 5): Promise<Clause[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      filter: {
        must: [
          { key: "user_id", match: { value: userId } },
          { key: "document_id", match: { value: documentId } },
        ],
      },
    });
    // ... mapping 동일
```

QdrantPayload에도 `document_id: string` 추가.

- [ ] **Step 3: retriever.ts에 documentId 전달**

```typescript
const clauses = await qdrantClient.search(embedding, state.userId, state.documentId, 5);
```

- [ ] **Step 4: index.ts에서 X-Document-ID 헤더 수신**

```typescript
app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const documentId = c.req.header("x-document-id");
  const sessionId = c.req.header("x-session-id") ?? crypto.randomUUID();

  if (!userId) return c.json({ error: "X-User-ID header is required" }, 401);
  if (!documentId) return c.json({ error: "X-Document-ID header is required" }, 400);

  const { question } = await c.req.json<{ question: string }>();
  if (!question) return c.json({ error: "question is required" }, 400);

  const result = await graph.invoke({ question, userId, sessionId, documentId });
  return c.json({
    answer: result.answer,
    citations: result.citations,
    questionType: result.questionType,
  });
});
```

- [ ] **Step 5: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/query-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add query-service/src/
git commit -m "feat(query): filter Qdrant by document_id via X-Document-ID header"
```

---

## Task 7: ui-service — AppContext selectedDocument + Supabase 메시지 로드

**Files:**
- Modify: `ui-service/app/context/AppContext.tsx`

- [ ] **Step 1: AppContext.tsx 전체 교체**

핵심 변경:
- `selectedDocument: DocumentMeta | null` 상태 추가
- `setSelectedDocument` 시 Supabase에서 해당 document의 messages 로드
- localStorage 기반 저장 제거 (Supabase가 대체)
- `loadingMessages: boolean` 상태 추가

```tsx
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";

export interface DocumentMeta {
  id: string;
  filename: string;
  clauseCount: number;
  createdAt: string;
}

export interface IngestingDoc {
  jobId: string;
  filename: string;
  filesize: string;
  progress: number;
  currentStep: "parsing" | "chunking" | "embedding" | "storing" | "done" | "failed";
  currentChunk: number;
  totalChunks: number;
  error?: string;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

interface AppContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  documents: DocumentMeta[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>;
  selectedDocument: DocumentMeta | null;
  selectDocument: (doc: DocumentMeta | null) => void;
  ingesting: IngestingDoc | null;
  setIngesting: React.Dispatch<React.SetStateAction<IngestingDoc | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadingMessages: boolean;
  citations: Citation[];
  setCitations: React.Dispatch<React.SetStateAction<Citation[]>>;
  activeCitation: number | null;
  setActiveCitation: React.Dispatch<React.SetStateAction<number | null>>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: User | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentMeta | null>(null);
  const [ingesting, setIngesting] = useState<IngestingDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  const supabase = createClient();

  const selectDocument = useCallback(async (doc: DocumentMeta | null) => {
    setSelectedDocument(doc);
    setMessages([]);
    setCitations([]);
    setActiveCitation(null);

    if (!doc) return;

    setLoadingMessages(true);
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, citations, created_at")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: true });

    if (data) {
      const loaded = data.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.citations as Citation[] | undefined,
        timestamp: new Date(m.created_at),
      }));
      setMessages(loaded);

      // 마지막 assistant 메시지의 citations를 사이드바에 표시
      const lastAssistant = [...loaded].reverse().find((m) => m.role === "assistant");
      if (lastAssistant?.citations && lastAssistant.citations.length > 0) {
        setCitations(lastAssistant.citations);
      }
    }
    setLoadingMessages(false);
  }, [supabase]);

  return (
    <AppContext.Provider
      value={{
        user, setUser,
        documents, setDocuments,
        selectedDocument, selectDocument,
        ingesting, setIngesting,
        messages, setMessages,
        loadingMessages,
        citations, setCitations,
        activeCitation, setActiveCitation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: LeftPanel, ChatPanel 등에서 에러 (아직 미수정) — 예상됨

- [ ] **Step 3: 커밋**

```bash
git add ui-service/app/context/AppContext.tsx
git commit -m "feat(ui): add selectedDocument state with Supabase message loading"
```

---

## Task 8: ui-service — LeftPanel 약관 선택 & 중복 핸들링

**Files:**
- Modify: `ui-service/app/components/LeftPanel.tsx`

- [ ] **Step 1: LeftPanel.tsx 전체 교체**

핵심 변경:
- `selectDocument` 사용 (기존 `setActiveCitation` 등 대신)
- 약관 카드 클릭 시 `selectDocument(doc)` 호출
- 선택된 약관 하이라이트 (파란 테두리)
- 업로드 409 에러 시 "이미 관리 중인 약관입니다" alert
- 인제스천 완료 후 자동으로 해당 약관 선택

주요 변경 부분만:

업로드 응답에서 409 처리:
```tsx
const res = await fetch("/api/ingest", { method: "POST", body: formData });
const data = await res.json();
if (res.status === 409) {
  alert("이미 관리 중인 약관입니다.");
  return;
}
if (!res.ok) {
  alert(data.error ?? "업로드 실패");
  return;
}
```

약관 목록에서 선택된 약관 하이라이트:
```tsx
const isSelected = selectedDocument?.id === doc.id;
// className에 isSelected ? "border-blue-500 bg-blue-100" : "border-blue-100" 적용
```

인제스천 완료 후 자동 선택:
```tsx
if (data.step === "done") {
  // ... Supabase 재조회 후
  const newDoc = docs?.find((d) => d.filename === ingesting.filename);
  if (newDoc) {
    selectDocument({
      id: newDoc.id,
      filename: newDoc.filename,
      clauseCount: newDoc.chunk_count,
      createdAt: newDoc.created_at,
    });
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add ui-service/app/components/LeftPanel.tsx
git commit -m "feat(ui): document selection highlight and 409 duplicate handling"
```

---

## Task 9: ui-service — ChatPanel 약관별 메시지 + API route 메시지 저장

**Files:**
- Modify: `ui-service/app/components/ChatPanel.tsx`
- Modify: `ui-service/app/api/query/route.ts`

- [ ] **Step 1: query/route.ts 전체 교체**

query-service 호출 시 `X-Document-ID` 헤더 추가, 응답 후 user/assistant 메시지를 Supabase messages 테이블에 저장:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { question, documentId } = await req.json();
  if (!question || !documentId) {
    return NextResponse.json({ error: "question and documentId are required" }, { status: 400 });
  }

  const queryUrl = process.env.QUERY_API_URL;

  const res = await fetch(`${queryUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": user.id,
      "X-Document-ID": documentId,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: errText }, { status: res.status });
  }

  const data = await res.json();

  // Supabase에 user 질문 + assistant 답변 병렬 저장
  await Promise.all([
    supabase.from("messages").insert({
      document_id: documentId,
      user_id: user.id,
      role: "user",
      content: question,
      citations: [],
    }),
    supabase.from("messages").insert({
      document_id: documentId,
      user_id: user.id,
      role: "assistant",
      content: data.answer,
      citations: data.citations ?? [],
    }),
  ]);

  return NextResponse.json(data);
}
```

- [ ] **Step 2: ChatPanel.tsx 전체 교체**

핵심 변경:
- `selectedDocument`가 없으면 "왼쪽에서 약관을 선택해주세요" 가이드
- `loadingMessages` 중이면 스켈레톤 UI
- `sendMessage` 시 `documentId` body에 포함
- 응답 후 `setCitations(data.citations)`

```tsx
const { messages, setMessages, setCitations, selectedDocument, loadingMessages } = useApp();

// selectedDocument가 없을 때
if (!selectedDocument) {
  return (
    <div className="flex-1 bg-white flex flex-col items-center justify-center gap-4 text-center min-w-0">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl">📄</div>
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">약관을 선택해주세요</h2>
        <p className="text-[12px] text-slate-400">왼쪽 패널에서 약관을 선택하면 대화를 시작할 수 있습니다</p>
      </div>
    </div>
  );
}

// sendMessage에서 documentId 전달
const res = await fetch("/api/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question, documentId: selectedDocument.id }),
});
```

- [ ] **Step 3: 타입 체크 + 빌드**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

- [ ] **Step 4: 커밋**

```bash
git add ui-service/app/components/ChatPanel.tsx ui-service/app/api/query/route.ts
git commit -m "feat(ui): document-scoped chat with Supabase message persistence"
```

---

## Task 10: ui-service — CitationPanel selectedDocument 연동

**Files:**
- Modify: `ui-service/app/components/CitationPanel.tsx`

CitationPanel은 이미 `citations` state를 사용하므로 변경 최소화. 약관 미선택 시 빈 상태 표시만 확인.

- [ ] **Step 1: 타입 체크로 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

CitationPanel이 `activeCitation`/`setActiveCitation`을 사용하는데, AppContext에서 제거하지 않았으므로 타입 에러 없어야 함.

- [ ] **Step 2: 전체 빌드 확인**

```bash
npm run build 2>&1 | tail -10
```

Expected: 빌드 성공

- [ ] **Step 3: 커밋 (빌드 성공 시)**

```bash
git add ui-service/
git commit -m "feat(ui): final build verification for document-scoped chat"
```

---

## Task 11: Docker 재빌드 & K8s 재배포

**Files:** 코드 변경 없음. 빌드 및 배포만.

- [ ] **Step 1: 시크릿 최신화**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
bash scripts/apply-secrets.sh
```

- [ ] **Step 2: Docker 재빌드**

```bash
eval $(minikube docker-env)
docker compose build 2>&1 | grep -E "Built|ERROR|transferring context"
```

Expected: 3개 서비스 Built, 컨텍스트 크기 감소 확인

- [ ] **Step 3: K8s 재배포**

```bash
kubectl rollout restart deployment/ingestion-service deployment/query-service deployment/ui-service
kubectl rollout status deployment/ingestion-service --timeout=60s
kubectl rollout status deployment/query-service --timeout=60s
kubectl rollout status deployment/ui-service --timeout=60s
```

- [ ] **Step 4: 포트포워드 + 헬스체크**

```bash
pkill -f "kubectl port-forward" 2>/dev/null; sleep 1
kubectl port-forward svc/ingestion-service 8081:8081 &>/tmp/pf-ingestion.log &
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
sleep 3
curl -s http://localhost:8081/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `{"status":"ok"}` + `307`

- [ ] **Step 5: 커밋**

```bash
git commit --allow-empty -m "chore: rebuild and redeploy with document-scoped chat"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| .dockerignore 추가 (3개 서비스) | Task 2 |
| 중복 업로드 차단 (UNIQUE + 409) | Task 1, 3, 5 |
| messages 테이블 + RLS | Task 1 |
| Supabase INSERT 먼저 → document_id 획득 | Task 3, 5 |
| Qdrant payload에 document_id 포함 | Task 4, 5 |
| query-service document_id 필터링 | Task 6 |
| selectedDocument 상태 + 메시지 로드 | Task 7 |
| 약관 선택 하이라이트 + 409 핸들링 | Task 8 |
| ChatPanel 약관별 메시지 + Supabase 저장 | Task 9 |
| CitationPanel 약관별 citations | Task 7 (selectDocument에서 처리) |
| Docker 재빌드 & K8s 재배포 | Task 11 |
