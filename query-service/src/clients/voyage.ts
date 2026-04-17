export class VoyageClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "voyage-3") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Voyage AI error: ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    const result: number[][] = new Array(texts.length);
    for (const item of data.data) {
      result[item.index] = item.embedding;
    }
    return result;
  }
}
