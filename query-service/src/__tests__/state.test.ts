import { describe, it, expect } from "vitest";
import { AgentState } from "../graph/state.js";

describe("AgentState", () => {
  it("documentId 필드가 존재해야 한다", () => {
    // AgentState.spec에 documentId가 정의되어 있는지 확인
    const spec = AgentState.spec;
    expect(spec).toHaveProperty("documentId");
  });

  it("userId 필드가 존재해야 한다", () => {
    const spec = AgentState.spec;
    expect(spec).toHaveProperty("userId");
  });

  it("question 필드가 존재해야 한다", () => {
    const spec = AgentState.spec;
    expect(spec).toHaveProperty("question");
  });

  it("sessionId 필드가 제거되었어야 한다", () => {
    const spec = AgentState.spec;
    expect(spec).not.toHaveProperty("sessionId");
  });
});
