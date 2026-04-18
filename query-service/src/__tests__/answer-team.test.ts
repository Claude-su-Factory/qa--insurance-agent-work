import { describe, it, expect } from "vitest";
import { buildAnswerTeam } from "../graph/subgraphs/answer-team.js";

describe("answer_team subgraph", () => {
  it("compile 성공하고 .invoke() 메서드를 제공해야 한다", () => {
    const team = buildAnswerTeam();
    expect(typeof team.invoke).toBe("function");
    expect(typeof team.stream).toBe("function");
  });
});
