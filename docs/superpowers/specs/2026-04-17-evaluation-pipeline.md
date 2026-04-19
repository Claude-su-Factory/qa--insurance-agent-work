# 자동 Evaluation 파이프라인 설계 문서

**작성일:** 2026-04-17
**대상 프로젝트:** insurance-qa-agent
**JD 매핑:** 기존 AI 서비스, LLMOps 운영 고도화 (주요 업무)

---

## 문제

현재 시스템은 품질을 객관적으로 측정할 방법이 없다.

1. **런타임 시그널은 쌓이지만 활용 안 됨** — Langfuse trace와 grader 점수가 기록되지만 아무도 보지 않음
2. **회귀 감지 불가** — 프롬프트/모델을 바꾸면 품질이 올랐는지 떨어졌는지 알 수 없음
3. **정답셋 부재** — "좋은 답변"의 정의가 없어 개선 여부를 판단할 수 없음
4. **Agent 고도화, model-service 도입 시 비교 기준이 없음** — Haiku → Phi-3 교체나 멀티 에이전트 전환 시 품질 트레이드오프를 숫자로 말할 수 없다

LLMOps 관점에서 "품질을 지속적으로 측정하고 회귀를 차단하는" 루프가 있어야 하며, 이는 JD 주요 업무에 직결된다.

---

## 해결

오프라인(Golden Dataset) + 온라인(Langfuse 런타임) 양축의 평가 체계를 구축한다.

1. 보험 약관 도메인에 맞춘 **Golden Dataset**을 만든다 (30~50건)
2. **LLM-as-judge 방식**으로 4개 메트릭을 계산한다 — 외부 파이썬 의존성 없이 TypeScript + Claude로 구현
3. **로컬 실행 스크립트** `scripts/eval.sh`로 언제든 돌릴 수 있게 한다
4. **baseline 파일**과 비교해 회귀를 감지하고, 개선 시 수동으로 baseline을 갱신한다
5. **Langfuse 태그**로 eval run을 런타임 trace와 별도로 추적한다

---

## 변경 범위

| 파일 | 변경 |
|---|---|
| `query-service/src/eval/dataset/golden.json` | 신규 — Golden Dataset |
| `query-service/src/eval/metrics.ts` | 신규 — 4개 메트릭 LLM-as-judge 구현 |
| `query-service/src/eval/runner.ts` | 신규 — eval 실행기 |
| `query-service/src/eval/report.ts` | 신규 — 결과 포맷터 + baseline 비교 |
| `query-service/package.json` | 수정 — `eval` 스크립트 추가 |
| `scripts/eval.sh` | 신규 — 로컬 실행 래퍼 |
| `docs/eval/baseline.json` | 신규 — 기준선 점수 |
| `docs/eval/README.md` | 신규 — 사용법, 데이터셋 추가, baseline 갱신 절차 |
| `docs/eval/results/` | 신규 디렉토리 — 실행 히스토리 |
| `.gitignore` | 수정 — `docs/eval/results/*.json` 제외 (baseline만 커밋) |
| `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` | 수정 — 완료 반영 |

---

## Golden Dataset 설계

### 포맷

각 항목은 다음 구조를 가진다.

```json
{
  "id": "q001",
  "category": "claim_eligibility",
  "document_id": "<실제 업로드된 약관의 UUID>",
  "document_name": "2023 무배당 생명보험 약관",
  "question": "운전 중 사고로 사망했을 때 보험금이 지급되나요?",
  "expected_answer_points": [
    "자동차 운전 중 사망은 상해사망보험금 지급 대상에 해당",
    "무면허운전, 음주운전은 면책사유"
  ],
  "expected_clause_ids": ["상해사망보험금 지급 사유", "면책사유 제1항"]
}
```

- `expected_answer_points`: 답변에 반드시 포함되어야 할 사실 포인트 리스트 (문자열 완전 일치 아님, 의미 일치)
- `expected_clause_ids`: 검색 결과에 반드시 포함되어야 할 조항 식별자 (clause_no 또는 조항 제목)

### 카테고리 분포

| 카테고리 | 건수 | 설명 |
|---|---|---|
| `claim_eligibility` | 10-15 | 보험금 지급 가능 여부 |
| `exclusion` | 8-10 | 면책 조항 해석 |
| `term_definition` | 5-8 | 용어 정의 |
| `premium` | 5-7 | 보험료 관련 |
| `procedure` | 5 | 청구 절차 |

총 33~45건. 실제 약관 PDF 2~3개를 기반으로 구축한다.

### 구축 방법

