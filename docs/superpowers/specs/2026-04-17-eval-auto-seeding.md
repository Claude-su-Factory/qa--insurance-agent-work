# 자동 씨딩 기반 Evaluation 파이프라인 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**관련 스펙:** `2026-04-17-evaluation-pipeline.md` (본 스펙이 대체)
**JD 매핑:** 기존 AI 서비스, LLMOps 운영 고도화 (주요 업무)

---

## 문제

기존 Golden Dataset 설계는 항목마다 사용자가 수작업으로 다음을 채워야 한다.

- `question` 작성
- `expected_answer_points` 2~3개 작성
- `expected_clause_ids` 2~3개 작성

이것이 15~50건 × 매 프로젝트 변경 시마다 발생하면 유지 비용이 너무 크다. 사용자 요구는 **모든 수작업 제거** — 데이터를 하나하나 확인하거나 편집하지 않고도 eval이 동작해야 한다.

또한 "ground truth(정답)"을 사람이 작성한다는 전제 자체가 포트폴리오 규모엔 과하다. 실사용자 질문을 실제로 돌려보는 것이 더 의미 있다.

---

## 해결

**Snapshot Testing 방식**으로 전환한다.

- 실사용자의 기존 질의(Langfuse trace)에서 자동으로 baseline을 수집한다
- "정답"이 아닌 **"현재 에이전트가 낸 답변"**을 기준선으로 삼는다
- eval은 "변경 후 출력이 기준선에서 얼마나 벗어났는가"를 측정한다
- 이는 UI 스냅샷 테스트와 동일한 원리 — **correctness가 아니라 drift를 잡는 체계**

JD 매핑 관점에서 이는 "실사용 데이터 피드백 루프"라는 LLMOps 데이터 플라이휠 스토리로 격상된다.

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `query-service/src/eval/types.ts` | 스키마 재정의: expected_* 제거, baseline_* 추가 |
| `query-service/src/eval/dataset/golden.json` | 포맷 변경 (`auto-generated` 주석 추가). 기존 파일 덮어쓰기 |
| `query-service/src/eval/seed.ts` | 신규 — Langfuse API에서 trace 읽어 golden.json 생성 |
| `query-service/src/eval/metrics.ts` | context_recall 제거, answer_consistency + citation_stability 추가 |
| `query-service/src/eval/runner.ts` | 새 스키마에 맞게 조정 |
| `query-service/src/eval/report.ts` | 새 메트릭 포함 |
| `query-service/src/eval/cli.ts` | `--seed` 플래그 추가 |
| `scripts/eval.sh` | 변경 없음 (기존 래퍼로 모든 플래그 전달됨) |
| `docs/eval/README.md` | 자동 씨딩 흐름으로 재작성 |
| `docs/eval/baseline.json` | 새 메트릭 반영 |
| `query-service/src/index.ts` | trace output에 `retrieved_clauses` 추가 (baseline 수집용) |

---

## 데이터 소스: Langfuse API

**근거**
- query-service가 이미 각 질의를 Langfuse trace로 기록 중
- trace `output`에 `answer`, `citations`, `gradingScore` 이미 존재
- `retrieved_clauses`를 `output`에 추가하기만 하면 씨딩에 필요한 모든 정보 확보
- Supabase `chat_messages`를 쓸 수도 있지만 citations/clauses가 없어 JOIN이 복잡. Langfuse가 단일 소스

**사용 API**
- `GET /api/public/traces?name=insurance-qa&limit=100&tags=!eval`
- 필터: `metadata.gradingScore >= 2` (저품질 baseline은 씨앗으로 부적합)
- `tags=!eval`로 이전 eval run 제외 (순환 참조 방지)

**인증**
- 기존 `.env`의 `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY` 재사용 (Basic Auth)

---

## 새 스키마

### `golden.json`

