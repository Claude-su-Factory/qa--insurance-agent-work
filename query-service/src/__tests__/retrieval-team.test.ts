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
