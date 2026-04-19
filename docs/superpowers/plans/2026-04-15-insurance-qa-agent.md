# 보험 약관 QA Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생명보험 약관 PDF를 Qdrant에 인덱싱하고, LangGraph.js Agent가 Claude API로 multi-step reasoning 답변을 생성하는 QA 시스템을 Go + TypeScript 마이크로서비스로 구축한다.

**Architecture:** Go(Fiber) Ingestion Service가 PDF를 파싱·청킹·임베딩(Voyage AI)하여 Qdrant에 저장한다. TypeScript(Hono + LangGraph.js) Query Service가 질문을 받아 Qdrant 검색 후 Claude claude-sonnet-4-6으로 prompt caching 답변을 생성한다. Next.js UI가 두 서비스를 연결하며, 전체는 minikube K8s에 배포된다.

**Tech Stack:** Go 1.22 + Fiber v2 | TypeScript 5.x + Hono 4.x + LangGraph.js | Next.js 14 | Qdrant (REST) | Claude claude-sonnet-4-6 | Voyage AI voyage-2 | minikube

---

## 파일 구조

```
insurance-qa-agent/
├── ingestion-service/
│   ├── cmd/main.go
│   ├── internal/
│   │   ├── config/config.go          # viper로 config.toml 로드
│   │   ├── parser/parser.go          # PDF 텍스트 추출 인터페이스 + 구현
│   │   ├── parser/parser_test.go
│   │   ├── chunker/chunker.go        # 슬라이딩 윈도우 청킹
│   │   ├── chunker/chunker_test.go
│   │   ├── embedder/embedder.go      # Voyage AI REST 클라이언트 인터페이스 + 구현
│   │   ├── embedder/embedder_test.go
│   │   ├── store/store.go            # Qdrant REST 클라이언트 인터페이스 + 구현
│   │   ├── store/store_test.go
│   │   └── handler/ingest.go        # Fiber 핸들러 + 테스트
│   ├── config.toml
│   ├── .env
│   ├── Dockerfile
│   └── go.mod
├── query-service/
│   ├── src/
│   │   ├── index.ts                  # Hono 앱 진입점
│   │   ├── clients/
│   │   │   ├── qdrant.ts             # Qdrant REST 클라이언트
│   │   │   └── voyage.ts             # Voyage AI 임베딩 클라이언트
│   │   └── graph/
│   │       ├── state.ts              # AgentState Annotation 정의
│   │       ├── nodes/
│   │       │   ├── classifier.ts     # question_classifier 노드
│   │       │   ├── retriever.ts      # retriever 노드
│   │       │   ├── tools-agent.ts    # tools_agent 노드 (tool calling)
│   │       │   ├── answer-generator.ts  # answer_generator 노드 (prompt caching)
│   │       │   └── citation-formatter.ts
│   │       ├── tools/
│   │       │   ├── calculate-days.ts
│   │       │   ├── check-exclusion.ts
│   │       │   └── check-waiting-period.ts
│   │       └── graph.ts              # StateGraph 조립 + conditional edge
│   ├── src/__tests__/
│   │   ├── chunker.test.ts           # (없음 - chunker는 Go에)
│   │   ├── tools.test.ts
│   │   └── nodes.test.ts
│   ├── .env
│   ├── Dockerfile
│   ├── tsconfig.json
│   └── package.json
├── ui-service/
│   ├── src/app/
│   │   ├── page.tsx                  # 메인 레이아웃 (업로드 + 채팅 분할)
│   │   ├── components/
│   │   │   ├── UploadPanel.tsx       # PDF 업로드 패널
│   │   │   └── ChatPanel.tsx         # 채팅 + 근거 조항 토글
│   │   └── api/
│   │       ├── ingest/route.ts       # Ingestion Service 프록시
│   │       └── query/route.ts        # Query Service 프록시
│   ├── .env.local
│   ├── Dockerfile
│   └── package.json
├── k8s/
│   ├── qdrant/deployment.yaml
│   ├── qdrant/service.yaml
│   ├── qdrant/pvc.yaml
│   ├── ingestion-service/deployment.yaml
│   ├── ingestion-service/service.yaml
│   ├── ingestion-service/configmap.yaml
│   ├── query-service/deployment.yaml
│   ├── query-service/service.yaml
│   ├── query-service/secret.yaml
│   ├── ui-service/deployment.yaml
│   └── ui-service/service.yaml
├── docker-compose.yml
└── .gitignore
```

---

## Task 1: 프로젝트 부트스트랩 & Qdrant 실행

**Files:**
- Create: `docker-compose.yml`
- Create: `.gitignore`

- [ ] **Step 1: 루트 디렉토리 생성**

```bash
mkdir -p insurance-qa-agent && cd insurance-qa-agent
mkdir -p ingestion-service query-service ui-service k8s docs/superpowers/specs
git init
```

- [ ] **Step 2: .gitignore 작성**

```
# Go
ingestion-service/vendor/
ingestion-service/*.exe

# Node
node_modules/
.next/

# 환경 변수
.env
.env.local
*.env

# 빌드 결과물
dist/
build/

# OS
.DS_Store
```

- [ ] **Step 3: docker-compose.yml 작성**

```yaml
version: "3.9"

services:
  qdrant:
    image: qdrant/qdrant:v1.9.2
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  ingestion-service:
    build: ./ingestion-service
    ports:
      - "8081:8081"
    env_file:
      - ./ingestion-service/.env
    volumes:
      - ./ingestion-service/config.toml:/app/config.toml
    depends_on:
      - qdrant

  query-service:
    build: ./query-service
    ports:
      - "8082:8082"
    env_file:
      - ./query-service/.env
    depends_on:
      - qdrant

  ui-service:
    build: ./ui-service
    ports:
      - "3000:3000"
    env_file:
      - ./ui-service/.env.local
    depends_on:
      - ingestion-service
      - query-service

volumes:
  qdrant_data:
```

- [ ] **Step 4: Qdrant 실행 및 헬스체크**

```bash
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:v1.9.2
curl http://localhost:6333/healthz
```

Expected:
```
healthz check passed
```

- [ ] **Step 5: insurance_clauses 컬렉션 생성**

```bash
curl -X PUT http://localhost:6333/collections/insurance_clauses \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 1024,
      "distance": "Cosine"
    }
  }'
```

