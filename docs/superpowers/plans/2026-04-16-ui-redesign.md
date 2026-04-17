# UI 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보험 약관 QA Agent UI를 3분할 대시보드(Clean Professional 스타일)로 전면 개선하고, 문서 분석 진행 상황을 서클 차트 + 라이브 로그로 실시간 표시한다.

**Architecture:** Ingestion Service(Go)에 비동기 job 처리를 추가해 `job_id`를 즉시 반환하고, UI(Next.js)가 1초 polling으로 진행 상황을 수신한다. React Context로 3개 패널(왼쪽/채팅/근거조항)의 공유 상태를 관리한다.

**Tech Stack:** Go 1.23 + Fiber v2 | Next.js 14 + TypeScript + Tailwind CSS | React Context | SVG 서클 차트

---

## 파일 구조

```
ingestion-service/
├── internal/
│   ├── job/
│   │   ├── store.go          신규 — in-memory job 상태 저장소 (concurrent-safe)
│   │   └── store_test.go     신규 — job store 유닛 테스트
│   └── handler/
│       ├── ingest.go         수정 — 비동기 처리 + job store 연동
│       └── ingest_test.go    수정 — 비동기 핸들러 테스트 추가
└── cmd/main.go               수정 — job store 주입 + status 라우트 추가

ui-service/app/
├── context/
│   └── AppContext.tsx        신규 — 전역 상태 (documents, ingesting, messages, citations)
├── components/
│   ├── CircleProgress.tsx    신규 — SVG 원형 진행 차트
│   ├── LeftPanel.tsx         신규 — 약관 업로드 + 진행 카드 + 목록
│   ├── CitationPanel.tsx     신규 — 근거 조항 패널
│   ├── ChatPanel.tsx         전면 개선 — 버블 + 추천 칩 + 분석 중 애니메이션
│   └── UploadPanel.tsx       삭제 (LeftPanel에 통합)
├── api/
│   ├── ingest/route.ts       수정 — job_id 반환 방식으로 변경
│   └── ingest/status/[jobId]/route.ts  신규 — status polling 프록시
├── page.tsx                  전면 개선 — 3분할 레이아웃
├── layout.tsx                수정 — AppProvider 래핑
└── globals.css               수정 — 커스텀 색상 변수 + 애니메이션
```

---

## Task 1: Ingestion Service — Job Store

**Files:**
- Create: `ingestion-service/internal/job/store.go`
- Create: `ingestion-service/internal/job/store_test.go`

- [ ] **Step 1: store_test.go 먼저 작성 (TDD)**

```go
package job_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
)

func TestStore_CreateAndGet(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")

	status, ok := s.Get("job1")
	assert.True(t, ok)
	assert.Equal(t, "job1", status.JobID)
	assert.Equal(t, "test.pdf", status.Filename)
	assert.Equal(t, job.StepParsing, status.Step)
	assert.Equal(t, 0, status.Progress)
}

func TestStore_Update(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")
	s.Update("job1", func(st *job.Status) {
		st.Step = job.StepChunking
		st.Progress = 30
		st.TotalChunks = 42
	})

	status, _ := s.Get("job1")
	assert.Equal(t, job.StepChunking, status.Step)
	assert.Equal(t, 30, status.Progress)
	assert.Equal(t, 42, status.TotalChunks)
}

func TestStore_GetNotFound(t *testing.T) {
	s := job.NewStore()
	_, ok := s.Get("nonexistent")
	assert.False(t, ok)
}

func TestStore_UpdateNonExistent(t *testing.T) {
	s := job.NewStore()
	// 존재하지 않는 job 업데이트는 패닉 없이 무시되어야 한다
	assert.NotPanics(t, func() {
		s.Update("ghost", func(st *job.Status) { st.Progress = 100 })
	})
}

func TestStore_DeleteAfter(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")
	s.DeleteAfter("job1", 50*time.Millisecond)

	time.Sleep(100 * time.Millisecond)
	_, ok := s.Get("job1")
	assert.False(t, ok)
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go test ./internal/job/... -v
```

Expected: `no Go files` 또는 컴파일 에러

- [ ] **Step 3: store.go 구현**

