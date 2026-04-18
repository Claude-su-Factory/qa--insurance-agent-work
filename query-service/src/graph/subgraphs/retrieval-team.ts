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
