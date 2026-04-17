import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function generateAnswer(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  const clauseContext = state.retrievedClauses
    .map((c) => `[${c.clauseNumber}] ${c.clauseTitle}\n${c.content}`)
    .join("\n\n---\n\n");

  const toolContext = state.toolResults
    ? `\n\n도구 분석 결과:\n${state.toolResults}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: "당신은 보험 약관 전문가입니다. 제공된 약관 조항만을 근거로 정확하고 명확하게 답변하세요. 약관에 없는 내용은 추측하지 마세요. 답변 끝에 참조한 조항 번호를 명시하세요.",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `관련 약관 조항:\n\n${clauseContext}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: state.question + toolContext }],
  });

  const answer =
    response.content[0].type === "text" ? response.content[0].text : "";
  return { answer };
}
