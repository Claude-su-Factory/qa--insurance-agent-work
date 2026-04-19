# 보험 약관 QA Agent — 설계 문서

**작성일:** 2026-04-15  
**목적:** AI Backend Engineer 포트폴리오 (추후 실서비스 확장 가능)  
**타겟 JD:** AI Backend Engineer

---

## 1. 프로젝트 개요

생명보험 약관 PDF를 벡터DB에 인덱싱하고, LangGraph.js 기반 multi-step reasoning Agent가 사용자 질문에 답변하는 QA 시스템이다. 보험금 청구 가능 여부 판단, 면책 조항 체크, 근거 조항 인용까지 수행한다.

### 핵심 어필 포인트

- LangGraph conditional edge / state management 실전 적용
- Go + TypeScript 폴리글랏 마이크로서비스 설계
- Claude API prompt caching으로 비용 최적화
- K8s(minikube) 배포까지 포함한 end-to-end 구현

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| Ingestion Service | Go + Fiber |
| Query Service | TypeScript + Hono + LangGraph.js |
| UI Service | TypeScript + Next.js |
| 벡터 DB | Qdrant |
| LLM | Claude (Anthropic API) |
| 임베딩 | Voyage AI (voyage-2) |
| 컨테이너 오케스트레이션 | minikube (K8s) |
| Go 설정 관리 | `.toml` + viper + godotenv |
| TypeScript 설정 관리 | `.env` + dotenv |

---

## 3. 전체 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   minikube cluster                   │
│                                                      │
│  ┌───────────┐    ┌────────────────┐    ┌─────────┐ │
│  │  UI Svc   │───▶│   Query Svc    │───▶│  Qdrant │ │
│  │ (Next.js) │    │ (LangGraph.js) │    │         │ │
│  └───────────┘    └───────┬────────┘    └─────────┘ │
│                           │ Claude API               │
│  ┌───────────────────┐    │                          │
│  │  Ingestion Svc    │───▶│ Qdrant (임베딩 저장)     │
│  │  (Go + Fiber)     │                               │
│  └───────────────────┘                               │
└─────────────────────────────────────────────────────┘
```

서비스 간 통신은 모두 HTTP(REST)이다. Ingestion Service와 Query Service는 ClusterIP로 내부 통신하며, UI Service만 NodePort로 외부에 노출한다.

---

## 4. Ingestion Service (Go + Fiber)

### 역할

보험 약관 PDF를 업로드받아 파싱, 청킹, 임베딩 생성 후 Qdrant에 저장한다.

### API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/ingest` | PDF 파일 업로드 및 처리 시작 |
| GET | `/health` | 헬스체크 |

### 처리 흐름

```
PDF 업로드 (multipart/form-data)
    ↓
pdfcpu로 텍스트 추출
    ↓
슬라이딩 윈도우 청킹
  - chunk_size: 512 tokens
  - overlap: 50 tokens
    ↓
Voyage AI API 호출 → 임베딩 벡터 생성
    ↓
Qdrant 저장 (벡터 + 메타데이터)
  메타데이터: 조항번호, 페이지, 약관명, 원문 텍스트
```

### 라이브러리

- HTTP 프레임워크: `github.com/gofiber/fiber/v2`
- PDF 파싱: `github.com/pdfcpu/pdfcpu`
- Qdrant 클라이언트: `github.com/qdrant/go-client`
- 설정 로드: `github.com/spf13/viper` (`.toml`) + `github.com/joho/godotenv` (`.env`)

### 설정 파일 구조

```
ingestion-service/
├── config.toml       # 비민감 앱 설정 (Qdrant URL, chunk_size, 모델명 등)
├── .env              # 민감 값 (VOYAGE_API_KEY)
└── ...
```

`config.toml` 예시:
```toml
[server]
port = 8081

[qdrant]
host = "qdrant"
port = 6334
collection = "insurance_clauses"

[chunking]
chunk_size = 512
overlap = 50

[embedding]
model = "voyage-2"
```

---

## 5. Query Service (TypeScript + Hono + LangGraph.js)

### 역할

사용자 질문을 받아 LangGraph.js Agent가 multi-step reasoning으로 답변을 생성하고 근거 조항을 인용한다.

### API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/query` | 질문 처리 및 답변 반환 |
| GET | `/health` | 헬스체크 |

### LangGraph State Machine

```
START
  ↓
[question_classifier]
  질문 유형 분류: "coverage" | "claim_eligibility" | "general"
  ↓
[retriever]
  Qdrant Top-K 벡터 검색 (k=5)
  ↓
[conditional edge]
  ├── claim_eligibility → [tools_agent]
  │     tool: calculate_hospitalization_days
  │     tool: check_exclusion_clause
  │     tool: check_waiting_period
  └── coverage / general → [answer_generator]
  ↓
[answer_generator]
  Claude API 호출
  - 약관 조항 텍스트를 system prompt에 포함 → prompt caching 적용
  - 비용 절감 + 응답 속도 향상
  ↓
[citation_formatter]
  근거 조항 번호 + 원문 추출하여 응답에 첨부
  ↓
END
```

### State 정의

```typescript
interface AgentState {
  question: string;
  questionType: "coverage" | "claim_eligibility" | "general";
  retrievedClauses: Clause[];
  toolResults?: ToolResult[];
  answer: string;
  citations: Citation[];
}
```

### Tools

