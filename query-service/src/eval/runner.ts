import Anthropic from "@anthropic-ai/sdk";
import { VoyageClient } from "../clients/voyage.js";
import { computeAllMetrics } from "./metrics.js";
import {
  countSnapshots,
  countSnapshotsSince,
  getLatestBaseline,
  getLatestRunFinishedAt,
  insertBaseline,
  insertRunItems,
  insertRunStart,
  sampleSnapshots,
  updateRunCompleted,
  updateRunFailed,
} from "./supabase-repo.js";
import {
  METRIC_KEYS,
  ZERO_SCORES,
  type EvalCategory,
  type EvalRunItemInsert,
  type EvalSnapshotRow,
  type MetricScores,
  type RetrievedClauseSnapshot,
} from "./types.js";

const REGRESSION_THRESHOLD = 0.05;

export interface RunEvalOptions {
  sampleSize?: number;
  skipIfNoNewSnapshots?: boolean;
}

export interface RunEvalResult {
  run_id: string;
  skipped: boolean;
  reason?: string;
  aggregate?: MetricScores;
  hasRegression?: boolean;
}

function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

interface QueryResponse {
  answer: string;
  citations: Array<{ clauseNumber: string; clauseTitle: string; excerpt: string }>;
  retrieved_clauses?: RetrievedClauseSnapshot[];
}

const SSE_TIMEOUT_MS = 120_000;

async function callQueryService(
  snapshot: EvalSnapshotRow,
  runId: string
): Promise<QueryResponse> {
  const url = process.env.QUERY_SERVICE_URL ?? `http://localhost:${process.env.PORT ?? 8082}`;
  const token = process.env.INTERNAL_AUTH_TOKEN;
  if (!token) throw new Error("INTERNAL_AUTH_TOKEN required for eval runner");

  // 1. 비동기 시작
  const startRes = await fetch(`${url}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
      "X-User-ID": snapshot.user_id,
      "X-Document-ID": snapshot.document_id,
      "X-Eval-Run-Id": runId,
    },
    body: JSON.stringify({ question: snapshot.question }),
  });

  if (!startRes.ok) {
    throw new Error(`query-service start ${startRes.status}: ${await startRes.text()}`);
  }
  const { jobId } = (await startRes.json()) as { jobId: string };

  // 2. SSE 구독 (Node native fetch + ReadableStream)
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), SSE_TIMEOUT_MS);
  try {
    const streamRes = await fetch(`${url}/query/stream/${jobId}`, {
      headers: { "X-Internal-Token": token, Accept: "text/event-stream" },
      signal: ac.signal,
    });
    if (!streamRes.ok || !streamRes.body) {
      throw new Error(`stream ${streamRes.status}: ${await streamRes.text().catch(() => "")}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // \n\n 경계로 SSE 이벤트 분리
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (payload === "ok" || payload === "error") continue; // event: done 마커

        const data = JSON.parse(payload);
        if (data.status === "completed" && data.result) {
          return {
            answer: data.result.answer,
            citations: data.result.citations,
            retrieved_clauses: data.result.retrieved_clauses,
          };
        }
        if (data.status === "failed") {
          throw new Error(`query failed: ${data.error ?? "unknown"}`);
        }
      }
    }
    throw new Error("stream ended without completion");
  } finally {
    clearTimeout(timeout);
  }
}

function aggregate(items: { scores: MetricScores; error: string | null }[]): MetricScores {
  const valid = items.filter((i) => !i.error);
  if (valid.length === 0) return { ...ZERO_SCORES };
  const sum = valid.reduce(
    (acc, it) => {
      for (const k of METRIC_KEYS) acc[k] += it.scores[k];
      return acc;
    },
    { ...ZERO_SCORES }
  );
  const avg: MetricScores = { ...ZERO_SCORES };
  for (const k of METRIC_KEYS) avg[k] = sum[k] / valid.length;
  return avg;
}

function byCategoryAgg(
  snapshots: EvalSnapshotRow[],
  items: { scores: MetricScores; error: string | null }[]
): Partial<Record<EvalCategory, MetricScores>> {
  const grouped = new Map<EvalCategory, { scores: MetricScores; error: string | null }[]>();
  for (let i = 0; i < snapshots.length; i++) {
    const cat = snapshots[i].category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(items[i]);
  }
  const result: Partial<Record<EvalCategory, MetricScores>> = {};
  for (const [cat, list] of grouped) {
    result[cat] = aggregate(list);
  }
  return result;
}

