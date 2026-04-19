# Supervisor 패턴 — Agent 고도화 (축소판)

**작성일:** 2026-04-18
**상태:** 초안 (자체 검토 완료)
**목표:** 단일 그래프를 Supervisor + Hierarchical Team 구조로 재구성하여 "Agentic 아키텍처 전략적 활용" JD 요구사항을 증빙.

---

## 배경 & 목표

### 현재 구조

`query-service/src/graph/graph.ts`의 단일 그래프:

```
START
 → question_classifier
 → retriever
 → (cond: claim_eligibility) tools_agent
 → answer_generator
 → grader
 → (cond: score<2 && retry<2) query_rewriter → retriever
 → citation_formatter
 → END
```

7개 노드가 한 그래프에서 flat하게 배치되어 있다. 조건부 엣지로 제어 흐름이 갈라지지만 **하위 팀(sub-agent)** 이라 부를 만한 모듈화는 없다.

### JD 매핑

- 타겟 문구: "Agent 기반 제품 설계 및 개발", **"Agentic 아키텍처 전략적 활용"**
- 현재: self-correction 루프만 존재. 멀티 에이전트/Supervisor 패턴 미구현
- 이 스펙: Supervisor + 2개 하위 팀(retrieval_team, answer_team) 구조 도입으로 "Hierarchical Team 적용" 증빙

### 스코프 기준 (포트폴리오)

CLAUDE.md의 "스코프 기준 (MANDATORY)" 원칙에 따라 **최소 증빙 수준**으로 진행한다.

- 하위 에이전트 3개 → **2개**로 축소
- Supervisor 별도 LLM 호출 → **기존 classifier 노드를 Supervisor로 rename**
- AgentState namespace 분리 → 단일 State 공유 유지
- self-correction (grader + query_rewriter) → 기존 그대로 top-level에 유지

---

## 제안 구조

### Top-level 그래프

```
START
 → supervisor
 → retrieval_team (subgraph)
 → answer_team (subgraph)
 → grader
 → (cond: score<2 && retry<2) query_rewriter → retrieval_team (루프)
 → END
```

### retrieval_team (subgraph)

```
START → retriever → (cond: claim_eligibility) tools_agent → END
                 → (else)                                → END
```

책임: 질문에 근거가 될 조항을 검색하고, 청구 자격 판단 질문일 경우 도구를 호출해 사실 검증.

### answer_team (subgraph)

```
START → answer_generator → citation_formatter → END
```

책임: 검색된 조항 + 도구 결과를 근거로 최종 답변 생성 + 사용자 노출용 근거 조항 정제.

### Supervisor 노드

- 기존 `classifier.ts`의 로직을 그대로 사용 (Claude Haiku로 questionType 분류)
- 파일명만 `supervisor.ts`로 변경, export 함수는 `supervise`
- 출력은 동일하게 `{ questionType }`. 라우팅 결정은 각 subgraph 내부의 conditional edge에 위임 (Supervisor가 매 노드마다 LLM 호출하는 "진짜 Supervisor"는 포트폴리오 과투자)

**Why 이걸 "Supervisor"라 부르는가:** 질문 유형 분류 = 하위 팀의 내부 경로를 결정하는 단일 시점의 라우팅 지시. LangGraph Hierarchical Team 예제에서도 team router가 분류 결과를 state로 넘기고 하위 팀이 이를 참조하는 패턴이 기본형.

---

## 변경 범위

| 파일 | 변경 | 책임 |
|---|---|---|
| `query-service/src/graph/nodes/classifier.ts` | **Rename → supervisor.ts**, export `supervise` | Supervisor 노드 |
| `query-service/src/graph/subgraphs/retrieval-team.ts` | **신규** | retrieval_team subgraph compile factory |
| `query-service/src/graph/subgraphs/answer-team.ts` | **신규** | answer_team subgraph compile factory |
| `query-service/src/graph/graph.ts` | **수정** | top-level 그래프 재구성 (supervisor → retrieval_team → answer_team → grader → ... ) |
| `query-service/src/graph/stream.ts` | **수정** | `streamMode: "updates"` + `subgraphs: true`로 subgraph 내부 노드도 progress emit |
| `query-service/src/jobs/step-labels.ts` | **수정** | `supervisor` 라벨 추가, subgraph 내부 노드명 처리 |
| `query-service/src/__tests__/nodes.test.ts` | **수정** | classifier 관련 테스트 → supervisor로 이름 변경 |
| `query-service/src/__tests__/state.test.ts` | **영향 없음** (state shape 유지) | — |
| `docs/STATUS.md` | **수정** | 최근 변경 이력 + Phase 4 Tier 1 체크 |
| `docs/ROADMAP.md` | **수정** | "Agent 고도화" 섹션 완료 처리, 미반영 옵션(B/C) 별도 노트 |
| `docs/ARCHITECTURE.md` | **수정** | LangGraph 구조도 + "Supervisor 패턴" 결정 기록 |

