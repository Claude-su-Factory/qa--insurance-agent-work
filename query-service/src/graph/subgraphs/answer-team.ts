import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../state.js";
import { generateAnswer } from "../nodes/answer-generator.js";
import { formatCitations } from "../nodes/citation-formatter.js";

/**
 * answer_team subgraph.
 *
 * 책임: retrieval_team이 채워놓은 retrievedClauses/toolResults를 근거로 답변을
 * 생성하고, 사용자 노출용 citation을 정제한다.
 *
 * 내부 구조:
 *   START → answer_generator → citation_formatter → END
 *
 * 주의: citation_formatter가 grader보다 먼저 실행되므로 grader 실패(재시도) 시
 * citations이 한 번 덮어쓰여지는 비효율은 있으나, formatCitations는 순수
 * 함수(LLM 호출 없음)라 비용은 무시할 수 있는 수준.
 */
export function buildAnswerTeam() {
  const graph = new StateGraph(AgentState)
    .addNode("answer_generator", generateAnswer)
    .addNode("citation_formatter", formatCitations)
    .addEdge(START, "answer_generator")
    .addEdge("answer_generator", "citation_formatter")
    .addEdge("citation_formatter", END);

  return graph.compile();
}
