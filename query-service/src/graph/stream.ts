import type { AgentState } from "./state.js";

export interface GraphProgressEvent {
  nodeName: string;
  state: typeof AgentState.State;
}

type StreamChunk = Record<string, Partial<typeof AgentState.State>>;
type StreamTuple = [string[], StreamChunk];

type StreamableGraph = {
  stream: (
    input: Partial<typeof AgentState.State>,
    options?: { streamMode?: "updates" | "values"; subgraphs?: boolean }
  ) => Promise<AsyncIterable<StreamChunk | StreamTuple>> | AsyncIterable<StreamChunk | StreamTuple>;
};

/**
 * graph.stream()을 돌면서 각 노드 완료 시 콜백 실행.
 * 누적 state를 유지하여 최종 결과 반환.
 *
 * subgraphs: true를 사용하므로 chunk 포맷은 [namespace, updates] 튜플.
 * top-level 노드는 namespace가 빈 배열, subgraph 내부 노드는 namespace에
 * "retrieval_team:<id>" / "answer_team:<id>" 형태의 식별자가 포함된다.
 * 노드명(updates의 key)만 상위 UI로 전달하면 step-labels가 동일하게 매핑한다.
 */
export async function runGraphWithProgress<G extends StreamableGraph>(
  graph: G,
  input: Partial<typeof AgentState.State>,
  onNode: (event: GraphProgressEvent) => void
): Promise<typeof AgentState.State> {
  let accumulated: typeof AgentState.State = input as typeof AgentState.State;

  const streamIter = await graph.stream(input, {
    streamMode: "updates",
    subgraphs: true,
  });

  for await (const chunk of streamIter as AsyncIterable<StreamChunk | StreamTuple>) {
    // subgraphs: true → [namespace, updates] 튜플
    // subgraphs: false (defensive) → updates 객체
    const updates: StreamChunk = Array.isArray(chunk) ? chunk[1] : chunk;

    for (const [nodeName, partial] of Object.entries(updates)) {
      if (!partial) continue;
      accumulated = { ...accumulated, ...partial } as typeof AgentState.State;
      onNode({ nodeName, state: accumulated });
    }
  }

  return accumulated;
}