| Tool | 설명 |
|------|------|
| `calculate_hospitalization_days` | 입원 시작일~종료일로 입원일수 계산 |
| `check_exclusion_clause` | 해당 증상/사고가 면책 조항에 포함되는지 확인 |
| `check_waiting_period` | 가입 후 면책기간(대기기간) 충족 여부 확인 |

### 설정 파일 구조

```
query-service/
├── .env     # ANTHROPIC_API_KEY, VOYAGE_API_KEY, QDRANT_URL 등
└── ...
```

### 라이브러리

- HTTP 프레임워크: `hono`
- LangGraph: `@langchain/langgraph`
- Claude SDK: `@anthropic-ai/sdk`
- Qdrant 클라이언트: `@qdrant/js-client-rest`
- 설정: `dotenv`

---

## 6. UI Service (TypeScript + Next.js)

### 화면 구성

```
┌──────────────────────────────────────────────────┐
│  보험 약관 QA Agent                               │
├──────────────┬───────────────────────────────────┤
│  약관 업로드  │  채팅                              │
│              │                                   │
│  [파일 선택]  │  사용자: 입원 3일이면 보험금 받나요? │
│  [업로드]     │                                   │
│              │  Agent: 약관 제4조에 따라 ...       │
│  업로드된 약관│  ┌─────────────────────────────┐  │
│  - 삼성생명.pdf│  │ 근거 조항 보기              │  │
│              │  │ 제4조 (보험금 지급 사유) ...  │  │
│              │  └─────────────────────────────┘  │
└──────────────┴───────────────────────────────────┘
```

### 설정 파일 구조

```
ui-service/
├── .env.local   # NEXT_PUBLIC_QUERY_API_URL, NEXT_PUBLIC_INGESTION_API_URL
└── ...
```

---

## 7. Qdrant 스키마

컬렉션명: `insurance_clauses`

```json
{
  "vector_size": 1024,
  "distance": "Cosine",
  "payload": {
    "clause_number": "string",
    "clause_title": "string",
    "content": "string",
    "page": "integer",
    "document_name": "string",
    "insurer": "string"
  }
}
```

---

## 8. K8s 리소스 (minikube)

```
k8s/
├── qdrant/
│   ├── deployment.yaml
│   ├── service.yaml        # ClusterIP
│   └── pvc.yaml            # 데이터 영속화
├── ingestion-service/
│   ├── deployment.yaml
│   ├── service.yaml        # ClusterIP
│   └── configmap.yaml      # config.toml 내용
├── query-service/
│   ├── deployment.yaml
│   ├── service.yaml        # ClusterIP
│   └── secret.yaml         # ANTHROPIC_API_KEY, VOYAGE_API_KEY
└── ui-service/
    ├── deployment.yaml
    └── service.yaml        # NodePort (외부 노출)
```

---

## 9. 디렉토리 구조

```
insurance-qa-agent/
├── ingestion-service/       # Go + Fiber
│   ├── cmd/
│   │   └── main.go
│   ├── internal/
│   │   ├── handler/
│   │   ├── parser/          # PDF 파싱
│   │   ├── chunker/         # 텍스트 청킹
│   │   ├── embedder/        # Voyage AI 임베딩
│   │   └── store/           # Qdrant 저장
│   ├── config.toml
│   ├── .env
│   ├── Dockerfile
│   └── go.mod
├── query-service/           # TypeScript + Hono + LangGraph.js
│   ├── src/
│   │   ├── index.ts
│   │   ├── graph/           # LangGraph state machine
│   │   │   ├── nodes/
│   │   │   ├── tools/
│   │   │   └── state.ts
│   │   └── clients/         # Qdrant, Claude 클라이언트
│   ├── .env
│   ├── Dockerfile
│   └── package.json
├── ui-service/              # TypeScript + Next.js
│   ├── src/
│   │   └── app/
│   ├── .env.local
│   ├── Dockerfile
│   └── package.json
├── k8s/
│   ├── qdrant/
│   ├── ingestion-service/
│   ├── query-service/
│   └── ui-service/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-15-insurance-qa-agent-design.md
└── docker-compose.yml       # 로컬 개발용
```

---

## 10. 개발 순서

1. Qdrant 로컬 실행 및 컬렉션 생성
2. Ingestion Service (Go) — PDF 파싱 → 임베딩 → Qdrant 저장
3. Query Service (TypeScript) — LangGraph Agent 구현
4. UI Service (Next.js) — 채팅 UI 연결
5. Docker 이미지 빌드 및 docker-compose 검증
6. K8s 매니페스트 작성 및 minikube 배포

---

## 11. 면접 어필 포인트 요약

| 질문 | 답변 근거 |
|------|-----------|
| LangGraph를 어떻게 활용했나요? | conditional edge로 질문 유형별 분기, state로 컨텍스트 관리 |
| 왜 마이크로서비스로 나눴나요? | Ingestion과 Query의 스케일 요구사항이 다름, 독립 배포 가능 |
| 왜 Go를 Ingestion에 썼나요? | 대용량 PDF 처리의 고성능 I/O, Go의 강점 영역 |
| prompt caching이 뭔가요? | Claude API의 system prompt 캐싱으로 반복 조항 조회 비용 절감 |
| Voyage AI를 쓴 이유는요? | Anthropic 공식 파트너 임베딩, Claude와 조합 시 최적화 |