1. 현재 업로드된 실제 약관 중 2~3개를 선정 (이미 ingestion된 것 활용)
2. 각 약관에서 조항을 검토하며 질문을 수작업으로 구성
3. 각 질문에 대해 Claude Sonnet으로 "예상 답변 포인트" 초안 생성 후 사람이 검수
4. Golden Dataset JSON으로 저장

Phase 1 범위: **최소 15건으로 파일럿 릴리스 → 이후 확장**. 30~50건 구축은 별도 작업으로 분리해도 됨.

---

## 4개 메트릭 정의

### 1. Faithfulness (답변 충실도)
**질문:** 답변의 각 주장이 검색된 근거 조항에 실제로 있는가? (할루시네이션 체크)

**계산법:**
- 답변을 N개 주장(claims)으로 분해 (LLM)
- 각 주장에 대해 "이 주장이 아래 조항들로부터 도출 가능한가?" LLM에 Yes/No 판정
- 점수 = supported_claims / total_claims

### 2. Answer Relevance (답변 적합성)
**질문:** 답변이 질문에 실제로 답하고 있는가?

**계산법:**
- 답변을 기반으로 "이 답변이 나오게 한 질문"을 LLM으로 역생성 (3회)
- 역생성된 질문과 원래 질문의 코사인 유사도 (임베딩)
- 점수 = 3회 평균 유사도

### 3. Context Precision (검색 정밀도)
**질문:** 검색된 조항이 실제로 답변 생성에 필요했는가?

**계산법:**
- 각 검색 조항에 대해 "이 조항이 질문에 답하는 데 필요한가?" Yes/No 판정
- 순위별 가중치(MAP-like): relevant가 상위에 있을수록 점수 높음
- 점수 = weighted precision@k

### 4. Context Recall (검색 재현율)
**질문:** 정답 생성에 필요한 조항을 다 찾았는가?

**계산법:**
- `expected_clause_ids` 중 검색된 조항에 포함된 비율
- 점수 = matched / total_expected

### 판정 모델

모든 LLM-as-judge는 **Claude Haiku** 사용. 이유:
- 채점은 단순 판정 작업
- 비용 최소화 (eval 1회당 150~300회 호출 예상)
- 기존 grader와 동일 모델 사용으로 일관성

---

## 실행 흐름

```
scripts/eval.sh
    ↓
query-service의 eval runner 실행 (tsx)
    ↓
1. golden.json 로드
2. 각 item에 대해:
   - 실제 query-service API 호출 (/query)
   - 답변 + 검색 조항 수집
   - Langfuse trace에 tag "eval-run-{timestamp}" 부여
3. 메트릭 계산 (Haiku LLM-as-judge)
   - Faithfulness
   - Answer Relevance
   - Context Precision
   - Context Recall
4. 결과 저장: docs/eval/results/{timestamp}.json
5. baseline 비교: docs/eval/baseline.json
6. 콘솔 리포트 출력 (개선/회귀 항목 강조)
```

### CLI 동작

```bash
# 기본 실행 (전체 데이터셋)
bash scripts/eval.sh

# 카테고리 지정
bash scripts/eval.sh --category claim_eligibility

# baseline 갱신 (개선 확인 후 수동)
bash scripts/eval.sh --update-baseline

# 드라이런 (LLM 호출 없이 데이터셋만 검증)
bash scripts/eval.sh --dry-run
```

### 전제 조건

- query-service가 로컬에서 실행 중 (`bash scripts/deploy.sh --no-build`)
- `.env`에 필요한 API 키 (Anthropic, Voyage, Langfuse, Internal Token)
- Golden Dataset에 명시된 `document_id`가 Qdrant에 존재

---

## 결과 파일 포맷

### `docs/eval/results/{timestamp}.json`

```json
{
  "run_id": "eval-20260417-213000",
  "timestamp": "2026-04-17T21:30:00Z",
  "dataset_size": 15,
  "aggregate": {
    "faithfulness": 0.87,
    "answer_relevance": 0.82,
    "context_precision": 0.75,
    "context_recall": 0.68
  },
  "by_category": {
    "claim_eligibility": { "faithfulness": 0.9, ... },
    "exclusion": { ... }
  },
  "items": [
    {
      "id": "q001",
      "scores": { "faithfulness": 1.0, "answer_relevance": 0.89, ... },
      "retrieved_clauses": ["...", "..."],
      "answer": "..."
    }
  ]
}
```

### `docs/eval/baseline.json`

가장 마지막으로 "승인된" 결과. 포맷은 동일. `docs/eval/results/`의 최신 파일을 수동으로 복사해서 갱신.

---

## 회귀 감지 로직

