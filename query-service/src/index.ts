import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { VoyageClient } from "./clients/voyage.js";
import { InsuranceQdrantClient } from "./clients/qdrant.js";
import { buildGraph } from "./graph/graph.js";
import { runGraphWithProgress } from "./graph/stream.js";
import { internalAuth } from "./middleware/internal-auth.js";
import { getLangfuse } from "./clients/langfuse.js";
import { captureSnapshot } from "./eval/snapshot.js";
import { startEvalWorker } from "./eval/worker.js";
import { queryJobs, type QueryJob } from "./jobs/query-jobs.js";
import { resolveProgressIndex, totalStepsFor } from "./jobs/step-labels.js";
import { formatEvent } from "./sse/format.js";
import type { Citation, QuestionType } from "./graph/state.js";
import type { RetrievedClauseSnapshot } from "./eval/types.js";

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

type TraceHandle = ReturnType<NonNullable<ReturnType<typeof getLangfuse>>["trace"]>;

async function executeQueryJob(job: QueryJob, trace: TraceHandle | null): Promise<void> {
  queryJobs.update(job.jobId, { status: "running" });

  try {
    const finalState = await runGraphWithProgress(
      graph,
      { question: job.question, userId: job.userId, documentId: job.documentId },
      ({ nodeName, state }) => {
        // supervisor가 먼저 돌면 questionType 결정 → totalSteps 확정
        const questionType: QuestionType | null =
          (state.questionType as QuestionType | undefined) ?? null;
        const retryCount = (state.retryCount as number | undefined) ?? 0;

        const step = resolveProgressIndex(nodeName, questionType, retryCount);
        if (!step) return;

        const current = queryJobs.get(job.jobId);
        if (!current) return;

        const nextProgressIndex =
          step.progressIndex === -1 ? current.progressIndex : step.progressIndex;

        queryJobs.update(job.jobId, {
          currentStep: nodeName,
          stepLabel: step.label,
          progressIndex: Math.max(current.progressIndex, nextProgressIndex),
          totalSteps: totalStepsFor(questionType) ?? current.totalSteps,
          questionType: questionType ?? current.questionType,
          retryCount,
        });
      }
    );

    const retrievedClauses: RetrievedClauseSnapshot[] = (finalState.retrievedClauses ?? []).map(
      (c) => ({ clauseNumber: c.clauseNumber, clauseTitle: c.clauseTitle, score: c.score })
    );

    const result = {
      answer: finalState.answer ?? "",
      citations: (finalState.citations ?? []) as Citation[],
      retrieved_clauses: retrievedClauses,
      questionType: (finalState.questionType ?? "general") as QuestionType,
      gradingScore: (finalState.gradingScore ?? 0) as number,
    };

    // 완료 단계: progressIndex = totalSteps, label = "완료"
    const finalTotal = totalStepsFor(result.questionType) ?? queryJobs.get(job.jobId)?.totalSteps ?? null;

    queryJobs.update(job.jobId, {
      status: "completed",
      stepLabel: "완료",
      progressIndex: finalTotal ?? 0,
      totalSteps: finalTotal,
      result,
      completedAt: Date.now(),
    });

    if (trace) {
      trace.update({
        output: {
          answer: result.answer,
          citations: result.citations,
          retrieved_clauses: result.retrieved_clauses,
          questionType: result.questionType,
          gradingScore: result.gradingScore,
          retryCount: finalState.retryCount,
        },
      });
      if (result.gradingScore > 0) {
        trace.score({
          name: "answer_quality",
          value: result.gradingScore,
          comment: `retryCount=${finalState.retryCount}`,
        });
      }
      await getLangfuse()?.flushAsync();
    }

    // snapshot side-effect: eval 자체 호출은 제외
    if (!job.evalRunId) {
      void captureSnapshot({
        question: job.question,
        userId: job.userId,
        documentId: job.documentId,
        category: result.questionType,
        answer: result.answer,
        citations: result.citations,
        retrievedClauses: result.retrieved_clauses,
        graderScore: result.gradingScore,
        traceId: trace?.id ?? null,
      }).catch((err) => console.error("[snapshot] failed:", err));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[query-job] ${job.jobId} failed:`, err);
    queryJobs.update(job.jobId, {
      status: "failed",
      error: msg,
      completedAt: Date.now(),
    });
  }
}

app.post("/query", async (c) => {
  const userId = c.req.header("x-user-id");
  const documentId = c.req.header("x-document-id");
  const evalRunId = c.req.header("x-eval-run-id") ?? null;

  if (!userId) return c.json({ error: "X-User-ID header is required" }, 401);
  if (!documentId) return c.json({ error: "X-Document-ID header is required" }, 400);

  const { question } = await c.req.json<{ question: string }>();
  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  // 중복 방지
  const inFlight = queryJobs.findInFlight(userId, documentId, evalRunId);
  if (inFlight) {
    return c.json({ error: "query in flight", jobId: inFlight.jobId }, 409);
  }

  const job = queryJobs.create({ userId, documentId, question, evalRunId });

  const langfuse = getLangfuse();
  const traceTags = evalRunId ? ["eval"] : undefined;
  const traceMetadata: Record<string, unknown> = { documentId, jobId: job.jobId };
  if (evalRunId) traceMetadata.eval_run_id = evalRunId;

  const trace =
    langfuse?.trace({
      name: "insurance-qa",
      userId,
      tags: traceTags,
      metadata: traceMetadata,
      input: { question },
    }) ?? null;

  // fire-and-forget
  void executeQueryJob(job, trace);

  return c.json({ jobId: job.jobId }, 202);
});

app.get("/query/stream/:jobId", (c) => {
  const jobId = c.req.param("jobId");
  const job = queryJobs.get(jobId);
  if (!job) return c.json({ error: "job not found or expired" }, 404);

  // 헤더는 stream() 호출 전 — body 시작 후엔 무효
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    let resolveDone!: () => void;
    const donePromise = new Promise<void>((r) => {
      resolveDone = r;
    });

    // 1. 먼저 구독해서 race window 제거
    const unsubscribe = queryJobs.subscribe(jobId, async (updated) => {
      await s.write(formatEvent(updated)).catch(() => {});
      if (updated.status === "completed" || updated.status === "failed") {
        await s.write("event: done\ndata: ok\n\n").catch(() => {});
        unsubscribe();
        resolveDone?.();
      }
    });

    // 2. 그다음 현재 스냅샷 전송 (subscribe 후 update 즉시 와도 유실 없음)
    //    progressIndex 단조 증가라 동일 단계 중복 전송돼도 클라이언트 idempotent
    const current = queryJobs.get(jobId);
    if (current) {
      await s.write(formatEvent(current));
      if (current.status === "completed" || current.status === "failed") {
        await s.write("event: done\ndata: ok\n\n");
        unsubscribe();
        resolveDone?.();
      }
    }

    // 3. heartbeat 10초
    const heartbeat = setInterval(() => {
      s.write(":heartbeat\n\n").catch(() => clearInterval(heartbeat));
    }, 10_000);

    // 4. 클라이언트 abort 시 정리
    c.req.raw.signal.addEventListener("abort", () => {
      unsubscribe();
      clearInterval(heartbeat);
      resolveDone?.();
    });

    await donePromise;
    clearInterval(heartbeat);
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 8082);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Query service running on :${port}`);
  queryJobs.startCleanup();
  startEvalWorker();
});
