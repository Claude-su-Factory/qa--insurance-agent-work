import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const queryUrl = process.env.QUERY_API_URL;
  const sessionId = req.headers.get("x-session-id") ?? randomUUID();

  const res = await fetch(`${queryUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-ID": user.id,
      "X-Session-ID": sessionId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
