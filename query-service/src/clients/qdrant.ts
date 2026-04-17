import { QdrantClient } from "@qdrant/js-client-rest";
import type { Clause } from "../graph/state.js";

interface QdrantPayload {
  content: string;
  document_name: string;
  chunk_index: number;
  clause_number?: string;
  clause_title?: string;
  user_id: string;
}

export class InsuranceQdrantClient {
  private client: QdrantClient;
  private collection: string;

  constructor(url: string, collection: string) {
    this.client = new QdrantClient({ url });
    this.collection = collection;
  }

  async search(vector: number[], userId: string, limit = 5): Promise<Clause[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "user_id",
            match: { value: userId },
          },
        ],
      },
    });

    return results.map((r) => {
      const payload = r.payload as unknown as QdrantPayload;
      return {
        id: String(r.id),
        clauseNumber: payload.clause_number ?? `chunk-${payload.chunk_index}`,
        clauseTitle: payload.clause_title ?? payload.document_name,
        content: payload.content,
        documentName: payload.document_name,
        score: r.score,
      };
    });
  }
}
