# Supervisor 패턴 Agent 고도화 구현 계획 (축소판)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 LangGraph를 Supervisor + 2개 하위 팀(retrieval_team, answer_team) 구조로 재구성하여 "Hierarchical Team / Agentic 아키텍처" JD 문구를 증빙.

**Architecture:** 기존 `question_classifier` 노드를 `supervisor`로 rename (추가 LLM 호출 없음). `retrieval_team` subgraph = retriever + (cond) tools_agent. `answer_team` subgraph = answer_generator + citation_formatter. self-correction (grader + query_rewriter)은 top-level에 유지하고 실패 시 retrieval_team을 재호출하는 루프를 top-level에서 관장.

**Tech Stack:** `@langchain/langgraph` v0.2.36 (subgraphs: true 지원 확인), Vitest, TypeScript 5.

**스펙 참조:** `docs/superpowers/specs/2026-04-18-supervisor-pattern.md`

---

## File Structure

| 파일 | 역할 |
|---|---|
| `query-service/src/graph/nodes/supervisor.ts` | 신규 (classifier.ts 내용 이관) — Supervisor 노드 |
| `query-service/src/graph/nodes/classifier.ts` | 삭제 |
| `query-service/src/graph/subgraphs/retrieval-team.ts` | 신규 — `buildRetrievalTeam(voyage, qdrant)` factory, retriever + (cond) tools_agent |
| `query-service/src/graph/subgraphs/answer-team.ts` | 신규 — `buildAnswerTeam()` factory, answer_generator + citation_formatter |
| `query-service/src/graph/graph.ts` | 수정 — top-level 그래프 재구성 |
| `query-service/src/graph/stream.ts` | 수정 — `subgraphs: true` + `[namespace, updates]` 튜플 처리 |
| `query-service/src/jobs/step-labels.ts` | 수정 — `supervisor` 라벨, grader progressIndex 재배치 |
| `query-service/src/__tests__/nodes.test.ts` | 수정 — "classifier" 문구 → "supervisor" |
| `query-service/src/__tests__/step-labels.test.ts` | 신규 — progressIndex/totalSteps 시퀀스 검증 |
| `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` | 수정 — 최근 변경/Phase 4/Supervisor 결정 |

---

## Task 1: Supervisor 노드 rename (classifier → supervisor)

**Files:**
- Create: `query-service/src/graph/nodes/supervisor.ts`
- Delete: `query-service/src/graph/nodes/classifier.ts`
- Modify: `query-service/src/graph/graph.ts` (import + node 이름)
- Modify: `query-service/src/__tests__/nodes.test.ts` (describe 문구만)

- [ ] **Step 1: supervisor.ts 생성 (classifier.ts 내용 이관 + 함수명 변경)**

파일: `query-service/src/graph/nodes/supervisor.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, QuestionType } from "../state.js";

function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

/**
 * Supervisor 노드 — 질문 유형을 분류하여 하위 팀(retrieval_team, answer_team)의
 * 내부 경로를 결정하도록 state에 questionType을 기록한다.
 *
 * Hierarchical Team 패턴에서 team router 역할. 매 노드마다 LLM으로 라우팅하는
 * "full Supervisor" 대신 single-shot 분류로 하위 팀의 conditional edge가 활용하는
 * 지시만 남긴다 (포트폴리오 축소판).
 */
export async function supervise(
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

- [ ] **Step 2: classifier.ts 삭제**

```bash
rm "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service/src/graph/nodes/classifier.ts"
```

- [ ] **Step 3: graph.ts import / 노드 이름 변경**

현재 `query-service/src/graph/graph.ts:3`:

```typescript
import { classifyQuestion } from "./nodes/classifier.js";
```

→ 변경:

```typescript
import { supervise } from "./nodes/supervisor.js";
```

`graph.ts:23` (노드 등록):

```typescript
    .addNode("question_classifier", classifyQuestion)
```

→ 변경:

```typescript
    .addNode("supervisor", supervise)
```

`graph.ts:30-31` (START / 다음 엣지):

```typescript
    .addEdge(START, "question_classifier")
    .addEdge("question_classifier", "retriever")
