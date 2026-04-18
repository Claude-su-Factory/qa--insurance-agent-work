import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Citation, QuestionType } from "../graph/state.js";
import type { RetrievedClauseSnapshot } from "../eval/types.js";

export type QueryJobStatus = "queued" | "running" | "completed" | "failed";

export interface QueryJobResult {
  answer: string;
  citations: Citation[];
  retrieved_clauses: RetrievedClauseSnapshot[];
  questionType: QuestionType;
  gradingScore: number;
}

export interface QueryJob {
  jobId: string;
  userId: string;
  documentId: string;
  question: string;
  status: QueryJobStatus;
  currentStep: string | null;
  stepLabel: string;
  progressIndex: number;
  totalSteps: number | null;
  questionType: QuestionType | null;
  retryCount: number;
  result?: QueryJobResult;
  error?: string;
  startedAt: number;
  completedAt?: number;
  evalRunId: string | null; // 있으면 eval 호출 (snapshot 배제)
}

export interface CreateJobInput {
  userId: string;
  documentId: string;
  question: string;
  evalRunId: string | null;
}

const TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

class JobRegistry {
  private jobs = new Map<string, QueryJob>();
  private emitter = new EventEmitter();
  private cleanupTimer: NodeJS.Timeout | null = null;

  create(input: CreateJobInput): QueryJob {
    const job: QueryJob = {
      jobId: `qj-${randomUUID().slice(0, 12)}`,
      userId: input.userId,
      documentId: input.documentId,
      question: input.question,
      status: "queued",
      currentStep: null,
      stepLabel: "대기 중",
      progressIndex: 0,
      totalSteps: null,
      questionType: null,
      retryCount: 0,
      evalRunId: input.evalRunId,
      startedAt: Date.now(),
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  get(jobId: string): QueryJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  update(jobId: string, patch: Partial<QueryJob>): void {
    const existing = this.jobs.get(jobId);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    this.jobs.set(jobId, updated);
    this.emitter.emit(jobId, updated);
  }

  subscribe(jobId: string, listener: (job: QueryJob) => void): () => void {
    this.emitter.on(jobId, listener);
    return () => this.emitter.off(jobId, listener);
  }

  /**
   * 동일 (userId, documentId)에 대해 queued/running 상태인 job 반환.
   * 같은 eval run 내 병렬 호출은 구분 (evalRunId 있으면 in-flight 검사 skip).
   */
  findInFlight(userId: string, documentId: string, evalRunId: string | null): QueryJob | null {
    if (evalRunId) return null; // eval 호출은 중복 방지 대상 아님
    for (const job of this.jobs.values()) {
      if (job.evalRunId) continue;
      if (job.userId !== userId || job.documentId !== documentId) continue;
      if (job.status === "queued" || job.status === "running") return job;
    }
    return null;
  }

  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, job] of this.jobs) {
        if (job.completedAt && now - job.completedAt > TTL_MS) {
          this.jobs.delete(id);
          this.emitter.removeAllListeners(id);
        }
      }
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  // 테스트/관측용
  size(): number {
    return this.jobs.size;
  }
}

export const queryJobs = new JobRegistry();
