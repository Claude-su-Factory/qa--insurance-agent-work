import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { VoyageClient } from "./clients/voyage.js";
import { InsuranceQdrantClient } from "./clients/qdrant.js";
import { buildGraph } from "./graph/graph.js";
import { internalAuth } from "./middleware/internal-auth.js";
import { getLangfuse } from "./clients/langfuse.js";

const voyageClient = new VoyageClient(process.env.VOYAGE_API_KEY!);
const qdrantClient = new InsuranceQdrantClient(
  process.env.QDRANT_URL!,
  process.env.QDRANT_COLLECTION!
);
const graph = buildGraph(voyageClient, qdrantClient);

const internalToken = process.env.INTERNAL_AUTH_TOKEN;
if (!internalToken) {
  throw new Error("INTERNAL_AUTH_TOKEN is required");
}

const app = new Hono();
app.use("*", internalAuth(internalToken));

app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const documentId = c.req.header("x-document-id");

  if (!userId) return c.json({ error: "X-User-ID header is required" }, 401);
  if (!documentId) return c.json({ error: "X-Document-ID header is required" }, 400);

  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "insurance-qa",
    userId,
    metadata: { documentId },
    input: { question },
  });

  const result = await graph.invoke({ question, userId, documentId });

  if (trace) {
    trace.update({
      output: {
        answer: result.answer,
        citations: result.citations,
        questionType: result.questionType,
        gradingScore: result.gradingScore,
        retryCount: result.retryCount,
      },
    });
    if (result.gradingScore > 0) {
      trace.score({
        name: "answer_quality",
        value: result.gradingScore,
        comment: `retryCount=${result.retryCount}`,
      });
    }
    await langfuse?.flushAsync();
  }

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
