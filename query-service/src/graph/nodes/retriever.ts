import { VoyageClient } from "../../clients/voyage.js";
import { InsuranceQdrantClient } from "../../clients/qdrant.js";
import type { AgentState } from "../state.js";

export function createRetriever(
  voyageClient: VoyageClient,
  qdrantClient: InsuranceQdrantClient
) {
  return async function retrieve(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const [embedding] = await voyageClient.embed([state.question]);
    const clauses = await qdrantClient.search(embedding, state.userId, 5);
    return { retrievedClauses: clauses };
  };
}
