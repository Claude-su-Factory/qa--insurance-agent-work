# 약관별 채팅 & 데이터 모델 개선 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent

---

## 문제

현재 시스템은 모든 약관의 채팅이 하나로 합쳐져 있고, 어떤 약관에 대한 질문인지 구분하지 않는다. 채팅 내역과 근거 조항이 약관과 연결되지 않으며, 동일 파일 중복 업로드가 가능하고, .dockerignore가 없어 빌드에 380MB+ 불필요 파일이 포함된다.

---

## 변경 목표

1. **약관 선택 → 해당 약관 전용 채팅/근거 조항 표시** (Document 1:N Chat)
2. **중복 약관 업로드 차단** (같은 user + 같은 filename)
3. **.dockerignore 추가** (node_modules, .next, .env 등 제외)
4. **약관별 질문 필터링** (Qdrant 검색 시 document_name으로도 필터링)

---

## 데이터 모델

### 현재

```
User 1:N Documents (Supabase)
User 1:N Qdrant Points (user_id 필터)
채팅: localStorage (전역, 약관 구분 없음)
근거 조항: React state (휘발성)
```

### 변경

```
User 1:N Documents (Supabase)
Document 1:N Messages (Supabase)
Document 1:N Qdrant Points (user_id + document_name 필터)
근거 조항: Message에 포함 (JSON 컬럼)
```

### Supabase 스키마 추가

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

CREATE POLICY "own_messages_only"
  ON messages FOR ALL
  USING (auth.uid() = user_id);

-- 동일 파일 중복 방지
ALTER TABLE documents
  ADD CONSTRAINT unique_user_filename UNIQUE (user_id, filename);
```

---

## 변경 범위

### .dockerignore (신규, 3개 서비스)

| 파일 | 설명 |
|---|---|
| `ui-service/.dockerignore` | node_modules, .next, .env.local 등 제외 |
| `query-service/.dockerignore` | node_modules, dist, .env 등 제외 |
| `ingestion-service/.dockerignore` | vendor, .env, 바이너리 등 제외 |

### ui-service 변경

| 파일 | 변경 |
|---|---|
| `app/context/AppContext.tsx` | `selectedDocument` 상태 추가, localStorage 저장을 document 단위로 변경 |
| `app/components/LeftPanel.tsx` | 약관 클릭 시 `selectedDocument` 설정, 선택된 약관 하이라이트, 중복 업로드 시 alert |
| `app/components/ChatPanel.tsx` | 선택된 약관이 없으면 "약관을 선택해주세요" 표시, 약관 변경 시 Supabase에서 메시지 로드 |
| `app/components/CitationPanel.tsx` | 선택된 약관의 마지막 AI 답변 citations 표시 |
| `app/api/query/route.ts` | `document_id` body에 추가 전달 |

### query-service 변경

| 파일 | 변경 |
|---|---|
| `src/graph/state.ts` | `documentName` 필드 추가 |
| `src/clients/qdrant.ts` | `search()` 에 `documentName` 필터 추가 (user_id + document_name) |
| `src/graph/nodes/retriever.ts` | `state.documentName` 전달 |
| `src/index.ts` | `X-Document-Name` 헤더 수신, state에 전달 |

### ingestion-service 변경

| 파일 | 변경 |
|---|---|
| `internal/handler/ingest.go` | Supabase에 중복 filename 체크 (INSERT 실패 시 409 반환) |

---

## UI 흐름

```
1. 로그인 → LeftPanel에 내 약관 목록 표시
2. 약관 클릭 → selectedDocument 설정
   → ChatPanel: Supabase messages 테이블에서 해당 document_id의 메시지 로드
   → CitationPanel: 마지막 assistant 메시지의 citations 표시
3. 질문 입력 → /api/query에 question + document_id 전달
   → query-service: user_id + document_name으로 Qdrant 필터링
   → 답변 생성
   → Supabase messages 테이블에 user/assistant 메시지 + citations 저장
4. 약관 미선택 시 → ChatPanel에 "왼쪽에서 약관을 선택해주세요" 안내
5. 중복 파일 업로드 → 409 에러 → "이미 업로드된 약관입니다" alert
```

---

## 메시지 저장 위치 변경

| | 기존 | 변경 |
|---|---|---|
| 저장소 | localStorage | Supabase messages 테이블 |
| 스코프 | 전역 (약관 구분 없음) | document_id별 |
| 영속성 | 브라우저 로컬 | 서버 영구 저장 |
| citations | 별도 state | messages.citations JSONB 컬럼 |

---

## .dockerignore 내용

### ui-service/.dockerignore
```
node_modules
.next
.env.local
*.env
.git
.DS_Store
```

### query-service/.dockerignore
```
node_modules
dist
.env
*.env
.git
.DS_Store
```

### ingestion-service/.dockerignore
```
vendor
*.exe
.env
*.env
.git
.DS_Store
testdata
```

---

## 검증 기준

- 약관 A 선택 → 질문 → 약관 B 선택 → 약관 A의 채팅이 보이지 않음
- 약관 A 재선택 → 이전 채팅 내역 + 근거 조항 복원
- 동일 파일 재업로드 → "이미 업로드된 약관입니다" alert
- Docker 빌드 시 컨텍스트 크기 380MB → 10MB 이하로 감소
- 새로고침 → 선택한 약관의 채팅 내역 유지 (Supabase 저장)
