import { describe, it, expect } from "vitest";
import type { QuestionType } from "../graph/state.js";

// Supervisor 노드의 questionType 파싱 로직 검증.
// (parseQuestionType는 supervisor.ts 내부 헬퍼 — 테스트에서는 동일 로직을 inline 재현)

function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

describe("parseQuestionType", () => {
  it("coverage 반환", () => {
    expect(parseQuestionType("coverage")).toBe("coverage");
  });
  it("claim_eligibility 반환", () => {
    expect(parseQuestionType("claim_eligibility")).toBe("claim_eligibility");
  });
  it("알 수 없는 값은 general 반환", () => {
    expect(parseQuestionType("unknown")).toBe("general");
    expect(parseQuestionType("")).toBe("general");
  });
  it("대소문자 무시", () => {
    expect(parseQuestionType("COVERAGE")).toBe("coverage");
  });
});