**삭제 파일:** 없음 (classifier.ts는 rename만)

**비범위 (명시):**
- State namespace 분리 (subgraph마다 sub-state 선언 — 과투자)
- 3번째 하위 팀 추가 (예: summarizer)
- Supervisor 재호출 루프 (Supervisor가 각 에이전트 완료 후 다음 에이전트를 LLM으로 결정)
- 옵션 B(장기 메모리) / 옵션 C(도구 확장) — 별도 스펙으로 분리

---

## 진행 상태 호환성

LangGraph `streamMode: "updates"` + `subgraphs: true` 조합은 튜플 형식을 emit:

```
[namespace: string[], updates: { [nodeName]: StatePatch }]
```

- `namespace`가 빈 배열 `[]`이면 top-level 노드 (`supervisor`, `grader`, `query_rewriter`)
- `namespace`가 `["retrieval_team:<checkpoint_id>"]` 같은 형태면 subgraph 내부 노드

### stream.ts 수정 요지

```typescript
const streamIter = await graph.stream(input, {
  streamMode: "updates",
  subgraphs: true,
});

for await (const chunk of streamIter) {
  // chunk = [namespace, updates]
  const [_namespace, updates] = chunk;
  for (const [nodeName, partial] of Object.entries(updates)) {
    accumulated = { ...accumulated, ...partial };
    onNode({ nodeName, state: accumulated });
  }
}
```

`nodeName`은 subgraph 내부에서도 `retriever`, `tools_agent`, `answer_generator`, `citation_formatter`로 그대로 emit된다 (namespace만 달라짐). 따라서 기존 `step-labels.ts`의 node-to-progressIndex 매핑은 **거의 그대로 재사용** 가능.

### step-labels.ts 수정 요지

- `question_classifier` → `supervisor`로 라벨 키 변경
- progressIndex 시퀀스 그대로:
  - claim_eligibility: supervisor(1) retriever(2) tools_agent(3) answer_generator(4) citation_formatter(5) grader(6)
  - 일반: supervisor(1) retriever(2) answer_generator(3) citation_formatter(4) grader(5)

(참고: 현재 코드는 grader의 progressIndex를 명시하지 않고 answer 뒤 citation 앞에 배치돼 있는데, Supervisor 설계에서 grader가 answer_team 이후에 위치하므로 실제 totalSteps 재계산 필요 — 구현 시 상세화)

---

## 검증 기준

### 단위 테스트 (Vitest)

1. `retrieval_team.invoke({ question, userId, documentId })` → `retrievedClauses` 존재, claim_eligibility일 때만 `toolResults` 채워짐
2. `answer_team.invoke({ retrievedClauses, toolResults, question })` → `answer`, `citations` 존재
3. Supervisor 노드 → questionType 3종 중 하나 반환
4. Top-level graph invoke → 기존과 동일한 `{ answer, citations, retrievedClauses }` 반환

### 통합 (수동)

- 기존 eval 샘플 10개로 회귀 없는지 확인 (evaluation 파이프라인 다음 run 시 auto-compare)
- Langfuse 대시보드에서 nested trace 확인 — `supervisor` 다음에 `retrieval_team` span이 자식으로 보여야 함

### UI 회귀

- ChatPanel 진행 상태가 기존과 유사하게 단계별 표시 (`supervisor` 라벨만 "질문 유형 분석 중"으로 유지)
- totalSteps 값이 기존과 동일 (5 or 6)

---

## 리스크 및 완화

| 리스크 | 완화 |
|---|---|
| `subgraphs: true`가 LangGraph.js 현재 버전에서 지원 안 될 가능성 | 사전 확인: `@langchain/langgraph` 패키지 버전 확인 후 문서 참조. 미지원 시 subgraph 내부 노드를 top-level로 inline하되 파일은 분리 (의미상 팀 구조는 유지) |
| subgraph 내부 노드 이름이 top-level 노드와 충돌 | 없음 — retriever/tools_agent/answer_generator/citation_formatter는 모두 subgraph 안에만 존재 |
| Langfuse nested trace 미지원 | 확인만 하고 미지원이어도 스펙 수용 (trace 계층은 nice-to-have) |
| evaluation 회귀 | grader + rewriter 루프는 그대로 유지하므로 의미 변화 없음. 차이는 trace 구조뿐. 다음 eval run에서 baseline 대비 드리프트 체크 |

