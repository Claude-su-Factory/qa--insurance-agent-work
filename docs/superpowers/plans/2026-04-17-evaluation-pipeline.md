# 자동 Evaluation 파이프라인 구현 계획

**스펙:** `docs/superpowers/specs/2026-04-17-evaluation-pipeline.md`
**작성일:** 2026-04-17

---

## Goal

query-service 내부에 오프라인 평가 체계를 구축한다. Golden Dataset을 기반으로 4개 메트릭(Faithfulness, Answer Relevance, Context Precision, Context Recall)을 LLM-as-judge로 산출하고, baseline 대비 회귀를 감지한다.

## 파일 구조

```
query-service/src/eval/
├── types.ts                     공통 타입 (GoldenItem, MetricScores, RunResult)
├── dataset/
│   └── golden.json              Golden Dataset (스캐폴드 + 예시 항목)
├── metrics.ts                   4개 메트릭 LLM-as-judge 구현
├── runner.ts                    데이터셋 순회 + query-service 호출 + 메트릭 계산
├── report.ts                    콘솔 리포트 + baseline 비교
└── cli.ts                       명령행 진입점 (--dry-run, --category, --update-baseline)

query-service/src/index.ts       수정 — X-Eval-Run-Id 헤더 수신, Langfuse tag 부여
query-service/package.json       수정 — "eval" 스크립트

scripts/eval.sh                  로컬 실행 래퍼

docs/eval/
├── README.md                    사용법, 데이터셋 추가, baseline 갱신
├── baseline.json                기준선 (초기 빈 스캐폴드)
└── results/                     실행 결과 (gitignore)

.gitignore                       수정 — docs/eval/results/*.json
```

## Tasks

### Task 1: 디렉토리 + 타입 + 데이터셋 스캐폴드
- [ ] `query-service/src/eval/` 생성
- [ ] `query-service/src/eval/types.ts` 작성
- [ ] `query-service/src/eval/dataset/golden.json` 생성 (1~2 예시 + TODO 주석)
- [ ] `docs/eval/` 생성
- [ ] `docs/eval/baseline.json` 초기 빈 스캐폴드
- [ ] `.gitignore`에 `docs/eval/results/*.json` 추가

### Task 2: 4개 메트릭 구현
- [ ] `query-service/src/eval/metrics.ts`
- [ ] Faithfulness — 답변을 claims로 분해, 각 claim이 조항에서 지지되는지 LLM 판정
- [ ] Answer Relevance — 답변 기반 질문 역생성 × 3, 임베딩 코사인 유사도
- [ ] Context Precision — 검색 조항별 필요성 판정, 순위 가중 정밀도
- [ ] Context Recall — expected_clause_ids 중 retrieved에 포함된 비율
- [ ] 모든 LLM 호출은 Claude Haiku

### Task 3: 러너 구현
- [ ] `query-service/src/eval/runner.ts`
- [ ] Golden Dataset 로드
- [ ] `--category` 필터 지원
- [ ] 각 item에 대해 query-service API(`POST /query`) 호출
- [ ] `X-Eval-Run-Id` 헤더 전달
- [ ] 답변 + 검색 조항 수집 후 메트릭 계산
- [ ] 결과를 `docs/eval/results/{timestamp}.json`에 저장

### Task 4: 리포트 + baseline 비교
- [ ] `query-service/src/eval/report.ts`
- [ ] 콘솔 테이블 포맷(메트릭별 집계, 카테고리별)
- [ ] baseline.json 로드 및 diff 계산
- [ ] 회귀(5% 이상 하락) 감지 시 exit code 1
- [ ] `--update-baseline` 플래그: 최신 결과를 baseline으로 복사

### Task 5: CLI + 패키지 스크립트
- [ ] `query-service/src/eval/cli.ts` (argparse, 위 기능 묶기)
- [ ] `package.json`에 `"eval": "tsx src/eval/cli.ts"` 추가
- [ ] `scripts/eval.sh` — `.env` 로드 후 `npm run eval` 래퍼

### Task 6: query-service `X-Eval-Run-Id` 지원
- [ ] `src/index.ts` 수정: 헤더 감지 시 Langfuse trace에 `tags: ["eval"]` + `metadata.eval_run_id`

### Task 7: 문서화
- [ ] `docs/eval/README.md` — 사용법, Golden Dataset 추가 방법, baseline 갱신, 트러블슈팅

### Task 8: Dry-run 스모크 테스트
- [ ] `bash scripts/eval.sh --dry-run` 실행 → Golden Dataset 로드 + 데이터 유효성 검증만
- [ ] 에러 없이 통과 확인

### Task 9: 문서 업데이트 (MANDATORY)
- [ ] `docs/STATUS.md` — Phase 4 Tier 1 "자동 Evaluation" 체크 + 최근 변경 이력 추가
- [ ] `docs/ROADMAP.md` — Evaluation 완료 반영
- [ ] `docs/ARCHITECTURE.md` — eval 디렉토리와 X-Eval-Run-Id 설계 결정 추가
