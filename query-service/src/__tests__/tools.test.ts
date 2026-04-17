import { describe, it, expect } from "vitest";
import { calculateHospitalizationDays } from "../graph/tools/calculate-days.js";
import { checkExclusionClause } from "../graph/tools/check-exclusion.js";
import { checkWaitingPeriod } from "../graph/tools/check-waiting-period.js";
import type { Clause } from "../graph/state.js";

describe("calculateHospitalizationDays", () => {
  it("정상 입원 기간 계산", () => {
    expect(calculateHospitalizationDays("2024-01-01", "2024-01-05")).toBe(4);
  });
  it("당일 퇴원은 0일", () => {
    expect(calculateHospitalizationDays("2024-01-01", "2024-01-01")).toBe(0);
  });
});

const mockClauses: Clause[] = [
  {
    id: "1",
    clauseNumber: "제5조",
    clauseTitle: "면책 조항",
    content: "자해, 자살, 전쟁으로 인한 사고는 보험금을 지급하지 않습니다.",
    documentName: "삼성생명_암보험",
    score: 0.9,
  },
];

describe("checkExclusionClause", () => {
  it("면책 조항에 포함된 경우 true", () => {
    expect(checkExclusionClause(mockClauses, "자해")).toBe(true);
  });
  it("면책 조항에 없는 경우 false", () => {
    expect(checkExclusionClause(mockClauses, "암 진단")).toBe(false);
  });
});

describe("checkWaitingPeriod", () => {
  it("면책기간 이후 사고는 true", () => {
    expect(checkWaitingPeriod("2024-01-01", "2024-04-01", 90)).toBe(true);
  });
  it("면책기간 중 사고는 false", () => {
    expect(checkWaitingPeriod("2024-01-01", "2024-01-30", 90)).toBe(false);
  });
});
