import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";
import { registerJob } from "../../lib/queryJobStore";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { question, documentId } = await req.json();
  if (!question || !documentId) {
    return NextResponse.json({ error: "question and documentId are required" }, { status: 400 });
  }

  const queryUrl = process.env.QUERY_API_URL;

  const res = await fetch(`${queryUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": user.id,
      "X-Document-ID": documentId,
      "X-Internal-Token": process.env.INTERNAL_AUTH_TOKEN ?? "",
    },
    body: JSON.stringify({ question }),
  });

  // 409 in-flight: jobId를 그대로 돌려주어 클라이언트가 폴링 복귀
  if (res.status === 409) {
    const data = await res.json();
    // in-flight에도 jobId 매핑 유지 (이전 POST 시점에 이미 등록됐을 수도 있고, 새 세션은 여기서 등록)
    registerJob(data.jobId, documentId);
    return NextResponse.json(
      { jobId: data.jobId, inFlight: true, error: "query in flight" },
      { status: 409 }
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: errText }, { status: res.status });
  }

  const { jobId } = (await res.json()) as { jobId: string };

  registerJob(jobId, documentId);

  // 유저 질문을 즉시 저장 (답변은 status 라우트에서 저장)
  await supabase.from("messages").insert({
    document_id: documentId,
    user_id: user.id,
    role: "user",
    content: question,
    citations: [],
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