function detectRegression(
  current: MetricScores,
  baseline: MetricScores | null
): boolean {
  if (!baseline) return false;
  for (const k of METRIC_KEYS) {
    const base = baseline[k];
    if (base <= 0) continue;
    const delta = current[k] - base;
    if (delta < 0 && Math.abs(delta) / base >= REGRESSION_THRESHOLD) return true;
  }
  return false;
}

export async function runEvaluation(opts: RunEvalOptions = {}): Promise<RunEvalResult> {
  const sampleSize =
    opts.sampleSize ?? Number(process.env.EVAL_SAMPLE_SIZE ?? 10);
  const skipIfIdle =
    opts.skipIfNoNewSnapshots ??
    process.env.EVAL_SKIP_IF_NO_NEW_SNAPSHOTS !== "false";

  // 1. skip-if-idle 체크
  if (skipIfIdle) {
    const lastFinished = await getLatestRunFinishedAt();
    if (lastFinished) {
      const newCount = await countSnapshotsSince(lastFinished);
      if (newCount === 0) {
        console.log("[eval-runner] skipped: no new snapshots since last run");
        return { run_id: "", skipped: true, reason: "no-new-snapshots" };
      }
    }
  }

  // 2. 샘플 수집
  const total = await countSnapshots();
  if (total === 0) {
    console.log("[eval-runner] skipped: no snapshots yet (ask the UI first)");
    return { run_id: "", skipped: true, reason: "no-snapshots" };
  }

  const snapshots = await sampleSnapshots(sampleSize);
  const runId = `eval-${nowTimestamp()}`;

  console.log(
    `[eval-runner] starting ${runId}: ${snapshots.length} samples (of ${total} total)`
  );

  // 3. run 시작 기록
  await insertRunStart(runId, snapshots.length);

  try {
    const anthropic = new Anthropic();
    const voyage = new VoyageClient(process.env.VOYAGE_API_KEY!);

    const items: EvalRunItemInsert[] = [];

    for (const [i, snap] of snapshots.entries()) {
      console.log(`[eval-runner] [${i + 1}/${snapshots.length}] ${snap.id} (${snap.category})`);
      try {
        const resp = await callQueryService(snap, runId);
        const retrieved: RetrievedClauseSnapshot[] =
          resp.retrieved_clauses && resp.retrieved_clauses.length > 0
            ? resp.retrieved_clauses
            : resp.citations.map((c) => ({
                clauseNumber: c.clauseNumber,
                clauseTitle: c.clauseTitle,
                score: 0,
              }));

        const scores = await computeAllMetrics(anthropic, voyage, {
          question: snap.question,
          currentAnswer: resp.answer,
          currentRetrievedClauses: retrieved,
          baselineAnswer: snap.baseline_answer,
          baselineRetrievedClauses: snap.baseline_retrieved_clauses,
        });

        items.push({
          run_id: runId,
          snapshot_id: snap.id,
          answer: resp.answer,
          retrieved_clauses: retrieved,
          scores,
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[eval-runner]   ERROR: ${msg}`);
        items.push({
          run_id: runId,
          snapshot_id: snap.id,
          answer: null,
          retrieved_clauses: null,
          scores: { ...ZERO_SCORES },
          error: msg,
        });
      }
    }

    await insertRunItems(items);

    const agg = aggregate(items);
    const catAgg = byCategoryAgg(snapshots, items);

    // 4. baseline 비교 + 자동 승급
    const baseline = await getLatestBaseline();
    const hasRegression = detectRegression(agg, baseline?.aggregate ?? null);

    await updateRunCompleted(runId, agg, catAgg, hasRegression);

    const autoPromote = process.env.EVAL_AUTO_PROMOTE_BASELINE !== "false";
    if (!baseline) {
      // bootstrap
      await insertBaseline(runId, agg, catAgg, "auto");
      console.log(`[eval-runner] bootstrap baseline created: ${runId}`);
    } else if (!hasRegression && autoPromote) {
      await insertBaseline(runId, agg, catAgg, "auto");
      console.log(`[eval-runner] baseline auto-promoted: ${runId}`);
    } else if (hasRegression) {
      console.log(`[eval-runner] regression detected, baseline held`);
    }

    console.log(`[eval-runner] complete: ${runId}`, agg);
    return { run_id: runId, skipped: false, aggregate: agg, hasRegression };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[eval-runner] failed:`, err);
    await updateRunFailed(runId, msg);
    return { run_id: runId, skipped: false };
  }
}
