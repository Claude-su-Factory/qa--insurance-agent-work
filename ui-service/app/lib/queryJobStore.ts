/**
 * Next.js API routes 간 jobId → documentId 맵 (메모리).
 * POST /api/query가 기록, GET /api/query/status/[jobId]가 assistant 메시지 저장 시 사용.
 *
 * replica=1 전제. 프로세스 재시작 시 초기화되나, 그 경우 assistant 저장이 누락되면
 * 클라이언트는 여전히 응답을 받지만 채팅 기록이 남지 않을 수 있음 (수용 가능).
 */
interface JobMeta {
  documentId: string;
  assistantSaved: boolean;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;

const store = new Map<string, JobMeta>();

function cleanup(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  store.forEach((meta, id) => {
    if (now - meta.createdAt > TTL_MS) toDelete.push(id);
  });
  toDelete.forEach((id) => store.delete(id));

  // 초과 시 가장 오래된 것부터 제거 (Map은 삽입 순서 유지)
  if (store.size > MAX_ENTRIES) {
    const keys = Array.from(store.keys());
    const excess = store.size - MAX_ENTRIES;
    for (let i = 0; i < excess; i++) store.delete(keys[i]);
  }
}

export function registerJob(jobId: string, documentId: string): void {
  cleanup();
  store.set(jobId, { documentId, assistantSaved: false, createdAt: Date.now() });
}

export function getJobDocumentId(jobId: string): string | null {
  return store.get(jobId)?.documentId ?? null;
}

export function markAssistantSaved(jobId: string): boolean {
  const meta = store.get(jobId);
  if (!meta) return false;
  if (meta.assistantSaved) return false;
  store.set(jobId, { ...meta, assistantSaved: true });
  return true;
}

export function resetAssistantSaved(jobId: string): void {
  const meta = store.get(jobId);
  if (!meta) return;
  store.set(jobId, { ...meta, assistantSaved: false });
}
