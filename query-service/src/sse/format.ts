import type { QueryJob } from "../jobs/query-jobs.js";

/**
 * QueryJob을 SSE 이벤트 페이로드로 직렬화.
 * 형식: `data: {json}\n\n` (SSE 표준 message 이벤트 경계)
 */
export function formatEvent(job: QueryJob): string {
  const base: Record<string, unknown> = {
    status: job.status,
    currentStep: job.currentStep,
    stepLabel: job.stepLabel,
    progressIndex: job.progressIndex,
    totalSteps: job.totalSteps,
    questionType: job.questionType,
    retryCount: job.retryCount,
  };
  if (job.status === "completed" && job.result) base.result = job.result;
  if (job.status === "failed") base.error = job.error;
  return `data: ${JSON.stringify(base)}\n\n`;
}
