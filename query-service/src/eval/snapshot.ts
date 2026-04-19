import { createHash } from "node:crypto";
import { insertSnapshotIgnoreConflict } from "./supabase-repo.js";
import type {
  Citation,
  EvalCategory,
  RetrievedClauseSnapshot,
} from "./types.js";

export interface SnapshotInput {
  question: string;
  userId: string;
  documentId: string;
  category: EvalCategory;
  answer: string;
  citations: Citation[];
  retrievedClauses: RetrievedClauseSnapshot[];
  graderScore: number;
  traceId: string | null;
}

const MIN_GRADER_SCORE = 2;

export function questionHash(question: string): string {
  return createHash("sha256").update(question.trim()).digest("hex").slice(0, 16);
}

/**
 * /query 핸들러에서 fire-and-forget으로 호출.
 * 저품질 baseline 배제(grader<2), eval 자체 호출 배제는 호출자가 책임.
 * 실패 시 로그만 남기고 throw 하지 않음.
 */
export async function captureSnapshot(input: SnapshotInput): Promise<void> {
  if (input.graderScore < MIN_GRADER_SCORE) return;
  if (!input.answer.trim()) return;
  if (process.env.EVAL_CRON_ENABLED === "false") return; // snapshot도 함께 끔

  const hash = questionHash(input.question);

  const result = await insertSnapshotIgnoreConflict({
    question_hash: hash,
    question: input.question,
    user_id: input.userId,
    document_id: input.documentId,
    category: input.category,
    baseline_answer: input.answer,
    baseline_citations: input.citations,
    baseline_retrieved_clauses: input.retrievedClauses,
    baseline_grader_score: input.graderScore,
    source_trace_id: input.traceId,
  });

  if (result === "inserted") {
    console.log(`[snapshot] inserted: ${hash} (${input.category})`);
  } else if (result === "conflict") {
    // no-op: 같은 질문이 이미 스냅샷으로 존재
  }
}
