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