Expected:
```json
{"result":true,"status":"ok","time":0.012}
```

- [ ] **Step 6: 커밋**

```bash
git add .gitignore docker-compose.yml
git commit -m "chore: project bootstrap with docker-compose and Qdrant"
```

---

## Task 2: Ingestion Service — Go 모듈 & 설정

**Files:**
- Create: `ingestion-service/go.mod`
- Create: `ingestion-service/config.toml`
- Create: `ingestion-service/.env`
- Create: `ingestion-service/internal/config/config.go`

- [ ] **Step 1: Go 모듈 초기화 및 의존성 설치**

```bash
cd ingestion-service
go mod init github.com/yourusername/insurance-qa-agent/ingestion-service
go get github.com/gofiber/fiber/v2
go get github.com/spf13/viper
go get github.com/joho/godotenv
go get github.com/ledongthuc/pdf
go get github.com/stretchr/testify
go get github.com/google/uuid
```

- [ ] **Step 2: config.toml 작성**

```toml
[server]
port = 8081

[qdrant]
base_url = "http://localhost:6333"
collection = "insurance_clauses"

[chunking]
chunk_size = 512
overlap = 50

[embedding]
model = "voyage-2"
base_url = "https://api.voyageai.com/v1/embeddings"
```

- [ ] **Step 3: .env 작성 (실제 키는 채워넣기)**

```
VOYAGE_API_KEY=your_voyage_api_key_here
```

- [ ] **Step 4: internal/config/config.go 작성**

```go
package config

import (
	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Qdrant    QdrantConfig    `mapstructure:"qdrant"`
	Chunking  ChunkingConfig  `mapstructure:"chunking"`
	Embedding EmbeddingConfig `mapstructure:"embedding"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type QdrantConfig struct {
	BaseURL    string `mapstructure:"base_url"`
	Collection string `mapstructure:"collection"`
}

type ChunkingConfig struct {
	ChunkSize int `mapstructure:"chunk_size"`
	Overlap   int `mapstructure:"overlap"`
}

type EmbeddingConfig struct {
	Model   string `mapstructure:"model"`
	BaseURL string `mapstructure:"base_url"`
}

func Load(path string) (*Config, error) {
	viper.SetConfigFile(path)
	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
```

- [ ] **Step 5: 설정 로드 검증**

```bash
cd ingestion-service
go build ./...
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add ingestion-service/
git commit -m "feat(ingestion): Go module setup and config loading"
```

---

## Task 3: Ingestion Service — PDF Parser

**Files:**
- Create: `ingestion-service/internal/parser/parser.go`
- Create: `ingestion-service/internal/parser/parser_test.go`
- Create: `ingestion-service/testdata/sample.txt` (테스트용 텍스트)

- [ ] **Step 1: 테스트용 샘플 PDF 텍스트 파일 생성**

```bash
mkdir -p ingestion-service/testdata
```

`ingestion-service/testdata/README.md` 에 작성:
```
실제 테스트 시 삼성생명 등 공개 약관 PDF를 이 디렉토리에 넣으세요.
단위 테스트는 mock을 사용합니다.
```

- [ ] **Step 2: parser.go 인터페이스 + 구현 작성**

```go
package parser

import (
	"bytes"

	"github.com/ledongthuc/pdf"
)

// Parser는 PDF에서 텍스트를 추출하는 인터페이스다.
type Parser interface {
	Extract(path string) (string, error)
}

type PDFParser struct{}

func New() Parser {
	return &PDFParser{}
}

func (p *PDFParser) Extract(path string) (string, error) {
	f, r, err := pdf.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var buf bytes.Buffer
	b, err := r.GetPlainText()
	if err != nil {
		return "", err
	}
	if _, err := buf.ReadFrom(b); err != nil {
		return "", err
	}
	return buf.String(), nil
}
```

- [ ] **Step 3: parser_test.go 작성 (인터페이스 계약 테스트)**

```go
package parser_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
)

// MockParser는 테스트용 가짜 Parser다.
type MockParser struct {
	Text string
	Err  error
}

func (m *MockParser) Extract(_ string) (string, error) {
	return m.Text, m.Err
}

func TestMockParser_Extract(t *testing.T) {
	mock := &MockParser{Text: "보험 약관 제1조 목적 이 약관은..."}
	text, err := mock.Extract("irrelevant.pdf")
	assert.NoError(t, err)
	assert.Equal(t, "보험 약관 제1조 목적 이 약관은...", text)
}

func TestMockParser_ExtractError(t *testing.T) {
	mock := &MockParser{Err: assert.AnError}
	_, err := mock.Extract("bad.pdf")
	assert.Error(t, err)
}

// Parser 인터페이스를 PDFParser가 올바르게 구현하는지 컴파일 타임 확인
var _ parser.Parser = (*parser.PDFParser)(nil)
```

- [ ] **Step 4: 테스트 실행**

```bash
cd ingestion-service
go test ./internal/parser/... -v
```

Expected:
```
--- PASS: TestMockParser_Extract (0.00s)
--- PASS: TestMockParser_ExtractError (0.00s)
PASS
```

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/parser/ ingestion-service/testdata/
git commit -m "feat(ingestion): PDF parser interface and implementation"
```

---

## Task 4: Ingestion Service — Text Chunker

**Files:**
- Create: `ingestion-service/internal/chunker/chunker.go`
- Create: `ingestion-service/internal/chunker/chunker_test.go`

- [ ] **Step 1: chunker_test.go 먼저 작성 (TDD)**

```go
package chunker_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
)

func TestChunk_BasicSliding(t *testing.T) {
	// 10개 단어, size=5, overlap=2 → step=3
	words := make([]string, 10)
	for i := range words {
		words[i] = fmt.Sprintf("w%d", i)
	}
	text := strings.Join(words, " ")

	c := chunker.New()
	chunks := c.Chunk(text, 5, 2)

	// i=0: w0~w4, i=3: w3~w7, i=6: w6~w9(end)
	require.Len(t, chunks, 3)
	assert.Equal(t, "w0 w1 w2 w3 w4", chunks[0])
	assert.Equal(t, "w3 w4 w5 w6 w7", chunks[1])
	assert.Equal(t, "w6 w7 w8 w9", chunks[2])
}

func TestChunk_TextShorterThanChunkSize(t *testing.T) {
	c := chunker.New()
	chunks := c.Chunk("짧은 텍스트", 512, 50)
	require.Len(t, chunks, 1)
	assert.Equal(t, "짧은 텍스트", chunks[0])
}

func TestChunk_EmptyText(t *testing.T) {
	c := chunker.New()
	chunks := c.Chunk("", 512, 50)
	assert.Empty(t, chunks)
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
go test ./internal/chunker/... -v
```