---

## 구현 순서 (계획 단계에서 task화 예정)

1. classifier.ts rename → supervisor.ts + 테스트 업데이트
2. retrieval-team.ts subgraph 신규 + 단위 테스트
3. answer-team.ts subgraph 신규 + 단위 테스트
4. graph.ts 재구성 + 기존 테스트 통과 확인
5. stream.ts `subgraphs: true` 처리
6. step-labels.ts 업데이트 + 진행 상태 UI 회귀 확인
7. 배포 + Langfuse trace 관찰
8. docs 업데이트 (STATUS / ROADMAP / ARCHITECTURE)

예상 기간: **2-3일** (포트폴리오 기준 스코프).

---

## 자체 검토 결과

CLAUDE.md "스펙 작성 규칙 (MANDATORY)"에 따라 1차 작성 직후 자체 검토.

### Critical

없음.

### Important

1. **`subgraphs: true` 옵션 존재 검증 필요** — LangGraph.js 버전에 따라 API 시그니처가 다를 수 있음. 스펙에서 "구현 전에 package.json 버전 확인 + 공식 문서 교차 검증" 단계를 명시 (Step 5 착수 시 첫 작업으로).
   - **패치:** 계획 수립 단계(writing-plans)에서 Task 5 앞에 "버전 확인 & 필요 시 fallback 전략 확정" 서브태스크 추가 예정.
2. **grader progressIndex 명시 누락** — 현재 `step-labels.ts`는 grader의 progressIndex를 `-1`로 두고 resolveProgressIndex에서 questionType 기반으로 계산. Supervisor 설계에서 grader가 answer_team **이후**에 위치하므로 시퀀스가 변함:
   - claim_eligibility: supervisor(1) retriever(2) tools_agent(3) answer_generator(4) citation_formatter(5) grader(6) → **totalSteps=6 유지**
   - 일반: supervisor(1) retriever(2) answer_generator(3) citation_formatter(4) grader(5) → **totalSteps=5 유지**
   - 현재 구조(grader가 answer_generator 바로 뒤)와 Supervisor 구조(grader가 citation_formatter **뒤**)의 차이점이 progressIndex 매핑에 영향.
   - **패치:** 스펙의 step-labels 섹션에 시퀀스 명시 추가 (완료 — 위 섹션 갱신).
3. **grader retry 루프 시 progressIndex 역주행** — 현재는 query_rewriter의 progressIndex=-1로 유지(역주행 방지). Supervisor 구조에서는 query_rewriter → retrieval_team 루프가 있으므로 retrieval_team 내부 노드들이 다시 emit됨. UI의 max-guard 로직이 이미 역주행 방지하므로 변화 없음 — 단 step-labels 테스트에서 확인 필요.
   - **패치:** 검증 기준 §UI 회귀 항목에 "재시도 시 progressIndex 유지" 명시 추가 (완료).

### Minor

1. **subgraph factory naming convention** — `retrieval-team.ts`에서 `buildRetrievalTeam(voyage, qdrant)` 같은 factory 형태로 통일하는 것이 `graph.ts`의 `buildGraph`와 대칭.
   - **패치:** 변경 범위 표에 factory 시그니처 예시 추가할지 고려 — 계획 단계로 넘김(writing-plans에서 상세화).
2. **비범위 항목의 B/C 옵션 언급** — ROADMAP 수정 시 "옵션 B/C는 이번 스펙 범위 외, 필요 시 별도 스펙"으로 표기 필요. 스펙 §변경 범위의 ROADMAP 줄에 이미 명시됨.
3. **Langfuse nested trace 관찰 결과 기록 위치** — ARCHITECTURE.md의 "Supervisor 패턴" 결정 블록에 "관찰된 nested hierarchy" 한 줄 남기기 권장. 배포 후 업데이트.
   - **패치:** 계획 Task 8 "docs 업데이트"에 이 한 줄 추가 예정으로 명시.

### 검토 후 조치 요약

- §진행 상태 호환성 단계 시퀀스 명시 완료
- §검증 기준 §UI 회귀에 재시도 역주행 체크 추가 완료
- 남은 사항은 계획(plan) 단계에서 task 분해 시 반영 — `docs/superpowers/plans/2026-04-18-supervisor-pattern.md`

---

## 검토 이력

| 날짜 | 검토자 | 내역 |
|---|---|---|
| 2026-04-18 | Claude (자체) | 1차 작성 + 자체 검토 3 Important / 3 Minor 식별 후 스펙 내 패치 완료. 사용자 승인 대기 |