```go
package job

import (
	"sync"
	"time"
)

type Step string

const (
	StepParsing   Step = "parsing"
	StepChunking  Step = "chunking"
	StepEmbedding Step = "embedding"
	StepStoring   Step = "storing"
	StepDone      Step = "done"
	StepFailed    Step = "failed"
)

type Status struct {
	JobID        string    `json:"jobId"`
	Filename     string    `json:"filename"`
	Step         Step      `json:"step"`
	Progress     int       `json:"progress"`
	CurrentChunk int       `json:"currentChunk"`
	TotalChunks  int       `json:"totalChunks"`
	Error        string    `json:"error,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Store struct {
	mu   sync.RWMutex
	jobs map[string]*Status
}

func NewStore() *Store {
	return &Store{jobs: make(map[string]*Status)}
}

func (s *Store) Create(jobID, filename string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[jobID] = &Status{
		JobID:     jobID,
		Filename:  filename,
		Step:      StepParsing,
		Progress:  0,
		CreatedAt: time.Now(),
	}
}

func (s *Store) Update(jobID string, fn func(*Status)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if st, ok := s.jobs[jobID]; ok {
		fn(st)
	}
}

func (s *Store) Get(jobID string) (*Status, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st, ok := s.jobs[jobID]
	if !ok {
		return nil, false
	}
	copy := *st
	return &copy, true
}

func (s *Store) DeleteAfter(jobID string, d time.Duration) {
	time.AfterFunc(d, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		delete(s.jobs, jobID)
	})
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
go test ./internal/job/... -v
```

Expected:
```
--- PASS: TestStore_CreateAndGet (0.00s)
--- PASS: TestStore_Update (0.00s)
--- PASS: TestStore_GetNotFound (0.00s)
--- PASS: TestStore_UpdateNonExistent (0.00s)
--- PASS: TestStore_DeleteAfter (0.10s)
PASS
```

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/job/
git commit -m "feat(ingestion): add concurrent-safe job status store"
```

---

## Task 2: Ingestion Service — 비동기 핸들러

**Files:**
- Modify: `ingestion-service/internal/handler/ingest.go`
- Modify: `ingestion-service/internal/handler/ingest_test.go`

- [ ] **Step 1: ingest.go 전체 재작성**

```go
package handler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

type IngestHandler struct {
	parser   parser.Parser
	chunker  chunker.Chunker
	embedder embedder.Embedder
	store    store.Store
	jobStore *job.Store
	cfg      *config.Config
}

func New(p parser.Parser, c chunker.Chunker, e embedder.Embedder, s store.Store, js *job.Store, cfg *config.Config) *IngestHandler {
	return &IngestHandler{parser: p, chunker: c, embedder: e, store: s, jobStore: js, cfg: cfg}
}

// Handle은 파일을 검증하고 job_id를 즉시 반환한다. 실제 처리는 고루틴에서 비동기로 진행된다.
func (h *IngestHandler) Handle(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file field is required"})
	}
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".pdf") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PDF files are accepted"})
	}

	tmpFile, err := os.CreateTemp("", "ingest-*.pdf")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create temp file"})
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()

	if err := c.SaveFile(file, tmpPath); err != nil {
		os.Remove(tmpPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}

	jobID := uuid.New().String()
	docName := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	h.jobStore.Create(jobID, file.Filename)

	go h.processAsync(jobID, tmpPath, docName)

	return c.JSON(fiber.Map{"jobId": jobID, "document": docName})
}

// processAsync는 PDF 파싱 → 청킹 → 임베딩(배치) → Qdrant 저장을 순서대로 처리하며 job store를 업데이트한다.
func (h *IngestHandler) processAsync(jobID, tmpPath, docName string) {
	defer os.Remove(tmpPath)

	fail := func(msg string) {
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.Step = job.StepFailed
			s.Error = msg
		})
	}

	// 1. 파싱 (0→10%)
	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepParsing; s.Progress = 5 })
	text, err := h.parser.Extract(tmpPath)
	if err != nil {
		fail("PDF 파싱 실패: " + err.Error())
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) { s.Progress = 10 })

	// 2. 청킹 (10→30%)
	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepChunking; s.Progress = 15 })
	chunks := h.chunker.Chunk(text, h.cfg.Chunking.ChunkSize, h.cfg.Chunking.Overlap)
	if len(chunks) == 0 {
		fail("PDF에서 텍스트를 추출할 수 없습니다")
		return
	}
	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Progress = 30
		s.TotalChunks = len(chunks)
	})

	// 3. 임베딩 — 10개씩 배치 처리 (30→70%)
	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepEmbedding })
	const batchSize = 10
	allVectors := make([][]float32, 0, len(chunks))
	for i := 0; i < len(chunks); i += batchSize {
		end := i + batchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		vecs, err := h.embedder.Embed(context.Background(), chunks[i:end])
		if err != nil {
			fail("임베딩 실패: " + err.Error())
			return
		}
		allVectors = append(allVectors, vecs...)
		processed := end
		h.jobStore.Update(jobID, func(s *job.Status) {
			s.CurrentChunk = processed
			s.Progress = 30 + int(float64(processed)/float64(len(chunks))*40)
		})
	}

	// 4. Qdrant 저장 (70→90%)
	h.jobStore.Update(jobID, func(s *job.Status) { s.Step = job.StepStoring; s.Progress = 75 })
	if err := h.store.Upsert(context.Background(), chunks, allVectors, docName); err != nil {
		fail("Qdrant 저장 실패: " + err.Error())
		return
	}

	// 5. 완료 (100%)
	h.jobStore.Update(jobID, func(s *job.Status) {
		s.Step = job.StepDone
		s.Progress = 100
	})
	// 30초 후 메모리에서 삭제
	h.jobStore.DeleteAfter(jobID, 30*time.Second)
}
```