Expected: `cannot find package` 또는 컴파일 에러

- [ ] **Step 3: chunker.go 구현**

```go
package chunker

import "strings"

// Chunker는 텍스트를 슬라이딩 윈도우로 청킹하는 인터페이스다.
type Chunker interface {
	Chunk(text string, chunkSize, overlap int) []string
}

type WordChunker struct{}

func New() Chunker {
	return &WordChunker{}
}

// Chunk는 텍스트를 단어 단위로 슬라이딩 윈도우 청킹한다.
// chunkSize: 청크당 최대 단어 수 (토큰 근사값으로 사용)
// overlap: 연속 청크 간 중복 단어 수
func (w *WordChunker) Chunk(text string, chunkSize, overlap int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}

	step := chunkSize - overlap
	if step <= 0 {
		step = 1
	}

	var chunks []string
	for i := 0; i < len(words); i += step {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}
		chunks = append(chunks, strings.Join(words[i:end], " "))
		if end == len(words) {
			break
		}
	}
	return chunks
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

```bash
go test ./internal/chunker/... -v
```

Expected:
```
--- PASS: TestChunk_BasicSliding (0.00s)
--- PASS: TestChunk_TextShorterThanChunkSize (0.00s)
--- PASS: TestChunk_EmptyText (0.00s)
PASS
```

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/chunker/
git commit -m "feat(ingestion): sliding window text chunker with TDD"
```

---

## Task 5: Ingestion Service — Voyage AI Embedder

**Files:**
- Create: `ingestion-service/internal/embedder/embedder.go`
- Create: `ingestion-service/internal/embedder/embedder_test.go`

- [ ] **Step 1: embedder_test.go 작성 (Mock으로 인터페이스 검증)**

```go
package embedder_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
)

type MockEmbedder struct {
	Vectors [][]float32
	Err     error
}

func (m *MockEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	// 입력 수만큼 벡터 반환
	result := make([][]float32, len(texts))
	for i := range texts {
		result[i] = m.Vectors[i%len(m.Vectors)]
	}
	return result, nil
}

func TestMockEmbedder_Embed(t *testing.T) {
	mock := &MockEmbedder{
		Vectors: [][]float32{{0.1, 0.2, 0.3}},
	}
	vecs, err := mock.Embed(context.Background(), []string{"텍스트1", "텍스트2"})
	require.NoError(t, err)
	assert.Len(t, vecs, 2)
}

// VoyageEmbedder가 Embedder 인터페이스를 구현하는지 컴파일 타임 확인
var _ embedder.Embedder = (*embedder.VoyageEmbedder)(nil)
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
go test ./internal/embedder/... -v
```

Expected: 컴파일 에러 (VoyageEmbedder 없음)

- [ ] **Step 3: embedder.go 구현**

```go
package embedder

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Embedder는 텍스트를 벡터로 변환하는 인터페이스다.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

type VoyageEmbedder struct {
	apiKey  string
	model   string
	baseURL string
}

func New(apiKey, model, baseURL string) Embedder {
	return &VoyageEmbedder{apiKey: apiKey, model: model, baseURL: baseURL}
}

type embedRequest struct {
	Input []string `json:"input"`
	Model string   `json:"model"`
}

type embedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
}

func (v *VoyageEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	body, err := json.Marshal(embedRequest{Input: texts, Model: v.model})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.baseURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+v.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("voyage api error: status %d", resp.StatusCode)
	}

	var result embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	vectors := make([][]float32, len(result.Data))
	for _, d := range result.Data {
		vectors[d.Index] = d.Embedding
	}
	return vectors, nil
}
```

- [ ] **Step 4: 테스트 실행**

```bash
go test ./internal/embedder/... -v
```

Expected:
```
--- PASS: TestMockEmbedder_Embed (0.00s)
PASS
```

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/embedder/
git commit -m "feat(ingestion): Voyage AI embedder with interface abstraction"
```

---

## Task 6: Ingestion Service — Qdrant Store Client

**Files:**
- Create: `ingestion-service/internal/store/store.go`
- Create: `ingestion-service/internal/store/store_test.go`

- [ ] **Step 1: store_test.go 작성**

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
	Err            error
}

func (m *MockStore) Upsert(_ context.Context, chunks []string, vectors [][]float32, docName string) error {
	if m.Err != nil {
		return m.Err
	}
	m.UpsertedChunks = append(m.UpsertedChunks, chunks...)
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
	)
	assert.NoError(t, err)
	assert.Equal(t, []string{"chunk1", "chunk2"}, mock.UpsertedChunks)
}

// QdrantStore가 Store 인터페이스를 구현하는지 컴파일 타임 확인
var _ store.Store = (*store.QdrantStore)(nil)
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
go test ./internal/store/... -v
```

Expected: 컴파일 에러

- [ ] **Step 3: store.go 구현**

```go
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

// Store는 Qdrant에 벡터를 저장하는 인터페이스다.
type Store interface {
	Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string) error
	EnsureCollection(ctx context.Context, vectorSize uint64) error
}

type QdrantStore struct {
	baseURL    string
	collection string
}

func New(baseURL, collection string) Store {
	return &QdrantStore{baseURL: baseURL, collection: collection}
}

type point struct {
	ID      string             `json:"id"`
	Vector  []float32          `json:"vector"`
	Payload map[string]interface{} `json:"payload"`
}

func (q *QdrantStore) Upsert(ctx context.Context, chunks []string, vectors [][]float32, docName string) error {
	points := make([]point, len(chunks))
	for i, chunk := range chunks {
		points[i] = point{
			ID:     uuid.New().String(),
			Vector: vectors[i],
			Payload: map[string]interface{}{
				"content":       chunk,
				"document_name": docName,
				"chunk_index":   i,
			},
		}
	}

	body, err := json.Marshal(map[string]interface{}{"points": points})
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/collections/%s/points", q.baseURL, q.collection)
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

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant upsert error: status %d", resp.StatusCode)
	}
	return nil
}

func (q *QdrantStore) EnsureCollection(ctx context.Context, vectorSize uint64) error {
	url := fmt.Sprintf("%s/collections/%s", q.baseURL, q.collection)
	body, _ := json.Marshal(map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     vectorSize,
			"distance": "Cosine",
		},
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

	// 이미 존재하는 경우(400)는 무시
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusBadRequest {
		return fmt.Errorf("qdrant create collection error: status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: 테스트 실행**

```bash
go test ./internal/store/... -v
```

Expected:
```
--- PASS: TestMockStore_Upsert (0.00s)
PASS
```

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/store/
git commit -m "feat(ingestion): Qdrant REST store client"
```

