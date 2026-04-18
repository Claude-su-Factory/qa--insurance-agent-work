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