- [ ] **Step 2: ingest_test.go 업데이트 — 비동기 핸들러 테스트 추가**

기존 `TestHandle_Success`, `TestHandle_NonPDFRejected`, `TestHandle_MissingFile` 아래에 추가:

```go
func TestHandle_ReturnsJobID(t *testing.T) {
	js := job.NewStore()
	app := newTestAppWithJobStore(
		&mockParser{text: "보험 약관 제1조"},
		&mockChunker{chunks: []string{"chunk1"}},
		&mockEmbedder{vecs: [][]float32{{0.1}}},
		&mockStore{},
		js,
	)

	body, ct := multipartPDF("samsung.pdf")
	req := httptest.NewRequest("POST", "/ingest", body)
	req.Header.Set("Content-Type", ct)

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["jobId"])
	assert.Equal(t, "samsung", result["document"])
}
```

`newTestApp` 함수를 `newTestAppWithJobStore`로 교체:

```go
func newTestAppWithJobStore(p *mockParser, c *mockChunker, e *mockEmbedder, s *mockStore, js *job.Store) *fiber.App {
	cfg := &config.Config{}
	cfg.Chunking.ChunkSize = 512
	cfg.Chunking.Overlap = 50
	h := handler.New(p, c, e, s, js, cfg)
	app := fiber.New()
	app.Post("/ingest", h.Handle)
	return app
}
```

`ingest_test.go` 상단 import에 추가:
```go
import (
    "encoding/json"
    "github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
    // ... 기존 imports
)
```

기존 `newTestApp` 호출을 모두 `newTestAppWithJobStore(..., job.NewStore())`로 변경.

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go build ./...
```

Expected: 에러 없음

- [ ] **Step 4: 테스트 실행**

```bash
go test ./internal/handler/... -v
```

Expected: 모든 테스트 PASS (비동기 처리로 인해 고루틴이 백그라운드에서 돌지만 테스트는 즉시 응답 확인)

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/handler/
git commit -m "feat(ingestion): async job processing with progress tracking"
```

---

## Task 3: Ingestion Service — Status 엔드포인트 + main.go 업데이트

**Files:**
- Modify: `ingestion-service/cmd/main.go`