---

## Task 7: Ingestion Service — Fiber 핸들러 & main & Dockerfile

**Files:**
- Create: `ingestion-service/internal/handler/ingest.go`
- Create: `ingestion-service/cmd/main.go`
- Create: `ingestion-service/Dockerfile`

- [ ] **Step 1: handler/ingest.go 작성**

```go
package handler

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/config"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

type IngestHandler struct {
	parser   parser.Parser
	chunker  chunker.Chunker
	embedder embedder.Embedder
	store    store.Store
	cfg      *config.Config
}

func New(p parser.Parser, c chunker.Chunker, e embedder.Embedder, s store.Store, cfg *config.Config) *IngestHandler {
	return &IngestHandler{parser: p, chunker: c, embedder: e, store: s, cfg: cfg}
}

func (h *IngestHandler) Handle(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file field is required"})
	}

	if !strings.HasSuffix(strings.ToLower(file.Filename), ".pdf") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PDF files are accepted"})
	}

	tmpPath := fmt.Sprintf("/tmp/%s", file.Filename)
	if err := c.SaveFile(file, tmpPath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}
	defer os.Remove(tmpPath)

	text, err := h.parser.Extract(tmpPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to parse PDF"})
	}

	chunks := h.chunker.Chunk(text, h.cfg.Chunking.ChunkSize, h.cfg.Chunking.Overlap)
	if len(chunks) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no text extracted from PDF"})
	}

	vectors, err := h.embedder.Embed(context.Background(), chunks)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to embed chunks"})
	}

	docName := strings.TrimSuffix(file.Filename, ".pdf")
	if err := h.store.Upsert(context.Background(), chunks, vectors, docName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to store chunks"})
	}

	return c.JSON(fiber.Map{
		"document": docName,
		"chunks":   len(chunks),
	})
}
```

- [ ] **Step 2: cmd/main.go 작성**

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
		log.Printf("collection may already exist: %v", err)
	}

	h := handler.New(
		parser.New(),
		chunker.New(),
		embedder.New(voyageAPIKey, cfg.Embedding.Model, cfg.Embedding.BaseURL),
		qdrantStore,
		cfg,
	)

	app := fiber.New()
	app.Post("/ingest", h.Handle)
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Fatal(app.Listen(fmt.Sprintf(":%d", cfg.Server.Port)))
}
```

- [ ] **Step 3: Dockerfile 작성**

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o ingestion-service ./cmd/main.go

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/ingestion-service .
COPY config.toml .
EXPOSE 8081
CMD ["./ingestion-service"]
```

- [ ] **Step 4: 빌드 확인**

```bash
cd ingestion-service
go build ./cmd/main.go
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add ingestion-service/internal/handler/ ingestion-service/cmd/ ingestion-service/Dockerfile
git commit -m "feat(ingestion): Fiber handler, main entrypoint, and Dockerfile"
```

---

## Task 8: Query Service — TypeScript 셋업 & State 타입

**Files:**
- Create: `query-service/package.json`
- Create: `query-service/tsconfig.json`
- Create: `query-service/.env`
- Create: `query-service/src/graph/state.ts`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "query-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@hono/node-server": "^1.12.0",
    "@langchain/langgraph": "^0.2.36",
    "@qdrant/js-client-rest": "^1.9.0",
    "dotenv": "^16.4.5",
    "hono": "^4.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: .env 작성**

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
VOYAGE_API_KEY=your_voyage_api_key_here
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=insurance_clauses
PORT=8082
```

- [ ] **Step 4: src/graph/state.ts 작성**

```typescript
import { Annotation } from "@langchain/langgraph";

export interface Clause {
  id: string;
  clauseNumber: string;
  clauseTitle: string;
  content: string;
  documentName: string;
  score: number;
}

export interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

export type QuestionType = "coverage" | "claim_eligibility" | "general";

