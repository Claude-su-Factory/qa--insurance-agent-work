# UI 리디자인 — 설계 문서

**작성일:** 2026-04-16
**목적:** 보험 약관 QA Agent UI를 매력적이고 직관적으로 전면 개선

---

## 1. 디자인 방향

**Clean Professional** — 화이트 베이스, 블루(#2563eb) 포인트 컬러.
신뢰감 있고 깔끔한 기업용 스타일. 보험 도메인과 잘 어울리며 포트폴리오에서도 전문적으로 보임.

---

## 2. 레이아웃: 3분할 대시보드

```
┌──────────────────────────────────────────────────────────┐
│  헤더: 로고 / 서비스명 / 상태 표시                         │
├──────────────┬────────────────────────┬──────────────────┤
│  왼쪽 패널   │      중앙: 채팅         │  오른쪽 패널     │
│  (240px)     │      (flex-1)          │  (260px)         │
│              │                        │                  │
│  약관 업로드  │  AI 답변 버블           │  근거 조항 카드   │
│  진행 상황   │  사용자 메시지 버블      │  관련도 바        │
│  약관 목록   │  추천 질문 칩           │                  │
│              │  입력창                │                  │
└──────────────┴────────────────────────┴──────────────────┘
```

서비스 간 통신은 모두 내부적으로 처리. UI는 세 파일로 분리:
- `app/page.tsx` — 전체 레이아웃 (헤더 + 3분할)
- `app/components/LeftPanel.tsx` — 약관 관리 + 진행 상황
- `app/components/ChatPanel.tsx` — 채팅 인터페이스
- `app/components/CitationPanel.tsx` — 근거 조항 패널

---

## 3. 헤더

- 높이: 52px, `border-bottom: 1px solid #e2e8f0`, 그림자 약하게
- 로고: 30×30 블루 그라디언트 아이콘 + "보험 약관 QA" 텍스트 + "AI Agent" 뱃지
- 우측: 초록 점 + "서비스 정상 운영 중" 상태 텍스트

---

## 4. 왼쪽 패널: 약관 관리 (240px)

### 4-1. 업로드 영역
- 점선 테두리 드래그앤드롭 존 (`border: 1.5px dashed #bfdbfe`)
- `dragover` 시 배경 `#eff6ff`, 테두리 `#2563eb`로 변경
- 파일 선택 버튼 (파란색) + **실제 파일 드롭 기능 포함** (HTML5 `onDrop` 이벤트 처리)
- `accept=".pdf"` 제한, 드롭한 파일도 PDF 여부 검증 후 업로드

### 4-2. 문서 분석 진행 카드 (업로드 시 등장)

**서클 차트 + 라이브 로그** 스타일:

```
┌─────────────────────────────────────┐
│ 📑 파일명.pdf  58페이지 · 2.1MB      │
├──────────┬──────────────────────────┤
│          │ ● PDF 파싱 완료           │
│  [60%]   │ ● 청킹 48개 생성         │
│  (SVG)   │ ⟳ 임베딩 29/48 처리중... │
│          │ ○ Qdrant 저장 대기        │
└──────────┴──────────────────────────┘
```

- SVG 원형 차트: 배경 `#dbeafe`, 채움 `#2563eb`, 중앙에 % 텍스트
- 라이브 로그: `monospace` 폰트, 완료(초록점) / 진행(파란 깜빡임) / 대기(회색점)
- 진행 중인 파일 한 개만 표시. 완료되면 아래 목록으로 이동

### 4-3. 완료된 약관 목록
- 파일명 + 조항 수 + 날짜
- 현재 선택된 약관 강조 (배경 `#eff6ff`, 테두리 `#bfdbfe`)
- 체크마크 배지 (초록)

---

## 5. 중앙 패널: 채팅 (flex-1)

### 5-1. 빈 상태 (메시지 없을 때)
- 중앙 정렬, 아이콘 + 안내 텍스트
- 추천 질문 칩 3개: "💊 면책기간 확인", "🏥 입원 보장 범위", "💰 보험금 청구 조건"
- 칩 클릭 시 입력창에 자동 채움

### 5-2. 메시지 버블
| 역할 | 배경 | 텍스트 | border-radius |
|------|------|--------|---------------|
| 사용자 | `#2563eb` | white | `14px 14px 4px 14px` |
| AI | `#f8fafc` + border | `#1e293b` | `14px 14px 14px 4px` |

- AI 메시지 하단: "📎 근거 조항 N건 보기" 버튼 → 클릭 시 오른쪽 패널 활성화
- 메타 정보: 시간 + 참조 약관명

### 5-3. 분석 중 상태
- 회색 말풍선 + "약관 분석 중" 텍스트 + 점 3개 바운스 애니메이션

### 5-4. 입력창
- 배경 `#f8fafc`, 테두리 `#e2e8f0`, 포커스 시 `#2563eb`
- 전송 버튼: 파란 rounded 사각형, 화살표 아이콘
- 하단: 추천 질문 칩 **3개 고정** ("💊 면책기간 확인", "🏥 입원 보장 범위", "💰 보험금 청구 조건")
- 칩 클릭 시 해당 텍스트가 입력창에 채워지고 즉시 전송

---

## 6. 오른쪽 패널: 근거 조항 (260px)

- 초기 상태: 빈 안내 메시지 ("AI가 답변하면 참조한 조항이 여기 표시됩니다")
- AI 답변 후: 조항 카드 목록 표시

### 조항 카드
```
┌──────────────────────────────────┐
│ 제8조                             │
│ 보험금 지급 면책기간               │
│                                  │
│ 피보험자가 암으로 진단 확정된 날로  │
│ 부터 90일 이내에 발생한 암에 대하   │
│ 여는 보험금을 지급하지 아니합니다.  │
│                                  │
│ 관련도 ───────────────── 97%     │
└──────────────────────────────────┘
```

- 클릭 시 활성 상태 (`border: #2563eb`, 배경 `#eff6ff`)
- 관련도 바: 회색 트랙 + 파란 채움

---

## 7. 상태 관리

**React Context** (`AppContext`)로 3개 패널이 공유 상태를 구독한다. props drilling은 사용하지 않는다.

```typescript
// app/context/AppContext.tsx
interface AppState {
  documents: DocumentMeta[];      // 완료된 약관 목록
  ingesting: IngestingDoc | null; // 현재 처리 중인 문서
  messages: Message[];            // 채팅 메시지
  citations: Citation[];          // 가장 최근 AI 답변의 근거 조항
  activeCitation: number | null;  // 선택된 조항의 배열 인덱스
}

interface IngestingDoc {
  jobId: string;
  filename: string;
  filesize: string;
  progress: number;        // 0~100
  currentStep: 'parsing' | 'chunking' | 'embedding' | 'storing' | 'done';
  currentChunk: number;
  totalChunks: number;
}
```

**근거 조항 표시 규칙:** 항상 **가장 최근 AI 답변**의 citations를 오른쪽 패널에 표시한다. 이전 메시지의 citations는 별도 상태로 저장하지 않는다.

### 진행 상황 수신: Polling 방식

`/ingest`는 즉시 `job_id`를 반환하고, UI가 1초 간격으로 `/ingest/status/{job_id}`를 폴링한다.

```
UI                          Ingestion Service
 |                                |
 |-- POST /ingest (PDF) --------> |  job_id 즉시 반환, 백그라운드 처리 시작
 |<-- { job_id: "abc123" } ------ |
 |                                |
 |-- GET /ingest/status/abc123 -> |
 |<-- { step: "parsing", ... } -- |  (1초마다 반복)
 |                                |
 |-- GET /ingest/status/abc123 -> |
 |<-- { step: "done", ... } ----- |  polling 중단
```

**Ingestion Service (Go) 추가 엔드포인트:**
- `GET /ingest/status/{jobId}` — in-memory map에서 진행 상태 조회
- 응답: `{ jobId, step, progress, currentChunk, totalChunks, filename }`
- `done` 상태 반환 후 30초 뒤 메모리에서 자동 삭제

---

## 8. 색상 시스템

| 용도 | 색상 |
|------|------|
| 주 색상 | `#2563eb` |
| 주 색상 hover | `#1d4ed8` |
| 주 색상 연한 배경 | `#eff6ff` |
| 주 색상 테두리 | `#bfdbfe` |
| 성공 | `#22c55e` |
| 텍스트 강조 | `#1e293b` |
| 텍스트 보조 | `#64748b` |
| 텍스트 비활성 | `#94a3b8` |
| 배경 기본 | `#f1f5f9` |
| 카드 배경 | `#f8fafc` |
| 테두리 기본 | `#e2e8f0` |

---

## 9. 구현 범위

### 포함
- 전체 레이아웃 재작성 (page.tsx, 컴포넌트 분리)
- 업로드 드래그앤드롭 (시각 효과 + 실제 파일 드롭 기능)
- 서클 차트 + 라이브 로그 진행 표시 (1초 polling)
- Ingestion Service Go API 변경 (job_id 반환 + status 엔드포인트)
- 채팅 버블 + 추천 질문 칩 3개 고정
- 근거 조항 패널 + 관련도 바 (최근 AI 답변 기준)
- React Context로 전역 상태 관리
- 반응형 고려 (최소 1200px 기준)

### 제외
- 모바일 대응 (포트폴리오 범위 외)
- 다크 모드
- 약관 검색/필터 기능

---

## 10. 파일 변경 목록

```
ui-service/
├── app/
│   ├── page.tsx                        ← 전체 레이아웃 재작성
│   ├── globals.css                     ← 폰트 + 기본 스타일 추가
│   ├── context/
│   │   └── AppContext.tsx              ← 신규 (React Context + 전역 상태)
│   ├── components/
│   │   ├── LeftPanel.tsx               ← 신규 (약관 관리 + 진행 상황)
│   │   ├── ChatPanel.tsx               ← 전면 개선
│   │   ├── CitationPanel.tsx           ← 신규 (근거 조항)
│   │   ├── CircleProgress.tsx          ← 신규 (SVG 서클 차트)
│   │   └── UploadPanel.tsx             ← 삭제 (LeftPanel에 통합)
│   └── api/
│       ├── ingest/route.ts             ← job_id 반환 방식으로 수정
│       └── ingest/status/[jobId]/route.ts ← 신규 (polling 프록시)

ingestion-service/
├── internal/
│   ├── handler/ingest.go               ← job_id 반환 + 백그라운드 처리
│   └── job/store.go                    ← 신규 (in-memory job 상태 저장소)
└── cmd/main.go                         ← GET /ingest/status/:jobId 라우트 추가
```
