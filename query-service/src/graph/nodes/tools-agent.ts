import Anthropic from "@anthropic-ai/sdk";
import { calculateHospitalizationDays } from "../tools/calculate-days.js";
import { checkExclusionClause } from "../tools/check-exclusion.js";
import { checkWaitingPeriod } from "../tools/check-waiting-period.js";
import type { AgentState } from "../state.js";

const toolDefs: Anthropic.Tool[] = [
  {
    name: "calculate_hospitalization_days",
    description: "입원 시작일과 종료일로 입원일수를 계산합니다",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "입원 시작일 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "퇴원일 (YYYY-MM-DD)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "check_exclusion_clause",
    description: "증상이나 사고 유형이 면책 조항에 해당하는지 확인합니다",
    input_schema: {
      type: "object",
      properties: {
        condition: { type: "string", description: "확인할 증상 또는 사고 유형" },
      },
      required: ["condition"],
    },
  },
  {
    name: "check_waiting_period",
    description: "가입일로부터 면책기간이 경과했는지 확인합니다",
    input_schema: {
      type: "object",
      properties: {
        enrollment_date: { type: "string", description: "보험 가입일 (YYYY-MM-DD)" },
        incident_date: { type: "string", description: "사고/질병 발생일 (YYYY-MM-DD)" },
        waiting_days: { type: "number", description: "면책기간 일수" },
      },
      required: ["enrollment_date", "incident_date", "waiting_days"],
    },
  },
];

function executeTool(
  name: string,
  input: Record<string, unknown>,
  clauses: typeof AgentState.State["retrievedClauses"]
): string {
  if (name === "calculate_hospitalization_days") {
    const days = calculateHospitalizationDays(
      input.start_date as string,
      input.end_date as string
    );
    return `입원일수: ${days}일`;
  }
  if (name === "check_exclusion_clause") {
    const isExcluded = checkExclusionClause(clauses, input.condition as string);
    return isExcluded
      ? `"${input.condition}"은 면책 조항에 해당합니다.`
      : `"${input.condition}"은 면책 조항에 해당하지 않습니다.`;
  }
  if (name === "check_waiting_period") {
    const passed = checkWaitingPeriod(
      input.enrollment_date as string,
      input.incident_date as string,
      input.waiting_days as number
    );
    return passed
      ? "면책기간이 경과하여 청구 가능합니다."
      : "면책기간 중이므로 청구가 불가합니다.";
  }
  return "알 수 없는 도구";
}

export async function toolsAgent(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  const anthropic = new Anthropic();
  const results: string[] = [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: toolDefs,
    system:
      "보험 청구 가능 여부를 판단하기 위해 필요한 도구를 사용하세요. 사용자 질문에서 날짜, 증상, 사고 유형 정보를 추출하여 적절한 도구를 호출하세요.",
    messages: [{ role: "user", content: state.question }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const result = executeTool(
        block.name,
        block.input as Record<string, unknown>,
        state.retrievedClauses
      );
      results.push(`[${block.name}] ${result}`);
    }
  }

  return { toolResults: results.join("\n") };
}