export const AgentState = Annotation.Root({
  question: Annotation<string>(),
  questionType: Annotation<QuestionType>({
    default: () => "general",
  }),
  retrievedClauses: Annotation<Clause[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  toolResults: Annotation<string>({
    default: () => "",
  }),
  answer: Annotation<string>({
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});
```

- [ ] **Step 5: 의존성 설치 및 타입 체크**

```bash
cd query-service
npm install
npx tsc --noEmit
```

Expected: 에러 없이 타입 체크 통과

- [ ] **Step 6: 커밋**

```bash
git add query-service/
git commit -m "feat(query): TypeScript project setup and LangGraph state types"
```

---

## Task 9: Query Service — Qdrant & Voyage 클라이언트

**Files:**
- Create: `query-service/src/clients/qdrant.ts`
- Create: `query-service/src/clients/voyage.ts`

- [ ] **Step 1: src/clients/voyage.ts 작성**

```typescript
export class VoyageClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "voyage-2") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      throw new Error(`Voyage AI error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    const result: number[][] = new Array(texts.length);
    for (const item of data.data) {
      result[item.index] = item.embedding;
    }
    return result;
  }
}
```

- [ ] **Step 2: src/clients/qdrant.ts 작성**

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Clause } from "../graph/state.js";

interface QdrantPayload {
  content: string;
  document_name: string;
  chunk_index: number;
  clause_number?: string;
  clause_title?: string;
}

export class InsuranceQdrantClient {
  private client: QdrantClient;
  private collection: string;

  constructor(url: string, collection: string) {
    this.client = new QdrantClient({ url });
    this.collection = collection;
  }

  async search(vector: number[], limit = 5): Promise<Clause[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
    });

    return results.map((r) => {
      const payload = r.payload as QdrantPayload;
      return {
        id: String(r.id),
        clauseNumber: payload.clause_number ?? `chunk-${payload.chunk_index}`,
        clauseTitle: payload.clause_title ?? payload.document_name,
        content: payload.content,
        documentName: payload.document_name,
        score: r.score,
      };
    });
  }
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd query-service
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add query-service/src/clients/
git commit -m "feat(query): Qdrant and Voyage AI client wrappers"
```

---

## Task 10: Query Service — Classifier & Retriever 노드

**Files:**
- Create: `query-service/src/graph/nodes/classifier.ts`
- Create: `query-service/src/graph/nodes/retriever.ts`
- Create: `query-service/src/__tests__/nodes.test.ts`

- [ ] **Step 1: nodes.test.ts에 classifier 테스트 작성**

```typescript
import { describe, it, expect, vi } from "vitest";
import type { QuestionType } from "../graph/state.js";

// classifier 로직을 순수 함수로 분리하여 테스트
function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

describe("parseQuestionType", () => {
  it("coverage 반환", () => {
    expect(parseQuestionType("coverage")).toBe("coverage");
  });
  it("claim_eligibility 반환", () => {
    expect(parseQuestionType("claim_eligibility")).toBe("claim_eligibility");
  });
  it("알 수 없는 값은 general 반환", () => {
    expect(parseQuestionType("unknown")).toBe("general");
    expect(parseQuestionType("")).toBe("general");
  });
  it("대소문자 무시", () => {
    expect(parseQuestionType("COVERAGE")).toBe("coverage");
  });
});
```

- [ ] **Step 2: 테스트 실행하여 통과 확인**

```bash
cd query-service
npm test
```

Expected:
```
✓ parseQuestionType > coverage 반환
✓ parseQuestionType > claim_eligibility 반환
✓ parseQuestionType > 알 수 없는 값은 general 반환
✓ parseQuestionType > 대소문자 무시
```

- [ ] **Step 3: src/graph/nodes/classifier.ts 작성**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, QuestionType } from "../state.js";

function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

export async function classifyQuestion(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    system: `보험 질문을 분류하세요. 반드시 아래 세 단어 중 하나만 응답하세요.
- coverage: 보장 범위, 보험금 지급 조건 관련
- claim_eligibility: 특정 상황에서 보험금 청구 가능 여부 판단
- general: 기타 일반 문의`,
    messages: [{ role: "user", content: state.question }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "general";
  return { questionType: parseQuestionType(text) };
}
```

- [ ] **Step 4: src/graph/nodes/retriever.ts 작성**

```typescript
import { VoyageClient } from "../../clients/voyage.js";
import { InsuranceQdrantClient } from "../../clients/qdrant.js";
import type { AgentState } from "../state.js";

export function createRetriever(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  return async function retrieve(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const [embedding] = await voyageClient.embed([state.question]);
    const clauses = await qdrantClient.search(embedding, 5);
    return { retrievedClauses: clauses };
  };
}
```

- [ ] **Step 5: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add query-service/src/graph/nodes/classifier.ts query-service/src/graph/nodes/retriever.ts query-service/src/__tests__/
git commit -m "feat(query): classifier and retriever LangGraph nodes"
```

---

## Task 11: Query Service — 보험 도메인 Tools

**Files:**
- Create: `query-service/src/graph/tools/calculate-days.ts`
- Create: `query-service/src/graph/tools/check-exclusion.ts`
- Create: `query-service/src/graph/tools/check-waiting-period.ts`
- Create: `query-service/src/__tests__/tools.test.ts`

- [ ] **Step 1: tools.test.ts 작성 (TDD)**

```typescript
import { describe, it, expect } from "vitest";
import { calculateHospitalizationDays } from "../graph/tools/calculate-days.js";
import { checkExclusionClause } from "../graph/tools/check-exclusion.js";
import { checkWaitingPeriod } from "../graph/tools/check-waiting-period.js";
import type { Clause } from "../graph/state.js";

describe("calculateHospitalizationDays", () => {
  it("정상 입원 기간 계산", () => {
    expect(calculateHospitalizationDays("2024-01-01", "2024-01-05")).toBe(4);
  });
  it("당일 퇴원은 0일", () => {
    expect(calculateHospitalizationDays("2024-01-01", "2024-01-01")).toBe(0);
  });
});

const mockClauses: Clause[] = [
  {
    id: "1",
    clauseNumber: "제5조",
    clauseTitle: "면책 조항",
    content: "자해, 자살, 전쟁으로 인한 사고는 보험금을 지급하지 않습니다.",
    documentName: "삼성생명_암보험",
    score: 0.9,
  },
];

describe("checkExclusionClause", () => {
  it("면책 조항에 포함된 경우 true", () => {
    expect(checkExclusionClause(mockClauses, "자해")).toBe(true);
  });
  it("면책 조항에 없는 경우 false", () => {
    expect(checkExclusionClause(mockClauses, "암 진단")).toBe(false);
  });
});

describe("checkWaitingPeriod", () => {
  it("면책기간 이후 사고는 true (청구 가능)", () => {
    expect(checkWaitingPeriod("2024-01-01", "2024-04-01", 90)).toBe(true);
  });
  it("면책기간 중 사고는 false (청구 불가)", () => {
    expect(checkWaitingPeriod("2024-01-01", "2024-01-30", 90)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
npm test
```

Expected: import 에러 (파일 없음)

- [ ] **Step 3: calculate-days.ts 구현**

```typescript
export function calculateHospitalizationDays(
  startDate: string,
  endDate: string
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 4: check-exclusion.ts 구현**

```typescript
import type { Clause } from "../state.js";

export function checkExclusionClause(
  clauses: Clause[],
  condition: string
): boolean {
  const exclusionClauses = clauses.filter(
    (c) => c.clauseTitle.includes("면책") || c.clauseTitle.includes("제외")
  );
  return exclusionClauses.some((c) => c.content.includes(condition));
}
```

- [ ] **Step 5: check-waiting-period.ts 구현**

```typescript
export function checkWaitingPeriod(
  enrollmentDate: string,
  incidentDate: string,
  waitingDays: number
): boolean {
  const enrollment = new Date(enrollmentDate);
  const incident = new Date(incidentDate);
  const diffDays = Math.floor(
    (incident.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays >= waitingDays;
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected:
```
✓ calculateHospitalizationDays > 정상 입원 기간 계산
✓ calculateHospitalizationDays > 당일 퇴원은 0일
✓ checkExclusionClause > 면책 조항에 포함된 경우 true
✓ checkExclusionClause > 면책 조항에 없는 경우 false
✓ checkWaitingPeriod > 면책기간 이후 사고는 true (청구 가능)
✓ checkWaitingPeriod > 면책기간 중 사고는 false (청구 불가)
```

- [ ] **Step 7: 커밋**

```bash
git add query-service/src/graph/tools/ query-service/src/__tests__/tools.test.ts
git commit -m "feat(query): insurance domain tools with TDD"
```

---

## Task 12: Query Service — Answer Generator, Tools Agent, Citation Formatter

**Files:**
- Create: `query-service/src/graph/nodes/tools-agent.ts`
- Create: `query-service/src/graph/nodes/answer-generator.ts`
- Create: `query-service/src/graph/nodes/citation-formatter.ts`

- [ ] **Step 1: answer-generator.ts 작성 (prompt caching 포함)**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function generateAnswer(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  const clauseContext = state.retrievedClauses
    .map((c) => `[${c.clauseNumber}] ${c.clauseTitle}\n${c.content}`)
    .join("\n\n---\n\n");

  const toolContext = state.toolResults
    ? `\n\n도구 분석 결과:\n${state.toolResults}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: "당신은 보험 약관 전문가입니다. 제공된 약관 조항만을 근거로 정확하고 명확하게 답변하세요. 약관에 없는 내용은 추측하지 마세요. 답변 끝에 참조한 조항 번호를 명시하세요.",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `관련 약관 조항:\n\n${clauseContext}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: state.question + toolContext,
      },
    ],
  });

  const answer =
    response.content[0].type === "text" ? response.content[0].text : "";
  return { answer };
}
```

- [ ] **Step 2: tools-agent.ts 작성**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { calculateHospitalizationDays } from "../tools/calculate-days.js";
import { checkExclusionClause } from "../tools/check-exclusion.js";
import { checkWaitingPeriod } from "../tools/check-waiting-period.js";
import type { AgentState } from "../state.js";

const toolDefs: Anthropic.Tool[] = [
  {
    name: "calculate_hospitalization_days",
    description: "입원 시작일과 종료일로 입원일수를 계산합니다",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "입원 시작일 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "퇴원일 (YYYY-MM-DD)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "check_exclusion_clause",
    description: "증상이나 사고 유형이 면책 조항에 해당하는지 확인합니다",
    input_schema: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          description: "확인할 증상 또는 사고 유형 (예: 자해, 암)",
        },
      },
      required: ["condition"],
    },
  },
  {
    name: "check_waiting_period",
    description: "가입일로부터 면책기간(대기기간)이 경과했는지 확인합니다",
    input_schema: {
      type: "object",
      properties: {
        enrollment_date: {
          type: "string",
          description: "보험 가입일 (YYYY-MM-DD)",
        },
        incident_date: {
          type: "string",
          description: "사고 또는 질병 발생일 (YYYY-MM-DD)",
        },
        waiting_days: { type: "number", description: "면책기간 일수" },
      },
      required: ["enrollment_date", "incident_date", "waiting_days"],
    },
  },
];

function executeTool(
  name: string,
  input: Record<string, unknown>,
  clauses: typeof AgentState.State["retrievedClauses"]
): string {
  if (name === "calculate_hospitalization_days") {
    const days = calculateHospitalizationDays(
      input.start_date as string,
      input.end_date as string
    );
    return `입원일수: ${days}일`;
  }
  if (name === "check_exclusion_clause") {
    const isExcluded = checkExclusionClause(clauses, input.condition as string);
    return isExcluded
      ? `"${input.condition}"은 면책 조항에 해당합니다.`
      : `"${input.condition}"은 면책 조항에 해당하지 않습니다.`;
  }
  if (name === "check_waiting_period") {
    const passed = checkWaitingPeriod(
      input.enrollment_date as string,
      input.incident_date as string,
      input.waiting_days as number
    );
    return passed
      ? "면책기간이 경과하여 청구 가능합니다."
      : "면책기간 중이므로 청구가 불가합니다.";
  }
  return "알 수 없는 도구";
}

export async function toolsAgent(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();
  const results: string[] = [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: toolDefs,
    system:
      "보험 청구 가능 여부를 판단하기 위해 필요한 도구를 사용하세요. 사용자 질문에서 날짜, 증상, 사고 유형 정보를 추출하여 적절한 도구를 호출하세요.",
    messages: [{ role: "user", content: state.question }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const result = executeTool(
        block.name,
        block.input as Record<string, unknown>,
        state.retrievedClauses
      );
      results.push(`[${block.name}] ${result}`);
    }
  }

  return { toolResults: results.join("\n") };
}
```

- [ ] **Step 3: citation-formatter.ts 작성**

```typescript
import type { AgentState, Citation } from "../state.js";

export function formatCitations(
  state: typeof AgentState.State
): Partial<typeof AgentState.State> {
  const citations: Citation[] = state.retrievedClauses.slice(0, 3).map(
    (c): Citation => ({
      clauseNumber: c.clauseNumber,
      clauseTitle: c.clauseTitle,
      excerpt: c.content.length > 200 ? c.content.slice(0, 200) + "..." : c.content,
    })
  );
  return { citations };
}
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add query-service/src/graph/nodes/
git commit -m "feat(query): tools-agent, answer-generator with prompt caching, citation-formatter"
```

---

## Task 13: Query Service — Graph 조립 & Hono API & Dockerfile

**Files:**
- Create: `query-service/src/graph/graph.ts`
- Create: `query-service/src/index.ts`
- Create: `query-service/Dockerfile`

- [ ] **Step 1: src/graph/graph.ts 작성**

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { classifyQuestion } from "./nodes/classifier.js";
import { createRetriever } from "./nodes/retriever.js";
import { toolsAgent } from "./nodes/tools-agent.js";
import { generateAnswer } from "./nodes/answer-generator.js";
import { formatCitations } from "./nodes/citation-formatter.js";
import { VoyageClient } from "../clients/voyage.js";
import { InsuranceQdrantClient } from "../clients/qdrant.js";

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
    .addEdge("answer_generator", "citation_formatter")
    .addEdge("citation_formatter", END);

  return graph.compile();
}
```

- [ ] **Step 2: src/index.ts 작성**

```typescript
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { VoyageClient } from "./clients/voyage.js";
import { InsuranceQdrantClient } from "./clients/qdrant.js";
import { buildGraph } from "./graph/graph.js";

const voyageClient = new VoyageClient(process.env.VOYAGE_API_KEY!);
const qdrantClient = new InsuranceQdrantClient(
  process.env.QDRANT_URL!,
  process.env.QDRANT_COLLECTION!
);
const graph = buildGraph(voyageClient, qdrantClient);

const app = new Hono();

app.post("/query", async (c) => {
  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  const result = await graph.invoke({ question });
  return c.json({
    answer: result.answer,
    citations: result.citations,
    questionType: result.questionType,
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 8082);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Query service running on :${port}`);
});
```

- [ ] **Step 3: Dockerfile 작성**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .
EXPOSE 8082
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: 빌드 확인**

```bash
cd query-service
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add query-service/src/graph/graph.ts query-service/src/index.ts query-service/Dockerfile
git commit -m "feat(query): LangGraph assembly with conditional edge, Hono API, Dockerfile"
```

---

## Task 14: UI Service — Next.js 셋업 & 컴포넌트

**Files:**
- Create: `ui-service/src/app/page.tsx`
- Create: `ui-service/src/app/components/UploadPanel.tsx`
- Create: `ui-service/src/app/components/ChatPanel.tsx`
- Create: `ui-service/src/app/api/ingest/route.ts`
- Create: `ui-service/src/app/api/query/route.ts`
- Create: `ui-service/.env.local`
- Create: `ui-service/Dockerfile`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd ui-service
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

프롬프트에서 모두 기본값 선택. 완료 후:

```bash
mv app src/app
```

- [ ] **Step 2: .env.local 작성**

```
NEXT_PUBLIC_QUERY_API_URL=http://localhost:8082
NEXT_PUBLIC_INGESTION_API_URL=http://localhost:8081
```

- [ ] **Step 3: src/app/page.tsx 작성**

```tsx
import UploadPanel from "./components/UploadPanel";
import ChatPanel from "./components/ChatPanel";

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      <header className="border-b p-4">
        <h1 className="text-xl font-semibold">보험 약관 QA Agent</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r p-4 overflow-y-auto">
          <UploadPanel />
        </aside>
        <section className="flex-1 overflow-hidden">
          <ChatPanel />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: UploadPanel.tsx 작성**

```tsx
"use client";

import { useState } from "react";

export default function UploadPanel() {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploaded((prev) => [...prev, data.document]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-medium text-sm text-gray-600">약관 업로드</h2>
      <label className="block">
        <span className="sr-only">PDF 파일 선택</span>
        <input
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          disabled={uploading}
          className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
      </label>
      {uploading && <p className="text-sm text-gray-500">업로드 중...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {uploaded.length > 0 && (
        <ul className="space-y-1">
          {uploaded.map((doc) => (
            <li key={doc} className="text-sm text-gray-700 truncate">
              ✓ {doc}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: ChatPanel.tsx 작성**

```tsx
"use client";

import { useState } from "react";

interface Citation {
  clauseNumber: string;
  clauseTitle: string;
  excerpt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [openCitation, setOpenCitation] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 mt-8">
            보험 약관에 대해 질문해보세요
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setOpenCitation(openCitation === i ? null : i)}
                    className="text-xs text-blue-600 underline"
                  >
                    {openCitation === i ? "근거 조항 숨기기" : "근거 조항 보기"}
                  </button>
                  {openCitation === i && (
                    <div className="mt-2 space-y-2">
                      {msg.citations.map((c, j) => (
                        <div key={j} className="rounded bg-white p-2 text-xs text-gray-600 border">
                          <p className="font-semibold">[{c.clauseNumber}] {c.clauseTitle}</p>
                          <p className="mt-1">{c.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-500">분석 중...</div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요 (예: 입원 3일이면 보험금을 받을 수 있나요?)"
          disabled={loading}
          className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-blue-600"
        >
          전송
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: API 프록시 라우트 작성**

`src/app/api/ingest/route.ts`:
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

`src/app/api/query/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const queryUrl = process.env.NEXT_PUBLIC_QUERY_API_URL;

  const res = await fetch(`${queryUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 7: Dockerfile 작성**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

`next.config.js`에 `output: 'standalone'` 추가:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}

module.exports = nextConfig
```

- [ ] **Step 8: 빌드 확인**

```bash
cd ui-service
npm run build
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add ui-service/
git commit -m "feat(ui): Next.js chat UI with upload panel and citation toggle"
```

---

## Task 15: docker-compose 통합 테스트

**Files:**
- 수정 없음 (기존 docker-compose.yml 사용)

- [ ] **Step 1: 전체 스택 빌드**

```bash
cd insurance-qa-agent
docker compose build
```

Expected: 3개 서비스 이미지 빌드 성공

- [ ] **Step 2: 전체 스택 실행**

```bash
docker compose up -d
docker compose ps
```

Expected:
```
NAME                  STATUS
qdrant                running
ingestion-service     running
query-service         running
ui-service            running
```

- [ ] **Step 3: 각 서비스 헬스체크**

```bash
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:3000
```

Expected:
```
{"status":"ok"}
{"status":"ok"}
(HTML 응답)
```

- [ ] **Step 4: 공개 약관 PDF 다운로드 및 ingestion 테스트**

삼성생명 공식 홈페이지(samsung.com/sec/insurance)에서 약관 PDF를 다운로드한 후:

```bash
curl -X POST http://localhost:8081/ingest \
  -F "file=@삼성생명_암보험약관.pdf"
```

Expected:
```json
{"document":"삼성생명_암보험약관","chunks":42}
```

- [ ] **Step 5: 질의 엔드투엔드 테스트**

```bash
curl -X POST http://localhost:8082/query \
  -H "Content-Type: application/json" \
  -d '{"question": "입원 3일이면 보험금을 받을 수 있나요?"}'
```

Expected:
```json
{
  "answer": "약관 제N조에 따르면...",
  "citations": [...],
  "questionType": "claim_eligibility"
}
```

- [ ] **Step 6: 스택 종료 및 커밋**

```bash
docker compose down
git add .
git commit -m "test: full stack docker-compose integration verified"
```

---

## Task 16: K8s 매니페스트 & minikube 배포

**Files:**
- Create: `k8s/qdrant/pvc.yaml`
- Create: `k8s/qdrant/deployment.yaml`
- Create: `k8s/qdrant/service.yaml`
- Create: `k8s/ingestion-service/configmap.yaml`
- Create: `k8s/ingestion-service/deployment.yaml`
- Create: `k8s/ingestion-service/service.yaml`
- Create: `k8s/query-service/secret.yaml`
- Create: `k8s/query-service/deployment.yaml`
- Create: `k8s/query-service/service.yaml`
- Create: `k8s/ui-service/deployment.yaml`
- Create: `k8s/ui-service/service.yaml`

- [ ] **Step 1: minikube 시작 및 로컬 이미지 설정**

```bash
minikube start --driver=docker
eval $(minikube docker-env)
docker compose build
```

- [ ] **Step 2: k8s/qdrant/pvc.yaml**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qdrant-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

- [ ] **Step 3: k8s/qdrant/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qdrant
  template:
    metadata:
      labels:
        app: qdrant
    spec:
      containers:
        - name: qdrant
          image: qdrant/qdrant:v1.9.2
          ports:
            - containerPort: 6333
          volumeMounts:
            - name: storage
              mountPath: /qdrant/storage
      volumes:
        - name: storage
          persistentVolumeClaim:
            claimName: qdrant-pvc
```

- [ ] **Step 4: k8s/qdrant/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: qdrant-service
spec:
  selector:
    app: qdrant
  ports:
    - port: 6333
      targetPort: 6333
  type: ClusterIP
```

- [ ] **Step 5: k8s/ingestion-service/configmap.yaml**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ingestion-config
data:
  config.toml: |
    [server]
    port = 8081

    [qdrant]
    base_url = "http://qdrant-service:6333"
    collection = "insurance_clauses"

    [chunking]
    chunk_size = 512
    overlap = 50

    [embedding]
    model = "voyage-2"
    base_url = "https://api.voyageai.com/v1/embeddings"
```

- [ ] **Step 6: k8s/ingestion-service/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingestion-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ingestion-service
  template:
    metadata:
      labels:
        app: ingestion-service
    spec:
      containers:
        - name: ingestion-service
          image: insurance-qa-agent-ingestion-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 8081
          env:
            - name: VOYAGE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: VOYAGE_API_KEY
          volumeMounts:
            - name: config
              mountPath: /app/config.toml
              subPath: config.toml
      volumes:
        - name: config
          configMap:
            name: ingestion-config
```

- [ ] **Step 7: k8s/ingestion-service/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ingestion-service
spec:
  selector:
    app: ingestion-service
  ports:
    - port: 8081
      targetPort: 8081
  type: ClusterIP
```

- [ ] **Step 8: k8s/query-service/secret.yaml (실제 키는 base64 인코딩 후 입력)**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
type: Opaque
data:
  ANTHROPIC_API_KEY: <base64_encoded_key>
  VOYAGE_API_KEY: <base64_encoded_key>
```

base64 인코딩 방법:
```bash
echo -n "your_api_key" | base64
```

- [ ] **Step 9: k8s/query-service/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: query-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: query-service
  template:
    metadata:
      labels:
        app: query-service
    spec:
      containers:
        - name: query-service
          image: insurance-qa-agent-query-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 8082
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: ANTHROPIC_API_KEY
            - name: VOYAGE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: VOYAGE_API_KEY
            - name: QDRANT_URL
              value: "http://qdrant-service:6333"
            - name: QDRANT_COLLECTION
              value: "insurance_clauses"
            - name: PORT
              value: "8082"
```

- [ ] **Step 10: k8s/query-service/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: query-service
spec:
  selector:
    app: query-service
  ports:
    - port: 8082
      targetPort: 8082
  type: ClusterIP
```

- [ ] **Step 11: k8s/ui-service/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ui-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ui-service
  template:
    metadata:
      labels:
        app: ui-service
    spec:
      containers:
        - name: ui-service
          image: insurance-qa-agent-ui-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_QUERY_API_URL
              value: "http://query-service:8082"
            - name: NEXT_PUBLIC_INGESTION_API_URL
              value: "http://ingestion-service:8081"
```

- [ ] **Step 12: k8s/ui-service/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ui-service
spec:
  selector:
    app: ui-service
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30000
  type: NodePort
```

- [ ] **Step 13: 전체 배포**

```bash
kubectl apply -f k8s/qdrant/
kubectl apply -f k8s/query-service/secret.yaml
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/query-service/
kubectl apply -f k8s/ui-service/
```

- [ ] **Step 14: Pod 상태 확인**

```bash
kubectl get pods
```

Expected:
```
NAME                                  READY   STATUS    RESTARTS
qdrant-xxx                            1/1     Running   0
ingestion-service-xxx                 1/1     Running   0
query-service-xxx                     1/1     Running   0
ui-service-xxx                        1/1     Running   0
```

- [ ] **Step 15: UI 접근 확인**

```bash
minikube service ui-service --url
```

Expected: `http://127.0.0.1:XXXXX` URL 출력. 브라우저에서 접근하여 UI 확인.

- [ ] **Step 16: 커밋**

```bash
git add k8s/
git commit -m "feat(k8s): minikube manifests for all services with Secrets and ConfigMaps"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 스펙 요구사항 | 구현 Task |
|---|---|
| PDF 파싱 + 청킹 파이프라인 | Task 3, 4 |
| Voyage AI 임베딩 → Qdrant 저장 | Task 5, 6 |
| LangGraph 질문 분류 → 검색 → 도구 → 답변 → 인용 흐름 | Task 10~13 |
| conditional edge (claim_eligibility 분기) | Task 13 |
| 보험금 청구 판단 tools (입원일수, 면책조항, 대기기간) | Task 11 |
| Claude prompt caching | Task 12 |
| FastAPI 서빙 → Hono로 대체 | Task 13 |
| Fiber HTTP 서버 | Task 7 |
| Go config.toml + .env | Task 2 |
| TypeScript .env | Task 8 |
| Streamlit/간단한 UI | Task 14 (Next.js) |
| K8s minikube 배포 | Task 16 |
| docker-compose 로컬 개발 | Task 1, 15 |