```

→ 변경:

```typescript
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "retriever")
```

(이번 Task에서는 그래프 구조 자체 재구성은 하지 않음 — 이름만 rename. 구조 재구성은 Task 4.)

- [ ] **Step 4: 테스트 describe 문구 업데이트 (선택 — 기능 무관)**

`query-service/src/__tests__/nodes.test.ts`에서 기존 `parseQuestionType` 테스트는 그대로 통과 (함수가 test 파일 안에 inline 정의되어 있음). 가독성을 위해 파일 상단 주석만 추가:

```typescript
// Supervisor 노드의 questionType 파싱 로직 검증.
// (parseQuestionType는 supervisor.ts 내부 헬퍼 — 테스트에서는 동일 로직을 inline 재현)
```

- [ ] **Step 5: 타입 체크 + 테스트**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx tsc --noEmit && npx vitest run
```

Expected: tsc 0 에러, vitest 기존 테스트 모두 PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add -A query-service/src/graph/nodes query-service/src/graph/graph.ts query-service/src/__tests__/nodes.test.ts && git commit -m "refactor(query): rename classifier node to supervisor"
```

---

## Task 2: retrieval_team subgraph 생성

**Files:**
- Create: `query-service/src/graph/subgraphs/retrieval-team.ts`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service/src/graph/subgraphs"
```

- [ ] **Step 2: retrieval-team.ts 작성**

파일: `query-service/src/graph/subgraphs/retrieval-team.ts`

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../state.js";
import { createRetriever } from "../nodes/retriever.js";
import { toolsAgent } from "../nodes/tools-agent.js";
import type { VoyageClient } from "../../clients/voyage.js";
import type { InsuranceQdrantClient } from "../../clients/qdrant.js";

/**
 * retrieval_team subgraph.
 *
 * 책임: 질문에 근거가 될 약관 조항을 검색하고, claim_eligibility 질문인 경우
 * 도구를 호출하여 사실(면책기간/제외 조항/입원일수)을 검증한다.
 *
 * 내부 구조:
 *   START → retriever → (claim_eligibility) tools_agent → END
 *                    → (else)             → END
 */
export function buildRetrievalTeam(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  const retrieve = createRetriever(voyageClient, qdrantClient);

  const graph = new StateGraph(AgentState)
    .addNode("retriever", retrieve)
    .addNode("tools_agent", toolsAgent)
    .addEdge(START, "retriever")
    .addConditionalEdges(
      "retriever",
      (state) =>
        state.questionType === "claim_eligibility" ? "tools_agent" : END,
      {
        tools_agent: "tools_agent",
        [END]: END,
      }
    )
    .addEdge("tools_agent", END);

  return graph.compile();
}
```

- [ ] **Step 3: compile 성공 단위 테스트**

파일: `query-service/src/__tests__/retrieval-team.test.ts` (신규)

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildRetrievalTeam } from "../graph/subgraphs/retrieval-team.js";

// 타입만 만족하는 stub — 실제 호출은 하지 않음
const voyageStub = { embed: vi.fn() } as unknown as Parameters<typeof buildRetrievalTeam>[0];
const qdrantStub = { search: vi.fn() } as unknown as Parameters<typeof buildRetrievalTeam>[1];

describe("retrieval_team subgraph", () => {
  it("compile 성공하고 .invoke() 메서드를 제공해야 한다", () => {
    const team = buildRetrievalTeam(voyageStub, qdrantStub);
    expect(typeof team.invoke).toBe("function");
    expect(typeof team.stream).toBe("function");
  });
});
```

- [ ] **Step 4: 테스트 실행**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx vitest run retrieval-team
```

Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add query-service/src/graph/subgraphs/retrieval-team.ts query-service/src/__tests__/retrieval-team.test.ts && git commit -m "feat(query): retrieval_team subgraph (retriever + cond tools_agent)"
```

---

## Task 3: answer_team subgraph 생성

**Files:**
- Create: `query-service/src/graph/subgraphs/answer-team.ts`
- Create: `query-service/src/__tests__/answer-team.test.ts`

- [ ] **Step 1: answer-team.ts 작성**

파일: `query-service/src/graph/subgraphs/answer-team.ts`

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../state.js";
import { generateAnswer } from "../nodes/answer-generator.js";
import { formatCitations } from "../nodes/citation-formatter.js";

/**
 * answer_team subgraph.
 *
 * 책임: retrieval_team이 채워놓은 retrievedClauses/toolResults를 근거로 답변을
 * 생성하고, 사용자 노출용 citation을 정제한다.
 *
 * 내부 구조:
 *   START → answer_generator → citation_formatter → END
 *
 * 주의: citation_formatter가 grader보다 먼저 실행되므로 grader 실패(재시도) 시
 * citations이 한 번 덮어쓰여지는 비효율은 있으나, formatCitations는 순수
 * 함수(LLM 호출 없음)라 비용은 무시할 수 있는 수준.
 */
