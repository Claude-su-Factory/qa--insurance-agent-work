import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  EvalBaselineRow,
  EvalRunItemInsert,
  EvalRunRow,
  EvalSnapshotInsert,
  EvalSnapshotRow,
  MetricScores,
} from "./types.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for eval");
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

/**
 * snapshot 삽입. question_hash UNIQUE 제약으로 중복은 무시.
 * 실패해도 예외 안 던짐 (side-effect 경로에서 사용자 응답 영향 방지).
 */
export async function insertSnapshotIgnoreConflict(
  row: EvalSnapshotInsert
): Promise<"inserted" | "conflict" | "error"> {
  try {
    const { error } = await getSupabase().from("eval_snapshots").insert(row);
    if (error) {
      // Postgres unique violation은 code 23505
      const code = (error as { code?: string }).code;
      if (code === "23505") return "conflict";
      console.error("[supabase-repo] snapshot insert error:", error);
      return "error";
    }
    return "inserted";
  } catch (err) {
    console.error("[supabase-repo] snapshot insert threw:", err);
    return "error";
  }
}

export async function countSnapshots(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("eval_snapshots")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countSnapshotsSince(since: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("eval_snapshots")
    .select("id", { count: "exact", head: true })
    .gt("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 카테고리별 비율을 유지하며 sampleSize만큼 랜덤 샘플링.
 * 전체가 sampleSize 이하면 전부 반환.
 */
export async function sampleSnapshots(sampleSize: number): Promise<EvalSnapshotRow[]> {
  const { data, error } = await getSupabase()
    .from("eval_snapshots")
    .select("*");
  if (error) throw error;

  const rows = (data ?? []) as EvalSnapshotRow[];
  if (rows.length <= sampleSize) return rows;

  // Fisher-Yates shuffle 후 상위 N개. 카테고리 비율 유지는 자연스럽게 근사됨.
  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, sampleSize);
}

export async function insertRunStart(runId: string, datasetSize: number): Promise<void> {
  const { error } = await getSupabase().from("eval_runs").insert({
    run_id: runId,
    started_at: new Date().toISOString(),
    status: "running",
    dataset_size: datasetSize,
  });
  if (error) throw error;
}

export async function updateRunCompleted(
  runId: string,
  aggregate: MetricScores,
  byCategory: Partial<Record<string, MetricScores>>,
  hasRegression: boolean
): Promise<void> {
  const { error } = await getSupabase()
    .from("eval_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      aggregate,
      by_category: byCategory,
      has_regression: hasRegression,
    })
    .eq("run_id", runId);
  if (error) throw error;
}

export async function updateRunFailed(runId: string, errorMessage: string): Promise<void> {
  const { error } = await getSupabase()
    .from("eval_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq("run_id", runId);
  if (error) console.error("[supabase-repo] updateRunFailed error:", error);
}

export async function insertRunItems(items: EvalRunItemInsert[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await getSupabase().from("eval_run_items").insert(items);
  if (error) throw error;
}

export async function getLatestBaseline(): Promise<EvalBaselineRow | null> {
  const { data, error } = await getSupabase()
    .from("eval_baselines")
    .select("*")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as EvalBaselineRow | null) ?? null;
}

export async function insertBaseline(
  runId: string,
  aggregate: MetricScores,
  byCategory: Partial<Record<string, MetricScores>>,
  approvedBy: "auto" | "manual" = "auto"
): Promise<void> {
  const { error } = await getSupabase().from("eval_baselines").insert({
    run_id: runId,
    aggregate,
    by_category: byCategory,
    approved_by: approvedBy,
  });
  if (error) throw error;
}

export async function getLatestRunFinishedAt(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("eval_runs")
    .select("finished_at")
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { finished_at: string | null } | null)?.finished_at ?? null;
}