```json
{
  "version": "1.0.0",
  "description": "Auto-seeded from Langfuse traces. Do not hand-edit. Run `bash scripts/eval.sh --seed` to refresh.",
  "seeded_at": "2026-04-17T21:30:00Z",
  "source": "langfuse",
  "items": [
    {
      "id": "auto-a1b2c3d4",
      "category": "claim_eligibility",
      "question": "운전 중 교통사고로 사망했을 때 보험금이 지급되나요?",
      "document_id": "33790d35-6148-4771-b765-72726e1abfdd",
      "user_id": "8afeb2b2-e706-45d7-99b5-143837c7f057",
      "baseline_answer": "자동차 운전 중 사망은 상해사망보험금...",
      "baseline_citations": [
        { "clauseNumber": "제5조", "clauseTitle": "상해사망보험금", "excerpt": "..." }
      ],
      "baseline_retrieved_clause_ids": ["제5조", "제8조"],
      "baseline_grader_score": 3,
      "seeded_trace_id": "lf-trace-xyz"
    }
  ]
}
```

**주요 변화**
- ❌ `expected_answer_points` 제거
- ❌ `expected_clause_ids` 제거
- ✅ `baseline_answer` — 씨딩 시점의 에이전트 답변
- ✅ `baseline_citations` — 씨딩 시점의 citations
- ✅ `baseline_retrieved_clause_ids` — 씨딩 시점의 retriever 결과
- ✅ `baseline_grader_score` — 씨딩 시점의 런타임 채점
- ✅ `seeded_trace_id` — Langfuse trace 추적용

**id 형식:** `auto-<question_hash_8chars>` — 동일 질문 중복 씨딩 방지

**category:** Langfuse trace의 `output.questionType` 재사용

---

## 새 메트릭 세트

**유지 (ground truth 불필요)**
1. **Faithfulness** — 답변 주장이 현재 검색 조항에서 지지되는가 (LLM judge)
2. **Answer Relevance** — 질문 ↔ 답변 임베딩 유사도
3. **Context Precision** — 검색 조항이 답변에 실제 기여했는가 (LLM judge)

**신규 (baseline 기반, ground truth 불필요)**
4. **Answer Consistency** — 현재 답변 vs `baseline_answer` 임베딩 코사인 유사도
5. **Citation Stability** — 현재 retrieved vs `baseline_retrieved_clause_ids` Jaccard 유사도

**제거**
- Context Recall — `expected_clause_ids`(사람 작성 필요) 의존

### 왜 이 조합인가

- Faithfulness/Answer Relevance/Context Precision은 **절대 품질**을 측정 (baseline 무관)
- Answer Consistency/Citation Stability는 **상대 안정성**을 측정 (drift 감지)
- 둘을 합치면 "답변이 여전히 올바르면서(절대), baseline에서 크게 벗어나지 않았는가(상대)"를 동시에 체크

---

## 자동 씨딩 흐름

### 사용자 동선 (수작업 전부 제거)

```bash
# 1단계 — 사용자는 UI에서 평소처럼 질문 (이미 하고 있음)
# (Langfuse에 trace가 자동으로 쌓임)

# 2단계 — eval 씨딩 (원샷)
bash scripts/eval.sh --seed

# 3단계 — eval 실행
bash scripts/eval.sh

# 4단계 — baseline 확정 (결과 OK면)
bash scripts/eval.sh --update-baseline
```

**수작업:** 0건. `golden.json`을 직접 열지 않아도 됨.

### `--seed` 내부 동작

1. Langfuse API에서 최근 100개 trace 조회 (`name=insurance-qa`, `tags=!eval`, `grading_score>=2`)
2. 각 trace에서 추출:
   - `input.question`, `userId`, `metadata.documentId`
   - `output.answer`, `output.citations`, `output.retrieved_clauses`, `output.questionType`, `output.gradingScore`
3. 질문 해시로 중복 제거
4. `golden.json` overwrite (주석에 `seeded_at`, `source`, `version` 기록)
5. 결과 요약 출력 (카테고리별 개수)

### 옵션 플래그

```bash
bash scripts/eval.sh --seed                    # 기본 100건
bash scripts/eval.sh --seed --limit 30         # 30건만
bash scripts/eval.sh --seed --min-score 3      # grader=3만
bash scripts/eval.sh --seed --since 2026-04-10 # 날짜 이후 trace만
```

---

## 회귀 감지 로직 (갱신)

baseline 대비 **5% 이상 하락** 시 회귀:

- `faithfulness`, `answer_relevance`, `context_precision` — 절대 점수 하락
- `answer_consistency`, `citation_stability` — 0.85 미만이면 이미 drift (임계치 방식)

각 메트릭 개별로 체크 → 하나라도 회귀면 exit code 1.

---

## Langfuse trace에 `retrieved_clauses` 추가

