import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, QuestionType } from "../state.js";

function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

/**
 * Supervisor 노드 — 질문 유형을 분류하여 하위 팀(retrieval_team, answer_team)의
 * 내부 경로를 결정하도록 state에 questionType을 기록한다.
 *
 * Hierarchical Team 패턴에서 team router 역할. 매 노드마다 LLM으로 라우팅하는
 * "full Supervisor" 대신 single-shot 분류로 하위 팀의 conditional edge가 활용하는
 * 지시만 남긴다 (포트폴리오 축소판).
 */
export async function supervise(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    system: `보험 질문을 분류하세요. 반드시 아래 세 단어 중 하나만 응답하세요.
- coverage: 보장 범위, 보험금 지급 조건 관련
- claim_eligibility: 특정 상황에서 보험금 청구 가능 여부 판단
- general: 기타 일반 문의`,
    messages: [{ role: "user", content: state.question }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "general";
  return { questionType: parseQuestionType(text) };
}
