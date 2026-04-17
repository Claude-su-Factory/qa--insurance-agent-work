import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { classifyQuestion } from "./nodes/classifier.js";
import { createRetriever } from "./nodes/retriever.js";
import { toolsAgent } from "./nodes/tools-agent.js";
import { generateAnswer } from "./nodes/answer-generator.js";
import { formatCitations } from "./nodes/citation-formatter.js";
import type { VoyageClient } from "../clients/voyage.js";
import type { InsuranceQdrantClient } from "../clients/qdrant.js";

export function buildGraph(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  const retrieve = createRetriever(voyageClient, qdrantClient);

  const graph = new StateGraph(AgentState)
    .addNode("question_classifier", classifyQuestion)
    .addNode("retriever", retrieve)
    .addNode("tools_agent", toolsAgent)
    .addNode("answer_generator", generateAnswer)
    .addNode("citation_formatter", formatCitations)
    .addEdge(START, "question_classifier")
    .addEdge("question_classifier", "retriever")
    .addConditionalEdges(
      "retriever",
      (state) =>
        state.questionType === "claim_eligibility"
          ? "tools_agent"
          : "answer_generator",
      {
        tools_agent: "tools_agent",
        answer_generator: "answer_generator",
      }
    )
    .addEdge("tools_agent", "answer_generator")
    .addEdge("answer_generator", "citation_formatter")
    .addEdge("citation_formatter", END);

  return graph.compile();
}
