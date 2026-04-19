# 약관별 채팅 & 데이터 모델 개선 설계 문서 (v1.1)

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**상태:** 검토 완료 (Reviewer 전용 모드 적용)

---

## 문제

현재 시스템은 모든 약관의 채팅이 하나로 합쳐져 있고, 어떤 약관에 대한 질문인지 구분하지 않는다. 채팅 내역과 근거 조항이 약관과 연결되지 않으며, 동일 파일 중복 업로드가 가능하고, .dockerignore가 없어 빌드 효율이 떨어진다.

---

## 변경 목표

1. **약관별 격리된 채팅 경험:** 약관 선택 시 해당 약관의 대화 기록 및 근거 조항만 표시
2. **정밀한 검색 필터링:** Qdrant 검색 시 파일명이 아닌 `document_id`(UUID)로 필터링하여 오검색 방지
3. **데이터 영속성:** 채팅 내역 및 근거 조항(Citations)을 Supabase에 영구 저장
4. **빌드 최적화:** 각 서비스별 `.dockerignore` 적용으로 컨텍스트 크기 최소화

---

## 데이터 모델

### 현재
- User 1:N Documents (Supabase)
- User 1:N Qdrant Points (user_id 필터)
- 채팅/근거: localStorage 및 휘발성 React state

### 변경
- **User 1:N Documents (Supabase)**
- **Document 1:N Messages (Supabase)**: `citations`를 JSONB 컬럼으로 포함
- **Document 1:N Qdrant Points**: 메타데이터에 `document_id` 필드 필수 포함
- **필터링 규칙**: 검색 시 `user_id` + `document_id` 조합 사용

### Supabase 스키마 개선

```sql
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  citations   JSONB DEFAULT '[]', -- 근거 조항 저장
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 보안: 본인의 메시지이면서, 해당 약관의 소유권도 확인하는 RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_messages_access"
  ON messages FOR ALL
  USING (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM documents WHERE id = document_id AND user_id = auth.uid())
  );

-- 동일 파일 중복 업로드 방지 (유저별 파일명 유니크)
ALTER TABLE documents
  ADD CONSTRAINT unique_user_filename UNIQUE (user_id, filename);
```

---

## 변경 범위

### 1. 서비스 공통 (.dockerignore)
- **ui-service**: `node_modules`, `.next`, `.env*`, `.git` 제외
- **query-service**: `node_modules`, `dist`, `.env*`, `.git` 제외
- **ingestion-service**: `vendor`, `bin/`, `*.exe`, `.env*`, `.git`, `testdata` 제외

### 2. ui-service 변경
- **AppContext.tsx**: `selectedDocument` 상태 관리, 약관 변경 시 메시지 로딩 로직 추가
- **LeftPanel.tsx**: 약관 클릭 시 선택 상태 시각화, 업로드 에러(409) 핸들링
- **ChatPanel.tsx**: 초기 미선택 상태 가이드, 메시지 로딩 시 `Skeleton` UI 적용
- **app/api/query/route.ts**: 
    - `query-service` 응답 수신 후, User 질문과 Assistant 답변을 `messages` 테이블에 병렬 저장
    - 응답에 `document_id` 포함하여 클라이언트에 반환

### 3. query-service 변경
- **state.ts**: `documentId` 필드 추가 (documentName 대신 ID 사용)
- **qdrant.ts**: `search()` 메서드 필터를 `user_id` + `document_id`로 변경
- **X-Document-ID** 헤더를 통한 식별자 수신 구조 확립

### 4. ingestion-service 변경
- **ingest.go**: 
    - Supabase INSERT 시 중복 에러 발생 시 `409 Conflict` 반환
    - Qdrant 포인트 저장 시 `metadata`에 `document_id` 주입

---

## UI 흐름

1. **약관 선택**: 목록에서 약관 클릭 → `selectedDocument` 설정 → Supabase에서 해당 `document_id` 메시지 페치
2. **질문 요청**: `question` + `document_id`를 API Route로 전달
3. **검색 & 생성**: `query-service`가 `document_id`로 정밀 필터링하여 근거 추출 및 답변 생성
4. **결과 저장**: `ui-service` API Route가 대화 내역(질문/답변/근거)을 DB에 기록 후 클라이언트에 반환
5. **예외 처리**: 이미 존재하는 파일 업로드 시 "이미 관리 중인 약관입니다" 토스트 알림

---

## 검증 기준

- [ ] 약관 A와 B의 채팅 내역이 완전히 분리되어 표시되는가?
- [ ] 파일명이 동일하더라도 ID가 다르면 각각 별개의 채팅방으로 작동하는가?
- [ ] 페이지 새로고침 후에도 선택했던 약관의 대화 기록이 Supabase에서 복원되는가?
- [ ] 중복 파일 업로드 시 DB 제약 조건에 의해 차단되고 적절한 UI 에러가 출력되는가?
- [ ] `.dockerignore` 적용 후 `docker build` 속도가 개선되고 이미지 크기가 최적화되었는가?
