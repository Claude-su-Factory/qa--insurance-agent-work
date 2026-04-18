import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import {
  getJobDocumentId,
  markAssistantSaved,
  resetAssistantSaved,
} from "../../../../lib/queryJobStore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const queryUrl = process.env.QUERY_API_URL;
  const upstream = await fetch(`${queryUrl}/query/stream/${jobId}`, {
    headers: {
      "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
      Accept: "text/event-stream",
    },
    signal: req.signal,
  });

  if (upstream.status === 404) {
    return NextResponse.json({ error: "job not found or expired" }, { status: 404 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "upstream error" },
      { status: upstream.status }
    );
  }

  const documentId = getJobDocumentId(jobId);
  const decoder = new TextDecoder();
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      // 1. 패스스루 — 브라우저 진행 표시는 즉시
      controller.enqueue(chunk);

      // 2. 버퍼에 쌓고 \n\n 경계로 SSE 이벤트 단위 파싱
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (payload === "ok" || payload === "error") continue;

        let data: { status?: string; result?: { answer: string; citations?: unknown[] } };
        try {
          data = JSON.parse(payload);
        } catch (err) {
          console.error(`[stream-route] ${jobId}: parse failed:`, err);
          continue;
        }

        if (
          data.status === "completed" &&
          data.result &&
          documentId &&
          markAssistantSaved(jobId)
        ) {
          const { error } = await supabase.from("messages").insert({
            document_id: documentId,
            user_id: user.id,
            role: "assistant",
            content: data.result.answer,
            citations: data.result.citations ?? [],
          });
          if (error) {
            resetAssistantSaved(jobId);
            console.error(`[stream-route] ${jobId}: insert failed:`, error);
          }
        }
      }
    },
  });

  return new Response(upstream.body.pipeThrough(transform), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
