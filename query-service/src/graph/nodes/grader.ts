import Anthropic from "@anthropic-ai/sdk";
import type { AgentState } from "../state.js";

export async function grader(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  // 답변이 비어있으면 즉시 실패로 간주
  if (!state.answer || state.answer.trim().length === 0) {
    return { gradingScore: 1, retryCount: state.retryCount + 1 };
  }

  const anthropic = new Anthropic();

  const clauseContext = state.retrievedClauses
    .map((c) => `[${c.clauseNumber}] ${c.clauseTitle}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system: `당신은 보험 약관 답변 품질 평가자입니다. 답변이 질문에 정확히 부합하고 조항에 근거하는지 1~3점으로 채점하세요.

채점 기준:
- 3점: 조항에 명확히 근거하여 질문에 정확히 답변
- 2점: 부분적으로 답변되거나 근거 조항이 부족
- 1점: 질문과 무관하거나 근거 없음

반드시 숫자 하나만 응답하세요. 다른 텍스트 금지.`,
      messages: [
        {
          role: "user",
          content: `질문: ${state.question}\n\n검색된 조항:\n${clauseContext}\n\n답변: ${state.answer}\n\n점수 (1-3):`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim() : "3";
    const parsed = parseInt(text.match(/\d/)?.[0] ?? "3", 10);
    const score = parsed >= 1 && parsed <= 3 ? parsed : 3;

    return {
      gradingScore: score,
      retryCount: state.retryCount + 1,
    };
  } catch (err) {
    // Haiku API 실패 시 fallback: score=3 (통과)로 처리해 self-correction 루프가 막히지 않게 함
    console.error("[grader] fallback due to API error:", err);
    return { gradingScore: 3, retryCount: state.retryCount + 1 };
  }
}