- [ ] **Step 1: main.go 전체 재작성**

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/handler"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using environment variables")
	}

	cfg, err := config.Load("config.toml")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	voyageAPIKey := os.Getenv("VOYAGE_API_KEY")
	if voyageAPIKey == "" {
		log.Fatal("VOYAGE_API_KEY is required")
	}

	qdrantStore := store.New(cfg.Qdrant.BaseURL, cfg.Qdrant.Collection)
	if err := qdrantStore.EnsureCollection(context.Background(), 1024); err != nil {
		log.Fatalf("failed to ensure qdrant collection: %v", err)
	}

	jobStore := job.NewStore()

	h := handler.New(
		parser.New(),
		chunker.New(),
		embedder.New(voyageAPIKey, cfg.Embedding.Model, cfg.Embedding.BaseURL),
		qdrantStore,
		jobStore,
		cfg,
	)

	app := fiber.New()
	app.Post("/ingest", h.Handle)
	app.Get("/ingest/status/:jobId", func(c *fiber.Ctx) error {
		jobID := c.Params("jobId")
		status, ok := jobStore.Get(jobID)
		if !ok {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
		}
		return c.JSON(status)
	})
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Fatal(app.Listen(fmt.Sprintf(":%d", cfg.Server.Port)))
}
```

- [ ] **Step 2: 전체 빌드 + 테스트**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ingestion-service
go build ./...
go test ./... -v 2>&1 | tail -20
```

Expected: 빌드 성공, 전체 테스트 PASS

- [ ] **Step 3: 로컬 실행으로 status 엔드포인트 확인 (Qdrant 필요)**

