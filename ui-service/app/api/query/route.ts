import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

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
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: errText }, { status: res.status });
  }

  const data = await res.json();

  // Supabase에 user 질문 + assistant 답변 병렬 저장
  await Promise.all([
    supabase.from("messages").insert({
      document_id: documentId,
      user_id: user.id,
      role: "user",
      content: question,
      citations: [],
    }),
    supabase.from("messages").insert({
      document_id: documentId,
      user_id: user.id,
      role: "assistant",
      content: data.answer,
      citations: data.citations ?? [],
    }),
  ]);

  return NextResponse.json(data);
}