`report.ts`가 최신 결과 vs baseline 비교:

- **회귀**: aggregate 메트릭이 baseline보다 5% 이상 하락 → 콘솔에 `🔴 REGRESSION` 표시 + exit code 1
- **개선**: 5% 이상 상승 → `🟢 IMPROVED` 표시
- **동일**: ±5% 이내 → `⚪ NEUTRAL` 표시

exit code 1로 빠지면 CI에 연결했을 때 PR 블록 가능 (Phase 2에서 GitHub Actions 추가 시).

---

## Langfuse 연동

eval runner는 query-service의 기존 `/query` 엔드포인트를 호출하므로 기존 Langfuse tracing이 자동으로 동작. 다만 eval trace와 실사용 trace를 구분하기 위해 다음을 추가:

- HTTP 헤더 `X-Eval-Run-Id: eval-{timestamp}` 전달
- query-service가 이 헤더를 감지하면 Langfuse trace에 `tags: ["eval"]` + `metadata.eval_run_id` 부여
- Langfuse 대시보드에서 `tag:eval`로 필터링 가능

**효과:** 오프라인 eval 점수와 실사용자 품질 점수를 Langfuse 한 군데에서 비교 가능.

---

## 왜 LLM-as-judge인가 (RAGAS 아님)

| 비교 | LLM-as-judge (선택) | RAGAS |
|---|---|---|
| 언어 | TypeScript 네이티브 | Python only |
| 의존성 | 기존 Anthropic SDK 재사용 | 별도 Python 서비스 필요 |
| 커스터마이징 | 프롬프트 수정만으로 자유 | 라이브러리에 묶임 |
| 메트릭 정확도 | 프롬프트 품질에 달림 | 검증된 공식 구현 |
| 비용 | Claude Haiku만 | OpenAI + 임베딩 비용 |

**결정:** TS 네이티브 구현의 이점(모노레포 단일 언어 유지)이 더 크다. 메트릭 프롬프트는 RAGAS 논문의 정의를 참고하여 충실하게 작성한다.

**향후:** 필요 시 Python 평가 서비스를 별도로 띄워 RAGAS 점수도 참고용으로 추가 가능.

---

## CI 연동 (Phase 2, 이 스펙에서는 제외)

GitHub Actions `workflow_dispatch` 수동 트리거 기반으로 추후 추가. 매 PR 자동 실행은 비용 부담이 커서 보류.

본 스펙의 범위: **로컬 실행 가능한 체계 완성까지**. CI는 별도 작업.

---

## 설계 결정

### 왜 baseline을 저장소에 커밋하는가

baseline은 "현재 승인된 품질 수준"의 스냅샷이다. git history로 추적되어야 품질이 시간에 따라 어떻게 움직였는지 볼 수 있다. 개별 실행 결과(`docs/eval/results/*.json`)는 gitignore로 제외하여 저장소 비대화 방지.

### 왜 수동 baseline 갱신인가

자동 갱신하면 점수가 서서히 내려가는 drift를 놓친다. 개선을 확인한 사람이 "이 정도면 새 기준선"이라고 판단해서 수동으로 갱신하는 게 안전.

### 왜 Phase 1 범위를 15건으로 축소하는가

30~50건 데이터셋 구축은 수작업이 무거워 병목이 된다. 15건으로 먼저 파이프라인을 완성해서 동작을 검증하고, 이후 데이터셋 확장만 반복하면 된다. 데이터셋 크기가 적다고 파이프라인 자체의 가치가 없어지지 않는다.

### 왜 grader(런타임) 점수와 분리된 체계인가

런타임 grader: 실사용자 질문에 대한 실시간 채점, 속도 중시, 단일 메트릭.
오프라인 eval: Golden Dataset에 대한 상세 분석, 정확도 중시, 다차원 메트릭.

두 체계가 상호 보완적이며, Langfuse 태그로 연결하여 한 눈에 비교할 수 있게 한다.

---

## 검증 기준

- `bash scripts/eval.sh` 실행 시 Golden Dataset 15건에 대한 점수 JSON 생성
- 4개 메트릭(faithfulness, answer_relevance, context_precision, context_recall) 모두 item별 + aggregate 산출
- `docs/eval/baseline.json` 대비 회귀 감지 시 exit code 1 반환
- `docs/eval/README.md`만 읽으면 처음 사용자가 eval 실행 + 데이터셋 추가 + baseline 갱신 가능
- Langfuse 대시보드에서 `tag:eval`로 eval run trace 필터링 가능
- `bash scripts/eval.sh --dry-run` 실행 시 LLM 호출 없이 데이터셋 유효성만 검증