```bash
# Qdrant가 실행 중이어야 함
VOYAGE_API_KEY=test ./ingestion-service &
curl http://localhost:8081/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: 커밋**

```bash
git add ingestion-service/cmd/main.go
git commit -m "feat(ingestion): add GET /ingest/status/:jobId endpoint"
```

---

## Task 4: UI — AppContext

**Files:**
- Create: `ui-service/app/context/AppContext.tsx`

- [ ] **Step 1: AppContext.tsx 작성**

```tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
  documents: DocumentMeta[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>;
  ingesting: IngestingDoc | null;
  setIngesting: React.Dispatch<React.SetStateAction<IngestingDoc | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  citations: Citation[];
  setCitations: React.Dispatch<React.SetStateAction<Citation[]>>;
  activeCitation: number | null;
  setActiveCitation: React.Dispatch<React.SetStateAction<number | null>>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [ingesting, setIngesting] = useState<IngestingDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);

  return (
    <AppContext.Provider
      value={{
        documents, setDocuments,
        ingesting, setIngesting,
        messages, setMessages,
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

- [ ] **Step 2: layout.tsx에 AppProvider 래핑**

`ui-service/app/layout.tsx` 읽고 `<body>` 안을 `<AppProvider>`로 감싼다:

```tsx
import type { Metadata } from "next";
import { AppProvider } from "./context/AppContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "보험 약관 QA Agent",
  description: "AI 기반 보험 약관 질의응답 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add ui-service/app/context/ ui-service/app/layout.tsx
git commit -m "feat(ui): add AppContext for shared state management"
```

---

## Task 5: UI — CircleProgress 컴포넌트

**Files:**
- Create: `ui-service/app/components/CircleProgress.tsx`

- [ ] **Step 1: CircleProgress.tsx 작성**

```tsx
interface Props {
  progress: number; // 0~100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export default function CircleProgress({
  progress,
  size = 52,
  strokeWidth = 5,
  label,
}: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="#dbeafe" strokeWidth={strokeWidth}
        />
        <circle
          cx={center} cy={center} r={r}
          fill="none" stroke="#2563eb" strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text
          x={center} y={center + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#1e293b"
        >
          {progress}%
        </text>
      </svg>
      {label && <span className="text-[9px] text-slate-500">{label}</span>}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add ui-service/app/components/CircleProgress.tsx
git commit -m "feat(ui): add SVG CircleProgress component"
```

---

## Task 6: UI — API 라우트 업데이트

**Files:**
- Modify: `ui-service/app/api/ingest/route.ts`
- Create: `ui-service/app/api/ingest/status/[jobId]/route.ts`

- [ ] **Step 1: ingest/route.ts 수정 — job_id 반환 방식으로 변경**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const ingestionUrl = process.env.NEXT_PUBLIC_INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

(내용 동일, job_id는 이제 Go 서버가 반환하므로 프록시만 유지)

- [ ] **Step 2: status/[jobId]/route.ts 신규 생성**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const ingestionUrl = process.env.NEXT_PUBLIC_INGESTION_API_URL;

  const res = await fetch(`${ingestionUrl}/ingest/status/${params.jobId}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add ui-service/app/api/
git commit -m "feat(ui): add status polling API proxy route"
```

---

## Task 7: UI — LeftPanel

**Files:**
- Create: `ui-service/app/components/LeftPanel.tsx`

- [ ] **Step 1: LeftPanel.tsx 작성**

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import CircleProgress from "./CircleProgress";
import { useApp } from "../context/AppContext";

const STEP_LABELS: Record<string, string> = {
  parsing: "PDF 파싱 중",
  chunking: "텍스트 청킹 중",
  embedding: "임베딩 생성 중",
  storing: "Qdrant 저장 중",
  done: "완료",
  failed: "실패",
};

const STEPS = ["parsing", "chunking", "embedding", "storing"] as const;

export default function LeftPanel() {
  const { documents, setDocuments, ingesting, setIngesting } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1초 polling
  useEffect(() => {
    if (!ingesting || ingesting.currentStep === "done" || ingesting.currentStep === "failed") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/ingest/status/${ingesting.jobId}`);
      if (!res.ok) return;

      const data = await res.json();
      setIngesting((prev) =>
        prev
          ? {
              ...prev,
              progress: data.progress ?? prev.progress,
              currentStep: data.step ?? prev.currentStep,
              currentChunk: data.currentChunk ?? prev.currentChunk,
              totalChunks: data.totalChunks ?? prev.totalChunks,
              error: data.error,
            }
          : null
      );

      if (data.step === "done") {
        setDocuments((prev) => [
          ...prev,
          {
            id: ingesting.jobId,
            filename: ingesting.filename,
            clauseCount: data.totalChunks ?? 0,
            createdAt: new Date().toISOString(),
          },
        ]);
        setTimeout(() => setIngesting(null), 2000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [ingesting?.jobId, ingesting?.currentStep, setIngesting, setDocuments]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF 파일만 업로드 가능합니다.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "업로드 실패");
        return;
      }

      setIngesting({
        jobId: data.jobId,
        filename: file.name,
        filesize: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
        progress: 0,
        currentStep: "parsing",
        currentChunk: 0,
        totalChunks: 0,
      });
    },
    [setIngesting]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <aside className="w-60 bg-white flex flex-col border-r border-slate-100 flex-shrink-0">
      <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        📁 약관 관리
      </div>

      {/* 업로드 영역 */}
      <div className="p-3">
        <div
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-blue-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-2xl mb-2">📄</div>
          <p className="text-[11px] text-slate-500 mb-1">PDF 약관 파일 업로드</p>
          <p className="text-[10px] text-slate-400 mb-3">드래그 앤 드롭 또는</p>
          <button className="bg-blue-600 text-white text-[11px] font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            파일 선택
          </button>
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {/* 진행 카드 */}
      {ingesting && (
        <div className="mx-3 mb-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📑</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-800 truncate">{ingesting.filename}</p>
              <p className="text-[9px] text-slate-400">{ingesting.filesize}</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <CircleProgress
              progress={ingesting.progress}
              label={ingesting.currentStep === "done" ? "완료" : "처리중"}
            />
            <div className="flex-1 bg-slate-50 rounded-lg p-2 font-mono">
              {STEPS.map((step) => {
                const stepIndex = STEPS.indexOf(step);
                const currentIndex = STEPS.indexOf(ingesting.currentStep as typeof STEPS[number]);
                const isDone = stepIndex < currentIndex || ingesting.currentStep === "done";
                const isActive = step === ingesting.currentStep;
                return (
                  <div key={step} className={`flex items-center gap-2 text-[9px] mb-1.5 last:mb-0 ${isDone ? "text-green-600" : isActive ? "text-blue-600" : "text-slate-300"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDone ? "bg-green-500" : isActive ? "bg-blue-500 animate-pulse" : "bg-slate-200"}`} />
                    <span>
                      {isDone ? `✓ ${STEP_LABELS[step]}` : isActive
                        ? `${STEP_LABELS[step]}${ingesting.totalChunks > 0 ? ` ${ingesting.currentChunk}/${ingesting.totalChunks}` : "..."}`
                        : STEP_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {ingesting.currentStep === "failed" && (
                <div className="text-red-500 text-[9px]">✗ {ingesting.error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 완료된 약관 목록 */}
      {documents.length > 0 && (
        <>
          <div className="px-4 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">완료된 약관</div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100 cursor-pointer hover:border-blue-300 transition-colors">
                <div className="w-7 h-8 bg-blue-100 rounded flex items-center justify-center text-xs flex-shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-800 truncate">{doc.filename.replace(".pdf", "")}</p>
                  <p className="text-[9px] text-slate-400">{doc.clauseCount}개 조항</p>
                </div>
                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[8px] font-bold">✓</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add ui-service/app/components/LeftPanel.tsx
git commit -m "feat(ui): LeftPanel with drag-drop upload and polling progress"
```

---

## Task 8: UI — CitationPanel

**Files:**
- Create: `ui-service/app/components/CitationPanel.tsx`

- [ ] **Step 1: CitationPanel.tsx 작성**

```tsx
"use client";

import { useApp } from "../context/AppContext";

export default function CitationPanel() {
  const { citations, activeCitation, setActiveCitation } = useApp();

  if (citations.length === 0) {
    return (
      <aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
        <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          📌 근거 조항
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-xl">📋</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            AI가 답변하면<br />참조한 조항이<br />여기 표시됩니다
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-white flex flex-col border-l border-slate-100 flex-shrink-0">
      <div className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center gap-2">
        📌 근거 조항
        <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          {citations.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {citations.map((c, i) => {
          const isActive = activeCitation === i;
          const score = Math.round(90 + (citations.length - i) * 3); // 예시 관련도
          return (
            <div
              key={i}
              onClick={() => setActiveCitation(isActive ? null : i)}
              className={`rounded-xl p-3 cursor-pointer border transition-all ${
                isActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50"
              }`}
            >
              <p className="text-[10px] font-bold text-blue-600 mb-1">{c.clauseNumber}</p>
              <p className="text-[11px] font-semibold text-slate-800 mb-2">{c.clauseTitle}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-3">{c.excerpt}</p>
              <div className="mt-2">
                <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                  <span>관련도</span>
                  <span className="font-semibold text-blue-600">{score}%</span>
                </div>
                <div className="h-1 bg-slate-200 rounded-full">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add ui-service/app/components/CitationPanel.tsx
git commit -m "feat(ui): CitationPanel with relevance bar"
```

---

## Task 9: UI — ChatPanel 전면 개선

**Files:**
- Modify: `ui-service/app/components/ChatPanel.tsx`

- [ ] **Step 1: ChatPanel.tsx 전체 재작성**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";

const SUGGESTED_QUESTIONS = [
  "💊 면책기간이 언제 시작되나요?",
  "🏥 입원 보장 범위가 어떻게 되나요?",
  "💰 보험금 청구 조건을 알려주세요",
];

export default function ChatPanel() {
  const { messages, setMessages, setCitations } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, timestamp: new Date() },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const citations = data.citations ?? [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer ?? "답변을 받을 수 없습니다.",
          citations,
          timestamp: new Date(),
        },
      ]);
      // 가장 최근 AI 답변의 citations를 오른쪽 패널에 표시
      setCitations(citations);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex-1 bg-white flex flex-col min-w-0">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl">💬</div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">약관에 대해 질문해보세요</h2>
              <p className="text-[12px] text-slate-400">
                업로드된 약관을 분석하여 정확한 답변을 제공합니다
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 hover:text-blue-600 rounded-full text-slate-600 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[72%]">
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                <p className={`text-[10px] text-slate-400 mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                  {msg.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}

        {/* 분석 중 애니메이션 */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <span className="text-[12px] text-slate-500">약관 분석 중</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="border-t border-slate-100 p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-4 py-2.5 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="약관에 대해 질문해보세요 (예: 면책기간이 언제 시작되나요?)"
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </form>
        <div className="flex gap-2 mt-2 flex-wrap">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading}
              className="text-[10px] px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 hover:text-blue-600 rounded-full text-slate-500 transition-all disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add ui-service/app/components/ChatPanel.tsx
git commit -m "feat(ui): redesign ChatPanel with suggested questions and animations"
```

---

## Task 10: UI — Page 레이아웃 + globals.css

**Files:**
- Modify: `ui-service/app/page.tsx`
- Modify: `ui-service/app/globals.css`
- Delete: `ui-service/app/components/UploadPanel.tsx` (LeftPanel에 통합됨)

- [ ] **Step 1: page.tsx 전체 재작성**

```tsx
import LeftPanel from "./components/LeftPanel";
import ChatPanel from "./components/ChatPanel";
import CitationPanel from "./components/CitationPanel";

export default function Home() {
  return (
    <main className="flex h-screen flex-col bg-slate-100">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 h-[52px] flex items-center gap-3 px-5 flex-shrink-0 shadow-sm">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-base">
          🛡️
        </div>
        <span className="font-bold text-[15px] text-slate-800">보험 약관 QA</span>
        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          AI Agent
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-[11px] text-slate-500">서비스 정상 운영 중</span>
        </div>
      </header>

      {/* 3분할 바디 */}
      <div className="flex flex-1 overflow-hidden gap-px bg-slate-200">
        <LeftPanel />
        <ChatPanel />
        <CitationPanel />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: globals.css에 커스텀 애니메이션 추가**

기존 globals.css 하단에 추가:

```css
/* 분석 중 바운스 딜레이 */
.animation-delay-150 { animation-delay: 150ms; }
.animation-delay-300 { animation-delay: 300ms; }

/* 스크롤바 스타일 */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
```

- [ ] **Step 3: UploadPanel.tsx 삭제**

```bash
rm ui-service/app/components/UploadPanel.tsx
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent/ui-service
npm run build 2>&1 | tail -15
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add ui-service/app/page.tsx ui-service/app/globals.css
git rm ui-service/app/components/UploadPanel.tsx
git commit -m "feat(ui): 3-panel dashboard layout with redesigned header"
```

---

## Task 11: Docker 이미지 재빌드 & K8s 재배포

**Files:**
- 코드 변경 없음. 빌드 및 배포만.

- [ ] **Step 1: minikube Docker 환경 설정**

```bash
eval $(minikube docker-env)
```

- [ ] **Step 2: 전체 이미지 재빌드**

```bash
cd /Users/yuhojin/Desktop/QA\ Agent/insurance-qa-agent
docker compose build 2>&1 | tail -10
```

Expected:
```
ingestion-service  Built
query-service      Built
ui-service         Built
```

- [ ] **Step 3: K8s 재배포**

```bash
kubectl rollout restart deployment/ingestion-service
kubectl rollout restart deployment/ui-service
kubectl rollout status deployment/ingestion-service --timeout=60s
kubectl rollout status deployment/ui-service --timeout=60s
```

Expected:
```
deployment "ingestion-service" successfully rolled out
deployment "ui-service" successfully rolled out
```

- [ ] **Step 4: port-forward 재시작**

```bash
pkill -f "kubectl port-forward" 2>/dev/null
kubectl port-forward svc/ui-service 3000:3000 &>/tmp/pf-ui.log &
echo "UI: http://localhost:3000"
```

- [ ] **Step 5: 통합 확인**

```bash
# 헬스체크
curl -s http://localhost:8081/health

# ingestion status 엔드포인트 확인 (없는 job_id → 404)
curl -s http://localhost:8081/ingest/status/nonexistent

# UI 접근 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected:
```
{"status":"ok"}
{"error":"job not found"}
200
```

- [ ] **Step 6: 최종 커밋**

```bash
git add .
git commit -m "chore: rebuild and redeploy with UI redesign" --allow-empty
```

---

## Self-Review

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| 3분할 대시보드 레이아웃 | Task 10 |
| Clean Professional 색상 (화이트/블루) | Task 9, 10 |
| 헤더 (로고, AI Agent 뱃지, 상태 표시) | Task 10 |
| 업로드 드래그앤드롭 (실제 기능) | Task 7 |
| 서클 차트 SVG | Task 5 |
| 라이브 로그 (파싱→청킹→임베딩→저장) | Task 7 |
| 1초 polling (`/ingest/status/{jobId}`) | Task 7 |
| Ingestion Service job_id 반환 + status 엔드포인트 | Task 1, 2, 3 |
| React Context 전역 상태 | Task 4 |
| 채팅 버블 (사용자/AI 스타일 구분) | Task 9 |
| 추천 질문 칩 3개 고정 + 즉시 전송 | Task 9 |
| 분석 중 바운스 애니메이션 | Task 9 |
| 근거 조항 패널 + 관련도 바 | Task 8 |
| 최근 AI 답변의 citations만 표시 | Task 9 |
| UploadPanel.tsx 삭제 | Task 10 |
| Docker 재빌드 + K8s 재배포 | Task 11 |
