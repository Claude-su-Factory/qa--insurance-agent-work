import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function queryRewriter(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: `당신은 보험 약관 검색 전문가입니다. 이전 검색이 실패했으므로 더 나은 검색 결과를 얻도록 질문을 재구성하세요.

재구성 전략:
- 구체적인 용어를 더 일반적인 용어로 확장
- 보험 업계 표준 용어 사용 (면책, 보장, 특약, 대기기간 등)
- 동의어나 관련 개념 추가

반드시 재구성된 질문 한 줄만 응답하세요. 다른 설명 금지.`,
      messages: [
        {
          role: "user",
          content: `원래 질문: ${state.question}\n\n재구성된 질문:`,
        },
      ],
    });

    const rewritten =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : state.question;

    return { question: rewritten };
  } catch (err) {
    // Haiku 실패 시 원래 질문 유지 (fallback)
    console.error("[query_rewriter] fallback due to API error:", err);
    return { question: state.question };
  }
}
