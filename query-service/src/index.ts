import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { VoyageClient } from "./clients/voyage.js";
import { InsuranceQdrantClient } from "./clients/qdrant.js";
import { buildGraph } from "./graph/graph.js";

const voyageClient = new VoyageClient(process.env.VOYAGE_API_KEY!);
const qdrantClient = new InsuranceQdrantClient(
  process.env.QDRANT_URL!,
  process.env.QDRANT_COLLECTION!
);
const graph = buildGraph(voyageClient, qdrantClient);

const app = new Hono();

app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const sessionId = c.req.header("x-session-id") ?? crypto.randomUUID();

  if (!userId) {
    return c.json({ error: "X-User-ID header is required" }, 401);
  }

  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  const result = await graph.invoke({ question, userId, sessionId });
  return c.json({
    answer: result.answer,
    citations: result.citations,
    questionType: result.questionType,
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 8082);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Query service running on :${port}`);
});