현재 `query-service/src/index.ts`의 trace output:

```typescript
trace.update({
  output: { answer, citations, questionType, gradingScore, retryCount }
});
```

변경:

```typescript
trace.update({
  output: {
    answer: result.answer,
    citations: result.citations,
    retrieved_clauses: result.retrievedClauses.map(c => ({
      clauseNumber: c.clauseNumber,
      clauseTitle: c.clauseTitle,
      score: c.score,
    })),
    questionType: result.questionType,
    gradingScore: result.gradingScore,
    retryCount: result.retryCount,
  }
});
```

**Why:** 씨딩 시 retrieved 조항 정보가 필요. HTTP 응답에는 이미 추가했지만(이전 작업) Langfuse에도 기록해야 과거 trace에서 추출 가능.

**Note:** 이전에 쌓인 trace는 `retrieved_clauses`가 없음. 씨딩은 이 변경 배포 이후 trace부터만 유효. 사용자가 UI에서 몇 번 질의하면 금방 축적됨.

---

## 설계 결정

### 왜 정답(ground truth)을 포기하는가

- 포트폴리오 규모엔 정답 작성 비용이 가치를 초과
- 정답 없이도 "drift 감지"는 가능 (snapshot test 원리)
- 오히려 "LLMOps 데이터 플라이휠" 스토리로 격상 — 실사용 → baseline → 회귀 감지의 루프

### 왜 Langfuse가 소스인가 (Supabase 아님)

- Langfuse trace에 answer + citations + retrieved 모두 한 곳에 있음
- Supabase `chat_messages`에는 citations/clauses 없음 (별도 테이블 필요)
- Langfuse는 읽기 전용 API로 깔끔함 — 기존 쓰기 경로(query-service)와 분리

### 왜 overwrite 방식인가 (append 아님)

- golden.json을 "항상 최신 스냅샷"으로 유지하는 것이 단순
- 과거 Dataset이 필요하면 git history에 남음 (baseline.json은 git tracked)
- append는 중복 관리, stale 항목 관리가 복잡

### 왜 `tags=!eval` 필터인가

- eval 자체가 `X-Eval-Run-Id` 헤더로 `tags=["eval"]`을 부여한 trace를 생성
- 이걸 씨딩 소스에 포함하면 순환 참조 (eval이 eval 결과를 씨앗으로 쓰게 됨)

### 왜 `grading_score >= 2` 필터인가

- 런타임 grader가 1점 준 trace는 이미 "품질 저하" 상태
- 이걸 baseline으로 삼으면 회귀 감지 기준이 낮아져 의미 없음
- 2점 이상만 씨앗으로 사용해 baseline 품질 담보

### 왜 category는 자동 분류인가

- 기존 `question_classifier` 노드가 이미 `questionType` 산출 (coverage / claim_eligibility / general)
- trace `output.questionType` 그대로 재사용
- 사용자 입력 불필요

---

## 검증 기준

- `bash scripts/eval.sh --seed` 실행 시 Langfuse trace 기반으로 `golden.json` 자동 생성
- 생성된 항목에 `expected_*` 필드가 없음 (새 스키마 준수)
- `bash scripts/eval.sh --seed` 재실행 시 기존 파일 overwrite (중복 제거됨)
- `bash scripts/eval.sh` 실행 시 새 5개 메트릭 모두 산출
- `--update-baseline` 후 다음 실행 시 drift 0 (동일 실행 결과)
- 사용자가 `golden.json`을 한 번도 수정하지 않고 eval 전 과정 완료 가능
- Langfuse trace가 비어있을 때 `--seed` 실행 시 유의미한 에러 메시지 ("no traces found, query the UI first")
- 이미 생성된 `golden.json`에 수동 값이 있으면 `--seed`가 경고 후 overwrite (`--force` 플래그 없이도)

---

## 마이그레이션

기존 파일 정리:
- `query-service/src/eval/dataset/golden.json` — 현재 수동 값 overwrite (사용자가 입력한 document_id 등은 Langfuse trace에서 자동 추출 가능하므로 손실 없음)
- `docs/eval/baseline.json` — 새 메트릭 반영 (`context_recall` 제거, `answer_consistency`/`citation_stability` 추가)

기존 spec(`2026-04-17-evaluation-pipeline.md`)은 deprecated 표기하고 유지 (이력 추적).