export function buildAnswerTeam() {
  const graph = new StateGraph(AgentState)
    .addNode("answer_generator", generateAnswer)
    .addNode("citation_formatter", formatCitations)
    .addEdge(START, "answer_generator")
    .addEdge("answer_generator", "citation_formatter")
    .addEdge("citation_formatter", END);

  return graph.compile();
}
```

- [ ] **Step 2: compile 성공 단위 테스트**

파일: `query-service/src/__tests__/answer-team.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildAnswerTeam } from "../graph/subgraphs/answer-team.js";

describe("answer_team subgraph", () => {
  it("compile 성공하고 .invoke() 메서드를 제공해야 한다", () => {
    const team = buildAnswerTeam();
    expect(typeof team.invoke).toBe("function");
    expect(typeof team.stream).toBe("function");
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx vitest run answer-team
```

Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add query-service/src/graph/subgraphs/answer-team.ts query-service/src/__tests__/answer-team.test.ts && git commit -m "feat(query): answer_team subgraph (answer_generator + citation_formatter)"
```

---

## Task 4: Top-level graph 재구성

**Files:**
- Modify: `query-service/src/graph/graph.ts` (완전 재작성)

- [ ] **Step 1: graph.ts를 다음으로 전면 교체**

파일: `query-service/src/graph/graph.ts` (전체 내용)

```typescript
import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { supervise } from "./nodes/supervisor.js";
import { grader } from "./nodes/grader.js";
import { queryRewriter } from "./nodes/query-rewriter.js";
import { buildRetrievalTeam } from "./subgraphs/retrieval-team.js";
import { buildAnswerTeam } from "./subgraphs/answer-team.js";
import type { VoyageClient } from "../clients/voyage.js";
import type { InsuranceQdrantClient } from "../clients/qdrant.js";

const MAX_RETRIES = 2;
const PASSING_SCORE = 2;

export function buildGraph(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  const retrievalTeam = buildRetrievalTeam(voyageClient, qdrantClient);
  const answerTeam = buildAnswerTeam();

  const graph = new StateGraph(AgentState)
    .addNode("supervisor", supervise)
    .addNode("retrieval_team", retrievalTeam)
    .addNode("answer_team", answerTeam)
    .addNode("grader", grader)
    .addNode("query_rewriter", queryRewriter)
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "retrieval_team")
    .addEdge("retrieval_team", "answer_team")
    .addEdge("answer_team", "grader")
    .addConditionalEdges(
      "grader",
      (state) => {
        if (state.gradingScore < PASSING_SCORE && state.retryCount < MAX_RETRIES) {
          return "query_rewriter";
        }
        return END;
      },
      {
        query_rewriter: "query_rewriter",
        [END]: END,
      }
    )
    .addEdge("query_rewriter", "retrieval_team");

  return graph.compile();
}
```

**변경 요지:**
- 기존 7개 flat 노드 → top-level 5개 노드 (supervisor, retrieval_team, answer_team, grader, query_rewriter)
- retriever/tools_agent는 retrieval_team 내부로 이동
- answer_generator/citation_formatter는 answer_team 내부로 이동
- grader는 answer_team 뒤로 이동 (citation_formatter → grader 순서)
- grader 통과 시 END (citation_formatter가 answer_team 안에서 이미 실행됨)
- grader 실패 시 query_rewriter → retrieval_team 루프

- [ ] **Step 2: 타입 체크**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx tsc --noEmit
```

Expected: 0 에러

- [ ] **Step 3: 기존 테스트 수행 (회귀 체크)**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx vitest run
```

Expected: 모든 테스트 PASS (AgentState, parseQuestionType, tools, subgraph compile)

- [ ] **Step 4: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add query-service/src/graph/graph.ts && git commit -m "refactor(query): top-level graph = supervisor + retrieval_team + answer_team + self-correction"
```

---

## Task 5: stream.ts `subgraphs: true` 처리

**Files:**
- Modify: `query-service/src/graph/stream.ts` (chunk 포맷 변경)

LangGraph v0.2.36에서 `subgraphs: true`는 chunk 포맷을 `[namespace: string[], update: Record<string, StatePatch>]` 튜플로 변경한다. 기존 코드는 `{ [nodeName]: partial }` 단일 객체를 가정하므로 수정 필요.

- [ ] **Step 1: stream.ts 전체 교체**

파일: `query-service/src/graph/stream.ts` (전체 내용)

```typescript
import type { AgentState } from "./state.js";

export interface GraphProgressEvent {
  nodeName: string;
  state: typeof AgentState.State;
}

type StreamChunk = Record<string, Partial<typeof AgentState.State>>;
type StreamTuple = [string[], StreamChunk];

type StreamableGraph = {
  stream: (
    input: Partial<typeof AgentState.State>,
    options?: { streamMode?: "updates" | "values"; subgraphs?: boolean }
  ) => Promise<AsyncIterable<StreamChunk | StreamTuple>> | AsyncIterable<StreamChunk | StreamTuple>;
};

/**
 * graph.stream()을 돌면서 각 노드 완료 시 콜백 실행.
 * 누적 state를 유지하여 최종 결과 반환.
 *
 * subgraphs: true를 사용하므로 chunk 포맷은 [namespace, updates] 튜플.
 * top-level 노드는 namespace가 빈 배열, subgraph 내부 노드는 namespace에
 * "retrieval_team:<id>" / "answer_team:<id>" 형태의 식별자가 포함된다.
 * 노드명(updates의 key)만 상위 UI로 전달하면 step-labels가 동일하게 매핑한다.
 */
export async function runGraphWithProgress<G extends StreamableGraph>(
  graph: G,
  input: Partial<typeof AgentState.State>,
  onNode: (event: GraphProgressEvent) => void
): Promise<typeof AgentState.State> {
  let accumulated: typeof AgentState.State = input as typeof AgentState.State;

  const streamIter = await graph.stream(input, {
    streamMode: "updates",
    subgraphs: true,
  });

  for await (const chunk of streamIter as AsyncIterable<StreamChunk | StreamTuple>) {
    // subgraphs: true → [namespace, updates] 튜플
    // subgraphs: false (defensive) → updates 객체
    const updates: StreamChunk = Array.isArray(chunk) ? chunk[1] : chunk;

    for (const [nodeName, partial] of Object.entries(updates)) {
      if (!partial) continue;
      accumulated = { ...accumulated, ...partial } as typeof AgentState.State;
      onNode({ nodeName, state: accumulated });
    }
  }

  return accumulated;
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx tsc --noEmit
```

Expected: 0 에러

- [ ] **Step 3: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add query-service/src/graph/stream.ts && git commit -m "feat(query): stream.ts handles subgraphs: true tuple format"
```

---

## Task 6: step-labels.ts 업데이트

**Files:**
- Modify: `query-service/src/jobs/step-labels.ts` (supervisor 라벨 + grader 위치 이동)
- Create: `query-service/src/__tests__/step-labels.test.ts`

**새로운 시퀀스:**
- 일반: supervisor(1) retriever(2) answer_generator(3) citation_formatter(4) grader(5) → totalSteps=5
- claim_eligibility: supervisor(1) retriever(2) tools_agent(3) answer_generator(4) citation_formatter(5) grader(6) → totalSteps=6

- [ ] **Step 1: step-labels.ts 전체 교체**

파일: `query-service/src/jobs/step-labels.ts` (전체 내용)

```typescript
import type { QuestionType } from "../graph/state.js";

export interface StepInfo {
  label: string;
  progressIndex: number;
}

/**
 * 노드명 → 단계 라벨 매핑.
 * progressIndex가 -1인 항목은 questionType 의존 — resolveProgressIndex에서 해결.
 */
export function nodeToStep(
  nodeName: string,
  retryCount: number = 0
): StepInfo | null {
  switch (nodeName) {
    case "supervisor":
      return { label: "질문 유형 분석 중", progressIndex: 1 };
    case "retriever":
      return { label: "관련 조항 검색 중", progressIndex: 2 };
    case "tools_agent":
      return { label: "청구 자격 확인 중", progressIndex: 3 };
    case "answer_generator":
      return { label: "답변 생성 중", progressIndex: -1 };
    case "citation_formatter":
      return { label: "근거 정리 중", progressIndex: -1 };
    case "grader":
      return { label: "답변 품질 평가 중", progressIndex: -1 };
    case "query_rewriter":
      return {
        label: `검색 재시도 중${retryCount > 0 ? ` (${retryCount}회차)` : ""}`,
        progressIndex: -1,
      };
    default:
      return null;
  }
}

/**
 * 질문 유형에 따라 total steps 결정.
 * claim_eligibility만 tools_agent를 경유하므로 +1.
 */
export function totalStepsFor(questionType: QuestionType | null): number | null {
  if (!questionType) return null;
  return questionType === "claim_eligibility" ? 6 : 5;
}

/**
 * answer_generator / citation_formatter / grader의 progressIndex는 질문 유형에 의존.
 * claim_eligibility 경로: supervisor(1) retriever(2) tools(3) answer(4) citation(5) grader(6)
 * 일반 경로:           supervisor(1) retriever(2) answer(3) citation(4) grader(5)
 */
export function resolveProgressIndex(
  nodeName: string,
  questionType: QuestionType | null,
  retryCount: number = 0
): StepInfo | null {
  const info = nodeToStep(nodeName, retryCount);
  if (!info) return null;
  if (info.progressIndex !== -1) return info;

  const isClaim = questionType === "claim_eligibility";

  switch (nodeName) {
    case "answer_generator":
      return { ...info, progressIndex: isClaim ? 4 : 3 };
    case "citation_formatter":
      return { ...info, progressIndex: isClaim ? 5 : 4 };
    case "grader":
      return { ...info, progressIndex: isClaim ? 6 : 5 };
    case "query_rewriter":
      // rewriter는 progressIndex를 바꾸지 않음 (역주행 방지) — 호출자가 이전 값 유지
      return { ...info, progressIndex: -1 };
    default:
      return info;
  }
}
```

- [ ] **Step 2: step-labels 단위 테스트 신규**

파일: `query-service/src/__tests__/step-labels.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  nodeToStep,
  totalStepsFor,
  resolveProgressIndex,
} from "../jobs/step-labels.js";

describe("step-labels", () => {
  describe("nodeToStep", () => {
    it("supervisor → 인덱스 1", () => {
      expect(nodeToStep("supervisor")).toEqual({
        label: "질문 유형 분석 중",
        progressIndex: 1,
      });
    });
    it("question_classifier는 매핑 없음 (rename 완료 확인)", () => {
      expect(nodeToStep("question_classifier")).toBeNull();
    });
    it("retriever → 인덱스 2", () => {
      expect(nodeToStep("retriever")?.progressIndex).toBe(2);
    });
    it("query_rewriter는 retryCount 반영", () => {
      expect(nodeToStep("query_rewriter", 1)?.label).toBe("검색 재시도 중 (1회차)");
      expect(nodeToStep("query_rewriter", 0)?.label).toBe("검색 재시도 중");
    });
  });

  describe("totalStepsFor", () => {
    it("claim_eligibility → 6", () => {
      expect(totalStepsFor("claim_eligibility")).toBe(6);
    });
    it("coverage → 5", () => {
      expect(totalStepsFor("coverage")).toBe(5);
    });
    it("general → 5", () => {
      expect(totalStepsFor("general")).toBe(5);
    });
    it("null → null", () => {
      expect(totalStepsFor(null)).toBeNull();
    });
  });

  describe("resolveProgressIndex (새 시퀀스)", () => {
    it("일반 경로: answer(3) citation(4) grader(5)", () => {
      expect(resolveProgressIndex("answer_generator", "coverage")?.progressIndex).toBe(3);
      expect(resolveProgressIndex("citation_formatter", "coverage")?.progressIndex).toBe(4);
      expect(resolveProgressIndex("grader", "coverage")?.progressIndex).toBe(5);
    });
    it("claim 경로: tools(3) answer(4) citation(5) grader(6)", () => {
      expect(resolveProgressIndex("tools_agent", "claim_eligibility")?.progressIndex).toBe(3);
      expect(resolveProgressIndex("answer_generator", "claim_eligibility")?.progressIndex).toBe(4);
      expect(resolveProgressIndex("citation_formatter", "claim_eligibility")?.progressIndex).toBe(5);
      expect(resolveProgressIndex("grader", "claim_eligibility")?.progressIndex).toBe(6);
    });
    it("query_rewriter는 progressIndex -1 (역주행 방지)", () => {
      expect(resolveProgressIndex("query_rewriter", "coverage")?.progressIndex).toBe(-1);
    });
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx vitest run step-labels
```

Expected: 모든 테스트 PASS

- [ ] **Step 4: 전체 테스트 재확인**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent/query-service" && npx vitest run && npx tsc --noEmit
```

Expected: 모두 PASS, 0 에러

- [ ] **Step 5: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add query-service/src/jobs/step-labels.ts query-service/src/__tests__/step-labels.test.ts && git commit -m "feat(query): step-labels — supervisor rename, grader after citation_formatter"
```

---

## Task 7: 배포 + e2e 검증

**Files:** N/A (런타임 검증)

- [ ] **Step 1: query-service 배포**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && bash scripts/deploy.sh query-service
```

Expected: rollout 성공, `/health` 200

- [ ] **Step 2: 브라우저 e2e — 진행 상태 순서 확인**

1. http://localhost:3000/dashboard 접속, 로그인 (port-forward 이미 활성)
2. DevTools Network 탭 열기
3. 약관 선택 후 **일반 질문** 입력 ("면책기간이 언제 시작되나요?")
4. EventStream 탭에서 다음 순서로 `data: {...stepLabel, progressIndex, totalSteps}` 관찰:
   - "질문 유형 분석 중" → progressIndex=1, totalSteps=5
   - "관련 조항 검색 중" → 2
   - "답변 생성 중" → 3
   - "근거 정리 중" → 4
   - "답변 품질 평가 중" → 5
5. 완료 응답에 citations 존재

Expected: 5단계 순차 push, UI 진행바 역주행 없음

- [ ] **Step 3: 브라우저 e2e — claim 경로**

동일 UI에서 청구 자격 질문 입력 ("3일 입원했는데 보험금 청구 가능한가요?")

Expected: 6단계 시퀀스 — supervisor → retriever → tools_agent → answer_generator → citation_formatter → grader

- [ ] **Step 4: Langfuse trace 관찰**

1. https://cloud.langfuse.com 접속 → Traces
2. 위 e2e에서 생성된 trace 클릭
3. span 구조 확인:
   - `supervisor` (top-level)
   - `retrieval_team` (top-level span) → 내부에 `retriever` + (claim 시) `tools_agent` 자식 span
   - `answer_team` (top-level span) → 내부에 `answer_generator` + `citation_formatter` 자식 span
   - `grader` (top-level)

Expected: Hierarchical Team 구조가 trace에서도 시각적으로 nested. (LangGraph 자동 instrumentation이 subgraph span을 내보내지 않으면 top-level 노드만 flat하게 보일 수 있음 — 이 경우 관찰 결과만 Task 8에서 "주의" 항목으로 기록)

- [ ] **Step 5: Evaluation 회귀 관찰 (선택)**

배포 직후 snapshot이 쌓이기 시작하며 다음 cron(일요일 03:00 UTC)에 비교된다. 즉시 검증은 불가 — Task 8 문서 업데이트 후 다음 주에 baseline 비교 결과 확인.

- [ ] **Step 6: 회귀 확인 — 기존 응답 포맷 유지**

```bash
TOKEN=$(kubectl get secret api-secrets -o jsonpath='{.data.INTERNAL_AUTH_TOKEN}' | base64 -d)
kubectl port-forward svc/query-service 8082:8082 > /tmp/pf.log 2>&1 &
sleep 2
# POST /query로 jobId 받고 SSE 스트림 수신 — 최종 completed 이벤트에 answer/citations/retrieved_clauses 있어야 함
# (구체 curl 명령은 X-User-ID, X-Document-ID가 필요해 수동 e2e로 대체)
kill %1 2>/dev/null
```

UI e2e에서 assistant 메시지에 citations 패널이 정상 렌더되면 포맷 회귀 없음 확인.

---

## Task 8: 문서 업데이트

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: STATUS.md 업데이트**

상단 "마지막 업데이트" → `2026-04-18`.

"최근 변경 이력" 표 맨 위 (기존 SSE 줄 위)에 추가:

```
| 2026-04-18 | Supervisor 패턴 + Hierarchical Team (retrieval_team, answer_team subgraph) | `2026-04-18-supervisor-pattern.md` |
```

Phase 4 Tier 1 항목 "Agent 고도화" 앞에 ✅ 추가, 뒤에 `(축소 Supervisor 패턴 적용)` 메모.

```
- [x] Agent 고도화 (축소 Supervisor 패턴 적용, 2026-04-18)
```

"현재 추천 다음 작업"을 `model-service (Phi-3 CPU 양자화)` 또는 `Railway 클라우드 실배포` 중 택 — Railway 권장 (Supervisor + SSE 완료 후 클라우드 배포가 JD 필수 "클라우드" 채움에 가장 큰 임팩트).

```
**현재 추천 다음 작업:** Railway 클라우드 실배포 (JD 클라우드 요구사항 충족)
```

- [ ] **Step 2: ROADMAP.md 업데이트**

상단 "마지막 업데이트" → `2026-04-18`.
"현재 추천 다음 작업" → `Railway 클라우드 실배포`.

`### 2. Agent 고도화` 섹션 헤더를 다음으로 교체:

```markdown
### 2. Agent 고도화 ✅ 완료 (축소 Supervisor, 2026-04-18)
**JD 매핑:** Agent 기반 제품 설계 + Agentic 아키텍처 전략적 활용 (주요 업무)

**최종 구조 (축소 Supervisor + Hierarchical Team)**
- `supervisor` 노드 (기존 classifier 확장) — questionType 분류로 하위 팀 경로 지시
- `retrieval_team` subgraph — retriever + (cond) tools_agent
- `answer_team` subgraph — answer_generator + citation_formatter
- self-correction (grader + query_rewriter)은 top-level 유지
- `graph.stream({ streamMode: "updates", subgraphs: true })`로 nested 진행 상태 push

**미반영 옵션 (필요 시 별도 스펙):**
- 옵션 B: 장기 메모리 (`user_memory` 테이블 + memory 노드)
- 옵션 C: 도구 확장 (약관 비교 / 보험료 계산 / 용어 사전)
- 옵션 A 강화판: Supervisor가 매 노드마다 LLM 호출로 다음 에이전트 동적 결정
```

(기존의 옵션 A/B/C 설명 블록과 "예상 기간: 5-7일" 문구는 위 교체문으로 대체되어 제거됨.)

- [ ] **Step 3: ARCHITECTURE.md 업데이트**

상단 "마지막 업데이트" → `2026-04-18`.

"시스템 구성도" 아래 "LangGraph 구조" 다이어그램/설명이 있으면 갱신 — 현 문서에는 query-service 설명에 ASCII 그래프가 있음 (`graph.ts` 설명 부분). 해당 블록을 다음으로 교체:

기존 (현 ARCHITECTURE.md의 "LangGraph 구조" 부분):
```
classifier → retriever → (조건) tools_agent → answer_generator → grader
                                                                   ↓
                                  citation_formatter ← (점수>=2) ──┤
                                                                   ↓ (점수<2, retry<3)
                                                     query_rewriter → retriever
```

새 내용:
```
supervisor → retrieval_team → answer_team → grader
                ↑                              ↓ (점수<2, retry<2)
                └── query_rewriter ←───────────┘
                                               ↓ (pass)
                                              END

retrieval_team (subgraph):  retriever → (cond: claim_eligibility) tools_agent → END
answer_team (subgraph):     answer_generator → citation_formatter → END
```

"주요 설계 결정 이력"에 추가 (적절한 시간순 위치):

```markdown
### Supervisor 패턴 + Hierarchical Team (축소판)
**When:** 2026-04-18
**Why:**
- JD 문구 "Agentic 아키텍처 전략적 활용"을 증빙하기 위해 단일 그래프 → Hierarchical Team 구조로 재구성
- 포트폴리오 기준으로 축소 — 하위 팀 2개, Supervisor는 기존 classifier 재활용(추가 LLM 호출 없음), AgentState namespace 분리 없음
**구성:**
- `supervisor` 노드: questionType 분류로 하위 팀의 conditional edge 활용할 지시 기록
- `retrieval_team` subgraph: retriever + (cond) tools_agent
- `answer_team` subgraph: answer_generator + citation_formatter
- self-correction (grader + query_rewriter): top-level에 유지, grader 실패 시 query_rewriter → retrieval_team 루프
- LangGraph `subgraphs: true` 스트리밍으로 nested 진행 상태 push
**관찰:** Langfuse trace에서 supervisor → retrieval_team → answer_team → grader 순서의 span hierarchy 확인 (subgraph 자동 instrumentation이 내부 노드 span을 내보내는 경우 nested 표시, 아니면 top-level flat — 배포 후 실측 기록)
**제약:** Supervisor 재호출 루프 없음 (매 노드마다 LLM 라우팅은 과투자). 하위 팀 확장 시 별도 스펙
**영향 파일:** `query-service/src/graph/nodes/supervisor.ts`, `query-service/src/graph/subgraphs/{retrieval-team,answer-team}.ts`, `query-service/src/graph/graph.ts`, `query-service/src/graph/stream.ts`, `query-service/src/jobs/step-labels.ts`
**상세 스펙:** `docs/superpowers/specs/2026-04-18-supervisor-pattern.md`
```

- [ ] **Step 4: 배포 후 관찰 결과 반영 (Task 7 Step 4 실측 기반)**

Task 7 Step 4에서 Langfuse nested hierarchy가 실제로 보이는지 관찰한 결과를 위 "관찰" 항목에 한 줄 추가:

- nested로 보임 → `"Langfuse trace에서 retrieval_team/answer_team이 부모 span으로 표시되고 내부 노드가 자식 span으로 nested."`
- flat으로 보임 → `"LangGraph auto-instrumentation이 subgraph 내부 노드를 별도 span으로 내보내지 않음 — 모든 노드가 trace root 직속 flat. 구조 증빙은 코드/문서 레벨에서만."`

- [ ] **Step 5: Commit**

```bash
cd "/Users/yuhojin/Desktop/QA Agent/insurance-qa-agent" && git add docs/STATUS.md docs/ROADMAP.md docs/ARCHITECTURE.md && git commit -m "docs: Supervisor 패턴 반영 (STATUS/ROADMAP/ARCHITECTURE)"
```

---

## 검증 체크리스트 (스펙 §검증 기준 매핑)

| 스펙 기준 | 검증 위치 |
|---|---|
| 단위: retrieval_team compile | Task 2 Step 3 |
| 단위: answer_team compile | Task 3 Step 2 |
| 단위: parseQuestionType (기존) | Task 1 Step 5 (회귀) |
| 단위: step-labels 시퀀스 | Task 6 Step 2 |
| 통합: eval 샘플 회귀 | Task 7 Step 5 (다음 cron) |
| 통합: Langfuse nested trace | Task 7 Step 4 |
| UI 회귀: 진행 상태 단계 순서 | Task 7 Steps 2–3 |
| UI 회귀: totalSteps 동일 (5/6) | Task 6 Step 2 + Task 7 Steps 2–3 |
| UI 회귀: 재시도 시 progressIndex 역주행 없음 | Task 6 Step 1 (rewriter=-1) + Task 7 Step 2 관찰 |

---

## 자체 검토 결과

- [x] **Spec coverage:** 스펙 §변경 범위 표의 모든 파일이 Task 1–8에 1:1 매핑됨 (supervisor / retrieval-team / answer-team / graph / stream / step-labels / tests / docs)
- [x] **Placeholder scan:** "TBD/TODO/handle edge cases" 없음. 모든 step이 실제 코드 또는 명령
- [x] **Type consistency:** `buildRetrievalTeam(voyage, qdrant)`, `buildAnswerTeam()`, `supervise(state)` 시그니처 — Task 2/3/4에서 일관 사용. `QuestionType` 값 `"coverage" | "claim_eligibility" | "general"` — Task 1/6 일관
- [x] **노드명 일관:** `supervisor`, `retrieval_team`, `answer_team`, `retriever`, `tools_agent`, `answer_generator`, `citation_formatter`, `grader`, `query_rewriter` — 각 Task 간 오타 없음
- [x] **progressIndex 시퀀스:** 일반 5단계 / claim 6단계 — Task 6 코드와 Task 6 테스트와 Task 7 브라우저 관찰 기댓값이 모두 일치
- [x] **Subgraph tuple 호환:** Task 5의 `StreamChunk | StreamTuple` 유니언으로 `subgraphs: true`와 기존 `false` 둘 다 처리. 미래에 옵션 바꿔도 안전
- [x] **classifier.ts 참조 누락 없음:** Task 1에서 delete, Task 4에서 import 갱신. 다른 파일에서의 import는 `grep -r "classifier" query-service/src`로 계획 실행 시 사전 확인 권장

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-supervisor-pattern.md`.

CLAUDE.md MANDATORY 규칙 (`개발 실행 방식`)에 따라 **Subagent-Driven Development** 방식으로 실행 — Task마다 새 서브에이전트를 디스패치하고 스펙 리뷰 → 코드 퀄리티 리뷰 2단계 검토를 거친다.
