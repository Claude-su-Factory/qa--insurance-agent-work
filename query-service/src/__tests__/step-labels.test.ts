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
