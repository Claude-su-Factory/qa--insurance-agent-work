import type { AgentState, Citation } from "../state.js";

export function formatCitations(
  state: typeof AgentState.State
): Partial<typeof AgentState.State> {
  const citations: Citation[] = state.retrievedClauses.slice(0, 3).map(
    (c): Citation => ({
      clauseNumber: c.clauseNumber,
      clauseTitle: c.clauseTitle,
      excerpt: c.content.length > 200 ? c.content.slice(0, 200) + "..." : c.content,
    })
  );
  return { citations };
}
