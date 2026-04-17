import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, QuestionType } from "../state.js";

function parseQuestionType(text: string): QuestionType {
  const cleaned = text.trim().toLowerCase();
  if (cleaned === "coverage") return "coverage";
  if (cleaned === "claim_eligibility") return "claim_eligibility";
  return "general";
}

export async function classifyQuestion(
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
